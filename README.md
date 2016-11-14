# ttyd - Share your terminal over the web [![Build Status](https://travis-ci.org/tsl0922/ttyd.svg?branch=master)](https://travis-ci.org/tsl0922/ttyd)

ttyd is a simple command-line tool for sharing terminal over the web, inspired by [GoTTY][1].

![screenshot](screenshot.gif)

# Features

- Built on top of [Libwebsockets][2] with C for speed
- Fully-featured terminal based on [Xterm.js][3] with CJK (*Chinese, Japanese, Korean*) and IME support
- SSL support based on [OpenSSL][4]
- Run any custom command with options
- Basic authentication support and many other custom options
- Cross platform: macOS, Linux, FreeBSD, [OpenWrt][5]/[LEDE][6]

# Installation

## Install on macOS

Install with [homebrew][7]:

```bash
brew install ttyd
```

## Install on Linux

Ubuntu 16.04 as example:

```bash
sudo apt-get install cmake g++ pkg-config git vim-common libwebsockets-dev libjson-c-dev libssl-dev
git clone https://github.com/tsl0922/ttyd.git
cd ttyd && mkdir build && cd build
cmake ..
make && make install
```

> **NOTE:** You may need to compile libwebsockets from source for ubuntu versions old than 16.04, since they have outdated `libwebsockets-dev` package ([Issue #6][9]).

## Install on OpenWrt/LEDE

```bash
opkg install ttyd
```

> **NOTE:** This may only works for [LEDE][6] snapshots currently, if the install command fails, [compile it yourself](openwrt).

# Usage

## Command-line Options

```
ttyd is a tool for sharing terminal over the web

USAGE:
    ttyd [options] <command> [<arguments...>]

VERSION:
    1.2.0

OPTIONS:
    --port, -p              Port to listen (default: 7681, use `0` for random port)
    --interface, -i         Network interface to bind
    --credential, -c        Credential for Basic Authentication (format: username:password)
    --uid, -u               User id to run with
    --gid, -g               Group id to run with
    --signal, -s            Signal to send to the command when exit it (default: SIGHUP)
    --reconnect, -r         Time to reconnect for the client in seconds (default: 10)
    --readonly, -R          Do not allow clients to write to the TTY
    --client-option, -t     Send option to client (format: key=value), repeat to add more options
    --check-origin, -O      Do not allow websocket connection from different origin
    --once, -o              Accept only one client and exit on disconnection
    --ssl, -S               Enable ssl
    --ssl-cert, -C          Ssl certificate file path
    --ssl-key, -K           Ssl key file path
    --ssl-ca, -A            Ssl ca file path
    --debug, -d             Set log level (0-9, default: 7)
    --version, -v           Print the version and exit
    --help, -h              Print this text and exit
```

## Example Usage

ttyd starts web server at port `7681` by default, you can use the `-p` option to change it, the `command` will be started with `arguments` as options. For example, run:

```bash
ttyd -p 8080 bash -x
```
Then open <http://localhost:8080> with a broswer, you will get a bash shell with debug mode enabled.

**More Examples:**

- If you want to login with your system accounts on the web broswer, run `ttyd login`.
- You can even run a none shell command like vim, try: `ttyd vim`, the web broswer will show you a vim editor.
- Sharing single process with multiple clients: `ttyd tmux new -A -s ttyd vim`, run `tmux new -A -s ttyd` to connect to the tmux session from terminal.

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