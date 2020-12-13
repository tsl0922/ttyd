# ttyd - Share your terminal over the web ![backend](https://github.com/tsl0922/ttyd/workflows/backend/badge.svg) ![frontend](https://github.com/tsl0922/ttyd/workflows/frontend/badge.svg)

ttyd is a simple command-line tool for sharing terminal over the web.

![screenshot](https://github.com/tsl0922/ttyd/raw/master/screenshot.gif)

# Features

- Built on top of [Libwebsockets](https://libwebsockets.org) with [libuv](https://libuv.org) for speed
- Fully-featured terminal based on [Xterm.js](https://xtermjs.org) with [CJK](https://en.wikipedia.org/wiki/CJK_characters) and IME support
- Graphical [ZMODEM](https://en.wikipedia.org/wiki/ZMODEM) integration with [lrzsz](https://ohse.de/uwe/software/lrzsz.html) support
- SSL support based on [OpenSSL](https://www.openssl.org)
- Run any custom command with options
- Basic authentication support and many other custom options
- Cross platform: macOS, Linux, FreeBSD/OpenBSD, [OpenWrt](https://openwrt.org), Windows

> ❤ Special thanks to [JetBrains](https://www.jetbrains.com/?from=ttyd) for sponsoring the opensource license to this project.

# Installation

## Install on macOS

Install with [homebrew](http://brew.sh):

```bash
brew install ttyd
```

## Install on Linux

- Binary version (recommended): download from the [releases](https://github.com/tsl0922/ttyd/releases) page.
- Build from source (debian/ubuntu):

    ```bash
    sudo apt-get install build-essential cmake git libjson-c-dev libwebsockets-dev
    git clone https://github.com/tsl0922/ttyd.git
    cd ttyd && mkdir build && cd build
    cmake ..
    make && make install
    ```

    You may also need to compile/install [libwebsockets](https://libwebsockets.org) from source if the `libwebsockets-dev` package is outdated.

- Install on Gentoo: clone the [repo](https://bitbucket.org/mgpagano/ttyd/src/master) and follow the directions [here](https://wiki.gentoo.org/wiki/Custom_repository#Creating_a_local_repository).

## Install on Windows

[Compile on Windows](https://github.com/tsl0922/ttyd/wiki/Compile-on-Windows).

## Install on OpenWrt

```bash
opkg install ttyd
```

# Usage

## Command-line Options

```
ttyd is a tool for sharing terminal over the web

USAGE:
    ttyd [options] <command> [<arguments...>]

VERSION:
    1.6.2

OPTIONS:
    -p, --port              Port to listen (default: 7681, use `0` for random port)
    -i, --interface         Network interface to bind (eg: eth0), or UNIX domain socket path (eg: /var/run/ttyd.sock)
    -c, --credential        Credential for Basic Authentication (format: username:password)
    -u, --uid               User id to run with
    -g, --gid               Group id to run with
    -s, --signal            Signal to send to the command when exit it (default: 1, SIGHUP)
    -a, --url-arg           Allow client to send command line arguments in URL (eg: http://localhost:7681?arg=foo&arg=bar)
    -R, --readonly          Do not allow clients to write to the TTY
    -t, --client-option     Send option to client (format: key=value), repeat to add more options
    -T, --terminal-type     Terminal type to report, default: xterm-256color
    -O, --check-origin      Do not allow websocket connection from different origin
    -m, --max-clients       Maximum clients to support (default: 0, no limit)
    -o, --once              Accept only one client and exit on disconnection
    -B, --browser           Open terminal with the default system browser
    -I, --index             Custom index.html path
    -b, --base-path         Expected base path for requests coming from a reverse proxy (eg: /mounted/here)
    -P, --ping-interval     Websocket ping interval(sec) (default: 300)
    -6, --ipv6              Enable IPv6 support
    -S, --ssl               Enable SSL
    -C, --ssl-cert          SSL certificate file path
    -K, --ssl-key           SSL key file path
    -A, --ssl-ca            SSL CA file path for client certificate verification
    -d, --debug             Set log level (default: 7)
    -v, --version           Print the version and exit
    -h, --help              Print this text and exit

Visit https://github.com/tsl0922/ttyd to get more information and report bugs.
```

Read the example usage on the [wiki](https://github.com/tsl0922/ttyd/wiki/Example-Usage).

## Browser Support

Modern browsers, See [Browser Support](https://github.com/xtermjs/xterm.js#browser-support).

## Alternatives

* [Wetty](https://github.com/krishnasrinivas/wetty): [Node](https://nodejs.org) based web terminal (SSH/login)
* [GoTTY](https://github.com/yudai/gotty): [Go](https://golang.org) based web terminal
