#include "server.h"

volatile bool force_exit = false;
struct lws_context *context;
struct tty_server *server;

static const struct lws_protocols protocols[] = {
        {
                "http-only",
                callback_http,
                0,
                0,
        },
        {
                "tty",
                callback_tty,
                sizeof(struct tty_client),
                128,
        },
        {NULL, NULL, 0, 0}
};

static const struct lws_extension extensions[] = {
        {
                "permessage-deflate",
                lws_extension_callback_pm_deflate,
                "permessage-deflate"
        },
        {
                "deflate-frame",
                lws_extension_callback_pm_deflate,
                "deflate_frame"
        },
        {NULL, NULL, NULL}
};

struct tty_server*
tty_server_new(int argc, char **argv) {
    struct tty_server *ts;
    size_t cmd_len = 0;

    ts = malloc(sizeof(struct tty_server));
    LIST_INIT(&ts->clients);
    ts->client_count = 0;
    ts->argv = malloc(sizeof(char *) * argc);
    for (int i = 1; i < argc; i++) {
        size_t len = strlen(argv[i]);
        ts->argv[i-1] = malloc(len);
        strcpy(ts->argv[i-1], argv[i]);

        cmd_len += len;
        if (i != argc -1) {
            cmd_len++; // for space
        }
    }
    ts->argv[argc-1] = NULL;

    ts->command = malloc(cmd_len);
    char *ptr = ts->command;
    for (int i = 0; i < argc - 1; i++) {
        ptr = stpcpy(ptr, ts->argv[i]);
        if (i != argc -2) {
            sprintf(ptr++, "%c", ' ');
        }
    }

    return ts;
}

void
sig_handler(int sig) {
    force_exit = true;
    lws_cancel_service(context);
}

int
main(int argc, char **argv) {
    if (argc == 1) {
        printf("Usage: %s command [options]", argv[0]);
        exit(EXIT_SUCCESS);
    }
    server = tty_server_new(argc, argv);
    lwsl_notice("start command: %s\n", server->command);

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

    signal(SIGINT, sig_handler);

    context = lws_create_context(&info);
    if (context == NULL) {
        lwsl_err("libwebsockets init failed\n");
        return -1;
    }

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
    int i = 0;
    do {
        free(server->argv[i++]);
    } while (server->argv[i] != NULL);
    free(server->argv);
    free(server->command);
    free(server);

    return 0;
}
