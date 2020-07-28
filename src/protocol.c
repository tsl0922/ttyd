#include <errno.h>
#include <json.h>
#include <libwebsockets.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>

#include "server.h"
#include "terminal.h"
#include "utils.h"

// initial message list
static char initial_cmds[] = {SET_WINDOW_TITLE, SET_PREFERENCES};

static int send_initial_message(struct lws *wsi, int index) {
  unsigned char message[LWS_PRE + 1 + 4096];
  unsigned char *p = &message[LWS_PRE];
  char buffer[128];
  int n = 0;

  char cmd = initial_cmds[index];
  switch (cmd) {
    case SET_WINDOW_TITLE:
      gethostname(buffer, sizeof(buffer) - 1);
      n = sprintf((char *)p, "%c%s (%s)", cmd, server->command, buffer);
      break;
    case SET_PREFERENCES:
      n = sprintf((char *)p, "%c%s", cmd, server->prefs_json);
      break;
    default:
      break;
  }

  return lws_write(wsi, p, (size_t)n, LWS_WRITE_BINARY);
}

static bool parse_window_size(struct pss_tty *pss, int *cols, int *rows) {
  char json[pss->len];
  strncpy(json, pss->buffer + 1, pss->len - 1);
  json[pss->len - 1] = '\0';

  json_object *obj = json_tokener_parse(json);
  struct json_object *o = NULL;

  if (!json_object_object_get_ex(obj, "columns", &o)) {
    lwsl_err("columns field not exists, json: %s\n", json);
    return false;
  }
  *cols = json_object_get_int(o);
  if (!json_object_object_get_ex(obj, "rows", &o)) {
    lwsl_err("rows field not exists, json: %s\n", json);
    return false;
  }
  *rows = json_object_get_int(o);
  json_object_put(obj);

  return true;
}

static bool check_host_origin(struct lws *wsi) {
  int origin_length = lws_hdr_total_length(wsi, WSI_TOKEN_ORIGIN);
  char buf[origin_length + 1];
  memset(buf, 0, sizeof(buf));
  int len = lws_hdr_copy(wsi, buf, sizeof(buf), WSI_TOKEN_ORIGIN);
  if (len <= 0) {
    return false;
  }

  const char *prot, *address, *path;
  int port;
  if (lws_parse_uri(buf, &prot, &address, &port, &path)) return false;
  if (port == 80 || port == 443) {
    sprintf(buf, "%s", address);
  } else {
    sprintf(buf, "%s:%d", address, port);
  }

  int host_length = lws_hdr_total_length(wsi, WSI_TOKEN_HOST);
  if (host_length != strlen(buf)) return false;
  char host_buf[host_length + 1];
  memset(host_buf, 0, sizeof(host_buf));
  len = lws_hdr_copy(wsi, host_buf, sizeof(host_buf), WSI_TOKEN_HOST);

  return len > 0 && strcasecmp(buf, host_buf) == 0;
}

static void pty_proc_free(struct pty_proc *proc) {
  uv_read_stop((uv_stream_t *)&proc->pipe);
  uv_close((uv_handle_t *)&proc->pipe, NULL);

  close(proc->pty);

  if (proc->pty_buffer != NULL) {
    free(proc->pty_buffer);
    proc->pty_buffer = NULL;
  }

  for (int i = 0; i < proc->argc; i++) {
    free(proc->args[i]);
  }

  free(proc);
}

static void alloc_cb(uv_handle_t *handle, size_t suggested_size, uv_buf_t *buf) {
  buf->base = xmalloc(suggested_size);
  buf->len = suggested_size;
}

static void read_cb(uv_stream_t *stream, ssize_t nread, const uv_buf_t *buf) {
  struct pss_tty *pss = (struct pss_tty *)stream->data;
  struct pty_proc *proc = pss->proc;
  proc->pty_len = nread;

  uv_read_stop(stream);

  if (nread <= 0) {
    if (nread == UV_ENOBUFS || nread == 0) return;
    proc->pty_buffer = NULL;
    lwsl_err("read_cb: %s (%s)\n", uv_err_name(nread), uv_strerror(nread));
  } else {
    proc->pty_buffer = xmalloc(LWS_PRE + 1 + (size_t)nread);
    memcpy(proc->pty_buffer + LWS_PRE + 1, buf->base, (size_t)nread);
  }
  free(buf->base);

  lws_callback_on_writable(pss->wsi);
}

static void child_cb(uv_signal_t *handle, int signum) {
  pid_t pid;
  int stat;

  struct pty_proc *proc;
  LIST_HEAD(proc, pty_proc) *procs = handle->data;
  LIST_FOREACH(proc, procs, entry) {
    do
      pid = waitpid(proc->pid, &stat, WNOHANG);
    while (pid == -1 && errno == EINTR);

    if (pid <= 0) continue;

    if (WIFEXITED(stat)) {
      proc->status = WEXITSTATUS(stat);
      lwsl_notice("process exited with code %d, pid: %d\n", proc->status, proc->pid);
    } else if (WIFSIGNALED(stat)) {
      int sig = WTERMSIG(stat);
      char sig_name[20];

      proc->status = 128 + sig;
      get_sig_name(sig, sig_name, sizeof(sig_name));
      lwsl_notice("process killed with signal %d (%s), pid: %d\n", sig, sig_name, proc->pid);
    }

    LIST_REMOVE(proc, entry);
    if (proc->state == STATE_KILL) {
      pty_proc_free(proc);
    } else {
      proc->state = STATE_EXIT;
    }
  }
}

static int spawn_process(struct pss_tty *pss) {
  struct pty_proc *proc = pss->proc;
  // append url args to arguments
  char *argv[server->argc + proc->argc + 1];
  int i, n = 0;
  for (i = 0; i < server->argc; i++) {
    argv[n++] = server->argv[i];
  }
  for (i = 0; i < proc->argc; i++) {
    argv[n++] = proc->args[i];
  }
  argv[n] = NULL;

  uv_signal_start(&server->watcher, child_cb, SIGCHLD);

  // ensure the lws socket fd close-on-exec
  fd_set_cloexec(lws_get_socket_fd(pss->wsi));

  // create process with pseudo-tty
  proc->pid = pty_fork(&proc->pty, argv[0], argv, server->terminal_type);
  if (proc->pid < 0) {
    lwsl_err("pty_fork: %d (%s)\n", errno, strerror(errno));
    return 1;
  }

  lwsl_notice("started process, pid: %d\n", proc->pid);

  proc->pipe.data = pss;
  uv_pipe_open(&proc->pipe, proc->pty);

  lws_callback_on_writable(pss->wsi);

  return 0;
}

static void kill_process(struct pty_proc *proc) {
  if (proc->pid <= 0) return;

  pid_t pid = proc->pid;
  int sig = server->sig_code;
  char *sig_name = server->sig_name;

  lwsl_notice("killing process %d with signal: %d (%s)\n", pid, sig, sig_name);
  int pgid = getpgid(pid);
  if (uv_kill(pgid > 0 ? -pgid : pid, sig) != 0) {
    lwsl_err("kill: %d, errno: %d (%s)\n", pid, errno, strerror(errno));
  }
}

static void write_cb(uv_write_t *req, int status) {
  if (status != 0) lwsl_warn("uv_write callback returned status: %d\n", status);
  free(req->data);
  free(req);
}

int callback_tty(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in,
                 size_t len) {
  struct pss_tty *pss = (struct pss_tty *)user;
  struct pty_proc *proc;
  char buf[256];
  size_t n = 0;

  switch (reason) {
    case LWS_CALLBACK_FILTER_PROTOCOL_CONNECTION:
      if (server->once && server->client_count > 0) {
        lwsl_warn("refuse to serve WS client due to the --once option.\n");
        return 1;
      }
      if (server->max_clients > 0 && server->client_count == server->max_clients) {
        lwsl_warn("refuse to serve WS client due to the --max-clients option.\n");
        return 1;
      }

      n = lws_hdr_copy(wsi, pss->path, sizeof(pss->path), WSI_TOKEN_GET_URI);
#if defined(LWS_ROLE_H2)
      if (n <= 0) n = lws_hdr_copy(wsi, pss->path, sizeof(pss->path), WSI_TOKEN_HTTP_COLON_PATH);
#endif
      if (strncmp(pss->path, endpoints.ws, n) != 0) {
        lwsl_warn("refuse to serve WS client for illegal ws path: %s\n", buf);
        return 1;
      }

      if (server->check_origin && !check_host_origin(wsi)) {
        lwsl_warn(
            "refuse to serve WS client from different origin due to the "
            "--check-origin option.\n");
        return 1;
      }
      break;

    case LWS_CALLBACK_ESTABLISHED:
      pss->initialized = false;
      pss->initial_cmd_index = 0;
      pss->authenticated = false;
      pss->wsi = wsi;
      pss->buffer = NULL;

      pss->proc = proc = xmalloc(sizeof(struct pty_proc));
      memset(proc, 0, sizeof(struct pty_proc));
      proc->status = -1;
      proc->state = STATE_INIT;
      uv_pipe_init(server->loop, &proc->pipe, 0);

      if (server->url_arg) {
        while (lws_hdr_copy_fragment(wsi, buf, sizeof(buf), WSI_TOKEN_HTTP_URI_ARGS, n++) > 0) {
          if (strncmp(buf, "arg=", 4) == 0) {
            proc->args = xrealloc(proc->args, (proc->argc + 1) * sizeof(char *));
            proc->args[proc->argc] = strdup(&buf[4]);
            proc->argc++;
          }
        }
      }

      LIST_INSERT_HEAD(&server->procs, proc, entry);
      server->client_count++;

#if LWS_LIBRARY_VERSION_NUMBER >= 2004000
      lws_get_peer_simple(lws_get_network_wsi(wsi), pss->address, sizeof(pss->address));
#else
      char name[100];
      lws_get_peer_addresses(wsi, lws_get_socket_fd(wsi), name, sizeof(name), pss->address,
                             sizeof(pss->address));
#endif
      lwsl_notice("WS   %s - %s, clients: %d\n", pss->path, pss->address, server->client_count);
      break;

    case LWS_CALLBACK_SERVER_WRITEABLE:
      proc = pss->proc;
      if (!pss->initialized) {
        if (pss->initial_cmd_index == sizeof(initial_cmds)) {
          pss->initialized = true;
          uv_read_start((uv_stream_t *)&proc->pipe, alloc_cb, read_cb);
          break;
        }
        if (send_initial_message(wsi, pss->initial_cmd_index) < 0) {
          lwsl_err("failed to send initial message, index: %d\n", pss->initial_cmd_index);
          lws_close_reason(wsi, LWS_CLOSE_STATUS_UNEXPECTED_CONDITION, NULL, 0);
          return -1;
        }
        pss->initial_cmd_index++;
        lws_callback_on_writable(wsi);
        break;
      }

      // read error or client exited, close connection
      if (proc->status == 0 || proc->pty_len == UV_EOF) {
        lws_close_reason(wsi, LWS_CLOSE_STATUS_NORMAL, NULL, 0);
        return 1;
      } else if (proc->status > 0 || proc->pty_len < 0) {
        lws_close_reason(wsi, LWS_CLOSE_STATUS_UNEXPECTED_CONDITION, NULL, 0);
        return -1;
      }

      if (proc->pty_buffer == NULL || proc->pty_len == 0) break;

      proc->pty_buffer[LWS_PRE] = OUTPUT;
      n = (size_t)(proc->pty_len + 1);
      if (lws_write(wsi, (unsigned char *)proc->pty_buffer + LWS_PRE, n, LWS_WRITE_BINARY) < n) {
        lwsl_err("write OUTPUT to WS\n");
      }
      free(proc->pty_buffer);
      proc->pty_buffer = NULL;
      uv_read_start((uv_stream_t *)&proc->pipe, alloc_cb, read_cb);
      break;

    case LWS_CALLBACK_RECEIVE:
      if (pss->buffer == NULL) {
        pss->buffer = xmalloc(len);
        pss->len = len;
        memcpy(pss->buffer, in, len);
      } else {
        pss->buffer = xrealloc(pss->buffer, pss->len + len);
        memcpy(pss->buffer + pss->len, in, len);
        pss->len += len;
      }

      const char command = pss->buffer[0];

      // check auth
      if (server->credential != NULL && !pss->authenticated && command != JSON_DATA) {
        lwsl_warn("WS client not authenticated\n");
        return 1;
      }

      // check if there are more fragmented messages
      if (lws_remaining_packet_payload(wsi) > 0 || !lws_is_final_fragment(wsi)) {
        return 0;
      }

      proc = pss->proc;
      switch (command) {
        case INPUT:
          if (proc->pty == 0) break;
          if (server->readonly) break;

          char *data = xmalloc(pss->len - 1);
          memcpy(data, pss->buffer + 1, pss->len - 1);

          uv_buf_t b = {data, pss->len - 1};
          uv_write_t *req = xmalloc(sizeof(uv_write_t));
          req->data = data;

          int err = uv_write(req, (uv_stream_t *)&proc->pipe, &b, 1, write_cb);
          if (err) {
            lwsl_err("uv_write: %s (%s)\n", uv_err_name(err), uv_strerror(err));
            return -1;
          }
          break;
        case RESIZE_TERMINAL: {
          int cols, rows;
          if (parse_window_size(pss, &cols, &rows)) {
            if (pty_resize(proc->pty, cols, rows) < 0) {
              lwsl_err("pty_resize: %d (%s)\n", errno, strerror(errno));
            }
          }
        } break;
        case JSON_DATA:
          if (proc->pid > 0) break;
          if (server->credential != NULL) {
            json_object *obj = json_tokener_parse(pss->buffer);
            struct json_object *o = NULL;
            if (json_object_object_get_ex(obj, "AuthToken", &o)) {
              const char *token = json_object_get_string(o);
              if (token != NULL && !strcmp(token, server->credential))
                pss->authenticated = true;
              else
                lwsl_warn("WS authentication failed with token: %s\n", token);
            }
            if (!pss->authenticated) {
              lws_close_reason(wsi, LWS_CLOSE_STATUS_POLICY_VIOLATION, NULL, 0);
              return -1;
            }
          }
          if (spawn_process(pss) != 0) return 1;
          break;
        default:
          lwsl_warn("ignored unknown message type: %c\n", command);
          break;
      }

      if (pss->buffer != NULL) {
        free(pss->buffer);
        pss->buffer = NULL;
      }
      break;

    case LWS_CALLBACK_CLOSED:
      if (pss->wsi == NULL) break;

      server->client_count--;
      lwsl_notice("WS closed from %s, clients: %d\n", pss->address, server->client_count);
      if (pss->buffer != NULL) {
        free(pss->buffer);
      }

      proc = pss->proc;
      if (proc->state == STATE_EXIT) {
        pty_proc_free(proc);
      } else {
        proc->state = STATE_KILL;
        uv_read_stop((uv_stream_t *)&proc->pipe);
        kill_process(proc);
      }

      if (server->once && server->client_count == 0) {
        lwsl_notice("exiting due to the --once option.\n");
        force_exit = true;
        lws_cancel_service(context);
        exit(0);
      }
      break;

    default:
      break;
  }

  return 0;
}
