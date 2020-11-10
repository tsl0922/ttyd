#include "server.h"

#include <errno.h>
#include <getopt.h>
#include <json.h>
#include <libwebsockets.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include "utils.h"

#ifndef TTYD_VERSION
#define TTYD_VERSION "unknown"
#endif

volatile bool force_exit = false;
struct lws_context *context;
struct server *server;
struct endpoints endpoints = {"/ws", "/", "/token", ""};

extern int callback_http(struct lws *wsi, enum lws_callback_reasons reason,
                         void *user, void *in, size_t len);
extern int callback_tty(struct lws *wsi, enum lws_callback_reasons reason,
                        void *user, void *in, size_t len);

// websocket protocols
static const struct lws_protocols protocols[] = {
    {"http-only", callback_http, sizeof(struct pss_http), 0},
    {"tty", callback_tty, sizeof(struct pss_tty), 0},
    {NULL, NULL, 0, 0}};

#ifndef LWS_WITHOUT_EXTENSIONS
// websocket extensions
static const struct lws_extension extensions[] = {
    {"permessage-deflate", lws_extension_callback_pm_deflate,
     "permessage-deflate"},
    {"deflate-frame", lws_extension_callback_pm_deflate, "deflate_frame"},
    {NULL, NULL, NULL}};
#endif

#if LWS_LIBRARY_VERSION_NUMBER >= 4000000
static const uint32_t backoff_ms[] = { 1000, 2000, 3000, 4000, 5000 };
static lws_retry_bo_t retry = {
      .retry_ms_table = backoff_ms,
      .retry_ms_table_count = LWS_ARRAY_SIZE(backoff_ms),
      .conceal_count = LWS_ARRAY_SIZE(backoff_ms),
      .secs_since_valid_ping = 300,
      .secs_since_valid_hangup = 300 + 7,
      .jitter_percent = 0,
    };
#endif

// command line options
static const struct option options[] = {
    {"port", required_argument, NULL, 'p'},
    {"interface", required_argument, NULL, 'i'},
    {"credential", required_argument, NULL, 'c'},
    {"uid", required_argument, NULL, 'u'},
    {"gid", required_argument, NULL, 'g'},
    {"signal", required_argument, NULL, 's'},
    {"index", required_argument, NULL, 'I'},
    {"base-path", required_argument, NULL, 'b'},
#if LWS_LIBRARY_VERSION_NUMBER >= 4000000
    {"ping-interval", required_argument, NULL, 'P'},
#endif
    {"ipv6", no_argument, NULL, '6'},
    {"ssl", no_argument, NULL, 'S'},
    {"ssl-cert", required_argument, NULL, 'C'},
    {"ssl-key", required_argument, NULL, 'K'},
    {"ssl-ca", required_argument, NULL, 'A'},
    {"url-arg", no_argument, NULL, 'a'},
    {"readonly", no_argument, NULL, 'R'},
    {"terminal-type", required_argument, NULL, 'T'},
    {"client-option", required_argument, NULL, 't'},
    {"check-origin", no_argument, NULL, 'O'},
    {"max-clients", required_argument, NULL, 'm'},
    {"once", no_argument, NULL, 'o'},
    {"browser", no_argument, NULL, 'B'},
    {"debug", required_argument, NULL, 'd'},
    {"version", no_argument, NULL, 'v'},
    {"help", no_argument, NULL, 'h'},
    {NULL, 0, 0, 0}};

#if LWS_LIBRARY_VERSION_NUMBER < 4000000
static const char *opt_string = "p:i:c:u:g:s:I:b:6aSC:K:A:Rt:T:Om:oBd:vh";
#endif
#if LWS_LIBRARY_VERSION_NUMBER >= 4000000
static const char *opt_string = "p:i:c:u:g:s:I:b:P:6aSC:K:A:Rt:T:Om:oBd:vh";
#endif

static void print_help() {
  // clang-format off
  fprintf(stderr, "ttyd is a tool for sharing terminal over the web\n\n"
          "USAGE:\n"
          "    ttyd [options] <command> [<arguments...>]\n\n"
          "VERSION:\n"
          "    %s\n\n"
          "OPTIONS:\n"
          "    -p, --port              Port to listen (default: 7681, use `0` for random port)\n"
          "    -i, --interface         Network interface to bind (eg: eth0), or UNIX domain socket path (eg: /var/run/ttyd.sock)\n"
          "    -c, --credential        Credential for Basic Authentication (format: username:password)\n"
          "    -u, --uid               User id to run with\n"
          "    -g, --gid               Group id to run with\n"
          "    -s, --signal            Signal to send to the command when exit it (default: 1, SIGHUP)\n"
          "    -a, --url-arg           Allow client to send command line arguments in URL (eg: http://localhost:7681?arg=foo&arg=bar)\n"
          "    -R, --readonly          Do not allow clients to write to the TTY\n"
          "    -t, --client-option     Send option to client (format: key=value), repeat to add more options\n"
          "    -T, --terminal-type     Terminal type to report, default: xterm-256color\n"
          "    -O, --check-origin      Do not allow websocket connection from different origin\n"
          "    -m, --max-clients       Maximum clients to support (default: 0, no limit)\n"
          "    -o, --once              Accept only one client and exit on disconnection\n"
          "    -B, --browser           Open terminal with the default system browser\n"
          "    -I, --index             Custom index.html path\n"
          "    -b, --base-path         Expected base path for requests coming from a reverse proxy (eg: /mounted/here)\n"
#if LWS_LIBRARY_VERSION_NUMBER >= 4000000
          "    -P, --ping-interval     Websocket ping interval(sec) (default: 300)\n"
#endif
#ifdef LWS_WITH_IPV6
          "    -6, --ipv6              Enable IPv6 support\n"
#endif
#if defined(LWS_OPENSSL_SUPPORT) || defined(LWS_WITH_TLS)
          "    -S, --ssl               Enable SSL\n"
          "    -C, --ssl-cert          SSL certificate file path\n"
          "    -K, --ssl-key           SSL key file path\n"
          "    -A, --ssl-ca            SSL CA file path for client certificate verification\n"
#endif
          "    -d, --debug             Set log level (default: 7)\n"
          "    -v, --version           Print the version and exit\n"
          "    -h, --help              Print this text and exit\n\n"
          "Visit https://github.com/tsl0922/ttyd to get more information and report bugs.\n",
          TTYD_VERSION
  );
  // clang-format on
}

static struct server *server_new(int argc, char **argv, int start) {
  struct server *ts;
  size_t cmd_len = 0;

  ts = xmalloc(sizeof(struct server));

  memset(ts, 0, sizeof(struct server));
  LIST_INIT(&ts->procs);
  ts->client_count = 0;
  ts->sig_code = SIGHUP;
  sprintf(ts->terminal_type, "%s", "xterm-256color");
  get_sig_name(ts->sig_code, ts->sig_name, sizeof(ts->sig_name));
  if (start == argc) return ts;

  int cmd_argc = argc - start;
  char **cmd_argv = &argv[start];
  ts->argv = xmalloc(sizeof(char *) * (cmd_argc + 1));
  for (int i = 0; i < cmd_argc; i++) {
    ts->argv[i] = strdup(cmd_argv[i]);
    cmd_len += strlen(ts->argv[i]);
    if (i != cmd_argc - 1) {
      cmd_len++;  // for space
    }
  }
  ts->argv[cmd_argc] = NULL;
  ts->argc = cmd_argc;

  ts->command = xmalloc(cmd_len + 1);
  char *ptr = ts->command;
  for (int i = 0; i < cmd_argc; i++) {
    ptr = stpcpy(ptr, ts->argv[i]);
    if (i != cmd_argc - 1) {
      *ptr++ = ' ';
    }
  }
  *ptr = '\0';  // null terminator

  ts->loop = xmalloc(sizeof *ts->loop);
  uv_loop_init(ts->loop);
  uv_signal_init(ts->loop, &ts->watcher);
  ts->watcher.data = &ts->procs;

  return ts;
}

static void server_free(struct server *ts) {
  if (ts == NULL) return;
  if (ts->credential != NULL) free(ts->credential);
  if (ts->index != NULL) free(ts->index);
  free(ts->command);
  free(ts->prefs_json);
  int i = 0;
  do {
    free(ts->argv[i++]);
  } while (ts->argv[i] != NULL);
  free(ts->argv);
  if (strlen(ts->socket_path) > 0) {
    struct stat st;
    if (!stat(ts->socket_path, &st)) {
      unlink(ts->socket_path);
    }
  }
  uv_signal_stop(&ts->watcher);
  uv_loop_close(ts->loop);
  free(ts->loop);
  free(ts);
}

static void signal_cb(uv_signal_t *watcher, int signum) {
  char sig_name[20];

  switch (watcher->signum) {
    case SIGINT:
    case SIGTERM:
      get_sig_name(watcher->signum, sig_name, sizeof(sig_name));
      lwsl_notice("received signal: %s (%d), exiting...\n", sig_name,
                  watcher->signum);
      break;
    default:
      signal(SIGABRT, SIG_DFL);
      abort();
  }

  if (force_exit) exit(EXIT_FAILURE);
  force_exit = true;
  lws_cancel_service(context);
#if LWS_LIBRARY_VERSION_MAJOR >= 3
  uv_stop(server->loop);
  lwsl_notice("send ^C to force exit.\n");
#else
  lws_libuv_stop(context);
  exit(EXIT_SUCCESS);
#endif
}

static int calc_command_start(int argc, char **argv) {
  // make a copy of argc and argv
  int argc_copy = argc;
  char **argv_copy = xmalloc(sizeof(char *) * argc);
  for (int i = 0; i < argc; i++) {
    argv_copy[i] = strdup(argv[i]);
  }

  // do not print error message for invalid option
  opterr = 0;
  while (getopt_long(argc_copy, argv_copy, opt_string, options, NULL) != -1)
    ;

  int start = argc;
  if (optind < argc) {
    char *command = argv_copy[optind];
    for (int i = 0; i < argc; i++) {
      if (strcmp(argv[i], command) == 0) {
        start = i;
        break;
      }
    }
  }

  // free argv copy
  for (int i = 0; i < argc; i++) {
    free(argv_copy[i]);
  }
  free(argv_copy);

  // reset for next use
  opterr = 1;
  optind = 0;

  return start;
}

int main(int argc, char **argv) {
  if (argc == 1) {
    print_help();
    return 0;
  }

  int start = calc_command_start(argc, argv);
  server = server_new(argc, argv, start);

  struct lws_context_creation_info info;
  memset(&info, 0, sizeof(info));
  info.port = 7681;
  info.iface = NULL;
  info.protocols = protocols;
  info.gid = -1;
  info.uid = -1;
  info.max_http_header_pool = 16;
  info.options = LWS_SERVER_OPTION_LIBUV | LWS_SERVER_OPTION_VALIDATE_UTF8 |
                 LWS_SERVER_OPTION_DISABLE_IPV6;
#ifndef LWS_WITHOUT_EXTENSIONS
  info.extensions = extensions;
#endif
  info.max_http_header_data = 20480;

  int debug_level = LLL_ERR | LLL_WARN | LLL_NOTICE;
  char iface[128] = "";
  bool browser = false;
  bool ssl = false;
  char cert_path[1024] = "";
  char key_path[1024] = "";
  char ca_path[1024] = "";

  struct json_object *client_prefs = json_object_new_object();

  // parse command line options
  int c;
  while ((c = getopt_long(start, argv, opt_string, options, NULL)) != -1) {
    switch (c) {
      case 'h':
        print_help();
        return 0;
      case 'v':
        printf("ttyd version %s\n", TTYD_VERSION);
        return 0;
      case 'd':
        debug_level = atoi(optarg);
        break;
      case 'a':
        server->url_arg = true;
        break;
      case 'R':
        server->readonly = true;
        break;
      case 'O':
        server->check_origin = true;
        break;
      case 'm':
        server->max_clients = atoi(optarg);
        break;
      case 'o':
        server->once = true;
        break;
      case 'B':
        browser = true;
        break;
      case 'p':
        info.port = atoi(optarg);
        if (info.port < 0) {
          fprintf(stderr, "ttyd: invalid port: %s\n", optarg);
          return -1;
        }
        break;
      case 'i':
        strncpy(iface, optarg, sizeof(iface) - 1);
        iface[sizeof(iface) - 1] = '\0';
        break;
      case 'c':
        if (strchr(optarg, ':') == NULL) {
          fprintf(stderr,
                  "ttyd: invalid credential, format: username:password\n");
          return -1;
        }
        server->credential =
            base64_encode((const unsigned char *)optarg, strlen(optarg));
        break;
      case 'u':
        info.uid = atoi(optarg);
        break;
      case 'g':
        info.gid = atoi(optarg);
        break;
      case 's': {
        int sig = get_sig(optarg);
        if (sig > 0) {
          server->sig_code = sig;
          get_sig_name(sig, server->sig_name, sizeof(server->sig_name));
        } else {
          fprintf(stderr, "ttyd: invalid signal: %s\n", optarg);
          return -1;
        }
      } break;
      case 'I':
        if (!strncmp(optarg, "~/", 2)) {
          const char *home = getenv("HOME");
          server->index = malloc(strlen(home) + strlen(optarg) - 1);
          sprintf(server->index, "%s%s", home, optarg + 1);
        } else {
          server->index = strdup(optarg);
        }
        struct stat st;
        if (stat(server->index, &st) == -1) {
          fprintf(stderr, "Can not stat index.html: %s, error: %s\n",
                  server->index, strerror(errno));
          return -1;
        }
        if (S_ISDIR(st.st_mode)) {
          fprintf(stderr, "Invalid index.html path: %s, is it a dir?\n",
                  server->index);
          return -1;
        }
        break;
      case 'b': {
        char path[128];
        strncpy(path, optarg, 128);
        size_t len = strlen(path);
        while (len && path[len - 1] == '/') path[--len] = 0;  // trim trailing /
        if (!len) break;
#define sc(f)                                  \
  strncpy(path + len, endpoints.f, 128 - len); \
  endpoints.f = strdup(path);
        sc(ws) sc(index) sc(token) sc(parent)
#undef sc
      } break;
#if LWS_LIBRARY_VERSION_NUMBER >= 4000000
      case 'P':
        if (atoi(optarg) <= 0) {
          fprintf(stderr, "ttyd: invalid ping interval: %s\n", optarg);
          return -1;
        }
        retry.secs_since_valid_ping = atoi(optarg);
        retry.secs_since_valid_hangup = atoi(optarg) + 7;
        info.retry_and_idle_policy = &retry;
        break;
#endif
      case '6':
        info.options &= ~(LWS_SERVER_OPTION_DISABLE_IPV6);
        break;
#if defined(LWS_OPENSSL_SUPPORT) || defined(LWS_WITH_TLS)
      case 'S':
        ssl = true;
        break;
      case 'C':
        strncpy(cert_path, optarg, sizeof(cert_path) - 1);
        cert_path[sizeof(cert_path) - 1] = '\0';
        break;
      case 'K':
        strncpy(key_path, optarg, sizeof(key_path) - 1);
        key_path[sizeof(key_path) - 1] = '\0';
        break;
      case 'A':
        strncpy(ca_path, optarg, sizeof(ca_path) - 1);
        ca_path[sizeof(ca_path) - 1] = '\0';
        break;
#endif
      case 'T':
        strncpy(server->terminal_type, optarg,
                sizeof(server->terminal_type) - 1);
        server->terminal_type[sizeof(server->terminal_type) - 1] = '\0';
        break;
      case '?':
        break;
      case 't':
        optind--;
        for (; optind < start && *argv[optind] != '-'; optind++) {
          char *option = strdup(optarg);
          char *key = strsep(&option, "=");
          if (key == NULL) {
            fprintf(stderr,
                    "ttyd: invalid client option: %s, format: key=value\n",
                    optarg);
            return -1;
          }
          char *value = strsep(&option, "=");
          if (value == NULL) {
            fprintf(stderr,
                    "ttyd: invalid client option: %s, format: key=value\n",
                    optarg);
            return -1;
          }
          free(option);
          struct json_object *obj = json_tokener_parse(value);
          json_object_object_add(
              client_prefs, key,
              obj != NULL ? obj : json_object_new_string(value));
        }
        break;
      default:
        print_help();
        return -1;
    }
  }
  server->prefs_json = strdup(json_object_to_json_string(client_prefs));
  json_object_put(client_prefs);

  if (server->command == NULL || strlen(server->command) == 0) {
    fprintf(stderr, "ttyd: missing start command\n");
    return -1;
  }

  lws_set_log_level(debug_level, NULL);

#if LWS_LIBRARY_VERSION_MAJOR >= 2
  char server_hdr[128] = "";
  sprintf(server_hdr, "ttyd/%s (libwebsockets/%s)", TTYD_VERSION,
          LWS_LIBRARY_VERSION);
  info.server_string = server_hdr;
#endif
#if LWS_LIBRARY_VERSION_NUMBER >= 2001000 && LWS_LIBRARY_VERSION_NUMBER < 4000000
  info.ws_ping_pong_interval = 5;
#endif

  if (strlen(iface) > 0) {
    info.iface = iface;
    if (endswith(info.iface, ".sock") || endswith(info.iface, ".socket")) {
#if defined(LWS_USE_UNIX_SOCK) || defined(LWS_WITH_UNIX_SOCK)
      info.options |= LWS_SERVER_OPTION_UNIX_SOCK;
      info.port = 0; // warmcat/libwebsockets#1985
      strncpy(server->socket_path, info.iface, sizeof(server->socket_path) - 1);
#else
      fprintf(stderr,
              "libwebsockets is not compiled with UNIX domain socket support");
      return -1;
#endif
    }
  }

#if defined(LWS_OPENSSL_SUPPORT) || defined(LWS_WITH_TLS)
  if (ssl) {
    info.ssl_cert_filepath = cert_path;
    info.ssl_private_key_filepath = key_path;
    info.ssl_ca_filepath = ca_path;
    if (strlen(info.ssl_ca_filepath) > 0)
      info.options |= LWS_SERVER_OPTION_REQUIRE_VALID_OPENSSL_CLIENT_CERT;
#if LWS_LIBRARY_VERSION_MAJOR >= 2
    info.options |= LWS_SERVER_OPTION_REDIRECT_HTTP_TO_HTTPS;
#endif
  }
#endif

  lwsl_notice("ttyd %s (libwebsockets %s)\n", TTYD_VERSION,
              LWS_LIBRARY_VERSION);
  lwsl_notice("tty configuration:\n");
  if (server->credential != NULL)
    lwsl_notice("  credential: %s\n", server->credential);
  lwsl_notice("  start command: %s\n", server->command);
  lwsl_notice("  close signal: %s (%d)\n", server->sig_name, server->sig_code);
  lwsl_notice("  terminal type: %s\n", server->terminal_type);
  if (endpoints.parent[0]) {
    lwsl_notice("endpoints:\n");
    lwsl_notice("  base-path: %s\n", endpoints.parent);
    lwsl_notice("  index    : %s\n", endpoints.index);
    lwsl_notice("  token    : %s\n", endpoints.token);
    lwsl_notice("  websocket: %s\n", endpoints.ws);
  }
  if (server->check_origin) lwsl_notice("  check origin: true\n");
  if (server->url_arg) lwsl_notice("  allow url arg: true\n");
  if (server->readonly) lwsl_notice("  readonly: true\n");
  if (server->max_clients > 0)
    lwsl_notice("  max clients: %d\n", server->max_clients);
  if (server->once) lwsl_notice("  once: true\n");
  if (server->index != NULL) {
    lwsl_notice("  custom index.html: %s\n", server->index);
  }

#if LWS_LIBRARY_VERSION_MAJOR >= 3
  void *foreign_loops[1];
  foreign_loops[0] = server->loop;
  info.foreign_loops = foreign_loops;
  info.options |= LWS_SERVER_OPTION_EXPLICIT_VHOSTS;
#endif

  context = lws_create_context(&info);
  if (context == NULL) {
    lwsl_err("libwebsockets context creation failed\n");
    return 1;
  }

#if LWS_LIBRARY_VERSION_MAJOR >= 3
  struct lws_vhost *vhost = lws_create_vhost(context, &info);
  if (vhost == NULL) {
    lwsl_err("libwebsockets vhost creation failed\n");
    return 1;
  }
  int port = lws_get_vhost_listen_port(vhost);
#else
  int port = info.port;
#endif
  lwsl_notice(" Listening on port: %d\n", port);

  if (browser) {
    char url[30];
    sprintf(url, "%s://localhost:%d", ssl ? "https" : "http", port);
    open_uri(url);
  }

#if LWS_LIBRARY_VERSION_MAJOR >= 3
  int sig_nums[] = {SIGINT, SIGTERM};
  int ns = sizeof(sig_nums) / sizeof(sig_nums[0]);
  uv_signal_t signals[ns];
  for (int i = 0; i < ns; i++) {
    uv_signal_init(server->loop, &signals[i]);
    uv_signal_start(&signals[i], signal_cb, sig_nums[i]);
  }

  lws_service(context, 0);

  for (int i = 0; i < ns; i++) {
    uv_signal_stop(&signals[i]);
  }
#else
#if LWS_LIBRARY_VERSION_MAJOR < 2
  lws_uv_initloop(context, server->loop, signal_cb, 0);
#else
  lws_uv_sigint_cfg(context, 1, signal_cb);
  lws_uv_initloop(context, server->loop, 0);
#endif
  lws_libuv_run(context, 0);
#endif

  lws_context_destroy(context);

  // cleanup
  server_free(server);

  return 0;
}
