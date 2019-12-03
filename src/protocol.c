#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <errno.h>

#include <libwebsockets.h>
#include <json.h>

#include "server.h"
#include "terminal.h"
#include "utils.h"

// initial message list
char initial_cmds[] = {
        SET_WINDOW_TITLE,
        SET_PREFERENCES
};

int
send_initial_message(struct lws *wsi, int index) {
    unsigned char message[LWS_PRE + 1 + 4096];
    unsigned char *p = &message[LWS_PRE];
    char buffer[128];
    int n = 0;

    char cmd = initial_cmds[index];
    switch(cmd) {
        case SET_WINDOW_TITLE:
            gethostname(buffer, sizeof(buffer) - 1);
            n = sprintf((char *) p, "%c%s (%s)", cmd, server->command, buffer);
            break;
        case SET_PREFERENCES:
            n = sprintf((char *) p, "%c%s", cmd, server->prefs_json);
            break;
        default:
            break;
    }

    return lws_write(wsi, p, (size_t) n, LWS_WRITE_BINARY);
}

bool
parse_window_size(const char *json, int *cols, int *rows) {
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

bool
check_host_origin(struct lws *wsi) {
    int origin_length = lws_hdr_total_length(wsi, WSI_TOKEN_ORIGIN);
    char buf[origin_length + 1];
    memset(buf, 0, sizeof(buf));
    int len = lws_hdr_copy(wsi, buf, sizeof(buf), WSI_TOKEN_ORIGIN);
    if (len <= 0) {
        return false;
    }

    const char *prot, *address, *path;
    int port;
    if (lws_parse_uri(buf, &prot, &address, &port, &path))
        return false;
    if (port == 80 || port == 443) {
        sprintf(buf, "%s", address);
    } else {
        sprintf(buf, "%s:%d", address, port);
    }

    int host_length = lws_hdr_total_length(wsi, WSI_TOKEN_HOST);
    if (host_length != strlen(buf))
        return false;
    char host_buf[host_length + 1];
    memset(host_buf, 0, sizeof(host_buf));
    len = lws_hdr_copy(wsi, host_buf, sizeof(host_buf), WSI_TOKEN_HOST);

    return len > 0 && strcasecmp(buf, host_buf) == 0;
}

void
pss_tty_free(struct pss_tty *pss) {
    uv_read_stop((uv_stream_t *) &pss->pipe);
    uv_close((uv_handle_t*) &pss->pipe, NULL);
    uv_signal_stop(&pss->watcher);

    close(pss->pty);

    // free the buffer
    if (pss->buffer != NULL) {
        free(pss->buffer);
        pss->buffer = NULL;
    }
    if (pss->pty_buffer != NULL) {
        free(pss->pty_buffer);
        pss->pty_buffer = NULL;
    }

    for (int i = 0; i < pss->argc; i++) {
        free(pss->args[i]);
    }
}

void
alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
    buf->base = xmalloc(suggested_size);
    buf->len = suggested_size;
}

void
read_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
    struct pss_tty *pss = (struct pss_tty *) stream->data;
    pss->pty_len = nread;

    uv_read_stop(stream);

    if (nread <= 0) {
        if (nread == UV_ENOBUFS || nread == 0)
            return;
        pss->pty_buffer = NULL;
        if (nread == UV_EOF)
            pss->pty_len = 0;
        else
            lwsl_err("read_cb: %s\n", uv_err_name(nread));
    } else {
        pss->pty_buffer = xmalloc(LWS_PRE + 1 + (size_t ) nread);
        memcpy(pss->pty_buffer + LWS_PRE + 1, buf->base, (size_t ) nread);
    }
    free(buf->base);

    lws_callback_on_writable(pss->wsi);
}

void
child_cb(uv_signal_t *handle, int signum) {
    struct pss_tty *pss;
    pid_t pid;
    int status;

    pss = (struct pss_tty *) handle->data;
    status = wait_proc(pss->pid, &pid);
    if (pid > 0) {
        lwsl_notice("process exited with code %d, pid: %d\n", status, pid);
        pss->pid = 0;
        pss->pty_len = status > 0 ? -status : status;
        pss_tty_free(pss);
    }
}

int
spawn_process(struct pss_tty *pss) {
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

    uv_signal_start(&pss->watcher, child_cb, SIGCHLD);

    pss->pid = pty_fork(&pss->pty, argv[0], argv, server->terminal_type);
    if (pss->pid < 0) {
        lwsl_err("pty_fork: %d (%s)\n", errno, strerror(errno));
        return 1;
    }

    lwsl_notice("started process, pid: %d\n", pss->pid);

    pss->pipe.data = pss;
    uv_pipe_open(&pss->pipe, pss->pty);

    lws_callback_on_writable(pss->wsi);

    return 0;
}

void
kill_process(pid_t pid, int sig) {
    if (pid <= 0) return;

    // kill process (group) and free resource
    lwsl_notice("killing process %d with signal %d\n", pid, sig);
    int pgid = getpgid(pid);
    if (kill(pgid > 0 ? -pgid : pid, sig) != 0) {
        lwsl_err("kill: %d, errno: %d (%s)\n", pid, errno, strerror(errno));
    }
}

int
callback_tty(struct lws *wsi, enum lws_callback_reasons reason,
             void *user, void *in, size_t len) {
    struct pss_tty *pss = (struct pss_tty *) user;
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
            if (lws_hdr_copy(wsi, buf, sizeof(buf), WSI_TOKEN_GET_URI) <= 0 || strcmp(buf, WS_PATH) != 0) {
                lwsl_warn("refuse to serve WS client for illegal ws path: %s\n", buf);
                return 1;
            }

            if (server->check_origin && !check_host_origin(wsi)) {
                lwsl_warn("refuse to serve WS client from different origin due to the --check-origin option.\n");
                return 1;
            }
            break;

        case LWS_CALLBACK_ESTABLISHED:
            pss->initialized = false;
            pss->initial_cmd_index = 0;
            pss->authenticated = false;
            pss->wsi = wsi;
            pss->buffer = NULL;
            pss->pty_len = 0;
            pss->argc = 0;
            pss->loop = server->loop;

            uv_pipe_init(pss->loop, &pss->pipe, 0);
            uv_signal_init(pss->loop, &pss->watcher);
            pss->watcher.data = pss;

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

            lws_hdr_copy(wsi, buf, sizeof(buf), WSI_TOKEN_GET_URI);

#if LWS_LIBRARY_VERSION_NUMBER >= 2004000
            lws_get_peer_simple(lws_get_network_wsi(wsi), pss->address, sizeof(pss->address));
#else
            char name[100];
            lws_get_peer_addresses(wsi, lws_get_socket_fd(wsi), name, sizeof(name), pss->address, sizeof(pss->address));
#endif
            lwsl_notice("WS   %s - %s, clients: %d\n", buf, pss->address, server->client_count);
            break;

        case LWS_CALLBACK_SERVER_WRITEABLE:
            if (!pss->initialized) {
                if (pss->initial_cmd_index == sizeof(initial_cmds)) {
                    pss->initialized = true;
                    uv_read_start((uv_stream_t *)& pss->pipe, alloc_cb, read_cb);
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
            if (pss->pty_len == 0) {
                lws_close_reason(wsi, LWS_CLOSE_STATUS_NORMAL, NULL, 0);
                return 1;
            } else if (pss->pty_len < 0) {
                lws_close_reason(wsi, LWS_CLOSE_STATUS_UNEXPECTED_CONDITION, NULL, 0);
                return -1;
            }

            if (pss->pty_buffer == NULL)
                break;

            pss->pty_buffer[LWS_PRE] = OUTPUT;
            n = (size_t) (pss->pty_len + 1);
            if (lws_write(wsi, (unsigned char *) pss->pty_buffer + LWS_PRE, n, LWS_WRITE_BINARY) < n) {
                lwsl_err("write OUTPUT to WS\n");
            }
            free(pss->pty_buffer);
            pss->pty_buffer = NULL;
            uv_read_start((uv_stream_t *)& pss->pipe, alloc_cb, read_cb);
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
                    if (pss->pty == 0)
                        break;
                    if (server->readonly)
                        return 0;
                    uv_buf_t b = { pss->buffer + 1, pss->len - 1 };
                    int err = uv_try_write((uv_stream_t *) &pss->pipe, &b, 1);
                    if (err < 0) {
                        lwsl_err("uv_try_write: %s\n", uv_err_name(err));
                        return -1;
                    }
                    break;
                case RESIZE_TERMINAL:
                    {
                        int cols, rows;
                        if (parse_window_size(pss->buffer + 1, &cols, &rows)) {
                            if (pty_resize(pss->pty, cols, rows) < 0) {
                                lwsl_err("pty_resize: %d (%s)\n", errno, strerror(errno));
                            }
                        }
                    }
                    break;
                case JSON_DATA:
                    if (pss->pid > 0)
                        break;
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
            server->client_count--;
            lwsl_notice("WS closed from %s, clients: %d\n", pss->address, server->client_count);
            uv_read_stop((uv_stream_t *) &pss->pipe);
            kill_process(pss->pid, server->sig_code);
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
