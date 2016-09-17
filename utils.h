#ifndef TTYD_UTIL_H
#define TTYD_UTIL_H

// malloc with NULL check
void *
t_malloc(size_t size);

// free with NULL check
void
t_free(void *p);

// realloc with NULL check
void *
t_realloc(void *p, size_t size);

// Convert a string to upper case
char *
uppercase(char *str);

// Get human readable signal string
int
get_sig_name(int sig, char *buf);

// Get signal code from string like SIGHUP
int
get_sig(const char *sig_name);

// Encode text to base64, the caller should free the returned string
char *
base64_encode(const unsigned char *buffer, size_t length);

#endif //TTYD_UTIL_H
