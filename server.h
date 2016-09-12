#include "lws_config.h"

#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <signal.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/queue.h>
#include <sys/stat.h>
#include <sys/select.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <pthread.h>

#include <libwebsockets.h>

#ifdef __APPLE__
#include <util.h>
#else
#include <pty.h>
#endif

#include <json.h>

extern volatile bool force_exit;
extern struct lws_context *context;
extern struct tty_server *server;

struct pty_data {
    char *data;
    int len;
    STAILQ_ENTRY(pty_data) list;
};

struct tty_client {
    bool exit;
    bool initialized;
    char hostname[100];
    char address[50];

    struct lws *wsi;
    int pid;
    int pty;
    pthread_t thread;

    STAILQ_HEAD(pty, pty_data) queue;
    pthread_mutex_t lock;

    LIST_ENTRY(tty_client) list;
};

struct tty_server {
    LIST_HEAD(client, tty_client) clients;
    int client_count;
    char *command;  // full command line
    char **argv;    // command with arguments
    pthread_mutex_t lock;
};

extern void
tty_client_destroy(struct tty_client *client);

extern int
callback_http(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len);

extern int
callback_tty(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len);

