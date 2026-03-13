/* compat.h -- MSVC compatibility shims for POSIX functions */
#ifndef TTYD_COMPAT_H
#define TTYD_COMPAT_H

#ifdef _MSC_VER
#include <string.h>
#include <sys/stat.h>
#define strcasecmp _stricmp
#define strncasecmp _strnicmp

#ifndef S_ISDIR
#define S_ISDIR(m) (((m) & _S_IFMT) == _S_IFDIR)
#endif
#ifndef S_ISREG
#define S_ISREG(m) (((m) & _S_IFMT) == _S_IFREG)
#endif
#endif

#endif /* TTYD_COMPAT_H */
