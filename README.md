# ttyd - terminal emulator for the web [![Build Status](https://travis-ci.org/tsl0922/ttyd.svg?branch=master)](https://travis-ci.org/tsl0922/ttyd)

ttyd is a simple command line tool for sharing terminal over the web, inspired by [GoTTY](https://github.com/yudai/gotty).

![screenshot](screenshot.gif)

> **WARNING:** ttyd is still under heavily development, so features may be incomplete or expected to have bugs.

# Requirements

- [CMake](https://cmake.org)
- [OpenSSL](https://www.openssl.org)
- [JSON-C](https://github.com/json-c/json-c)
- [Libwebsockets](https://libwebsockets.org)

# Installation

### For Mac OS X users

Install with [homebrew](http://brew.sh):

```bash
brew tap tsl0922/ttyd
brew install ttyd --HEAD
```

### For Linux users

Ubuntu as example:

```bash
sudo apt-get install cmake g++ pkg-config git vim-common libwebsockets-dev libjson-c-dev libssl-dev
git clone https://github.com/tsl0922/ttyd.git
cd ttyd && mkdir build && cd build
cmake ..
make && make install
```

# Usage

```
ttyd is a tool for sharing terminal over the web

USAGE: ttyd [options] <command> [<arguments...>]

OPTIONS:
    --port, -p              Port to listen (default: 7681)
    --interface, -i         Network interface to bind
    --credential, -c        Credential for Basic Authentication (format: username:password)
    --uid, -u               User id to run with
    --gid, -g               Group id to run with
    --signal, -s            Signal to send to the command when exit it (default: SIGHUP)
    --reconnect, -r         Time to reconnect for the client in seconds (default: 10)
    --ssl, -S               Enable ssl
    --ssl-cert, -C          Ssl certificate file path
    --ssl-key, -K           Ssl key file path
    --ssl-ca, -A            Ssl ca file path
    --debug, -d             Set log level (0-9, default: 7)
    --help, -h              Print this text and exit
```

ttyd starts web server at port `7681` by default, the `command` will be started with `arguments` as options. For example, run:

```bash
ttyd bash
```
Then open <http://localhost:7681>, now you can see and control the `bash` console on your web broswer! :tada: 

> **TIP:** You may replace `bash` with `login` to get a login prompt first.

# Credits

- [GoTTY](https://github.com/yudai/gotty): ttyd is a port of GoTTY to `C` language.
- [hterm](https://chromium.googlesource.com/apps/libapps/+/HEAD/hterm): ttyd uses hterm to run a terminal emulator on the web.