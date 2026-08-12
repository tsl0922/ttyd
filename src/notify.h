#ifndef TTYD_NOTIFY_H
#define TTYD_NOTIFY_H

#include <libwebsockets.h>
#include <stdbool.h>
#include <uv.h>

bool notify_start(uv_loop_t *loop);
void notify_stop(void);
void notify_add_client(struct lws *wsi);
void notify_remove_client(struct lws *wsi);

#endif
