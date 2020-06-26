#!/bin/bash
#
# This script should be run inside the tsl0922/musl-cross docker image
# Example:
#         docker run --rm -v $(pwd):/ttyd -w /ttyd tsl0922/musl-cross ./scripts/cross-build.sh mips
#
set -eo pipefail

CROSS_ROOT="${CROSS_ROOT:-/opt/cross}"
STAGE_ROOT="${STAGE_ROOT:-/opt/stage}"
BUILD_ROOT="${BUILD_ROOT:-/opt/build}"

ZLIB_VERSION="${ZLIB_VERSION:-1.2.11}"
JSON_C_VERSION="${JSON_C_VERSION:-0.14}"
OPENSSL_VERSION="${OPENSSL_VERSION:-1.0.2u}"
LIBUV_VERSION="${LIBUV_VERSION:-1.38.0}"
LIBWEBSOCKETS_VERSION="${LIBWEBSOCKETS_VERSION:-4.0.19}"

build_zlib() {
    echo "=== Building zlib-${ZLIB_VERSION} (${TARGET})..."
    curl -sLo- "https://zlib.net/zlib-${ZLIB_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}"/zlib-"${ZLIB_VERSION}"
        env CHOST="${TARGET}" ./configure --static --archs="-fPIC" --prefix="${STAGE_DIR}"
        make -j"$(nproc)" install
    popd
}

build_json-c() {
    echo "=== Building json-c-${JSON_C_VERSION} (${TARGET})..."
    curl -sLo- "https://s3.amazonaws.com/json-c_releases/releases/json-c-${JSON_C_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/json-c-${JSON_C_VERSION}"
        mkdir build && cd build
        cmake -DCMAKE_TOOLCHAIN_FILE="${BUILD_DIR}/cross-${TARGET}.cmake" \
            -DCMAKE_BUILD_TYPE=RELEASE \
            -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
            -DBUILD_SHARED_LIBS=OFF \
            ..
        make -j"$(nproc)" install
    popd
}

build_openssl() {
    echo "=== Building openssl-${OPENSSL_VERSION} (${TARGET})..."
    curl -sLo- "https://www.openssl.org/source/openssl-${OPENSSL_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/openssl-${OPENSSL_VERSION}"
        env CC="${TARGET}-gcc" AR="${TARGET}-ar" RANLIB="${TARGET}-ranlib" C_INCLUDE_PATH="${STAGE_DIR}/include" \
            ./Configure dist -fPIC --prefix=/ --install_prefix="${STAGE_DIR}"
        make -j"$(nproc)" > /dev/null
        make install_sw
    popd
}

build_libuv() {
  echo "=== Building libuv-${LIBUV_VERSION} (${TARGET})..."
    curl -sLo- "https://dist.libuv.org/dist/v${LIBUV_VERSION}/libuv-v${LIBUV_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/libuv-v${LIBUV_VERSION}"
        ./autogen.sh
        env CFLAGS=-fPIC ./configure --disable-shared --enable-static --prefix="${STAGE_DIR}" --host="${TARGET}"
        make -j"$(nproc)" install
    popd
}

install_cmake_cross_file() {
    cat << EOF > "${BUILD_DIR}/cross-${TARGET}.cmake"
set(CMAKE_SYSTEM_NAME Linux)

set(CMAKE_C_COMPILER "${TARGET}-gcc")
set(CMAKE_CXX_COMPILER "${TARGET}-g++")

set(CMAKE_FIND_ROOT_PATH "${STAGE_DIR}")
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
EOF
}

build_libwebsockets() {
    echo "=== Building libwebsockets-${LIBWEBSOCKETS_VERSION} (${TARGET})..."
    curl -sLo- "https://github.com/warmcat/libwebsockets/archive/v${LIBWEBSOCKETS_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/libwebsockets-${LIBWEBSOCKETS_VERSION}"
        sed -i 's/ websockets_shared//g' cmake/LibwebsocketsConfig.cmake.in
        mkdir build && cd build
        cmake -DCMAKE_TOOLCHAIN_FILE="${BUILD_DIR}/cross-${TARGET}.cmake" \
            -DCMAKE_BUILD_TYPE=RELEASE \
            -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
            -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
            -DCMAKE_EXE_LINKER_FLAGS="-static" \
            -DLWS_WITHOUT_TESTAPPS=ON \
            -DLWS_WITH_LIBUV=ON \
            -DLWS_STATIC_PIC=ON \
            -DLWS_WITH_SHARED=OFF \
            -DLWS_UNIX_SOCK=ON \
            -DLWS_IPV6=ON \
            ..
        make -j"$(nproc)" install
        sed -i 's/ssl;crypto;//g' "${STAGE_DIR}/lib/cmake/libwebsockets/LibwebsocketsTargets-release.cmake"
    popd
}

build_ttyd() {
    echo "=== Building ttyd (${TARGET})..."
    rm -rf build && mkdir -p build && cd build
  cmake -DCMAKE_TOOLCHAIN_FILE="${BUILD_DIR}/cross-${TARGET}.cmake" \
      -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
      -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
      -DCMAKE_EXE_LINKER_FLAGS="-static -no-pie -s" \
      -DCMAKE_BUILD_TYPE=RELEASE \
      ..
  make install
}

build() {
    TARGET="$1"
    ALIAS="$2"
    STAGE_DIR="${STAGE_ROOT}/${TARGET}"
    BUILD_DIR="${BUILD_ROOT}/${TARGET}"

    echo "=== Building target ${ALIAS} (${TARGET})..."

    rm -rf "${STAGE_DIR}" "${BUILD_DIR}"
    mkdir -p "${STAGE_DIR}" "${BUILD_DIR}"
    export PKG_CONFIG_PATH="${STAGE_DIR}/lib/pkgconfig"

    install_cmake_cross_file

    build_zlib
    build_json-c
    build_libuv
    build_openssl
    build_libwebsockets
    build_ttyd
}

case $1 in
  i386|x86_64|aarch64|mips|mipsel)
    build "$1-linux-musl" "$1"
    ;;
  arm)
    build arm-linux-musleabi "$1"
    ;;
  armhf)
    build arm-linux-musleabihf "$1"
    ;;
  *)
    echo "usage: $0 i386|x86_64|arm|armhf|aarch64|mips|mipsel" && exit 1
esac
