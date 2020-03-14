#ifndef TTYD_TERMINAL_H
#define TTYD_TERMINAL_H

int pty_fork(int *pty, const char *file, char *const argv[], const char *term);

int pty_resize(int pty, int cols, int rows);

#endif  // TTYD_TERMINAL_H
