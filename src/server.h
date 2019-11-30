#include <stdbool.h>
#include <sys/ioctl.h>
#include <uv.h>

// client message
#define INPUT '0'
#define RESIZE_TERMINAL '1'
#define JSON_DATA '{'

// server message
#define OUTPUT '0'
#define SET_WINDOW_TITLE '1'
#define SET_PREFERENCES '2'

// websocket url path
#define WS_PATH "/ws"

extern volatile bool force_exit;
extern struct lws_context *context;
extern struct tty_server *server;

struct tty_client {
    bool initialized;
    int initial_cmd_index;
    bool authenticated;
    char address[50];
    char **args;
    int argc;

    struct lws *wsi;
    struct winsize size;
    char *buffer;
    size_t len;

    int pid;
    int pty;
    int exit_status;
    char *pty_buffer;
    ssize_t pty_len;

    uv_pipe_t pipe;
};

struct pss_http {
    char path[128];
    char *buffer;
    char *ptr;
    size_t len;
};

struct tty_server {
    int client_count;                         // client count
    char *prefs_json;                         // client preferences
    char *credential;                         // encoded basic auth credential
    char *index;                              // custom index.html
    char *command;                            // full command line
    char **argv;                              // command with arguments
    int argc;                                 // command + arguments count
    int sig_code;                             // close signal
    char sig_name[20];                        // human readable signal string
    bool url_arg;                             // allow client to send cli arguments in URL
    bool readonly;                            // whether not allow clients to write to the TTY
    bool check_origin;                        // whether allow websocket connection from different origin
    int max_clients;                          // maximum clients to support
    bool once;                                // whether accept only one client and exit on disconnection
    char socket_path[255];                    // UNIX domain socket path
    char terminal_type[30];                   // terminal type to report
    uv_loop_t *loop;                          // the libuv event loop
};

extern int
callback_http(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len);

extern int
callback_tty(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len);

