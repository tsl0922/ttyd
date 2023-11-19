#ifndef TTYD_CERT_H
#define TTYD_CERT_H

void generate_self_signed_cert(const void** ssl_cert_mem, unsigned int* ssl_cert_mem_len,
                               const void** ssl_private_key_mem, unsigned int* ssl_private_key_mem_len);

#endif  // TTYD_CERT_H
