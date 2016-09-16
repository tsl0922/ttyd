#include "server.h"

#ifdef __linux__
/*
 *  sys_signame -- an ordered list of signals.
 *  lifted from /usr/include/linux/signal.h
 *  this particular order is only correct for linux.
 *  this is _not_ portable.
 */
const char *sys_signame[NSIG] = {
    "zero",  "HUP",  "INT",   "QUIT", "ILL",   "TRAP", "IOT",  "UNUSED",
    "FPE",   "KILL", "USR1",  "SEGV", "USR2",  "PIPE", "ALRM", "TERM",
    "STKFLT","CHLD", "CONT",  "STOP", "TSTP",  "TTIN", "TTOU", "IO",
    "XCPU",  "XFSZ", "VTALRM","PROF", "WINCH", NULL
};
#endif

volatile bool force_exit = false;
struct lws_context *context;
struct tty_server *server;

// websocket protocols
static const struct lws_protocols protocols[] = {
        {"http-only", callback_http, 0, 0},
        {"tty", callback_tty, sizeof(struct tty_client), 128},
        {NULL, NULL, 0, 0}
};

// websocket extensions
static const struct lws_extension extensions[] = {
        {"permessage-deflate", lws_extension_callback_pm_deflate, "permessage-deflate"},
        {"deflate-frame", lws_extension_callback_pm_deflate, "deflate_frame"},
        {NULL, NULL, NULL}
};

// command line options
static const struct option options[] = {
        {"port",          required_argument, NULL, 'p'},
        {"interface",     required_argument, NULL, 'i'},
        {"credential",    required_argument, NULL, 'c'},
        {"uid",           required_argument, NULL, 'u'},
        {"gid",           required_argument, NULL, 'g'},
        {"signal",        required_argument, NULL, 's'},
        {"reconnect",     required_argument, NULL, 'r'},
#ifdef LWS_OPENSSL_SUPPORT
        {"ssl",           no_argument,       NULL, 'S'},
        {"ssl-cert",      required_argument, NULL, 'C'},
        {"ssl-key",       required_argument, NULL, 'K'},
        {"ssl-ca",        required_argument, NULL, 'A'},
#endif
        {"debug",         required_argument, NULL, 'd'},
        {"help",          no_argument,       NULL, 'h'},
        {NULL, 0, 0,                               0}
};
static const char *opt_string = "p:i:c:u:g:s:r:aSC:K:A:d:vh";

void print_help() {
    fprintf(stderr, "ttyd is a tool for sharing terminal over the web\n\n"
                    "USAGE: ttyd [options] <command> [<arguments...>]\n\n"
                    "OPTIONS:\n"
                    "\t--port, -p              Port to listen (default: 7681)\n"
                    "\t--interface, -i         Network interface to bind\n"
                    "\t--credential, -c        Credential for Basic Authentication (format: username:password)\n"
                    "\t--uid, -u               User id to run with\n"
                    "\t--gid, -g               Group id to run with\n"
                    "\t--signal, -s            Signal to send to the command when exit it (default: SIGHUP)\n"
                    "\t--reconnect, -r         Time to reconnect for the client in seconds (default: 10)\n"
#ifdef LWS_OPENSSL_SUPPORT
                    "\t--ssl, -S               Enable ssl\n"
                    "\t--ssl-cert, -C          Ssl certificate file path\n"
                    "\t--ssl-key, -K           Ssl key file path\n"
                    "\t--ssl-ca, -A            Ssl ca file path\n"
#endif
                    "\t--debug, -d             Set log level (0-9, default: 7)\n"
                    "\t--help, -h              Print this text and exit\n"
    );
}

struct tty_server*
tty_server_new(int argc, char **argv) {
    struct tty_server *ts;
    size_t cmd_len = 0;

    ts = malloc(sizeof(struct tty_server));
    LIST_INIT(&ts->clients);
    ts->client_count = 0;
    ts->credential = NULL;
    ts->reconnect = 10;
    ts->sig_code = SIGHUP;
    ts->sig_name = strdup("SIGHUP");
    ts->argv = malloc(sizeof(char *) * (argc + 1));
    for (int i = 0; i < argc; i++) {
        ts->argv[i] = strdup(argv[i]);
        cmd_len += strlen(ts->argv[i]);
        if (i != argc - 1) {
            cmd_len++; // for space
        }
    }
    ts->argv[argc] = NULL;

    ts->command = malloc(cmd_len);
    char *ptr = ts->command;
    for (int i = 0; i < argc; i++) {
        ptr = stpcpy(ptr, ts->argv[i]);
        if (i != argc -1) {
            sprintf(ptr++, "%c", ' ');
        }
    }

    return ts;
}

char *
uppercase(char *str) {
    int i = 0;
    do {
        str[i] = (char) toupper(str[i]);
    } while (str[i++] != '\0');
    return str;
}

// Get human readable signal string
int
get_sig_name(int sig, char *buf) {
    int n = sprintf(buf, "SIG%s", sig < NSIG ? sys_signame[sig] : "unknown");
    uppercase(buf);
    return n;
}

// Get signal code from string like SIGHUP
int
get_sig(const char *sig_name) {
    if (strcasestr(sig_name, "sig") != sig_name || strlen(sig_name) <= 3) {
        return -1;
    }
    for (int sig = 1; sig < NSIG; sig++) {
        const char *name = sys_signame[sig];
        if (strcasecmp(name, sig_name + 3) == 0)
            return sig;
    }
    return -1;
}

void
sig_handler(int sig) {
    char sig_name[20];
    get_sig_name(sig, sig_name);
    lwsl_notice("received signal: %s (%d)\n", sig_name, sig);
    force_exit = true;
    lws_cancel_service(context);
}

int
calc_command_start(int argc, char **argv) {
    // make a copy of argc and argv
    int argc_copy = argc;
    char **argv_copy = malloc(sizeof(char *) * argc);
    for (int i = 0; i < argc; i++) {
        argv_copy[i] = strdup(argv[i]);
    }

    // do not print error message for invalid option
    opterr = 0;
    while(getopt_long(argc_copy, argv_copy, opt_string, options, NULL) != -1)
        ;;
    int start= -1;
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
    if (argc == 1 || strcmp(argv[1], "-h") == 0 || strcmp(argv[1], "--help") == 0) {
        print_help();
        exit(0);
    }
    // parse command line
    int start = calc_command_start(argc, argv);
    if (start < 0) {
        fprintf(stderr, "ttyd: missing start command\n");
        exit(1);
    }
    server = tty_server_new(argc - start, &argv[start]);

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
#ifdef LWS_OPENSSL_SUPPORT
    bool ssl = false;
    char cert_path[1024] = "";
    char key_path[1024] = "";
    char ca_path[1024] = "";
#endif

    // parse command line options
    int c;
    while ((c = getopt_long(start, argv, opt_string, options, NULL)) != -1) {
        switch (c) {
            case 'h':
                print_help();
                return 0;
            case 'd':
                debug_level = atoi(optarg);
                break;
            case 'p':
                info.port = atoi(optarg);
                break;
            case 'i':
                strncpy(iface, optarg, sizeof(iface));
                iface[sizeof(iface)-1] = '\0';
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
            case 's':
                {
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
                break;
#ifdef LWS_OPENSSL_SUPPORT
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
            case '?':
                break;
            default:
                print_help();
                exit(1);
        }
    }

    lws_set_log_level(debug_level, NULL);

    if (strlen(iface) > 0)
        info.iface = iface;
#ifdef LWS_OPENSSL_SUPPORT
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
#endif

    signal(SIGINT, sig_handler);

    context = lws_create_context(&info);
    if (context == NULL) {
        lwsl_err("libwebsockets init failed\n");
        return -1;
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
        free(server->credential);
    free(server->command);
    int i = 0;
    do {
        free(server->argv[i++]);
    } while (server->argv[i] != NULL);
    free(server->argv);
    free(server->sig_name);
    free(server);

    return 0;
}
