#!/bin/bash
#
# Example:
#         env BUILD_TARGET=mips WITH_SSL=true ./scripts/cross-build.sh
#
set -eo pipefail

CROSS_ROOT="${CROSS_ROOT:-/opt/cross}"
STAGE_ROOT="${STAGE_ROOT:-/opt/stage}"
BUILD_ROOT="${BUILD_ROOT:-/opt/build}"
BUILD_TARGET="${BUILD_TARGET:-x86_64}"
WITH_SSL=${WITH_SSL:-false}

ZLIB_VERSION="${ZLIB_VERSION:-1.2.11}"
JSON_C_VERSION="${JSON_C_VERSION:-0.14}"
OPENSSL_VERSION="${OPENSSL_VERSION:-1.1.1g}"
LIBUV_VERSION="${LIBUV_VERSION:-1.38.0}"
LIBWEBSOCKETS_VERSION="${LIBWEBSOCKETS_VERSION:-4.1.4}"

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

map_openssl_target() {
    case $1 in
        i686) echo linux-generic32 ;;
        x86_64) echo linux-x86_64 ;;
        arm|armhf) echo linux-armv4 ;;
        aarch64) echo linux-aarch64 ;;
        mips|mipsel) echo linux-mips32 ;;
        mips64|mips64el) echo linux64-mips64 ;;
        *) echo "unknown openssl target: $1" && exit 1
    esac
}

build_openssl() {
    openssl_target=$(map_openssl_target "${BUILD_TARGET}")
    echo "=== Building openssl-${OPENSSL_VERSION} (${openssl_target})..."
    curl -sLo- "https://www.openssl.org/source/openssl-${OPENSSL_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/openssl-${OPENSSL_VERSION}"
        env CC=gcc CROSS_COMPILE="${TARGET}-" CFLAGS="-fPIC -latomic" \
            ./Configure "${openssl_target}" no-ssl3 no-err -DOPENSSL_SMALL_FOOTPRINT --prefix="${STAGE_DIR}" \
        && make -j"$(nproc)" all > /dev/null && make install_sw
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

set(OPENSSL_USE_STATIC_LIBS TRUE)
EOF
}

build_libwebsockets() {
    echo "=== Building libwebsockets-${LIBWEBSOCKETS_VERSION} (${TARGET})..."
    curl -sLo- "https://github.com/warmcat/libwebsockets/archive/v${LIBWEBSOCKETS_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/libwebsockets-${LIBWEBSOCKETS_VERSION}"
        sed -i 's/ websockets_shared//g' cmake/libwebsockets-config.cmake.in
        sed -i '/PC_OPENSSL/d' CMakeLists.txt
        mkdir build && cd build
        [ "${WITH_SSL}" = true ] || CMAKE_OPTIONS="-DLWS_WITH_SSL=OFF"
        cmake -DCMAKE_TOOLCHAIN_FILE="${BUILD_DIR}/cross-${TARGET}.cmake" "${CMAKE_OPTIONS}" \
            -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
            -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
            -DCMAKE_EXE_LINKER_FLAGS="-static" \
            -DLWS_WITHOUT_TESTAPPS=ON \
            -DLWS_WITH_LIBUV=ON \
            -DLWS_STATIC_PIC=ON \
            -DLWS_WITH_SHARED=OFF \
            -DLWS_UNIX_SOCK=ON \
            -DLWS_IPV6=ON \
            -DLWS_ROLE_RAW_FILE=OFF \
            -DLWS_WITH_HTTP2=OFF \
            -DLWS_WITH_HTTP_BASIC_AUTH=OFF \
            -DLWS_WITH_UDP=OFF \
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

build_ttyd() {
    echo "=== Building ttyd (${TARGET})..."
    rm -rf build && mkdir -p build && cd build
    cmake -DCMAKE_TOOLCHAIN_FILE="${BUILD_DIR}/cross-${TARGET}.cmake" \
        -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
        -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
        -DCMAKE_C_FLAGS="-Os -ffunction-sections -fdata-sections -fno-unwind-tables -fno-asynchronous-unwind-tables -flto" \
        -DCMAKE_EXE_LINKER_FLAGS="-static -no-pie -Wl,-s -Wl,-Bsymbolic -Wl,--gc-sections" \
        -DCMAKE_BUILD_TYPE=RELEASE \
        ..
    make install
}

build() {
    TARGET="$1"
    ALIAS="$2"
    STAGE_DIR="${STAGE_ROOT}/${TARGET}"
    BUILD_DIR="${BUILD_ROOT}/${TARGET}"

    echo "=== Installing toolchain ${ALIAS} (${TARGET})..."

    mkdir -p "${CROSS_ROOT}" && export PATH="${PATH}:/opt/cross/bin"
    curl -sLo- "https://musl.cc/${TARGET}-cross.tgz" | tar xz -C "${CROSS_ROOT}" --strip-components 1

    echo "=== Building target ${ALIAS} (${TARGET})..."

    rm -rf "${STAGE_DIR}" "${BUILD_DIR}"
    mkdir -p "${STAGE_DIR}" "${BUILD_DIR}"
    export PKG_CONFIG_PATH="${STAGE_DIR}/lib/pkgconfig"

    install_cmake_cross_file

    build_zlib
    build_json-c
    build_libuv
    [ "${WITH_SSL}" = true ] && build_openssl
    build_libwebsockets
    build_ttyd
}

case ${BUILD_TARGET} in
    i686|x86_64|aarch64|mips|mipsel|mips64|mips64el)
        build "${BUILD_TARGET}-linux-musl" "${BUILD_TARGET}"
        ;;
    arm)
        build arm-linux-musleabi "${BUILD_TARGET}"
        ;;
    armhf)
        build arm-linux-musleabihf "${BUILD_TARGET}"
        ;;
    *)
        echo "unknown cross target: ${BUILD_TARGET}" && exit 1
esac
