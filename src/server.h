#include <stdbool.h>
#include <uv.h>

#include "queue.h"

// client message
#define INPUT '0'
#define RESIZE_TERMINAL '1'
#define JSON_DATA '{'

// server message
#define OUTPUT '0'
#define SET_WINDOW_TITLE '1'
#define SET_PREFERENCES '2'

// url paths
struct endpoints {
  char *ws;
  char *index;
  char *token;
  char *parent;
};

extern volatile bool force_exit;
extern struct lws_context *context;
extern struct server *server;
extern struct endpoints endpoints;

typedef enum { STATE_INIT, STATE_KILL, STATE_EXIT } proc_state;

struct pss_http {
  char path[128];
  char *buffer;
  char *ptr;
  size_t len;
};

struct pty_proc {
  char **args;
  int argc;

  pid_t pid;
  int status;
  proc_state state;

  int pty;
  char *pty_buffer;
  ssize_t pty_len;

  uv_pipe_t pipe;

  LIST_ENTRY(pty_proc) entry;
};

struct pss_tty {
  bool initialized;
  int initial_cmd_index;
  bool authenticated;
  char address[50];
  char path[20];

  struct lws *wsi;
  char *buffer;
  size_t len;

  struct pty_proc *proc;
};

struct server {
  int client_count;        // client count
  char *prefs_json;        // client preferences
  char *credential;        // encoded basic auth credential
  char *index;             // custom index.html
  char *command;           // full command line
  char **argv;             // command with arguments
  int argc;                // command + arguments count
  int sig_code;            // close signal
  char sig_name[20];       // human readable signal string
  bool url_arg;            // allow client to send cli arguments in URL
  bool readonly;           // whether not allow clients to write to the TTY
  bool check_origin;       // whether allow websocket connection from different origin
  int max_clients;         // maximum clients to support
  bool once;               // whether accept only one client and exit on disconnection
  char socket_path[255];   // UNIX domain socket path
  char terminal_type[30];  // terminal type to report

  uv_loop_t *loop;      // the libuv event loop
  uv_signal_t watcher;  // SIGCHLD watcher

  LIST_HEAD(proc, pty_proc) procs;  // started process list
};
