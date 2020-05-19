#include <errno.h>
#include <fcntl.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <unistd.h>

#if defined(__OpenBSD__) || defined(__APPLE__)
#include <util.h>
#elif defined(__FreeBSD__)
#include <libutil.h>
#else
#include <pty.h>
#endif

#include "utils.h"

pid_t pty_fork(int *pty, const char *file, char *const argv[], const char *term) {
  pid_t pid = forkpty(pty, NULL, NULL, NULL);

  if (pid < 0) {
    return pid;
  } else if (pid == 0) {
    setenv("TERM", term, true);
    int ret = execvp(file, argv);
    if (ret < 0) {
      perror("execvp failed\n");
      _exit(-errno);
    }
  }

  // set the file descriptor non blocking
  int flags = fcntl(*pty, F_GETFL);
  if (flags != -1) {
    fcntl(*pty, F_SETFD, flags | O_NONBLOCK);
  }
  // set the file descriptor close-on-exec
  fd_set_cloexec(*pty);

  return pid;
}

int pty_resize(int pty, int cols, int rows) {
  struct winsize size;

  size.ws_col = (unsigned short)cols;
  size.ws_row = (unsigned short)rows;
  size.ws_xpixel = 0;
  size.ws_ypixel = 0;

  return ioctl(pty, TIOCSWINSZ, &size);
}
