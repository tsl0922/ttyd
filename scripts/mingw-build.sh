#!/bin/bash

set -eo pipefail

TMPDIR="${TMPDIR:-/tmp}"
JSON_C_VERSION="${JSON_C_VERSION:-0.15}"
LIBWEBSOCKETS_VERSION="${LIBWEBSOCKETS_VERSION:-4.2.1}"

build_libwebsockets() {
  curl -sLo- "https://github.com/warmcat/libwebsockets/archive/v${LIBWEBSOCKETS_VERSION}.tar.gz" | tar xz -f - -C "${TMPDIR}"
  pushd "${TMPDIR}/libwebsockets-${LIBWEBSOCKETS_VERSION}"
      sed -i 's/ websockets_shared//g' cmake/libwebsockets-config.cmake.in
      sed -i '/PC_OPENSSL/d' lib/tls/CMakeLists.txt
      rm -rf build && mkdir -p build && cd build
      MSYS2_ARG_CONV_EXCL="-DCMAKE_INSTALL_PREFIX=" \
      cmake -G"MSYS Makefiles" \
          -DCMAKE_INSTALL_PREFIX=${MINGW_PREFIX} \
          -DCMAKE_BUILD_TYPE=RELEASE \
          -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
          -DCMAKE_EXE_LINKER_FLAGS="-static" \
          -DLWS_WITH_MBEDTLS=ON \
          -DLWS_WITH_DIR=OFF \
          -DLWS_WITHOUT_DAEMONIZE=ON \
          -DLWS_WITHOUT_TESTAPPS=ON \
          -DLWS_WITH_LIBUV=ON \
          ..
      make -j"$(nproc)" install
  popd
}

build_libwebsockets

rm -rf build && mkdir -p build && cd build
cmake -G"MSYS Makefiles" \
    -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
    -DCMAKE_C_FLAGS="-Os -ffunction-sections -fdata-sections -fno-unwind-tables -fno-asynchronous-unwind-tables -flto" \
    -DCMAKE_EXE_LINKER_FLAGS="-static -no-pie -Wl,-s -Wl,-Bsymbolic -Wl,--gc-sections" \
    -DCMAKE_BUILD_TYPE=RELEASE \
    ..
make install
