#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <sys/queue.h>

#if defined(__OpenBSD__) || defined(__APPLE__)
#include <util.h>
#elif defined(__FreeBSD__)
#include <libutil.h>
#else
#include <pty.h>
#endif

#include <libwebsockets.h>
#include <json.h>

#include "server.h"
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
parse_window_size(const char *json, struct winsize *size) {
    int columns, rows;
    json_object *obj = json_tokener_parse(json);
    struct json_object *o = NULL;

    if (!json_object_object_get_ex(obj, "columns", &o)) {
        lwsl_err("columns field not exists, json: %s\n", json);
        return false;
    }
    columns = json_object_get_int(o);
    if (!json_object_object_get_ex(obj, "rows", &o)) {
        lwsl_err("rows field not exists, json: %s\n", json);
        return false;
    }
    rows = json_object_get_int(o);
    json_object_put(obj);

    memset(size, 0, sizeof(struct winsize));
    size->ws_col = (unsigned short) columns;
    size->ws_row = (unsigned short) rows;

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
tty_client_remove(struct tty_client *client) {
    struct tty_client *iterator;
    LIST_FOREACH(iterator, &server->clients, list) {
        if (iterator == client) {
            LIST_REMOVE(iterator, list);
            server->client_count--;
            break;
        }
    }
}

void
tty_client_destroy(struct tty_client *client) {
    if (!client->running || client->pid <= 0)
        goto cleanup;

    client->running = false;

    // kill process (group) and free resource
    int pgid = getpgid(client->pid);
    int pid = pgid > 0 ? -pgid : client->pid;
    lwsl_notice("sending %s (%d) to process (group) %d\n", server->sig_name, server->sig_code, pid);
    if (kill(pid, server->sig_code) != 0) {
        lwsl_err("kill: %d, errno: %d (%s)\n", pid, errno, strerror(errno));
    }
    pid_t pid_out;
    client->exit_status = wait_proc(client->pid, &pid_out);
    if (pid_out > 0) {
        lwsl_notice("process exited with code %d, pid: %d\n", client->exit_status, pid_out);
    }
    close(client->pty);

cleanup:
    // free the buffer
    if (client->buffer != NULL)
        free(client->buffer);

    for (int i = 0; i < client->argc; i++) {
        free(client->args[i]);
    }

#if LWS_LIBRARY_VERSION_NUMBER >= 3002000
    lws_sul_schedule(context, 0, &client->sul_stagger, NULL, LWS_SET_TIMER_USEC_CANCEL);
#endif

    // remove from client list
    tty_client_remove(client);
}

int
spawn_process(struct tty_client *client) {
    // append url args to arguments
    char *argv[server->argc + client->argc + 1];
    int i, n = 0;
    for (i = 0; i < server->argc; i++) {
        argv[n++] = server->argv[i];
    }
    for (i = 0; i < client->argc; i++) {
        argv[n++] = client->args[i];
    }
    argv[n] = NULL;

    int pty;
    pid_t pid = forkpty(&pty, NULL, NULL, NULL);
    if (pid < 0) { /* error */
        lwsl_err("forkpty failed: %d (%s)\n", errno, strerror(errno));
        return 1;
    } else if (pid == 0) { /* child */
        setenv("TERM", server->terminal_type, true);
#if LWS_LIBRARY_VERSION_NUMBER < 3001000
        // libwebsockets set FD_CLOEXEC since v3.1.0
        close(lws_get_socket_fd(client->wsi));
#endif
        if (execvp(argv[0], argv) < 0) {
            perror("execvp failed\n");
            _exit(-errno);
        }
    }

    // set the file descriptor close-on-exec
    int status_flags = fcntl(pty, F_GETFL);
    if (status_flags != -1) {
        fcntl(pty, F_SETFD, status_flags | FD_CLOEXEC);
    }

    lwsl_notice("started process, pid: %d\n", pid);
    client->pid = pid;
    client->pty = pty;
    client->running = true;
    if (client->size.ws_row > 0 && client->size.ws_col > 0)
        ioctl(client->pty, TIOCSWINSZ, &client->size);

    return 0;
}

void
tty_client_poll(struct tty_client *client) {
    if (client->pid <= 0 || client->state == STATE_READY) return;

    if (!client->running) {
        memset(client->pty_buffer, 0, sizeof(client->pty_buffer));
        client->pty_len = client->exit_status;
        client->state = STATE_READY;
        return;
    }

    fd_set des_set;
    FD_ZERO (&des_set);
    FD_SET (client->pty, &des_set);
    struct timeval tv = { 0, 0 };
    if (select(client->pty + 1, &des_set, NULL, NULL, &tv) <= 0) return;

    if (FD_ISSET (client->pty, &des_set)) {
        memset(client->pty_buffer, 0, sizeof(client->pty_buffer));
        client->pty_len = read(client->pty, client->pty_buffer + LWS_PRE + 1, BUF_SIZE);
        client->state = STATE_READY;
    }
}

int
callback_tty(struct lws *wsi, enum lws_callback_reasons reason,
             void *user, void *in, size_t len) {
    struct tty_client *client = (struct tty_client *) user;
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
            client->running = false;
            client->initialized = false;
            client->initial_cmd_index = 0;
            client->authenticated = false;
            client->wsi = wsi;
            client->buffer = NULL;
            client->state = STATE_INIT;
            client->pty_len = 0;
            client->argc = 0;

            if (server->url_arg) {
                while (lws_hdr_copy_fragment(wsi, buf, sizeof(buf), WSI_TOKEN_HTTP_URI_ARGS, n++) > 0) {
                    if (strncmp(buf, "arg=", 4) == 0) {
                        client->args = xrealloc(client->args, (client->argc + 1) * sizeof(char *));
                        client->args[client->argc] = strdup(&buf[4]);
                        client->argc++;
                    }
                }
            }

            LIST_INSERT_HEAD(&server->clients, client, list);
            server->client_count++;

            lws_hdr_copy(wsi, buf, sizeof(buf), WSI_TOKEN_GET_URI);

#if LWS_LIBRARY_VERSION_NUMBER >= 2004000
            lws_get_peer_simple(lws_get_network_wsi(wsi), client->address, sizeof(client->address));
#else
            char name[100];
            lws_get_peer_addresses(wsi, lws_get_socket_fd(wsi), name, sizeof(name), client->address, sizeof(client->address));
#endif
            lwsl_notice("WS   %s - %s, clients: %d\n", buf, client->address, server->client_count);
            break;

        case LWS_CALLBACK_SERVER_WRITEABLE:
            if (!client->initialized) {
                if (client->initial_cmd_index == sizeof(initial_cmds)) {
                    client->initialized = true;
                    break;
                }
                if (send_initial_message(wsi, client->initial_cmd_index) < 0) {
                    lwsl_err("failed to send initial message, index: %d\n", client->initial_cmd_index);
                    lws_close_reason(wsi, LWS_CLOSE_STATUS_UNEXPECTED_CONDITION, NULL, 0);
                    return -1;
                }
                client->initial_cmd_index++;
                lws_callback_on_writable(wsi);
                break;
            }
            if (client->state != STATE_READY) {
                break;
            }

            // read error or client exited, close connection
            if (client->pty_len == 0) {
                lws_close_reason(wsi, LWS_CLOSE_STATUS_NORMAL, NULL, 0);
                return 1;
            } else if (client->pty_len < 0) {
                lwsl_err("read error: %d (%s)\n", errno, strerror(errno));
                lws_close_reason(wsi, LWS_CLOSE_STATUS_UNEXPECTED_CONDITION, NULL, 0);
                return -1;
            }

            client->pty_buffer[LWS_PRE] = OUTPUT;
            n = (size_t) (client->pty_len + 1);
            if (lws_write(wsi, (unsigned char *) client->pty_buffer + LWS_PRE, n, LWS_WRITE_BINARY) < n) {
                lwsl_err("write data to WS\n");
            }
            client->state = STATE_DONE;
            break;

        case LWS_CALLBACK_RECEIVE:
            if (client->buffer == NULL) {
                client->buffer = xmalloc(len);
                client->len = len;
                memcpy(client->buffer, in, len);
            } else {
                client->buffer = xrealloc(client->buffer, client->len + len);
                memcpy(client->buffer + client->len, in, len);
                client->len += len;
            }

            const char command = client->buffer[0];

            // check auth
            if (server->credential != NULL && !client->authenticated && command != JSON_DATA) {
                lwsl_warn("WS client not authenticated\n");
                return 1;
            }

            // check if there are more fragmented messages
            if (lws_remaining_packet_payload(wsi) > 0 || !lws_is_final_fragment(wsi)) {
                return 0;
            }

            switch (command) {
                case INPUT:
                    if (client->pty == 0)
                        break;
                    if (server->readonly)
                        return 0;
                    if (write(client->pty, client->buffer + 1, client->len - 1) == -1) {
                        lwsl_err("write INPUT to pty: %d (%s)\n", errno, strerror(errno));
                        lws_close_reason(wsi, LWS_CLOSE_STATUS_UNEXPECTED_CONDITION, NULL, 0);
                        return -1;
                    }
                    break;
                case RESIZE_TERMINAL:
                    if (parse_window_size(client->buffer + 1, &client->size) && client->pty > 0) {
                        if (ioctl(client->pty, TIOCSWINSZ, &client->size) == -1) {
                            lwsl_err("ioctl TIOCSWINSZ: %d (%s)\n", errno, strerror(errno));
                        }
                    }
                    break;
                case JSON_DATA:
                    if (client->pid > 0)
                        break;
                    if (server->credential != NULL) {
                        json_object *obj = json_tokener_parse(client->buffer);
                        struct json_object *o = NULL;
                        if (json_object_object_get_ex(obj, "AuthToken", &o)) {
                            const char *token = json_object_get_string(o);
                            if (token != NULL && !strcmp(token, server->credential))
                                client->authenticated = true;
                            else
                                lwsl_warn("WS authentication failed with token: %s\n", token);
                        }
                        if (!client->authenticated) {
                            lws_close_reason(wsi, LWS_CLOSE_STATUS_POLICY_VIOLATION, NULL, 0);
                            return -1;
                        }
                    }
                    if (spawn_process(client) != 0) return 1;
                    break;
                default:
                    lwsl_warn("ignored unknown message type: %c\n", command);
                    break;
            }

            if (client->buffer != NULL) {
                free(client->buffer);
                client->buffer = NULL;
            }
            break;

        case LWS_CALLBACK_CLOSED:
            tty_client_destroy(client);
            lwsl_notice("WS closed from %s, clients: %d\n", client->address, server->client_count);
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
