#include "cert.h"

#include <libwebsockets.h>

#include "utils.h"

#if defined(LWS_OPENSSL_SUPPORT) || defined(LWS_WITH_TLS)

#ifndef LWS_WITH_MBEDTLS

#include <openssl/err.h>
#include <openssl/x509.h>

static EVP_PKEY* generate_rsa_keypair() {
  EVP_PKEY* pkey = EVP_PKEY_new();
  if (!pkey) {
    return NULL;
  }
#if OPENSSL_VERSION_NUMBER >= 0x10100000L
  EVP_PKEY_CTX* ctx = NULL;
  do {
    ctx = EVP_PKEY_CTX_new_id(EVP_PKEY_RSA, NULL);
    if (!ctx) {
      break;
    }
    if (EVP_PKEY_keygen_init(ctx) <= 0) {
      break;
    }
    if (EVP_PKEY_CTX_set_rsa_keygen_bits(ctx, 4096) <= 0) {
      break;
    }
    if (EVP_PKEY_keygen(ctx, &pkey) <= 0) {
      break;
    }
    EVP_PKEY_CTX_free(ctx);
    return pkey;
  } while (0);
  if (ctx) EVP_PKEY_CTX_free(ctx);
  if (pkey) EVP_PKEY_free(pkey);
  return NULL;
#else
  RSA* rsa = NULL;
  BIGNUM* e = NULL;
  do {
    rsa = RSA_new();
    if (!rsa) {
      break;
    }
    e = BN_new();
    if (!e) {
      break;
    }
    if (!BN_set_word(e, 65537)) {
      break;
    }
    if (!RSA_generate_key_ex(rsa, 4096, e, NULL)) {
      break;
    }
    if (!EVP_PKEY_assign_RSA(pkey, rsa)) {
      break;
    }
    BN_free(e);
    return pkey;
  } while (0);
  if (e) BN_free(e);
  if (rsa) RSA_free(rsa);
  if (pkey) EVP_PKEY_free(pkey);
  return NULL;
#endif
}

void generate_self_signed_cert(const void** ssl_cert_mem, unsigned int* ssl_cert_mem_len,
                               const void** ssl_private_key_mem, unsigned int* ssl_private_key_mem_len) {
  EVP_PKEY* pkey = generate_rsa_keypair();
  if (!pkey) {
    lwsl_err("generate rsa key pair error: %s", ERR_error_string(ERR_get_error(), NULL));
    return;
  }

  unsigned char* pkey_der = NULL;
  unsigned char* cert_der = NULL;
  X509* x509 = NULL;

  do {
    x509 = X509_new();
    if (!x509) {
      break;
    }

    if (!X509_set_version(x509, 2)) {
      break;
    }
    if (!X509_set_pubkey(x509, pkey)) {
      break;
    }

    ASN1_INTEGER* serial_number = X509_get_serialNumber(x509);
    if (!serial_number) {
      break;
    }
    if (!ASN1_INTEGER_set(serial_number, 1)) {
      break;
    }

    ASN1_TIME* not_before = X509_get_notBefore(x509);
    if (!not_before) {
      break;
    }
    if (!X509_gmtime_adj(not_before, 0)) {
      break;
    }

    ASN1_TIME* not_after = X509_get_notAfter(x509);
    if (!not_after) {
      break;
    }
    if (!X509_gmtime_adj(not_after, 10 * 365 * 24 * 60 * 60)) {
      break;
    }

    X509_NAME* name = X509_get_subject_name(x509);
    if (!name) {
      break;
    }
    if (!X509_NAME_add_entry_by_txt(name, "CN", MBSTRING_ASC, (unsigned char*)"ttyd", -1, -1, 0)) {
      break;
    }
    if (!X509_NAME_add_entry_by_txt(name, "O", MBSTRING_ASC, (unsigned char*)"ttyd", -1, -1, 0)) {
      break;
    }
    if (!X509_NAME_add_entry_by_txt(name, "OU", MBSTRING_ASC, (unsigned char*)"ttyd", -1, -1, 0)) {
      break;
    }
    if (!X509_set_issuer_name(x509, name)) {
      break;
    }

    if (!X509_sign(x509, pkey, EVP_sha256())) {
      break;
    }

    int cert_len = i2d_X509(x509, NULL);
    if (cert_len <= 0) {
      break;
    }
    cert_der = xmalloc(cert_len);
    *ssl_cert_mem = cert_der;
    *ssl_cert_mem_len = cert_len;
    if (i2d_X509(x509, &cert_der) != cert_len) {
      break;
    }

    int pkey_len = i2d_PrivateKey(pkey, NULL);
    if (pkey_len <= 0) {
      break;
    }
    pkey_der = xmalloc(pkey_len);
    *ssl_private_key_mem = pkey_der;
    *ssl_private_key_mem_len = pkey_len;
    if (i2d_PrivateKey(pkey, &pkey_der) != pkey_len) {
      break;
    }

    unsigned int fingerprint_len = 0;
    unsigned char fingerprint[EVP_MAX_MD_SIZE];
    char fingerprint_hex[(EVP_MAX_MD_SIZE << 1) + 1];
    if (!X509_digest(x509, EVP_sha256(), fingerprint, &fingerprint_len)) {
      break;
    }
    for (unsigned int i = 0; i < fingerprint_len; i++) {
      snprintf(fingerprint_hex + (i << 1), 3, "%02x", fingerprint[i]);
    }
    lwsl_notice("Certificate Fingerprint: %s", fingerprint_hex);

    X509_free(x509);
    EVP_PKEY_free(pkey);
    return;
  } while (0);

  lwsl_err("generate self signed cert error: %s", ERR_error_string(ERR_get_error(), NULL));
  *ssl_cert_mem = NULL;
  *ssl_cert_mem_len = 0;
  *ssl_private_key_mem = NULL;
  *ssl_private_key_mem_len = 0;
  if (x509) X509_free(x509);
  if (cert_der) free(cert_der);
  if (pkey_der) free(pkey_der);
  if (pkey) EVP_PKEY_free(pkey);
}

#else

#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/error.h>
#include <mbedtls/sha256.h>
#include <mbedtls/x509_crt.h>

void generate_self_signed_cert(const void** ssl_cert_mem, unsigned int* ssl_cert_mem_len,
                               const void** ssl_private_key_mem, unsigned int* ssl_private_key_mem_len) {
  int ret = 0;
  char err_buf[256];
  unsigned char* pkey_der = NULL;
  unsigned char* cert_der = NULL;

  mbedtls_mpi serial;
  mbedtls_mpi_init(&serial);

  mbedtls_entropy_context entropy;
  mbedtls_entropy_init(&entropy);

  mbedtls_ctr_drbg_context ctr_drbg;
  mbedtls_ctr_drbg_init(&ctr_drbg);

  mbedtls_pk_context pkey;
  mbedtls_pk_init(&pkey);

  mbedtls_x509write_cert cert;
  mbedtls_x509write_crt_init(&cert);

  mbedtls_x509write_crt_set_md_alg(&cert, MBEDTLS_MD_SHA256);
  mbedtls_x509write_crt_set_version(&cert, MBEDTLS_X509_CRT_VERSION_3);
  mbedtls_x509write_crt_set_subject_key(&cert, &pkey);
  mbedtls_x509write_crt_set_issuer_key(&cert, &pkey);

  do {
    if ((ret = mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy, NULL, 0)) != 0) {
      break;
    }

    if ((ret = mbedtls_pk_setup(&pkey, mbedtls_pk_info_from_type(MBEDTLS_PK_RSA))) != 0) {
      break;
    }
    if ((ret = mbedtls_rsa_gen_key(mbedtls_pk_rsa(pkey), mbedtls_ctr_drbg_random, &ctr_drbg, 4096, 65537)) != 0) {
      break;
    }

    if ((ret = mbedtls_x509write_crt_set_subject_name(&cert, "CN=ttyd,O=ttyd,OU=ttyd")) != 0) {
      break;
    }
    if ((ret = mbedtls_x509write_crt_set_issuer_name(&cert, "CN=ttyd,O=ttyd,OU=ttyd")) != 0) {
      break;
    }

    if ((ret = mbedtls_mpi_read_string(&serial, 10, "1")) != 0) {
      break;
    }
    if ((ret = mbedtls_x509write_crt_set_serial(&cert, &serial)) != 0) {
      break;
    }

    char not_before[20], not_after[20];
    time_t current_time = time(NULL);
    strftime(not_before, sizeof(not_before), "%Y%m%d%H%M%S", gmtime(&current_time));
    current_time += 10 * 365 * 24 * 60 * 60;
    strftime(not_after, sizeof(not_after), "%Y%m%d%H%M%S", gmtime(&current_time));
    if ((ret = mbedtls_x509write_crt_set_validity(&cert, not_before, not_after)) != 0) {
      break;
    }

    if ((ret - mbedtls_x509write_crt_set_basic_constraints(&cert, 0, -1)) != 0) {
      break;
    }

    const int N = 4096;
    cert_der = xmalloc(N);
    if ((ret = mbedtls_x509write_crt_der(&cert, cert_der, N, mbedtls_ctr_drbg_random, &ctr_drbg)) < 0) {
      break;
    }
    *ssl_cert_mem = cert_der + N - ret;
    *ssl_cert_mem_len = ret;

    pkey_der = xmalloc(N);
    if ((ret = mbedtls_pk_write_key_der(&pkey, pkey_der, N)) < 0) {
      break;
    }
    *ssl_private_key_mem = pkey_der + N - ret;
    *ssl_private_key_mem_len = ret;

    unsigned char fingerprint[32];
    char fingerprint_hex[(sizeof(fingerprint) << 1) + 1];
    mbedtls_sha256_ret(*ssl_cert_mem, *ssl_cert_mem_len, fingerprint, 0);
    for (unsigned int i = 0; i < sizeof(fingerprint); i++) {
      snprintf(fingerprint_hex + (i << 1), 3, "%02x", fingerprint[i]);
    }
    lwsl_notice("Certificate Fingerprint: %s", fingerprint_hex);
  } while (0);

  if (ret < 0) {
    mbedtls_strerror(ret, err_buf, sizeof(err_buf));
    lwsl_err("generate self signed cert error -0x%04X: %s", -ret, err_buf);
    *ssl_cert_mem = NULL;
    *ssl_cert_mem_len = 0;
    *ssl_private_key_mem = NULL;
    *ssl_private_key_mem_len = 0;
    if (cert_der) free(cert_der);
    if (pkey_der) free(pkey_der);
  }

  mbedtls_x509write_crt_free(&cert);
  mbedtls_pk_free(&pkey);
  mbedtls_ctr_drbg_free(&ctr_drbg);
  mbedtls_entropy_free(&entropy);
  mbedtls_mpi_free(&serial);
}

#endif
#endif
