#ifndef TOTP_H
#define TOTP_H

#include <stdint.h>
#include <stddef.h>
#include <time.h>
#include <openssl/evp.h>

/*
 * TOTP_Generate()
 *
 * base32_secret: ASCII Base32-encoded shared secret (no padding).
 * md:            hash algorithm, e.g. EVP_sha1(), EVP_sha256(), EVP_sha512().
 * t:             current Unix time (seconds), e.g. time(NULL).
 * digits:        number of digits in OTP (usually 6,7 or 8).
 * interval:      time step in seconds (usually 30).
 * t0:            epoch offset (usually 0).
 * out:           buffer to receive \0-terminated OTP string.
 * out_len:       size of out[]; must be ≥ digits+1.
 *
 * Returns 0 on success (out contains the zero-padded OTP), or –1 on error.
 */
int TOTP_Generate(const char *base32_secret,
                  const EVP_MD *md,
                  uint64_t t,
                  int digits,
                  uint64_t interval,
                  int64_t t0,
                  char *out,
                  size_t out_len);


/*
 * Parse a specifier of the form
 *   [DIGEST:]SECRET[:DIGITS[:INTERVAL[:OFFSET]]]
 * and generate the OTP for time t.
 *
 * spec:    the specification string, see above
 * t:       current Unix time (e.g. time(NULL))
 * out:     must be at least (digits+1) bytes
 * out_len: length of out[]
 *
 * Returns 0 on success, -1 on error.
 */
int TOTP_GenerateFromSpec(const char *spec,
                          time_t t,
                          char *out,
                          size_t out_len);
#endif /* TOTP_H */
