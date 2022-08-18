#ifndef TTYD_PTY_H
#define TTYD_PTY_H

#include <stdbool.h>
#include <stdint.h>
#include <uv.h>

#ifdef _WIN32
#ifndef HPCON
#define HPCON VOID *
#endif
#ifndef PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE
#define PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE 0x00020016
#endif

bool conpty_init();
#endif

typedef struct {
  char *base;
  size_t len;
} pty_buf_t;

struct pty_process_;
typedef struct pty_process_ pty_process;
typedef void (*pty_read_cb)(pty_process *, pty_buf_t *, bool);
typedef void (*pty_exit_cb)(pty_process *);

struct pty_process_ {
  int pid, exit_code, exit_signal;
  uint16_t columns, rows;
#ifdef _WIN32
  STARTUPINFOEXW si;
  HPCON pty;
  HANDLE handle;
  HANDLE wait;
#else
  pid_t pty;
  uv_thread_t tid;
#endif
  char **argv;
  char **envp;
  char *cwd;

  uv_loop_t *loop;
  uv_async_t async;
  uv_pipe_t *in;
  uv_pipe_t *out;
  bool paused;

  pty_read_cb read_cb;
  pty_exit_cb exit_cb;
  void *ctx;
};

pty_buf_t *pty_buf_init(char *base, size_t len);
void pty_buf_free(pty_buf_t *buf);
pty_process *process_init(void *ctx, uv_loop_t *loop, char *argv[], char *envp[]);
bool process_running(pty_process *process);
void process_free(pty_process *process);
int pty_spawn(pty_process *process, pty_read_cb read_cb, pty_exit_cb exit_cb);
void pty_pause(pty_process *process);
void pty_resume(pty_process *process);
int pty_write(pty_process *process, pty_buf_t *buf);
bool pty_resize(pty_process *process);
bool pty_kill(pty_process *process, int sig);

#endif  // TTYD_PTY_H
