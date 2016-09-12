#include "server.h"
#include "html.h"

int
callback_http(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len) {
    unsigned char buffer[4096 + LWS_PRE];
    unsigned char *p;
    unsigned char *end;
    char buf[256];
    int n;

    switch (reason) {
        case LWS_CALLBACK_HTTP:
            lwsl_notice("lws_http_serve: %s\n", in);

            {
                char name[100], rip[50];
                lws_get_peer_addresses(wsi, lws_get_socket_fd(wsi), name,
                                       sizeof(name), rip, sizeof(rip));
                sprintf(buf, "%s (%s)", name, rip);
                lwsl_notice("HTTP connect from %s\n", buf);
            }

            if (len < 1) {
                lws_return_http_status(wsi, HTTP_STATUS_BAD_REQUEST, NULL);
                goto try_to_reuse;
            }

            if (lws_hdr_total_length(wsi, WSI_TOKEN_POST_URI))
                return 0;

            if (strcmp((const char *) in, "/")) {
                lws_return_http_status(wsi, HTTP_STATUS_NOT_FOUND, NULL);
                goto try_to_reuse;
            }

            p = buffer + LWS_PRE;
            end = p + sizeof(buffer) - LWS_PRE;

            if (lws_add_http_header_status(wsi, 200, &p, end))
                return 1;
            if (lws_add_http_header_by_token(wsi,
                                             WSI_TOKEN_HTTP_CONTENT_TYPE,
                                             (unsigned char *) "text/html",
                                             9, &p, end))
                return 1;
            if (lws_add_http_header_content_length(wsi, index_html_len, &p, end))
                return 1;
            if (lws_finalize_http_header(wsi, &p, end))
                return 1;
            n = lws_write(wsi, buffer + LWS_PRE, p - (buffer + LWS_PRE), LWS_WRITE_HTTP_HEADERS);
            if (n < 0) {
                return 1;
            }

            n = lws_write_http(wsi, index_html, index_html_len);
            if (n < 0)
                return 1;
            goto try_to_reuse;
        case LWS_CALLBACK_HTTP_WRITEABLE:
            lwsl_info("LWS_CALLBACK_HTTP_WRITEABLE\n");
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
