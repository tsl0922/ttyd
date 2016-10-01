#include "server.h"

#define TTYD_VERSION "1.0.0"

volatile bool force_exit = false;
struct lws_context *context;
struct tty_server *server;

// websocket protocols
static const struct lws_protocols protocols[] = {
        {"http-only", callback_http, 0,                         0},
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
        {"port", required_argument, NULL, 'p'},
        {"interface", required_argument, NULL, 'i'},
        {"credential", required_argument, NULL, 'c'},
        {"uid", required_argument, NULL, 'u'},
        {"gid", required_argument, NULL, 'g'},
        {"signal", required_argument, NULL, 's'},
        {"reconnect", required_argument, NULL, 'r'},
        {"ssl", no_argument, NULL, 'S'},
        {"ssl-cert", required_argument, NULL, 'C'},
        {"ssl-key", required_argument, NULL, 'K'},
        {"ssl-ca", required_argument, NULL, 'A'},
        {"debug", required_argument, NULL, 'd'},
        {"version", no_argument, NULL, 'v'},
        {"help", no_argument, NULL, 'h'},
        {NULL, 0, 0, 0}
};
static const char *opt_string = "p:i:c:u:g:s:r:aSC:K:A:d:vh";

void print_help() {
    fprintf(stderr, "ttyd is a tool for sharing terminal over the web\n\n"
                    "USAGE:\n"
                    "    ttyd [options] <command> [<arguments...>]\n\n"
                    "VERSION:\n"
                    "    %s\n\n"
                    "OPTIONS:\n"
                    "    --port, -p              Port to listen (default: 7681)\n"
                    "    --interface, -i         Network interface to bind\n"
                    "    --credential, -c        Credential for Basic Authentication (format: username:password)\n"
                    "    --uid, -u               User id to run with\n"
                    "    --gid, -g               Group id to run with\n"
                    "    --signal, -s            Signal to send to the command when exit it (default: SIGHUP)\n"
                    "    --reconnect, -r         Time to reconnect for the client in seconds (default: 10)\n"
                    "    --ssl, -S               Enable ssl\n"
                    "    --ssl-cert, -C          Ssl certificate file path\n"
                    "    --ssl-key, -K           Ssl key file path\n"
                    "    --ssl-ca, -A            Ssl ca file path\n"
                    "    --debug, -d             Set log level (0-9, default: 7)\n"
                    "    --version, -v           Print the version and exit\n"
                    "    --help, -h              Print this text and exit\n",
            TTYD_VERSION
    );
}

struct tty_server *
tty_server_new(int argc, char **argv, int start) {
    struct tty_server *ts;
    size_t cmd_len = 0;

    ts = t_malloc(sizeof(struct tty_server));

    memset(ts, 0, sizeof(struct tty_server));
    LIST_INIT(&ts->clients);
    ts->client_count = 0;
    ts->reconnect = 10;
    ts->sig_code = SIGHUP;
    ts->sig_name = strdup("SIGHUP");
    if (start == argc)
        return ts;

    int cmd_argc = argc - start;
    char **cmd_argv = &argv[start];
    ts->argv = t_malloc(sizeof(char *) * (cmd_argc + 1));
    for (int i = 0; i < cmd_argc; i++) {
        ts->argv[i] = strdup(cmd_argv[i]);
        cmd_len += strlen(ts->argv[i]);
        if (i != cmd_argc - 1) {
            cmd_len++; // for space
        }
    }
    ts->argv[cmd_argc] = NULL;

    ts->command = t_malloc(cmd_len);
    char *ptr = ts->command;
    for (int i = 0; i < cmd_argc; i++) {
        ptr = stpcpy(ptr, ts->argv[i]);
        if (i != cmd_argc - 1) {
            sprintf(ptr++, "%c", ' ');
        }
    }

    return ts;
}

void
sig_handler(int sig) {
    if (force_exit)
        exit(EXIT_FAILURE);

    char sig_name[20];
    get_sig_name(sig, sig_name);
    lwsl_notice("received signal: %s (%d), exiting...\n", sig_name, sig);
    force_exit = true;
    lws_cancel_service(context);
    lwsl_notice("send ^C to force exit.\n");
}

int
calc_command_start(int argc, char **argv) {
    // make a copy of argc and argv
    int argc_copy = argc;
    char **argv_copy = t_malloc(sizeof(char *) * argc);
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
        t_free(argv_copy[i]);
    }
    t_free(argv_copy);

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
    info.options = LWS_SERVER_OPTION_VALIDATE_UTF8;
    info.extensions = extensions;
    info.timeout_secs = 5;

    int debug_level = 7;
    char iface[128] = "";
    bool ssl = false;
    char cert_path[1024] = "";
    char key_path[1024] = "";
    char ca_path[1024] = "";

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
            case 'p':
                info.port = atoi(optarg);
                if (info.port < 0) {
                    fprintf(stderr, "ttyd: invalid port: %s\n", optarg);
                    return -1;
                }
                break;
            case 'i':
                strncpy(iface, optarg, sizeof(iface));
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
                    server->sig_code = get_sig(optarg);
                    server->sig_name = uppercase(strdup(optarg));
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
            case '?':
                break;
            default:
                print_help();
                return -1;
        }
    }

    if (server->command == NULL || strlen(server->command) == 0) {
        fprintf(stderr, "ttyd: missing start command\n");
        return -1;
    }

    lws_set_log_level(debug_level, NULL);

    if (strlen(iface) > 0)
        info.iface = iface;
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
#if LWS_LIBRARY_VERSION_MAJOR == 2
        info.options |= LWS_SERVER_OPTION_REDIRECT_HTTP_TO_HTTPS;
#endif
    }

    signal(SIGINT, sig_handler);  // ^C
    signal(SIGTERM, sig_handler); // kill

    context = lws_create_context(&info);
    if (context == NULL) {
        lwsl_err("libwebsockets init failed\n");
        return 1;
    }

    lwsl_notice("TTY configuration:\n");
    if (server->credential != NULL)
        lwsl_notice("  credential: %s\n", server->credential);
    lwsl_notice("  start command: %s\n", server->command);
    lwsl_notice("  reconnect timeout: %ds\n", server->reconnect);
    lwsl_notice("  close signal: %s (%d)\n", server->sig_name, server->sig_code);

    // libwebsockets main loop
    while (!force_exit) {
        pthread_mutex_lock(&server->lock);
        if (!LIST_EMPTY(&server->clients)) {
            struct tty_client *client;
            LIST_FOREACH(client, &server->clients, list) {
                if (!STAILQ_EMPTY(&client->queue)) {
                    lws_callback_on_writable(client->wsi);
                }
            }
        }
        pthread_mutex_unlock(&server->lock);
        lws_service(context, 10);
    }

    lws_context_destroy(context);

    // cleanup
    if (server->credential != NULL)
        t_free(server->credential);
    t_free(server->command);
    int i = 0;
    do {
        t_free(server->argv[i++]);
    } while (server->argv[i] != NULL);
    t_free(server->argv);
    t_free(server->sig_name);
    t_free(server);

    return 0;
}
