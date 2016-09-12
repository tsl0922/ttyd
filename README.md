# ttyd - terminal emulator for the web

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

```bash
brew install cmake openssl json-c libwebsockets
git clone https://github.com/tsl0922/ttyd.git
cd ttyd && mkdir build && cd build
cmake -DOPENSSL_ROOT_DIR=/usr/local/opt/openssl ..
make
```

### For Linux users

Ubuntu as example:

```bash
sudo apt-get install cmake libwebsockets-dev libjson-c-dev libssl-dev
git clone https://github.com/tsl0922/ttyd.git
cd ttyd && mkdir build && cd build
cmake ..
make
```

The `ttyd` executable file will be in the `build` directory.

# Usage

```
Usage: ttyd command [options]
```

ttyd will start a web server at port `7681`. When you open <http://localhost:7681>, the `command` will be started with `options` as arguments and now you can see the running command on the web! :tada: 

# Credits

- [GoTTY](https://github.com/yudai/gotty): ttyd is a port of GoTTY to `C` language.
- [hterm](https://chromium.googlesource.com/apps/libapps/+/HEAD/hterm): ttyd uses hterm to run a terminal emulator on the web.