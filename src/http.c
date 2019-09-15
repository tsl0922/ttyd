#include <string.h>
#include <libwebsockets.h>

#include "server.h"
#include "html.h"

enum {
    AUTH_OK, AUTH_FAIL, AUTH_ERROR
};

int
check_auth(struct lws *wsi, struct pss_http *pss) {
    if (server->credential == NULL)
        return AUTH_OK;

    int hdr_length = lws_hdr_total_length(wsi, WSI_TOKEN_HTTP_AUTHORIZATION);
    char buf[hdr_length + 1];
    int len = lws_hdr_copy(wsi, buf, sizeof(buf), WSI_TOKEN_HTTP_AUTHORIZATION);
    if (len > 0) {
        // extract base64 text from authorization header
        char *ptr = &buf[0];
        char *token, *b64_text = NULL;
        int i = 1;
        while ((token = strsep(&ptr, " ")) != NULL) {
            if (strlen(token) == 0)
                continue;
            if (i++ == 2) {
                b64_text = token;
                break;
            }
        }
        if (b64_text != NULL && !strcmp(b64_text, server->credential))
            return AUTH_OK;
    }

    unsigned char buffer[1024 + LWS_PRE], *p, *end;
    p = buffer + LWS_PRE;
    end = p + sizeof(buffer) - LWS_PRE;

    char *body = strdup("401 Unauthorized\n");
    size_t n = strlen(body);

    if (lws_add_http_header_status(wsi, HTTP_STATUS_UNAUTHORIZED, &p, end))
        return AUTH_ERROR;
    if (lws_add_http_header_by_token(wsi,
                                     WSI_TOKEN_HTTP_WWW_AUTHENTICATE,
                                     (unsigned char *) "Basic realm=\"ttyd\"",
                                     18, &p, end))
        return AUTH_ERROR;
    if (lws_add_http_header_content_length(wsi, n, &p, end))
        return AUTH_ERROR;
    if (lws_finalize_http_header(wsi, &p, end))
        return AUTH_ERROR;
    if (lws_write(wsi, buffer + LWS_PRE, p - (buffer + LWS_PRE), LWS_WRITE_HTTP_HEADERS) < 0)
        return AUTH_ERROR;

    pss->buffer = pss->ptr = body;
    pss->len = n;
    lws_callback_on_writable(wsi);

    return AUTH_FAIL;
}

void
access_log(struct lws *wsi, const char *path) {
    char rip[50];

#if LWS_LIBRARY_VERSION_NUMBER >= 2004000
    lws_get_peer_simple(lws_get_network_wsi(wsi), rip, sizeof(rip));
#else
    char name[100];
    lws_get_peer_addresses(wsi, lws_get_socket_fd(wsi), name, sizeof(name), rip, sizeof(rip));
#endif
    lwsl_notice("HTTP %s - %s\n", path, rip);
}

int
callback_http(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len) {
    struct pss_http *pss = (struct pss_http *) user;
    unsigned char buffer[4096 + LWS_PRE], *p, *end;
    char buf[256];
    bool done = false;

    switch (reason) {
        case LWS_CALLBACK_HTTP:
            access_log(wsi, (const char *) in);
            snprintf(pss->path, sizeof(pss->path), "%s", (const char *) in);
            switch (check_auth(wsi, pss)) {
                case AUTH_OK:
                    break;
                case AUTH_FAIL:
                    return 0;
                case AUTH_ERROR:
                default:
                    return 1;
            }

            p = buffer + LWS_PRE;
            end = p + sizeof(buffer) - LWS_PRE;

            if (strncmp(pss->path, "/auth_token.js", 14) == 0) {
                const char *credential = server->credential != NULL ? server->credential : "";
                size_t n = sprintf(buf, "var tty_auth_token = '%s';\n", credential);
                if (lws_add_http_header_status(wsi, HTTP_STATUS_OK, &p, end))
                    return 1;
                if (lws_add_http_header_by_token(wsi,
                                                 WSI_TOKEN_HTTP_CONTENT_TYPE,
                                                 (unsigned char *) "application/javascript",
                                                 22, &p, end))
                    return 1;
                if (lws_add_http_header_content_length(wsi, (unsigned long) n, &p, end))
                    return 1;
                if (lws_finalize_http_header(wsi, &p, end))
                    return 1;
                if (lws_write(wsi, buffer + LWS_PRE, p - (buffer + LWS_PRE), LWS_WRITE_HTTP_HEADERS) < 0)
                    return 1;
                pss->buffer = pss->ptr = strdup(buf);
                pss->len = n;
                lws_callback_on_writable(wsi);
                break;
            }

            if (strcmp(pss->path, "/") != 0) {
                lws_return_http_status(wsi, HTTP_STATUS_NOT_FOUND, NULL);
                goto try_to_reuse;
            }

            const char* content_type = "text/html";
            if (server->index != NULL) {
                int n = lws_serve_http_file(wsi, server->index, content_type, NULL, 0);
                if (n < 0 || (n > 0 && lws_http_transaction_completed(wsi)))
                    return 1;
            } else {
                if (lws_add_http_header_status(wsi, HTTP_STATUS_OK, &p, end))
                    return 1;
                if (lws_add_http_header_by_token(wsi, WSI_TOKEN_HTTP_CONTENT_TYPE, (const unsigned char *) content_type, 9, &p, end))
                    return 1;
                if (lws_add_http_header_content_length(wsi, (unsigned long) index_html_len, &p, end))
                    return 1;
                if (lws_finalize_http_header(wsi, &p, end))
                    return 1;
                if (lws_write(wsi, buffer + LWS_PRE, p - (buffer + LWS_PRE), LWS_WRITE_HTTP_HEADERS) < 0)
                    return 1;
#if LWS_LIBRARY_VERSION_MAJOR < 2
                if (lws_write_http(wsi, index_html, index_html_len) < 0)
                    return 1;
                goto try_to_reuse;
#else
                pss->buffer = pss->ptr = (char *) index_html;
                pss->len = index_html_len;
                lws_callback_on_writable(wsi);
#endif
            }
            break;

        case LWS_CALLBACK_HTTP_WRITEABLE:
            if (!pss->buffer || pss->len <= 0) {
                goto try_to_reuse;
            }

            do {
                int n = sizeof(buffer) - LWS_PRE;
                int m = lws_get_peer_write_allowance(wsi);
                if (m == 0) {
                    lws_callback_on_writable(wsi);
                    return 0;
                } else if (m != -1 && m < n) {
                    n = m;
                }
                if (pss->ptr + n > pss->buffer + pss->len) {
                    n = (int) (pss->len - (pss->ptr - pss->buffer));
                    done = true;
                }
                memcpy(buffer + LWS_PRE, pss->ptr, n);
                pss->ptr += n;
                if (lws_write_http(wsi, buffer + LWS_PRE, (size_t) n) < n) {
                    if (pss->buffer != (char *) index_html) free(pss->buffer);
                    return -1;
                }
            } while (!lws_send_pipe_choked(wsi) && !done);

            if (!done && pss->ptr < pss->buffer + pss->len) {
                lws_callback_on_writable(wsi);
                break;
            }

            if (pss->buffer != (char *) index_html) {
                free(pss->buffer);
            }
            goto try_to_reuse;

        case LWS_CALLBACK_HTTP_FILE_COMPLETION:
            goto try_to_reuse;

        case LWS_CALLBACK_OPENSSL_PERFORM_CLIENT_CERT_VERIFICATION:
            if (!len || (SSL_get_verify_result((SSL *) in) != X509_V_OK)) {
                int err = X509_STORE_CTX_get_error((X509_STORE_CTX *) user);
                int depth = X509_STORE_CTX_get_error_depth((X509_STORE_CTX *) user);
                const char *msg = X509_verify_cert_error_string(err);
                lwsl_err("client certificate verification error: %s (%d), depth: %d\n", msg, err, depth);
                return 1;
            }
            break;
        default:
            break;
    }

    return 0;

    /* if we're on HTTP1.1 or 2.0, will keep the idle connection alive */
try_to_reuse:
    if (lws_http_transaction_completed(wsi))
        return -1;

    return 0;
}
