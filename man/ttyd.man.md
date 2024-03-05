ttyd 1 "September 2016" ttyd "User Manual"
==================================================

# NAME
  ttyd - Share your terminal over the web

# SYNOPSIS
  **ttyd** [options] \<command\> [\<arguments...\>]

# DESCRIPTION
  ttyd is a command-line tool for sharing terminal over the web that runs in *nix and windows systems, with the following features:

  - Built on top of Libwebsockets with libuv for speed
  - Fully-featured terminal based on Xterm.js with CJK (Chinese, Japanese, Korean) and IME support
  - Graphical ZMODEM integration with lrzsz support
  - Sixel image output support
  - SSL support based on OpenSSL
  - Run any custom command with options
  - Basic authentication support and many other custom options
  - Cross platform: macOS, Linux, FreeBSD/OpenBSD, OpenWrt/LEDE, Windows

# OPTIONS
  -p, --port <port>
      Port to listen (default: 7681, use `0` for random port)

  -i, --interface <interface>
      Network interface to bind (eg: eth0), or UNIX domain socket path (eg: /var/run/ttyd.sock)

  -U, --socket-owner
      User owner of the UNIX domain socket file, when enabled (eg: user:group)

  -c, --credential USER[:PASSWORD]
      Credential for Basic Authentication (format: username:password)

  -H, --auth-header <name>
      HTTP Header name for auth proxy, this will configure ttyd to let a HTTP reverse proxy handle authentication

  -u, --uid <uid>
      User id to run with

  -g, --gid <gid>
      Group id to run with

  -s, --signal <signal string>
      Signal to send to the command when exit it (default: 1, SIGHUP)

  -w, --cwd <path>
      Working directory to be set for the child program

  -a, --url-arg
      Allow client to send command line arguments in URL (eg: http://localhost:7681?arg=foo&arg=bar)

  -W, --writable
      Allow clients to write to the TTY (readonly by default)

  -t, --client-option <key=value>
      Send option to client (format: key=value), repeat to add more options, see **CLIENT OPTIONS** for details

  -T, --terminal-type
      Terminal type to report, default: xterm-256color

  -O, --check-origin
      Do not allow websocket connection from different origin

  -m, --max-clients
      Maximum clients to support (default: 0, no limit)

  -o, --once
      Accept only one client and exit on disconnection

  -q, --exit-no-conn
      Exit on all clients disconnection

  -B, --browser
      Open terminal with the default system browser

  -I, --index <index file>
      Custom index.html path
  
  -b, --base-path
      Expected base path for requests coming from a reverse proxy (eg: /mounted/here, max length: 128)

  -P, --ping-interval
      Websocket ping interval(sec) (default: 5)

  -6, --ipv6
      Enable IPv6 support

  -S, --ssl
      Enable SSL

  -C, --ssl-cert <cert path>
      SSL certificate file path

  -K, --ssl-key <key path>
      SSL key file path

  -A, --ssl-ca <ca path>
      SSL CA file path for client certificate verification

  -d, --debug <level>
      Set log level (default: 7)

  -v, --version
      Print the version and exit

  -h, --help
      Print this text and exit

# CLIENT OPTIONS
ttyd has a mechanism to pass server side command-line arguments to the browser page which is called **client options**:

```bash
-t, --client-option     Send option to client (format: key=value), repeat to add more options
```

## Basic usage

- `-t rendererType=canvas`: use the `canvas` renderer for xterm.js (default: `webgl`)
- `-t disableLeaveAlert=true`: disable the leave page alert
- `-t disableResizeOverlay=true`: disable the terminal resize overlay
- `-t disableReconnect=true`: prevent the terminal from reconnecting on connection error/close
- `-t enableZmodem=true`: enable [ZMODEM](https://en.wikipedia.org/wiki/ZMODEM) / [lrzsz](https://ohse.de/uwe/software/lrzsz.html) file transfer support
- `-t enableTrzsz=true`: enable [trzsz](https://trzsz.github.io) file transfer support
- `-t enableSixel=true`: enable [Sixel](https://en.wikipedia.org/wiki/Sixel) image output support ([Usage](https://saitoha.github.io/libsixel/))
- `-t titleFixed=hello`: set a fixed title for the browser window
- `-t fontSize=20`: change the font size of the terminal

## Advanced usage

You can use the client option to change all the settings of xterm defined in [ITerminalOptions](https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/), examples:

- `-t cursorStyle=bar`: set cursor style to `bar`
- `-t lineHeight=1.5`: set line-height to `1.5`
- `-t 'theme={"background": "green"}'`: set background color to `green`

to try the example options above, run:

```bash
ttyd -t cursorStyle=bar -t lineHeight=1.5 -t 'theme={"background": "green"}' bash
```

# EXAMPLES
  ttyd starts web server at port 7681 by default, you can use the -p option to change it, the command will be started with arguments as options. For example, run:
  
```  
ttyd -p 8080 bash -x
```

  Then open http://localhost:8080 with a browser, you will get a bash shell with debug mode enabled. More examples:

  - If you want to login with your system accounts on the web browser, run `ttyd login`.
  - You can even run a none shell command like vim, try: `ttyd vim`, the web browser will show you a vim editor.
  - Sharing single process with multiple clients: `ttyd tmux new -A -s ttyd vim`, run `tmux new -A -s ttyd` to connect to the tmux session from terminal.

# SSL how-to
  Generate SSL CA and self signed server/client certificates:

```
# CA certificate (FQDN must be different from server/client)
openssl genrsa -out ca.key 2048
openssl req -new -x509 -days 365 -key ca.key -subj "/C=CN/ST=GD/L=SZ/O=Acme, Inc./CN=Acme Root CA" -out ca.crt

# server certificate (for multiple domains, change subjectAltName to: DNS:example.com,DNS:www.example.com)
openssl req -newkey rsa:2048 -nodes -keyout server.key -subj "/C=CN/ST=GD/L=SZ/O=Acme, Inc./CN=localhost" -out server.csr
openssl x509 -sha256 -req -extfile <(printf "subjectAltName=DNS:localhost") -days 365 -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt

# client certificate (the p12/pem format may be useful for some clients)
openssl req -newkey rsa:2048 -nodes -keyout client.key -subj "/C=CN/ST=GD/L=SZ/O=Acme, Inc./CN=client" -out client.csr
openssl x509 -req -days 365 -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out client.crt
openssl pkcs12 -export -clcerts -in client.crt -inkey client.key -out client.p12
openssl pkcs12 -in client.p12 -out client.pem -clcerts
```

  Then start ttyd:

```
ttyd --ssl --ssl-cert server.crt --ssl-key server.key --ssl-ca ca.crt bash
```

  You may want to test the client certificate verification with *curl*(1):

```
curl --insecure --cert client.p12[:password] -v https://localhost:7681
```

  If you don't want to enable client certificate verification, remove the `--ssl-ca` option.

# Docker and ttyd
  Docker containers are jailed environments which are more secure, this is useful for protecting the host system, you may use ttyd with docker like this:

  - Sharing single docker container with multiple clients: docker run -it --rm -p 7681:7681 tsl0922/ttyd.
  - Creating new docker container for each client: ttyd docker run -it --rm ubuntu.

# Nginx reverse proxy

Sample config to proxy ttyd under the `/ttyd` path:

```nginx
location ~ ^/ttyd(.*)$ {
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_pass http://127.0.0.1:7681/$1;
}
```

# AUTHOR
  Shuanglei Tao \<tsl0922@gmail.com\> Visit https://github.com/tsl0922/ttyd to get more information and report bugs.
