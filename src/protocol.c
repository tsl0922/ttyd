#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <json.h>
#include <libwebsockets.h>

#include "pty.h"
#include "server.h"
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
  int len = lws_hdr_copy(wsi, buf, (int) sizeof(buf), WSI_TOKEN_ORIGIN);
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
  len = lws_hdr_copy(wsi, host_buf, (int) sizeof(host_buf), WSI_TOKEN_HOST);

  return len > 0 && strcasecmp(buf, host_buf) == 0;
}

static void process_read_cb(void *ctx, pty_buf_t *buf, bool eof) {
  struct pss_tty *pss = (struct pss_tty *) ctx;
  pss->pty_buf = buf;
  pss->pty_eof = eof;
  lws_callback_on_writable(pss->wsi);
}

static void process_exit_cb(void *ctx, pty_process *process) {
  struct pss_tty *pss = (struct pss_tty *) ctx;
  if (process->killed) {
    lwsl_notice("process killed with signal %d, pid: %d\n", process->exit_signal, process->pid);
  } else {
    lwsl_notice("process exited with code %d, pid: %d\n", process->exit_code, process->pid);
    pss->pty_eof = true;
    lws_callback_on_writable(pss->wsi);
  }
}

static bool spawn_process(struct pss_tty *pss) {
  // append url args to arguments
  char *argv[server->argc + pss->argc + 1];
  int i, n = 0;
  for (i = 0; i < server->argc; i++) {
    argv[n++] = server->argv[i];
  }
  for (i = 0; i < pss->argc; i++) {
    argv[n++] = pss->args[i];
  }
  argv[n] = NULL;

  pty_process *process = process_init((void *) pss, server->loop, argv);
  if (pty_spawn(process, process_read_cb, process_exit_cb) != 0) {
    lwsl_err("pty_spawn: %d (%s)\n", errno, strerror(errno));
    process_free(process);
    return false;
  }
  lwsl_notice("started process, pid: %d\n", process->pid);
  pss->process = process;
  lws_callback_on_writable(pss->wsi);

  return true;
}

static void wsi_output(struct lws *wsi, pty_buf_t *buf) {
  if (buf == NULL) return;
  char *wbuf = xmalloc(LWS_PRE + 1 + buf->len);
  memcpy(wbuf + LWS_PRE + 1, buf->base, buf->len);
  wbuf[LWS_PRE] = OUTPUT;
  size_t n = buf->len + 1;
  pty_buf_free(buf);
  if (lws_write(wsi, (unsigned char *) wbuf + LWS_PRE, n, LWS_WRITE_BINARY) < n) {
    lwsl_err("write OUTPUT to WS\n");
  }
  free(wbuf);
}

int callback_tty(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in,
                 size_t len) {
  struct pss_tty *pss = (struct pss_tty *)user;
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
        lwsl_warn("refuse to serve WS client for illegal ws path: %s\n", pss->path);
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
      pss->pty_buf = NULL;

      if (server->url_arg) {
        while (lws_hdr_copy_fragment(wsi, buf, sizeof(buf), WSI_TOKEN_HTTP_URI_ARGS, n++) > 0) {
          if (strncmp(buf, "arg=", 4) == 0) {
            pss->args = xrealloc(pss->args, (pss->argc + 1) * sizeof(char *));
            pss->args[pss->argc] = strdup(&buf[4]);
            pss->argc++;
          }
        }
      }

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
      if (!pss->initialized) {
        if (pss->initial_cmd_index == sizeof(initial_cmds)) {
          pss->initialized = true;
          pty_resume(pss->process);
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
      if (pss->pty_eof) {
        lws_close_reason(wsi, pss->process->exit_code ? LWS_CLOSE_STATUS_UNEXPECTED_CONDITION : LWS_CLOSE_STATUS_NORMAL, NULL, 0);
        return 1;
      }

      if (pss->pty_buf != NULL) {
        wsi_output(wsi, pss->pty_buf);
        pss->pty_buf = NULL;
        pty_resume(pss->process);
      }
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

      switch (command) {
        case INPUT:
          if (server->readonly) break;

          char *data = xmalloc(pss->len - 1);
          memcpy(data, pss->buffer + 1, pss->len - 1);

          uv_write_t *req = xmalloc(sizeof(uv_write_t));
          req->data = data;

          int err = pty_write(pss->process, pty_buf_init(data, pss->len - 1));
          if (err) {
            lwsl_err("uv_write: %s (%s)\n", uv_err_name(err), uv_strerror(err));
            return -1;
          }
          break;
        case RESIZE_TERMINAL: {
          int cols, rows;
          if (parse_window_size(pss, &cols, &rows)) {
            if (pty_resize(pss->process, rows, cols) < 0) {
              lwsl_err("pty_resize: %d (%s)\n", errno, strerror(errno));
            }
          }
        } break;
        case PAUSE:
          pty_pause(pss->process);
          break;
        case RESUME:
          pty_resume(pss->process);
          break;
        case JSON_DATA:
          if (pss->process != NULL) break;
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
          if (!spawn_process(pss)) return 1;
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

      if (process_running(pss->process)) {
        pty_pause(pss->process);
        lwsl_notice("killing process, pid: %d\n", pss->process->pid);
        pty_close(pss->process, server->sig_code);
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
