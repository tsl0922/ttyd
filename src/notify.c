#include "notify.h"
#include "server.h"
#include "utils.h"

#include <errno.h>
#include <libwebsockets.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <systemd/sd-bus.h>
#include <uv.h>

/* ------------------------------------------------------------------ */
/*  sd-bus mode: dedicated background thread + uv_async_t bridge       */
/* ------------------------------------------------------------------ */

static sd_bus *notify_bus = NULL;
static uv_thread_t notify_thread;
static volatile bool notify_thread_running = false;
static uv_async_t notify_async;

/* notification payload queued from sd-bus thread to main thread */
static struct {
  char app[256];
  char summary[512];
  char body[1024];
  bool pending;
} pending_notify;

/* called from main (libuv) thread via uv_async_send */
static void on_async(uv_async_t *handle) {
  (void)handle;
  if (!pending_notify.pending) return;
  pending_notify.pending = false;

  size_t al = strlen(pending_notify.app);
  size_t sl = strlen(pending_notify.summary);
  size_t bl = strlen(pending_notify.body);
  size_t jl = al + sl + bl + 64;
  char *json = xmalloc(jl);
  int n = snprintf(json, jl, "{\"app\":\"%s\",\"summary\":\"%s\",\"body\":\"%s\"}",
                    pending_notify.app, pending_notify.summary, pending_notify.body);
  if (n < 0) { free(json); return; }
  size_t total = (size_t)n + 2;
  char *p = xmalloc(total);
  p[0] = NOTIFICATION; memcpy(p + 1, json, (size_t)n); p[total - 1] = '\0';

  struct client_node *c = server->clients;
  while (c) {
    struct pss_tty *ps = (struct pss_tty *)lws_wsi_user(c->wsi);
    if (ps->initialized && ps->process) {
      if (ps->notify_pending) free(ps->notify_pending);
      ps->notify_pending = xmalloc(total);
      memcpy(ps->notify_pending, p, total);
      lws_callback_on_writable(c->wsi);
    }
    c = c->next;
  }
  free(p); free(json);
}

static void notify_thread_fn(void *arg) {
  sd_bus *bus = (sd_bus *)arg;
  while (notify_thread_running) {
    int r = sd_bus_process(bus, NULL);
    if (r == -EAGAIN || r > 0) continue;
    r = sd_bus_wait(bus, 100000);
    if (r == -EAGAIN || r == -EINTR) continue;
    if (r < 0) break;
  }
}

static int method_notify(sd_bus_message *m, void *userdata, sd_bus_error *ret_error) {
  (void)userdata; (void)ret_error;

  const char *app = NULL, *icon = NULL, *summary = NULL, *body = NULL;
  uint32_t rid;
  int32_t expire;

  sd_bus_message_read_basic(m, 's', &app);
  sd_bus_message_read_basic(m, 'u', &rid);
  sd_bus_message_read_basic(m, 's', &icon);
  sd_bus_message_read_basic(m, 's', &summary);
  sd_bus_message_read_basic(m, 's', &body);

  sd_bus_message_enter_container(m, SD_BUS_TYPE_ARRAY, "s");
  while (sd_bus_message_at_end(m, false) == 0) { const char *x; sd_bus_message_read_basic(m, 's', &x); }
  sd_bus_message_exit_container(m);

  sd_bus_message_enter_container(m, SD_BUS_TYPE_ARRAY, "{sv}");
  while (sd_bus_message_at_end(m, false) == 0) {
    sd_bus_message_enter_container(m, SD_BUS_TYPE_DICT_ENTRY, NULL);
    const char *k; sd_bus_message_read_basic(m, 's', &k);
    sd_bus_message_enter_container(m, SD_BUS_TYPE_VARIANT, NULL);
    while (sd_bus_message_at_end(m, false) == 0) sd_bus_message_skip(m, NULL);
    sd_bus_message_exit_container(m);
    sd_bus_message_exit_container(m);
  }
  sd_bus_message_exit_container(m);
  sd_bus_message_read_basic(m, 'i', &expire);

  /* queue for main thread */
  snprintf(pending_notify.app, sizeof(pending_notify.app), "%s", app ? app : "");
  snprintf(pending_notify.summary, sizeof(pending_notify.summary), "%s", summary ? summary : "");
  snprintf(pending_notify.body, sizeof(pending_notify.body), "%s", body ? body : "");
  pending_notify.pending = true;
  uv_async_send(&notify_async);

  lwsl_notice("notification: app=%s summary=%s body=%s\n",
              pending_notify.app, pending_notify.summary, pending_notify.body);
  return sd_bus_reply_method_return(m, "u", (uint32_t)0);
}

static int method_get_capabilities(sd_bus_message *m, void *userdata, sd_bus_error *ret_error) {
  (void)userdata; (void)ret_error;
  sd_bus_message *r = NULL;
  int rc = sd_bus_message_new_method_return(m, &r);
  if (rc < 0) return rc;
  sd_bus_message_open_container(r, SD_BUS_TYPE_ARRAY, "s");
  sd_bus_message_append(r, "s", "body");
  sd_bus_message_close_container(r);
  sd_bus_send(NULL, r, NULL);
  sd_bus_message_unref(r);
  return 1;
}

static int method_get_server_info(sd_bus_message *m, void *userdata, sd_bus_error *ret_error) {
  (void)userdata; (void)ret_error;
  return sd_bus_reply_method_return(m, "ssss", "ttyd", "tsl0922", "1.7.7", "1.2");
}

static int method_close_notification(sd_bus_message *m, void *userdata, sd_bus_error *ret_error) {
  (void)userdata; (void)ret_error;
  return sd_bus_reply_method_return(m, "");
}

static const sd_bus_vtable notify_vtable[] = {
    SD_BUS_VTABLE_START(0),
    SD_BUS_METHOD("Notify", "susssasa{sv}i", "u", method_notify, 0),
    SD_BUS_METHOD("CloseNotification", "u", "", method_close_notification, 0),
    SD_BUS_METHOD("GetCapabilities", "", "as", method_get_capabilities, 0),
    SD_BUS_METHOD("GetServerInformation", "", "ssss", method_get_server_info, 0),
    SD_BUS_VTABLE_END
};

static bool notify_try_claim_name(void) {
  sd_bus *bus = NULL;
  int r;

  r = sd_bus_open_user(&bus);
  if (r < 0) {
    lwsl_info("sd_bus_open_user: %s, trying system\n", strerror(-r));
    r = sd_bus_default_system(&bus);
    if (r < 0) {
      lwsl_info("sd_bus_default_system: %s, using monitor\n", strerror(-r));
      return false;
    }
  }

  r = sd_bus_request_name(bus, "org.freedesktop.Notifications",
                           SD_BUS_NAME_REPLACE_EXISTING);
  if (r < 0) {
    lwsl_info("sd_bus_request_name: %s, using monitor\n", strerror(-r));
    sd_bus_unref(bus);
    return false;
  }

  r = sd_bus_add_object_vtable(bus, NULL, "/org/freedesktop/Notifications",
                                "org.freedesktop.Notifications", notify_vtable, NULL);
  if (r < 0) {
    lwsl_err("sd_bus_add_object_vtable: %s\n", strerror(-r));
    sd_bus_unref(bus);
    return false;
  }

  uv_async_init(server->loop, &notify_async, on_async);

  notify_bus = bus;
  notify_thread_running = true;
  uv_thread_create(&notify_thread, notify_thread_fn, bus);

  lwsl_notice("notification daemon registered on D-Bus\n");
  return true;
}

static void notify_release_name(void) {
  if (!notify_bus) return;
  notify_thread_running = false;
  uv_thread_join(&notify_thread);
  uv_close((uv_handle_t *)&notify_async, NULL);
  sd_bus_unref(notify_bus);
  notify_bus = NULL;
  lwsl_notice("notification daemon released\n");
}

/* ------------------------------------------------------------------ */
/*  dbus-monitor fallback                                                */
/* ------------------------------------------------------------------ */

#define NBL 4096
static char nb[NBL];
static size_t nbl;
static bool nic;
static int nsc;
static char na[256], ns[512], nbd[1024];

static void parse_line(const char *line) {
  if (strstr(line, "member=Notify")) {
    nic = true; nsc = 0; na[0] = ns[0] = nbd[0] = '\0'; return;
  }
  if (!nic) return;
  if (line[0] == '\0') { nic = false; return; }
  if (strstr(line, "string ") == line) {
    const char *s = strchr(line, '"');
    if (!s) return; s++;
    const char *e = strrchr(s, '"');
    if (!e) return;
    size_t n = (size_t)(e - s);
    switch (nsc) {
      case 0: snprintf(na, sizeof(na), "%.*s", (int)n, s); break;
      case 2: snprintf(ns, sizeof(ns), "%.*s", (int)n, s); break;
      case 3: snprintf(nbd, sizeof(nbd), "%.*s", (int)n, s); break;
    }
    nsc++;
  }
  if (strstr(line, "int32 ") == line || strstr(line, "array ") == line) {
    nic = false;
    if (nsc > 0 && (ns[0] || nbd[0])) {
      snprintf(pending_notify.app, sizeof(pending_notify.app), "%s", na);
      snprintf(pending_notify.summary, sizeof(pending_notify.summary), "%s", ns);
      snprintf(pending_notify.body, sizeof(pending_notify.body), "%s", nbd);
      pending_notify.pending = true;
      uv_async_send(&notify_async);
      lwsl_notice("notification: app=%s summary=%s body=%s\n", na, ns, nbd);
    }
    nsc = 0; na[0] = ns[0] = nbd[0] = '\0';
  }
}

static void ma(uv_handle_t *h, size_t sz, uv_buf_t *b) { (void)h; b->base = xmalloc(sz); b->len = sz; }
static void mr(uv_stream_t *s, ssize_t nr, const uv_buf_t *b) {
  (void)s;
  if (nr < 0) { if (b->base) free(b->base); return; }
  for (ssize_t i = 0; i < nr; i++) {
    char c = b->base[i]; if (c == '\r') continue;
    if (c == '\n') {
      nb[nbl] = '\0';
      char *t = nb; while (*t == ' ' || *t == '\t') t++;
      parse_line(t); nbl = 0;
    } else if (nbl < NBL - 1) nb[nbl++] = c;
  }
  if (b->base) free(b->base);
}
static void me(uv_process_t *p, int64_t es, int ts) {
  lwsl_warn("dbus-monitor exit: %" PRId64 " sig %d\n", es, ts);
  uv_close((uv_handle_t *)&server->notify_pipe, NULL);
  uv_close((uv_handle_t *)p, NULL);
  server->notify_active = false;
}

static bool start_monitor(void) {
  uv_async_init(server->loop, &notify_async, on_async);
  uv_pipe_init(server->loop, &server->notify_pipe, 0);
  uv_process_options_t o; memset(&o, 0, sizeof(o));
  char *args[] = {"dbus-monitor", "--session",
    "interface='org.freedesktop.Notifications',member='Notify'", NULL};
  o.file = "dbus-monitor"; o.args = args; o.exit_cb = me;
  uv_stdio_container_t io[3];
  io[0].flags = UV_IGNORE;
  io[1].flags = (uv_stdio_flags)(UV_CREATE_PIPE | UV_WRITABLE_PIPE);
  io[1].data.stream = (uv_stream_t *)&server->notify_pipe;
  io[2].flags = UV_IGNORE;
  o.stdio = io; o.stdio_count = 3;
  int r = uv_spawn(server->loop, &server->notify_proc, &o);
  if (r < 0) { lwsl_err("monitor spawn: %s\n", uv_strerror(r)); uv_close((uv_handle_t *)&server->notify_pipe, NULL); return false; }
  uv_read_start((uv_stream_t *)&server->notify_pipe, ma, mr);
  server->notify_active = true;
  lwsl_notice("notification monitor started (dbus-monitor)\n");
  return true;
}

/* ------------------------------------------------------------------ */
/*  Client tracking                                                     */
/* ------------------------------------------------------------------ */

void notify_add_client(struct lws *wsi) {
  struct client_node *n = xmalloc(sizeof(*n));
  n->wsi = wsi; n->next = server->clients; server->clients = n;
}
void notify_remove_client(struct lws *wsi) {
  struct client_node **p = &server->clients;
  while (*p) {
    if ((*p)->wsi == wsi) { struct client_node *t = *p; *p = t->next; free(t); return; }
    p = &(*p)->next;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

bool notify_start(uv_loop_t *loop) {
  (void)loop;
  if (notify_bus || server->notify_active) return true;
  if (notify_try_claim_name()) return true;
  return start_monitor();
}

void notify_stop(void) {
  notify_release_name();
  if (server->notify_active) {
    uv_process_kill(&server->notify_proc, SIGTERM);
    server->notify_active = false;
    uv_close((uv_handle_t *)&notify_async, NULL);
  }
  struct client_node *c = server->clients;
  while (c) { struct client_node *t = c; c = c->next; free(t); }
  server->clients = NULL;
}
