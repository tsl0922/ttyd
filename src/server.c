#include <stdio.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <getopt.h>
#include <pthread.h>
#include <signal.h>
#include <sys/stat.h>
#include <sys/wait.h>

#include <libwebsockets.h>
#include <json.h>

#include "server.h"
#include "utils.h"

#ifndef TTYD_VERSION
#define TTYD_VERSION "unknown"
#endif

volatile bool force_exit = false;
struct lws_context *context;
struct tty_server *server;

// websocket protocols
static const struct lws_protocols protocols[] = {
        {"http-only", callback_http, sizeof(struct pss_http),   0},
        {"tty",       callback_tty,  sizeof(struct tty_client), 0},
        {NULL, NULL,                 0,                         0}
};

// websocket extensions
static const struct lws_extension extensions[] = {
        {"permessage-deflate", lws_extension_callback_pm_deflate, "permessage-deflate"},
        {"deflate-frame",      lws_extension_callback_pm_deflate, "deflate_frame"},
        {NULL, NULL, NULL}
};

// command line options
static const struct option options[] = {
        {"port",         required_argument, NULL, 'p'},
        {"interface",    required_argument, NULL, 'i'},
        {"credential",   required_argument, NULL, 'c'},
        {"uid",          required_argument, NULL, 'u'},
        {"gid",          required_argument, NULL, 'g'},
        {"signal",       required_argument, NULL, 's'},
        {"signal-list",  no_argument,       NULL,  1},
        {"reconnect",    required_argument, NULL, 'r'},
        {"index",        required_argument, NULL, 'I'},
        {"ipv6",         no_argument, NULL, '6'},
        {"ssl",          no_argument,       NULL, 'S'},
        {"ssl-cert",     required_argument, NULL, 'C'},
        {"ssl-key",      required_argument, NULL, 'K'},
        {"ssl-ca",       required_argument, NULL, 'A'},
        {"readonly",     no_argument,       NULL, 'R'},
        {"check-origin", no_argument,       NULL, 'O'},
        {"max-clients",  required_argument, NULL, 'm'},
        {"once",         no_argument,       NULL, 'o'},
        {"browser",      no_argument,       NULL, 'B'},
        {"debug",        required_argument, NULL, 'd'},
        {"version",      no_argument,       NULL, 'v'},
        {"help",         no_argument,       NULL, 'h'},
        {NULL,           0,                 0,     0}
};
static const char *opt_string = "p:i:c:u:g:s:r:I:6aSC:K:A:Rt:T:Om:oBd:vh";

void print_help() {
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
                    "    -r, --reconnect         Time to reconnect for the client in seconds (default: 10)\n"
                    "    -R, --readonly          Do not allow clients to write to the TTY\n"
                    "    -t, --client-option     Send option to client (format: key=value), repeat to add more options\n"
                    "    -T, --terminal-type     Terminal type to report, default: xterm-256color\n"
                    "    -O, --check-origin      Do not allow websocket connection from different origin\n"
                    "    -m, --max-clients       Maximum clients to support (default: 0, no limit)\n"
                    "    -o, --once              Accept only one client and exit on disconnection\n"
                    "    -B, --browser           Open terminal with the default system browser\n"
                    "    -I, --index             Custom index.html path\n"
                    "    -6, --ipv6              Enable IPv6 support\n"
                    "    -S, --ssl               Enable SSL\n"
                    "    -C, --ssl-cert          SSL certificate file path\n"
                    "    -K, --ssl-key           SSL key file path\n"
                    "    -A, --ssl-ca            SSL CA file path for client certificate verification\n"
                    "    -d, --debug             Set log level (default: 7)\n"
                    "    -v, --version           Print the version and exit\n"
                    "    -h, --help              Print this text and exit\n\n"
                    "Visit https://github.com/tsl0922/ttyd to get more information and report bugs.\n",
            TTYD_VERSION
    );
}

struct tty_server *
tty_server_new(int argc, char **argv, int start) {
    struct tty_server *ts;
    size_t cmd_len = 0;

    ts = xmalloc(sizeof(struct tty_server));

    memset(ts, 0, sizeof(struct tty_server));
    LIST_INIT(&ts->clients);
    ts->client_count = 0;
    ts->reconnect = 10;
    ts->sig_code = SIGHUP;
    sprintf(ts->terminal_type, "%s", "xterm-256color");
    get_sig_name(ts->sig_code, ts->sig_name, sizeof(ts->sig_name));
    if (start == argc)
        return ts;

    int cmd_argc = argc - start;
    char **cmd_argv = &argv[start];
    ts->argv = xmalloc(sizeof(char *) * (cmd_argc + 1));
    for (int i = 0; i < cmd_argc; i++) {
        ts->argv[i] = strdup(cmd_argv[i]);
        cmd_len += strlen(ts->argv[i]);
        if (i != cmd_argc - 1) {
            cmd_len++; // for space
        }
    }
    ts->argv[cmd_argc] = NULL;

    ts->command = xmalloc(cmd_len + 1);
    char *ptr = ts->command;
    for (int i = 0; i < cmd_argc; i++) {
        ptr = stpcpy(ptr, ts->argv[i]);
        if (i != cmd_argc - 1) {
            *ptr++ = ' ';
        }
    }
    *ptr = '\0'; // null terminator

    return ts;
}

void
tty_server_free(struct tty_server *ts) {
    if (ts == NULL)
        return;
    if (ts->credential != NULL)
        free(ts->credential);
    if (ts->index != NULL)
        free(ts->index);
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
    pthread_mutex_destroy(&ts->mutex);
    free(ts);
}

void
sig_handler(int sig) {
    if (force_exit)
        exit(EXIT_FAILURE);

    char sig_name[20];
    get_sig_name(sig, sig_name, sizeof(sig_name));
    lwsl_notice("received signal: %s (%d), exiting...\n", sig_name, sig);
    force_exit = true;
    lws_cancel_service(context);
    lwsl_notice("send ^C to force exit.\n");
}

void
sig_child_handler(int sig) {
    char sig_name[20];
    get_sig_name(sig, sig_name, sizeof(sig_name));
    lwsl_notice("received signal: %s (%d), exiting...\n", sig_name, sig);

    int status, pid_result;
    while (pid_result = waitpid(-1, &status, WNOHANG | WUNTRACED) == -1 && errno == EINTR)
        ;
    if (pid_result > 0) {
        lwsl_notice("process exited with code %d, pid: %d\n", status, pid_result);
        // We successfully cleaned up one child, we'll look for one more
        while (pid_result = waitpid(-1, &status, WNOHANG | WUNTRACED) == -1 && errno == EINTR)
            ;
        if (pid_result > 0) {
            lwsl_notice("process exited with code %d, pid: %d\n", status, pid_result);
        }
    }
}

int
calc_command_start(int argc, char **argv) {
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

int
main(int argc, char **argv) {
    if (argc == 1) {
        print_help();
        return 0;
    }

    int start = calc_command_start(argc, argv);
    server = tty_server_new(argc, argv, start);
    pthread_mutex_init(&server->mutex, NULL);

    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));
    info.port = 7681;
    info.iface = NULL;
    info.protocols = protocols;
    info.ssl_cert_filepath = NULL;
    info.ssl_private_key_filepath = NULL;
    info.gid = -1;
    info.uid = -1;
    info.max_http_header_pool = 16;
    info.options = LWS_SERVER_OPTION_VALIDATE_UTF8 | LWS_SERVER_OPTION_DISABLE_IPV6;
    info.extensions = extensions;
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
                    fprintf(stderr, "ttyd: invalid credential, format: username:password\n");
                    return -1;
                }
                server->credential = base64_encode((const unsigned char *) optarg, strlen(optarg));
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
            }
                break;
            case 'r':
                server->reconnect = atoi(optarg);
                if (server->reconnect <= 0) {
                    fprintf(stderr, "ttyd: invalid reconnect: %s\n", optarg);
                    return -1;
                }
                break;
            case 'I':
                if (!strncmp(optarg, "~/", 2)) {
                    const char* home = getenv("HOME");
                    server->index = malloc(strlen(home) + strlen(optarg) - 1);
                    sprintf(server->index, "%s%s", home, optarg + 1);
                } else {
                    server->index = strdup(optarg);
                }
                struct stat st;
                if (stat(server->index, &st) == -1) {
                    fprintf(stderr, "Can not stat index.html: %s, error: %s\n", server->index, strerror(errno));
                    return -1;
                }
                if (S_ISDIR(st.st_mode)) {
                    fprintf(stderr, "Invalid index.html path: %s, is it a dir?\n", server->index);
                    return -1;
                }
                break;
            case '6':
                info.options &= ~(LWS_SERVER_OPTION_DISABLE_IPV6);
                break;
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
            case 'T':
                strncpy(server->terminal_type, optarg, sizeof(server->terminal_type) - 1);
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
                        fprintf(stderr, "ttyd: invalid client option: %s, format: key=value\n", optarg);
                        return -1;
                    }
                    char *value = strsep(&option, "=");
                    free(option);
                    struct json_object *obj = json_tokener_parse(value);
                    json_object_object_add(client_prefs, key, obj != NULL ? obj : json_object_new_string(value));
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
    sprintf(server_hdr, "ttyd/%s (libwebsockets/%s)", TTYD_VERSION, LWS_LIBRARY_VERSION);
    info.server_string = server_hdr;
#if LWS_LIBRARY_VERSION_MINOR >= 1
    info.ws_ping_pong_interval = 5;
#endif
#endif

    if (strlen(iface) > 0) {
        info.iface = iface;
        if (endswith(info.iface, ".sock") || endswith(info.iface, ".socket")) {
#if defined(LWS_USE_UNIX_SOCK) || defined(LWS_WITH_UNIX_SOCK)
            info.options |= LWS_SERVER_OPTION_UNIX_SOCK;
            strncpy(server->socket_path, info.iface, sizeof(server->socket_path));
#else
            fprintf(stderr, "libwebsockets is not compiled with UNIX domain socket support");
            return -1;
#endif
        }
    }

    if (ssl) {
        info.ssl_cert_filepath = cert_path;
        info.ssl_private_key_filepath = key_path;
        info.ssl_ca_filepath = ca_path;
        info.ssl_cipher_list = "ECDHE-ECDSA-AES256-GCM-SHA384:"
                "ECDHE-RSA-AES256-GCM-SHA384:"
                "DHE-RSA-AES256-GCM-SHA384:"
                "ECDHE-RSA-AES256-SHA384:"
                "HIGH:!aNULL:!eNULL:!EXPORT:"
                "!DES:!MD5:!PSK:!RC4:!HMAC_SHA1:"
                "!SHA1:!DHE-RSA-AES128-GCM-SHA256:"
                "!DHE-RSA-AES128-SHA256:"
                "!AES128-GCM-SHA256:"
                "!AES128-SHA256:"
                "!DHE-RSA-AES256-SHA256:"
                "!AES256-GCM-SHA384:"
                "!AES256-SHA256";
        if (strlen(info.ssl_ca_filepath) > 0)
            info.options |= LWS_SERVER_OPTION_REQUIRE_VALID_OPENSSL_CLIENT_CERT;
#if LWS_LIBRARY_VERSION_MAJOR >= 2
        info.options |= LWS_SERVER_OPTION_REDIRECT_HTTP_TO_HTTPS;
#endif
    }

    lwsl_notice("ttyd %s (libwebsockets %s)\n", TTYD_VERSION, LWS_LIBRARY_VERSION);
    lwsl_notice("tty configuration:\n");
    if (server->credential != NULL)
        lwsl_notice("  credential: %s\n", server->credential);
    lwsl_notice("  start command: %s\n", server->command);
    lwsl_notice("  close signal: %s (%d)\n", server->sig_name, server->sig_code);
    lwsl_notice("  terminal type: %s\n", server->terminal_type);
    lwsl_notice("  reconnect timeout: %ds\n", server->reconnect);
    if (server->check_origin)
        lwsl_notice("  check origin: true\n");
    if (server->readonly)
        lwsl_notice("  readonly: true\n");
    if (server->max_clients > 0)
        lwsl_notice("  max clients: %d\n", server->max_clients);
    if (server->once)
        lwsl_notice("  once: true\n");
    if (server->index != NULL) {
        lwsl_notice("  custom index.html: %s\n", server->index);
    }

    signal(SIGINT, sig_handler);  // ^C
    signal(SIGTERM, sig_handler); // kill
    signal(SIGCHLD, sig_child_handler); // child status update

    context = lws_create_context(&info);
    if (context == NULL) {
        lwsl_err("libwebsockets init failed\n");
        return 1;
    }

    if (browser) {
        char url[30];
        sprintf(url, "%s://localhost:%d", ssl ? "https" : "http", info.port);
        open_uri(url);
    }

    // libwebsockets main loop
    while (!force_exit) {
        pthread_mutex_lock(&server->mutex);
        if (!LIST_EMPTY(&server->clients)) {
            struct tty_client *client;
            LIST_FOREACH(client, &server->clients, list) {
                if (client->running) {
                    pthread_mutex_lock(&client->mutex);
                    if (client->state != STATE_DONE)
                        lws_callback_on_writable(client->wsi);
                    else
                        pthread_cond_signal(&client->cond);
                    pthread_mutex_unlock(&client->mutex);
                }
            }
        }
        pthread_mutex_unlock(&server->mutex);
        lws_service(context, 10);
    }

    lws_context_destroy(context);

    // cleanup
    tty_server_free(server);

    return 0;
}
