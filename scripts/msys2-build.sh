#!/bin/bash

set -eo pipefail

TMPDIR="${TMPDIR:-/tmp}"
JSON_C_VERSION="${JSON_C_VERSION:-0.15}"
LIBWEBSOCKETS_VERSION="${LIBWEBSOCKETS_VERSION:-3.2.2}"

build_json-c() {
  curl -sLo- "https://s3.amazonaws.com/json-c_releases/releases/json-c-${JSON_C_VERSION}.tar.gz" | tar xz -f - -C "${TMPDIR}" || true
  pushd "${TMPDIR}/json-c-${JSON_C_VERSION}"
      rm -rf build && mkdir -p build && cd build
      cmake -DCMAKE_BUILD_TYPE=RELEASE -DBUILD_SHARED_LIBS=OFF ..
      make -j"$(nproc)" install
  popd
}

build_libwebsockets() {
  curl -sLo- "https://github.com/warmcat/libwebsockets/archive/v${LIBWEBSOCKETS_VERSION}.tar.gz" | tar xz -f - -C "${TMPDIR}"
  pushd "${TMPDIR}/libwebsockets-${LIBWEBSOCKETS_VERSION}"
      sed -i 's/ websockets_shared//g' cmake/LibwebsocketsConfig.cmake.in
      rm -rf build && mkdir -p build && cd build
      cmake -DCMAKE_BUILD_TYPE=RELEASE \
          -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
          -DCMAKE_EXE_LINKER_FLAGS="-static" \
          -DLWS_WITH_SSL=OFF \
          -DLWS_WITH_BUNDLED_ZLIB=OFF \
          -DLWS_WITHOUT_TESTAPPS=ON \
          -DLWS_WITH_LIBUV=ON \
          -DLWS_STATIC_PIC=ON \
          -DLWS_WITH_SHARED=OFF \
          -DLWS_UNIX_SOCK=ON \
          -DLWS_IPV6=ON \
          -DLWS_WITH_HTTP2=OFF \
          -DLWS_WITHOUT_CLIENT=ON \
          -DLWS_WITH_LEJP=OFF \
          -DLWS_WITH_LEJP_CONF=OFF \
          -DLWS_WITH_LWSAC=OFF \
          -DLWS_WITH_CUSTOM_HEADERS=OFF \
          -DLWS_WITH_SEQUENCER=OFF \
          ..
      make -j"$(nproc)" install
  popd
}

build_json-c
build_libwebsockets

rm -rf build && mkdir -p build && cd build
cmake -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
    -DCMAKE_C_FLAGS="-Os -ffunction-sections -fdata-sections -fno-unwind-tables -fno-asynchronous-unwind-tables -flto" \
    -DCMAKE_EXE_LINKER_FLAGS="-static -no-pie -Wl,-s -Wl,-Bsymbolic -Wl,--gc-sections" \
    -DCMAKE_BUILD_TYPE=RELEASE \
    ..
make install
