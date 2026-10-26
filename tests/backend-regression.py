"""Run backend regressions against a built ttyd; no frontend build required.

Usage: python3 tests/backend-regression.py /path/to/ttyd
"""

import base64
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest


BINARY = str(Path(sys.argv.pop(1)).resolve())
CLIENT_TITLE = "Backend regression"


class WebSocket:
    def __init__(self, port, path):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=3)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((
            f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
            "Sec-WebSocket-Protocol: tty\r\n\r\n"
        ).encode())
        self.response = b""
        while not self.response.endswith(b"\r\n\r\n"):
            chunk = self.sock.recv(1)
            if not chunk:
                break
            self.response += chunk

    def close(self):
        self.sock.close()

    def send(self, data, opcode=2, final=True):
        mask = os.urandom(4)
        header = bytes([(0x80 if final else 0) | opcode])
        if len(data) < 126:
            header += bytes([0x80 | len(data)])
        else:
            header += bytes([0x80 | 126]) + struct.pack("!H", len(data))
        self.sock.sendall(header + mask + bytes(v ^ mask[i % 4] for i, v in enumerate(data)))

    def read(self):
        def exact(n):
            data = b""
            while len(data) < n:
                chunk = self.sock.recv(n - len(data))
                if not chunk:
                    raise EOFError("WebSocket closed before message completed")
                data += chunk
            return data

        first, second = exact(2)
        length = second & 127
        if length == 126:
            length = struct.unpack("!H", exact(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", exact(8))[0]
        if first & 15 != 2 or second & 128:
            raise AssertionError("Expected an unmasked binary server frame")
        return exact(length)


class BackendRegression(unittest.TestCase):
    def setUp(self):
        self.log = tempfile.TemporaryFile(mode="w+")
        self.addCleanup(self.log.close)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            self.port = listener.getsockname()[1]
        self.command = "exec cat"
        self.proc = subprocess.Popen([
            BINARY, "-i", "127.0.0.1", "-p", str(self.port), "-W",
            "--url-arg", "-b", "/terminal", "-t", "titleFixed=" + CLIENT_TITLE,
            "/bin/sh", "-c", self.command,
        ], stdout=self.log, stderr=self.log)
        self.addCleanup(self.stop_server)
        deadline = time.monotonic() + 10
        while True:
            if self.proc.poll() is not None:
                self.fail("ttyd exited during startup")
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=.1):
                    break
            except OSError:
                if time.monotonic() >= deadline:
                    self.fail("ttyd did not start listening")
                time.sleep(.05)

    def stop_server(self):
        if self.proc.poll() is None:
            self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
        self.log.seek(0)
        self.assertNotIn("ERROR: AddressSanitizer", self.log.read())

    def connect(self, path="/terminal/ws"):
        ws = WebSocket(self.port, path)
        self.addCleanup(ws.close)
        return ws

    def initial_messages(self, ws):
        title = ws.read()
        prefs = ws.read()
        self.assertTrue(title.startswith(b"1/bin/sh -c " + self.command.encode()))
        self.assertEqual(prefs[:1], b"2")
        self.assertEqual(json.loads(prefs[1:])["titleFixed"], CLIENT_TITLE)

    def test_normal_initialization(self):
        ws = self.connect()
        self.assertTrue(ws.response.startswith(b"HTTP/1.1 101"))
        ws.send(b"{}")
        self.initial_messages(ws)

    def test_websocket_path_requires_exact_match(self):
        for path in ["/terminal/w", "/terminal/", "/terminal/wsx", "/terminal/ws/"]:
            with self.subTest(path=path):
                ws = self.connect(path)
                self.assertNotIn(b"101 Switching Protocols", ws.response)
                ws.close()
        ws = self.connect()
        self.assertTrue(ws.response.startswith(b"HTTP/1.1 101"))

    def test_repeated_url_arg_connections(self):
        # Exercise argument allocation and cleanup without spawning child processes.
        for _ in range(30):
            ws = self.connect("/terminal/ws?arg=one&arg=two")
            self.assertTrue(ws.response.startswith(b"HTTP/1.1 101"))
            ws.close()
        self.assertIsNone(self.proc.poll())


if __name__ == "__main__":
    unittest.main()
