#!/bin/bash
#
# Example:
#         env BUILD_TARGET=mips ./scripts/cross-build.sh
#
set -eo pipefail

CROSS_ROOT="${CROSS_ROOT:-/opt/cross}"
STAGE_ROOT="${STAGE_ROOT:-/opt/stage}"
BUILD_ROOT="${BUILD_ROOT:-/opt/build}"
BUILD_TARGET="${BUILD_TARGET:-x86_64}"

ZLIB_VERSION="${ZLIB_VERSION:-1.3.1}"
JSON_C_VERSION="${JSON_C_VERSION:-0.17}"
MBEDTLS_VERSION="${MBEDTLS_VERSION:-2.28.5}"
LIBUV_VERSION="${LIBUV_VERSION:-1.44.2}"
LIBWEBSOCKETS_VERSION="${LIBWEBSOCKETS_VERSION:-4.3.3}"

build_zlib() {
    echo "=== Building zlib-${ZLIB_VERSION} (${TARGET})..."
    curl -fSsLo- "https://zlib.net/zlib-${ZLIB_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}"/zlib-"${ZLIB_VERSION}"
        env CHOST="${TARGET}" ./configure --static --archs="-fPIC" --prefix="${STAGE_DIR}"
        make -j"$(nproc)" install
    popd
}

build_json-c() {
    echo "=== Building json-c-${JSON_C_VERSION} (${TARGET})..."
    curl -fSsLo- "https://s3.amazonaws.com/json-c_releases/releases/json-c-${JSON_C_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/json-c-${JSON_C_VERSION}"
        rm -rf build && mkdir -p build && cd build
        cmake -DCMAKE_TOOLCHAIN_FILE="${BUILD_DIR}/cross-${TARGET}.cmake" \
            -DCMAKE_BUILD_TYPE=RELEASE \
            -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
            -DBUILD_SHARED_LIBS=OFF \
            -DBUILD_TESTING=OFF \
            -DDISABLE_THREAD_LOCAL_STORAGE=ON \
            ..
        make -j"$(nproc)" install
    popd
}

build_mbedtls() {
    echo "=== Building mbedtls-${MBEDTLS_VERSION} (${TARGET})..."
    curl -fSsLo- "https://github.com/ARMmbed/mbedtls/archive/v${MBEDTLS_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/mbedtls-${MBEDTLS_VERSION}"
        rm -rf build && mkdir -p build && cd build
        cmake -DCMAKE_TOOLCHAIN_FILE="${BUILD_DIR}/cross-${TARGET}.cmake" \
            -DCMAKE_BUILD_TYPE=RELEASE \
            -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
            -DENABLE_TESTING=OFF \
            ..
        make -j"$(nproc)" install
    popd
}

build_libuv() {
    echo "=== Building libuv-${LIBUV_VERSION} (${TARGET})..."
    curl -fSsLo- "https://dist.libuv.org/dist/v${LIBUV_VERSION}/libuv-v${LIBUV_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/libuv-v${LIBUV_VERSION}"
        ./autogen.sh
        env CFLAGS=-fPIC ./configure --disable-shared --enable-static --prefix="${STAGE_DIR}" --host="${TARGET}"
        make -j"$(nproc)" install
    popd
}

install_cmake_cross_file() {
    cat << EOF > "${BUILD_DIR}/cross-${TARGET}.cmake"
SET(CMAKE_SYSTEM_NAME $1)

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
    curl -fSsLo- "https://github.com/warmcat/libwebsockets/archive/v${LIBWEBSOCKETS_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/libwebsockets-${LIBWEBSOCKETS_VERSION}"
        sed -i 's/ websockets_shared//g' cmake/libwebsockets-config.cmake.in
        sed -i 's/ OR PC_OPENSSL_FOUND//g' lib/tls/CMakeLists.txt
        sed -i '/PC_OPENSSL/d' lib/tls/CMakeLists.txt
        rm -rf build && mkdir -p build && cd build
        cmake -DCMAKE_TOOLCHAIN_FILE="${BUILD_DIR}/cross-${TARGET}.cmake" \
            -DCMAKE_BUILD_TYPE=RELEASE \
            -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
            -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
            -DCMAKE_EXE_LINKER_FLAGS="-static" \
            -DLWS_WITHOUT_TESTAPPS=ON \
            -DLWS_WITH_MBEDTLS=ON \
            -DLWS_WITH_LIBUV=ON \
            -DLWS_STATIC_PIC=ON \
            -DLWS_WITH_SHARED=OFF \
            -DLWS_UNIX_SOCK=ON \
            -DLWS_IPV6=ON \
            -DLWS_ROLE_RAW_FILE=OFF \
            -DLWS_WITH_HTTP2=ON \
            -DLWS_WITH_HTTP_BASIC_AUTH=OFF \
            -DLWS_WITH_UDP=OFF \
            -DLWS_WITHOUT_CLIENT=ON \
            -DLWS_WITHOUT_EXTENSIONS=OFF \
            -DLWS_WITH_LEJP=OFF \
            -DLWS_WITH_LEJP_CONF=OFF \
            -DLWS_WITH_LWSAC=OFF \
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
    MUSL_CC_URL="https://github.com/tsl0922/musl-toolchains/releases/download/2021-11-23"
    COMPONENTS="1"
    SYSTEM="Linux"

    if [ "$ALIAS" = "win32" ]; then
        COMPONENTS=2
        SYSTEM="Windows"
    fi

    echo "=== Installing toolchain ${ALIAS} (${TARGET})..."

    mkdir -p "${CROSS_ROOT}" && export PATH="${PATH}:${CROSS_ROOT}/bin"
    curl -fSsLo- "${MUSL_CC_URL}/${TARGET}-cross.tgz" | tar xz -C "${CROSS_ROOT}" --strip-components=${COMPONENTS}

    echo "=== Building target ${ALIAS} (${TARGET})..."

    rm -rf "${STAGE_DIR}" "${BUILD_DIR}"
    mkdir -p "${STAGE_DIR}" "${BUILD_DIR}"
    export PKG_CONFIG_PATH="${STAGE_DIR}/lib/pkgconfig"

    install_cmake_cross_file ${SYSTEM}

    build_zlib
    build_json-c
    build_libuv
    build_mbedtls
    build_libwebsockets
    build_ttyd
}

case ${BUILD_TARGET} in
    amd64) BUILD_TARGET="x86_64" ;;
    arm64) BUILD_TARGET="aarch64" ;;
    armv7) BUILD_TARGET="armv7l" ;;
esac

case ${BUILD_TARGET} in
    i686|x86_64|aarch64|mips|mipsel|mips64|mips64el|s390x)
        build "${BUILD_TARGET}-linux-musl" "${BUILD_TARGET}"
        ;;
    arm)
        build "${BUILD_TARGET}-linux-musleabi" "${BUILD_TARGET}"
        ;;
    armhf)
        build arm-linux-musleabihf "${BUILD_TARGET}"
        ;;
    armv7l)
        build armv7l-linux-musleabihf "${BUILD_TARGET}"
        ;;
    win32)
        build x86_64-w64-mingw32 "${BUILD_TARGET}"
        ;;
    *)
        echo "unknown cross target: ${BUILD_TARGET}" && exit 1
esac
