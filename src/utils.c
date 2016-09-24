#define _GNU_SOURCE

#include <stdio.h>
#include <ctype.h>
#include <string.h>
#include <signal.h>

#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/buffer.h>

// http://web.mit.edu/~svalente/src/kill/kill.c
#ifdef __linux__
/*
 *  sys_signame -- an ordered list of signals.
 *  lifted from /usr/include/linux/signal.h
 *  this particular order is only correct for linux.
 *  this is _not_ portable.
 */
const char *sys_signame[NSIG] = {
    "zero",  "HUP",  "INT",   "QUIT", "ILL",   "TRAP", "IOT",  "UNUSED",
    "FPE",   "KILL", "USR1",  "SEGV", "USR2",  "PIPE", "ALRM", "TERM",
    "STKFLT","CHLD", "CONT",  "STOP", "TSTP",  "TTIN", "TTOU", "IO",
    "XCPU",  "XFSZ", "VTALRM","PROF", "WINCH", NULL
};
#endif

void *
t_malloc(size_t size) {
    if (size == 0)
        return NULL;
    void *p = malloc(size);
    if (!p)
        abort();
    return p;
}

void t_free(void *p) {
    free(p);
}

void *
t_realloc(void *p, size_t size) {
    if ((size == 0) && (p == NULL))
        return NULL;
    p = realloc(p, size);
    if (!p)
        abort();
    return p;
}

char *
uppercase(char *str) {
    int i = 0;
    do {
        str[i] = (char) toupper(str[i]);
    } while (str[i++] != '\0');
    return str;
}

int
get_sig_name(int sig, char *buf) {
    int n = sprintf(buf, "SIG%s", sig < NSIG ? sys_signame[sig] : "unknown");
    uppercase(buf);
    return n;
}

int
get_sig(const char *sig_name) {
    if (strcasestr(sig_name, "sig") != sig_name || strlen(sig_name) <= 3) {
        return -1;
    }
    for (int sig = 1; sig < NSIG; sig++) {
        const char *name = sys_signame[sig];
        if (strcasecmp(name, sig_name + 3) == 0)
            return sig;
    }
    return -1;
}

char *
base64_encode(const unsigned char *buffer, size_t length) {
    BIO *bio, *b64;
    BUF_MEM *bptr;

    b64 = BIO_new(BIO_f_base64());
    bio = BIO_new(BIO_s_mem());
    b64 = BIO_push(b64, bio);

    BIO_write(b64, buffer, (int) length);
    BIO_flush(b64);
    BIO_get_mem_ptr(b64, &bptr);

    char *data = (char *) t_malloc(bptr->length);
    memcpy(data, bptr->data, bptr->length - 1);
    data[bptr->length - 1] = 0;

    BIO_free_all(b64);

    return data;
}