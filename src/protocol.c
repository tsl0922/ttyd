#include "server.h"

// client message
#define INPUT '0'
#define PING '1'
#define RESIZE_TERMINAL '2'
#define JSON_DATA '{'

// server message
#define OUTPUT '0'
#define PONG '1'
#define SET_WINDOW_TITLE '2'
#define SET_PREFERENCES '3'
#define SET_RECONNECT '4'

#define BUF_SIZE 1024

int
send_initial_message(struct lws *wsi) {
    unsigned char message[LWS_PRE + 256];
    unsigned char *p = &message[LWS_PRE];
    int n;

    char hostname[128];
    gethostname(hostname, sizeof(hostname) - 1);

    // window title
    n = sprintf((char *) p, "%c%s (%s)", SET_WINDOW_TITLE, server->command, hostname);
    if (lws_write(wsi, p, (size_t) n, LWS_WRITE_TEXT) < n) {
        return -1;
    }
    // reconnect time
    n = sprintf((char *) p, "%c%d", SET_RECONNECT, server->reconnect);
    if (lws_write(wsi, p, (size_t) n, LWS_WRITE_TEXT) < n) {
        return -1;
    }

    return 0;
}

struct winsize *
parse_window_size(const char *json) {
    int columns, rows;
    json_object *obj = json_tokener_parse(json);
    struct json_object *o = NULL;

    if (!json_object_object_get_ex(obj, "columns", &o)) {
        lwsl_err("columns field not exists!");
        return NULL;
    }
    columns = json_object_get_int(o);
    if (!json_object_object_get_ex(obj, "rows", &o)) {
        lwsl_err("rows field not exists!");
        return NULL;
    }
    rows = json_object_get_int(o);

    struct winsize *size = t_malloc(sizeof(struct winsize));
    memset(size, 0, sizeof(struct winsize));
    size->ws_col = (unsigned short) columns;
    size->ws_row = (unsigned short) rows;

    return size;
}

void
tty_client_destroy(struct tty_client *client) {
    if (client->exit)
        return;

    // stop event loop
    client->exit = true;

    // kill process and free resource
    lwsl_notice("sending %s to process %d\n", server->sig_name, client->pid);
    if (kill(client->pid, server->sig_code) != 0) {
        lwsl_err("kill: pid, errno: %d (%s)\n", client->pid, errno, strerror(errno));
    }
    int status;
    while (waitpid(client->pid, &status, 0) == -1 && errno == EINTR)
        ;
    lwsl_notice("process exited with code %d, pid: %d\n", status, client->pid);
    close(client->pty);

    // free the buffer
    if (client->buffer != NULL)
        t_free(client->buffer);

    // remove from clients list
    pthread_mutex_lock(&server->lock);
    LIST_REMOVE(client, list);
    server->client_count--;
    pthread_mutex_unlock(&server->lock);
}

void *
thread_run_command(void *args) {
    struct tty_client *client;
    int pty;
    int bytes;
    char buf[BUF_SIZE];
    fd_set des_set;

    client = (struct tty_client *) args;
    pid_t pid = forkpty(&pty, NULL, NULL, NULL);

    switch (pid) {
        case -1: /* */
            lwsl_err("forkpty\n");
            break;
        case 0: /* child */
            if (setenv("TERM", "xterm-256color", true) < 0) {
                perror("setenv");
                exit(1);
            }
            if (execvp(server->argv[0], server->argv) < 0) {
                perror("execvp");
                exit(1);
            }
            break;
        default: /* parent */
            lwsl_notice("started process, pid: %d\n", pid);
            client->pid = pid;
            client->pty = pty;

            while (!client->exit) {
                FD_ZERO (&des_set);
                FD_SET (pty, &des_set);

                if (select(pty + 1, &des_set, NULL, NULL, NULL) < 0) {
                    break;
                }

                if (FD_ISSET (pty, &des_set)) {
                    memset(buf, 0, BUF_SIZE);
                    bytes = (int) read(pty, buf, BUF_SIZE);
                    struct pty_data *frame = (struct pty_data *) t_malloc(sizeof(struct pty_data));
                    frame->len = bytes;
                    if (bytes > 0) {
                        frame->data = t_malloc((size_t) bytes);
                        memcpy(frame->data, buf, bytes);
                    }
                    pthread_mutex_lock(&client->lock);
                    STAILQ_INSERT_TAIL(&client->queue, frame, list);
                    pthread_mutex_unlock(&client->lock);
                }
            }
            tty_client_destroy(client);
            break;
    }

    return 0;
}

int
callback_tty(struct lws *wsi, enum lws_callback_reasons reason,
             void *user, void *in, size_t len) {
    struct tty_client *client = (struct tty_client *) user;
    struct winsize *size;

    switch (reason) {
        case LWS_CALLBACK_ESTABLISHED:
            client->exit = false;
            client->initialized = false;
            client->authenticated = false;
            client->wsi = wsi;
            client->buffer = NULL;
            lws_get_peer_addresses(wsi, lws_get_socket_fd(wsi),
                                   client->hostname, sizeof(client->hostname),
                                   client->address, sizeof(client->address));
            STAILQ_INIT(&client->queue);
            if (pthread_create(&client->thread, NULL, thread_run_command, client) != 0) {
                lwsl_err("pthread_create\n");
                return -1;
            }

            pthread_mutex_lock(&server->lock);
            LIST_INSERT_HEAD(&server->clients, client, list);
            server->client_count++;
            pthread_mutex_unlock(&server->lock);

            lwsl_notice("client connected from %s (%s), total: %d\n", client->hostname, client->address, server->client_count);
            break;

        case LWS_CALLBACK_SERVER_WRITEABLE:
            if (!client->initialized) {
                if (send_initial_message(wsi) < 0)
                    return -1;
                client->initialized = true;
                break;
            }

            pthread_mutex_lock(&client->lock);
            while (!STAILQ_EMPTY(&client->queue)) {
                struct pty_data *frame = STAILQ_FIRST(&client->queue);
                // read error or client exited, close connection
                if (frame->len <= 0) {
                    STAILQ_REMOVE_HEAD(&client->queue, list);
                    t_free(frame);
                    return -1;
                }

                char *b64_text = base64_encode((const unsigned char *) frame->data, (size_t) frame->len);
                size_t msg_len = LWS_PRE + strlen(b64_text) + 1;
                unsigned char message[msg_len];
                unsigned char *p = &message[LWS_PRE];
                size_t n = sprintf((char *) p, "%c%s", OUTPUT, b64_text);

                t_free(b64_text);

                if (lws_write(wsi, p, n, LWS_WRITE_TEXT) < n) {
                    lwsl_err("lws_write\n");
                    break;
                }

                STAILQ_REMOVE_HEAD(&client->queue, list);
                t_free(frame->data);
                t_free(frame);

                if(lws_partial_buffered(wsi)){
                    lws_callback_on_writable(wsi);
                    break;
                }
            }
            pthread_mutex_unlock(&client->lock);
            break;

        case LWS_CALLBACK_RECEIVE:
            if (client->buffer == NULL) {
                client->buffer = t_malloc(len + 1);
                client->len = len;
                memcpy(client->buffer, in, len);
            } else {
                client->buffer = t_realloc(client->buffer, client->len + len + 1);
                memcpy(client->buffer + client->len, in, len);
                client->len += len;
            }
            client->buffer[client->len] = '\0';

            const char command = client->buffer[0];

            // check auth
            if (server->credential != NULL && !client->authenticated && command != JSON_DATA) {
                lwsl_notice("websocket authentication failed\n");
                return -1;
            }

            // check if there are more fragmented messages
            if (lws_remaining_packet_payload(wsi) > 0 || !lws_is_final_fragment(wsi)) {
                return 0;
            }

            switch (command) {
                case INPUT:
                    if (write(client->pty, client->buffer + 1, client->len - 1) < client->len - 1) {
                        lwsl_err("write INPUT to pty\n");
                        return -1;
                    }
                    break;
                case PING:
                    {
                        unsigned char c = PONG;
                        if (lws_write(wsi, &c, 1, LWS_WRITE_TEXT) != 1) {
                            lwsl_err("send PONG\n");
                            return -1;
                        }
                    }
                    break;
                case RESIZE_TERMINAL:
                    size = parse_window_size(client->buffer + 1);
                    if (size != NULL) {
                        if (ioctl(client->pty, TIOCSWINSZ, size) == -1) {
                            lwsl_err("ioctl TIOCSWINSZ: %d (%s)\n", errno, strerror(errno));
                        }
                        t_free(size);
                    }
                    break;
                case JSON_DATA:
                    if (server->credential == NULL)
                        break;
                    {
                        json_object *obj = json_tokener_parse(client->buffer);
                        struct json_object *o = NULL;
                        if (json_object_object_get_ex(obj, "AuthToken", &o)) {
                            const char *token = json_object_get_string(o);
                            if (strcmp(token, server->credential)) {
                                lwsl_notice("websocket authentication failed with token: %s\n", token);
                                return -1;
                            }
                        }
                        client->authenticated = true;
                    }
                    break;
                default:
                    lwsl_notice("unknown message type: %c\n", command);
                    break;
            }

            if (client->buffer != NULL) {
                t_free(client->buffer);
                client->buffer = NULL;
            }
            break;

        case LWS_CALLBACK_CLOSED:
            tty_client_destroy(client);
            lwsl_notice("client disconnected from %s (%s), total: %d\n", client->hostname, client->address, server->client_count);
            break;

        default:
            break;
    }

    return 0;
}