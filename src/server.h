#ifdef HAVE_LWS_CONFIG_H
#include "lws_config.h"
#endif

#define _GNU_SOURCE

#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <signal.h>
#include <errno.h>
#include <string.h>
#include <fcntl.h>
#include <getopt.h>
#include <pthread.h>
#include <sys/ioctl.h>
#include <sys/queue.h>
#include <sys/stat.h>
#include <sys/select.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <assert.h>

#ifdef __APPLE__
#include <util.h>
#else
#include <pty.h>
#endif

#include <libwebsockets.h>
#include <json.h>

#include "utils.h"

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
    bool authenticated;
    char hostname[100];
    char address[50];

    struct lws *wsi;
    char *buffer;
    size_t len;
    int pid;
    int pty;
    pthread_t thread;

    STAILQ_HEAD(pty, pty_data) queue;
    pthread_mutex_t lock;

    LIST_ENTRY(tty_client) list;
};

struct tty_server {
    LIST_HEAD(client, tty_client) clients;    // client list
    int client_count;                         // client count
    char *credential;                         // encoded basic auth credential
    int reconnect;                            // reconnect timeout
    char *command;                            // full command line
    char **argv;                              // command with arguments
    int sig_code;                             // close signal
    char *sig_name;                           // human readable signal string
    pthread_mutex_t lock;
};

extern int
callback_http(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len);

extern int
callback_tty(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len);

