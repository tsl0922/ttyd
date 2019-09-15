#include <stdbool.h>
#include <sys/ioctl.h>
#include <sys/queue.h>

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

#define BUF_SIZE 32768 // 32K

extern volatile bool force_exit;
extern struct lws_context *context;
extern struct tty_server *server;

enum pty_state {
    STATE_INIT, STATE_READY, STATE_DONE
};

struct tty_client {
    bool running;
    bool initialized;
    int initial_cmd_index;
    bool authenticated;
    char address[50];
    char **args;
    int argc;

    struct lws *wsi;
#if LWS_LIBRARY_VERSION_NUMBER >= 3002000
    lws_sorted_usec_list_t sul_stagger;
#endif
    struct winsize size;
    char *buffer;
    size_t len;

    int pid;
    int pty;
    int exit_status;
    enum pty_state state;
    char pty_buffer[LWS_PRE + 1 + BUF_SIZE];
    ssize_t pty_len;

    LIST_ENTRY(tty_client) list;
};

struct pss_http {
    char path[128];
    char *buffer;
    char *ptr;
    size_t len;
};

struct tty_server {
    LIST_HEAD(client, tty_client) clients;    // client list
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
};

extern int
callback_http(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len);

extern int
callback_tty(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len);

extern void
tty_client_poll(struct tty_client *client);
