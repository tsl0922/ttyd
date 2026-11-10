#!/usr/bin/env python3
"""ttyd integration / security regression tests.

Covers the fixes tracked in SECURITY-AUDIT.md. Stdlib only: no external
dependencies. Each test starts its own ttyd instance on an ephemeral port
and drives it over raw sockets.

Usage:  python3 tests/ws_test.py [path-to-ttyd]   (default: ./build/ttyd)

Not covered here (require TLS+h2 or platform specifics):
  - h2 :authority origin fallback (upstream #1566) - needs --ssl + ALPN h2
  - macOS/BSD-specific read paths (VULN-17 platform half)
"""
import base64
import json
import os
import random
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time

TTYD = sys.argv[1] if len(sys.argv) > 1 else "./build/ttyd"
RESULTS = []


# ---------------------------------------------------------------- helpers
def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Server:
    def __init__(self, *args):
        self.port = free_port()
        self.logfile = tempfile.NamedTemporaryFile(prefix="ttyd-test-", delete=False)
        self.args = [TTYD, "-p", str(self.port)] + list(args)
        self.proc = None

    def __enter__(self):
        self.proc = subprocess.Popen(self.args, stdout=self.logfile, stderr=self.logfile)
        deadline = time.time() + 10
        while time.time() < deadline:
            with socket.socket() as s:
                if s.connect_ex(("127.0.0.1", self.port)) == 0:
                    return self
            if self.proc.poll() is not None:
                raise AssertionError(f"ttyd exited early rc={self.proc.returncode}: {self.log()}")
            time.sleep(0.05)
        raise AssertionError("ttyd did not start listening: " + self.log())

    def __exit__(self, *exc):
        if self.proc and self.proc.poll() is None:
            self.proc.send_signal(signal.SIGTERM)
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()

    def log(self):
        with open(self.logfile.name, "rb") as f:
            return f.read().decode("utf-8", "replace")

    def alive(self):
        return self.proc is not None and self.proc.poll() is None


def http_get(port, path, headers=None):
    s = socket.create_connection(("127.0.0.1", port), timeout=5)
    hdrs = f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n"
    for k, v in (headers or {}).items():
        hdrs += f"{k}: {v}\r\n"
    s.sendall((hdrs + "\r\n").encode())
    data = b""
    s.settimeout(5)
    while True:
        try:
            c = s.recv(65536)
        except socket.timeout:
            break
        if not c:
            break
        data += c
        # stop once we have the full body per Content-Length
        head, _, body = data.partition(b"\r\n\r\n")
        if b"\r\n\r\n" in data:
            cl = -1
            for l in head.decode("latin1").split("\r\n")[1:]:
                if l.lower().startswith("content-length:"):
                    cl = int(l.split(":", 1)[1].strip())
            if cl >= 0 and len(body) >= cl:
                break
    s.close()
    head, _, body = data.partition(b"\r\n\r\n")
    lines = head.decode("latin1").split("\r\n")
    hmap = {}
    for l in lines[1:]:
        if ":" in l:
            k, v = l.split(":", 1)
            hmap[k.strip().lower()] = v.strip()
    return lines[0], hmap, body


def ws_connect(port, path="/ws", origin=None, host=None, authorization=None, subproto=True):
    s = socket.create_connection(("127.0.0.1", port), timeout=5)
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\nHost: {host or f'127.0.0.1:{port}'}\r\n"
        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
        + (f"Origin: {origin}\r\n" if origin else "")
        + (f"Authorization: {authorization}\r\n" if authorization else "")
        + f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
        + ("Sec-WebSocket-Protocol: tty\r\n" if subproto else "")
        + "\r\n"
    )
    s.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        c = s.recv(4096)
        if not c:
            break
        resp += c
    first = resp.split(b"\r\n")[0].decode("latin1")
    return s, first


def ws_frame(s, opcode, payload, fin=True):
    b0 = (0x80 if fin else 0) | opcode
    mask = os.urandom(4)
    n = len(payload)
    if n < 126:
        hdr = struct.pack("!BB", b0, 0x80 | n)
    elif n < 65536:
        hdr = struct.pack("!BBH", b0, 0x80 | 126, n)
    else:
        hdr = struct.pack("!BBQ", b0, 0x80 | 127, n)
    s.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))


def ws_drain(s, secs):
    s.settimeout(0.2)
    end = time.time() + secs
    data = b""
    while time.time() < end:
        try:
            c = s.recv(65536)
            if not c:
                break
            data += c
        except socket.timeout:
            pass
        except OSError:
            break
    return data


def spawn_terminal(s, columns=80, rows=24, auth_token=None):
    msg = {"columns": columns, "rows": rows}
    if auth_token is not None:
        msg["AuthToken"] = auth_token
    ws_frame(s, 2, json.dumps(msg).encode())


# ---------------------------------------------------------------- tests

def test_zero_length_frame_no_crash():  # VULN-14 / upstream #1546
    with Server("-W", "bash") as srv:
        s, first = ws_connect(srv.port)
        assert "101" in first, first
        spawn_terminal(s)
        ws_drain(s, 0.8)
        ws_frame(s, 2, b"", fin=False)  # zero-length first fragment
        time.sleep(0.5)
        assert srv.alive(), "server died on zero-length frame"
        # protocol-legal continuation completes the message: command byte comes
        # from this fragment since the empty one contributed nothing
        ws_frame(s, 0, b"0echo ok\n", fin=True)
        data = ws_drain(s, 1.5)
        assert b"ok" in data, "connection unusable after zero-length frame"
        assert srv.alive()
        s.close()


def test_flood_message_capped():  # VULN-1
    with Server("-W", "bash") as srv:
        s, first = ws_connect(srv.port)
        assert "101" in first, first
        spawn_terminal(s)
        ws_drain(s, 0.5)
        chunk = b"0" + b"A" * 65535
        ws_frame(s, 2, chunk, fin=False)
        sent = len(chunk)
        closed = False
        deadline = time.time() + 15
        try:
            while time.time() < deadline and sent < 64 * 1024 * 1024:
                ws_frame(s, 0, chunk, fin=False)
                sent += len(chunk)
                # poll for the server close (FIN is not seen by send, and a
                # close frame or EOF arrives on the read side)
                s.settimeout(0)
                try:
                    d = s.recv(65536)
                    if d == b"" or (d and (d[0] & 0x0F) == 0x8):
                        closed = True
                        break
                except (BlockingIOError, socket.timeout):
                    pass
                except OSError:
                    closed = True
                    break
                s.settimeout(5)
                time.sleep(0.002)
        except (BrokenPipeError, ConnectionResetError, OSError):
            closed = True
        assert closed, f"connection never closed after {sent} bytes of fragments"
        assert srv.alive(), "server died during flood"
        s2, f2 = ws_connect(srv.port)  # server still serves new clients
        assert "101" in f2, f2
        s2.close()


# ---------------------------------------------------------------- runner
def main():
    if not os.path.exists(TTYD):
        print(f"ttyd binary not found: {TTYD}")
        return 2
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        name = t.__name__
        try:
            t()
            RESULTS.append((name, "PASS", ""))
            print(f"PASS {name}")
        except Exception as e:  # noqa: BLE001
            RESULTS.append((name, "FAIL", str(e)))
            print(f"FAIL {name}: {e}")
    failed = [r for r in RESULTS if r[1] == "FAIL"]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
