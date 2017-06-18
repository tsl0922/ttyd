# ttyd - Share your terminal over the web [![Build Status](https://travis-ci.org/tsl0922/ttyd.svg?branch=master)](https://travis-ci.org/tsl0922/ttyd)

ttyd is a simple command-line tool for sharing terminal over the web, inspired by [GoTTY][1].

![screenshot](https://github.com/tsl0922/ttyd/raw/master/screenshot.gif)

# Features

- Built on top of [Libwebsockets][2] with C for speed
- Fully-featured terminal based on [Xterm.js][3] with CJK (*Chinese, Japanese, Korean*) and IME support
- SSL support based on [OpenSSL][4]
- Run any custom command with options
- Basic authentication support and many other custom options
- Cross platform: macOS, Linux, FreeBSD/OpenBSD, [OpenWrt][5]/[LEDE][6], Windows

# Installation

## Install on macOS

Install with [homebrew][7]:

```bash
brew install ttyd
```

## Install on Linux

- Install from ppa (ubuntu 16.04 and later):

    ```bash
    sudo apt-get install -y software-properties-common
    sudo add-apt-repository ppa:tsl0922/ttyd-dev
    sudo apt-get update
    sudo apt-get install ttyd
    ```

- Build from source (debian/ubuntu):

    ```bash
    sudo apt-get install cmake g++ pkg-config git vim-common libwebsockets-dev libjson-c-dev libssl-dev
    git clone https://github.com/tsl0922/ttyd.git
    cd ttyd && mkdir build && cd build
    cmake ..
    make && make install
    ```

    You may need to compile/install [libwebsockets][2] from source if the `libwebsockets-dev` package is outdated.

## Install on Windows

ttyd can be built with [MSYS2][10] on windows, The build instructions is [here][13].

> **NOTE:** Native windows console programs may not work correctly due to [pty incompatibility issues][11].
 As a workaround, you can use [winpty][12] as a wrapper to invoke the windows program, eg: `ttyd winpty cmd`.

## Install on OpenWrt/LEDE

[LEDE][6] `17.01.0` and later:

```bash
opkg install ttyd
```

If the install command fails, you can [compile it yourself][14].

# Usage

## Command-line Options

```
ttyd is a tool for sharing terminal over the web

USAGE:
    ttyd [options] <command> [<arguments...>]

VERSION:
    1.3.3

OPTIONS:
    --port, -p              Port to listen (default: 7681, use `0` for random port)
    --interface, -i         Network interface to bind (eg: eth0), or UNIX domain socket path (eg: /var/run/ttyd.sock)
    --credential, -c        Credential for Basic Authentication (format: username:password)
    --uid, -u               User id to run with
    --gid, -g               Group id to run with
    --signal, -s            Signal to send to the command when exit it (default: SIGHUP)
    --signal-list           Print a list of supported signals
    --reconnect, -r         Time to reconnect for the client in seconds (default: 10)
    --readonly, -R          Do not allow clients to write to the TTY
    --client-option, -t     Send option to client (format: key=value), repeat to add more options
    --check-origin, -O      Do not allow websocket connection from different origin
    --max-clients, -m       Maximum clients to support (default: 0, no limit)
    --once, -o              Accept only one client and exit on disconnection
    --browser, -B           Open terminal with the default system browser
    --index, -I             Custom index.html path
    --ssl, -S               Enable SSL
    --ssl-cert, -C          SSL certificate file path
    --ssl-key, -K           SSL key file path
    --ssl-ca, -A            SSL CA file path for client certificate verification
    --debug, -d             Set log level (default: 7)
    --version, -v           Print the version and exit
    --help, -h              Print this text and exit

Visit https://github.com/tsl0922/ttyd to get more information and report bugs.
```

## Example Usage

ttyd starts web server at port `7681` by default, you can use the `-p` option to change it, the `command` will be started with `arguments` as options. For example, run:

```bash
ttyd -p 8080 bash -x
```
Then open <http://localhost:8080> with a browser, you will get a bash shell with debug mode enabled.

**More Examples:**

- If you want to login with your system accounts on the web browser, run `ttyd login`.
- You can even run a none shell command like vim, try: `ttyd vim`, the web browser will show you a vim editor.
- Sharing single process with multiple clients: `ttyd tmux new -A -s ttyd vim`, run `tmux new -A -s ttyd` to connect to the tmux session from terminal.

## SSL how-to

Generate SSL CA and self signed server/client certificates:

```bash
# CA certificate (FQDN must be different from server/client)
openssl genrsa -out ca.key 2048
openssl req -new -x509 -days 365 -key ca.key -subj "/C=CN/ST=GD/L=SZ/O=Acme, Inc./CN=Acme Root CA" -out ca.crt

# server certificate (for multiple domains, change subjectAltName to: DNS:example.com,DNS:www.example.com)
openssl req -newkey rsa:2048 -nodes -keyout server.key -subj "/C=CN/ST=GD/L=SZ/O=Acme, Inc./CN=localhost" -out server.csr
openssl x509 -req -extfile <(printf "subjectAltName=DNS:localhost") -days 365 -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt

# client certificate (the p12/pem format may be useful for some clients)
openssl req -newkey rsa:2048 -nodes -keyout client.key -subj "/C=CN/ST=GD/L=SZ/O=Acme, Inc./CN=client" -out client.csr
openssl x509 -req -days 365 -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out client.crt
openssl pkcs12 -export -clcerts -in client.crt -inkey client.key -out client.p12
openssl pkcs12 -in client.p12 -out client.pem -clcerts
```

Then start ttyd:

```bash
ttyd --ssl --ssl-cert server.crt --ssl-key server.key --ssl-ca ca.crt bash
```
You may want to test the client certificate verification with `curl`:

```bash
curl --insecure --cert client.p12[:password] -v https://localhost:7681
```

If you don't want to enable client certificate verification, remove the `--ssl-ca` option.

## Docker and ttyd

Docker containers are jailed environments which are more secure, this is useful for protecting the host system, you may use ttyd with docker like this:

- Sharing single docker container with multiple clients: `docker run -it --rm -p 7681:7681 tsl0922/ttyd`.
- Creating new docker container for each client: `ttyd docker run -it --rm ubuntu`.

# Credits

- [GoTTY][1]: ttyd is a port of GoTTY to `C` language with many improvements.
- [Libwebsockets][2]: is used to build the websocket server.
- [Xterm.js][3]: is used to run the terminal emulator on the web, [hterm][8] is used previously.

  [1]: https://github.com/yudai/gotty
  [2]: https://libwebsockets.org
  [3]: https://github.com/sourcelair/xterm.js
  [4]: https://www.openssl.org
  [5]: https://openwrt.org
  [6]: https://www.lede-project.org
  [7]: http://brew.sh
  [8]: https://chromium.googlesource.com/apps/libapps/+/HEAD/hterm
  [9]: https://github.com/tsl0922/ttyd/issues/6
  [10]: http://msys2.github.io
  [11]: https://github.com/mintty/mintty/blob/master/wiki/Tips.md#inputoutput-interaction-with-alien-programs
  [12]: https://github.com/rprichard/winpty
  [13]: https://github.com/tsl0922/ttyd/tree/master/msys2
  [14]: https://github.com/tsl0922/ttyd/tree/master/openwrt
