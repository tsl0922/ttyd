#include "totp.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <strings.h>  /* for strcasecmp */
#include <time.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <math.h>

static const char *BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/*
 * Decode Base32 (no padding) into a dynamically allocated buffer.
 * *out_len will be set to the byte‐length of the result.
 * Returns 0 on success, -1 on failure.
 */
static int base32_decode(const char *in, uint8_t **out, size_t *out_len) {
  size_t i, bitbuf = 0, bits = 0;
  size_t in_len = strlen(in);
  uint8_t *buf = malloc(in_len * 5 / 8 + 1);
  if (!buf) return -1;
  *out_len = 0;

  for (i = 0; i < in_len; i++) {
    char c = toupper((unsigned char)in[i]);
    const char *p = strchr(BASE32_CHARS, c);
    if (!p) break;  /* stop at first invalid char */

    bitbuf = (bitbuf << 5) | (p - BASE32_CHARS);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      buf[*out_len] = (uint8_t)(bitbuf >> bits);
      (*out_len)++;
      bitbuf &= ((1 << bits) - 1);
    }
  }
  *out = buf;
  return 0;
}

int TOTP_Generate(const char *base32_secret,
                  const EVP_MD *md,
                  uint64_t t,
                  int digits,
                  uint64_t interval,
                  int64_t t0,
                  char *out,
                  size_t out_len)
{
  if (!base32_secret || !md || !out || out_len < (size_t)digits + 1)
    return -1;

  /* 1) decode the shared secret */
  uint8_t *key = NULL;
  size_t key_len = 0;
  if (base32_decode(base32_secret, &key, &key_len) < 0)
    return -1;

  /* 2) compute time‐step counter */
  uint64_t steps = (t - t0) / interval;

  /* 3) 8‐byte big‐endian counter */
  uint8_t msg[8];
  for (int i = 0; i < 8; i++)
    msg[7 - i] = (uint8_t)(steps >> (i * 8));

  /* 4) HMAC(hash, key, msg) */
  unsigned char hmac[EVP_MAX_MD_SIZE];
  unsigned int hmac_len = 0;
  if (!HMAC(md, key, (int)key_len, msg, sizeof(msg), hmac, &hmac_len)) {
    free(key);
    return -1;
  }
  free(key);

  /* 5) dynamic truncation */
  int offset = hmac[hmac_len - 1] & 0x0F;
  uint32_t bin =
    ((hmac[offset + 0] & 0x7F) << 24) |
    ((hmac[offset + 1] & 0xFF) << 16) |
    ((hmac[offset + 2] & 0xFF) <<  8) |
    ((hmac[offset + 3] & 0xFF) <<  0);

  /* 6) compute OTP value */
  uint32_t otp = bin % (uint32_t)pow(10, digits);

  /* 7) format zero-padded result into out[] */
  char fmt[8];
  snprintf(fmt, sizeof(fmt), "%%0%dd", digits);
  snprintf(out, out_len, fmt, otp);
  return 0;
}

int TOTP_GenerateFromSpec(const char *spec,
                          time_t t,
                          char *out,
                          size_t out_len)
{
  if (!spec || !out) return -1;

  /* make a writable copy */
  char *buf = strdup(spec);
  if (!buf) return -1;

  const EVP_MD *md = EVP_sha1();
  char *secret = NULL;

  /* tokenize on ':' */
  char *saveptr = NULL;
  char *token = strtok_r(buf, ":", &saveptr);
  if (!token) {
    free(buf);
    return -1;
  }

  /* first token may be the digest name */
  if (strcasecmp(token, "sha1") == 0) {
    md = EVP_sha1();
    token = strtok_r(NULL, ":", &saveptr);
  }
  else if (strcasecmp(token, "sha256") == 0) {
    md = EVP_sha256();
    token = strtok_r(NULL, ":", &saveptr);
  }
  else if (strcasecmp(token, "sha512") == 0) {
    md = EVP_sha512();
    token = strtok_r(NULL, ":", &saveptr);
  }
  else {
    /* no digest prefix, first token is the secret */
  }

  if (!token) {          /* must have at least SECRET */
    free(buf);
    return -1;
  }
  secret = token;

  /* optional fields */
  int      digits   = 6;
  uint64_t interval = 30;
  int64_t  offset   = 0;

  token = strtok_r(NULL, ":", &saveptr);
  if (token) digits = atoi(token);

  token = strtok_r(NULL, ":", &saveptr);
  if (token) interval = strtoull(token, NULL, 10);

  token = strtok_r(NULL, ":", &saveptr);
  if (token) offset = strtoll(token, NULL, 10);

  /* call the core generator */
  int rc = TOTP_Generate(secret,
                         md,
                         t,
                         digits,
                         interval,
                         offset,
                         out,
                         out_len);

  free(buf);
  return rc;
}
