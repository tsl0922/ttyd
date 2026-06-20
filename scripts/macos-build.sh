#!/bin/bash
#
# Native macOS static build of ttyd (TLS via OpenSSL).
#
# macOS companion to scripts/cross-build.sh: it pins the SAME dependency versions
# and uses the SAME libwebsockets feature flags, but builds natively per-arch (no
# cross toolchain). The third-party deps (json-c, OpenSSL, libuv, libwebsockets)
# are linked statically. zlib resolves to the macOS system libz, and libSystem /
# libutil stay dynamically linked -- normal and unavoidable on macOS, which ships
# no static libSystem.
#
# Build on a Mac of the matching architecture (the CI matrix does this: arm64 on
# macos-14, x86_64 on macos-13). Single-arch native build; cross-arch from one
# host is not supported (dependency configure steps run native test binaries).
#
# Example:
#         env BUILD_TARGET=arm64 ./scripts/macos-build.sh
#
set -eo pipefail

BUILD_TARGET="${BUILD_TARGET:-$(uname -m)}"   # arm64 | x86_64
case "${BUILD_TARGET}" in
    arm64|aarch64) ARCH="arm64";  OPENSSL_TARGET="darwin64-arm64-cc"  ;;
    x86_64)        ARCH="x86_64"; OPENSSL_TARGET="darwin64-x86_64-cc" ;;
    *) echo "unknown macOS target: ${BUILD_TARGET}" >&2 && exit 1 ;;
esac

ROOT="${ROOT:-$(pwd)}"
BUILD_DIR="${BUILD_DIR:-${ROOT}/.macos-build/${ARCH}}"   # unpacked dep sources
STAGE_DIR="${STAGE_DIR:-${ROOT}/.macos-stage/${ARCH}}"   # static install prefix

JSON_C_VERSION="${JSON_C_VERSION:-0.18}"
OPENSSL_VERSION="${OPENSSL_VERSION:-3.6.1}"
LIBUV_VERSION="${LIBUV_VERSION:-1.52.1}"
LIBWEBSOCKETS_VERSION="${LIBWEBSOCKETS_VERSION:-4.5.7}"

NPROC="$(sysctl -n hw.ncpu)"
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-11.0}"

rm -rf "${BUILD_DIR}" "${STAGE_DIR}"
mkdir -p "${BUILD_DIR}" "${STAGE_DIR}"

build_jsonc() {
    echo "=== Building json-c-${JSON_C_VERSION} (${ARCH})..."
    curl -fSsLo- "https://s3.amazonaws.com/json-c_releases/releases/json-c-${JSON_C_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/json-c-${JSON_C_VERSION}" >/dev/null
        rm -rf build && mkdir -p build && cd build
        # NB: cross-build.sh passes -DDISABLE_THREAD_LOCAL_STORAGE=ON for musl;
        # on macOS clang that breaks json-c (undefined SPEC___THREAD), so it is
        # intentionally omitted -- clang supports thread-local storage natively.
        cmake -DCMAKE_BUILD_TYPE=RELEASE \
            -DCMAKE_OSX_ARCHITECTURES="${ARCH}" \
            -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
            -DBUILD_SHARED_LIBS=OFF \
            -DBUILD_TESTING=OFF \
            ..
        make -j"${NPROC}" install
    popd >/dev/null
}

build_openssl() {
    echo "=== Building openssl-${OPENSSL_VERSION} (${OPENSSL_TARGET})..."
    curl -fSsLo- "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/openssl-${OPENSSL_VERSION}" >/dev/null
        # darwin64-<arch>-cc selects the arch; native build, so no CROSS_COMPILE.
        ./Configure "${OPENSSL_TARGET}" no-shared no-tests no-ssl3 no-err \
            -DOPENSSL_SMALL_FOOTPRINT --prefix="${STAGE_DIR}"
        make -j"${NPROC}" >/dev/null
        make install_sw      # libs + headers only; skip docs/man pages
    popd >/dev/null
}

build_libuv() {
    echo "=== Building libuv-${LIBUV_VERSION} (${ARCH})..."
    curl -fSsLo- "https://dist.libuv.org/dist/v${LIBUV_VERSION}/libuv-v${LIBUV_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/libuv-v${LIBUV_VERSION}" >/dev/null
        # libuv ships a CMake build; use it (no autoconf/automake/libtool needed).
        rm -rf build && mkdir -p build && cd build
        cmake -DCMAKE_BUILD_TYPE=RELEASE \
            -DCMAKE_OSX_ARCHITECTURES="${ARCH}" \
            -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
            -DBUILD_TESTING=OFF \
            -DLIBUV_BUILD_SHARED=OFF \
            ..
        make -j"${NPROC}" install
    popd >/dev/null
}

build_libwebsockets() {
    echo "=== Building libwebsockets-${LIBWEBSOCKETS_VERSION} (${ARCH})..."
    curl -fSsLo- "https://github.com/warmcat/libwebsockets/archive/v${LIBWEBSOCKETS_VERSION}.tar.gz" | tar xz -C "${BUILD_DIR}"
    pushd "${BUILD_DIR}/libwebsockets-${LIBWEBSOCKETS_VERSION}" >/dev/null
        # Same patch cross-build.sh applies, with BSD sed: macOS sed REQUIRES an
        # explicit (empty) backup-suffix arg after -i, or it eats the next token.
        sed -i '' 's/ websockets_shared//g' cmake/libwebsockets-config.cmake.in
        rm -rf build && mkdir -p build && cd build
        cmake -DCMAKE_BUILD_TYPE=RELEASE \
            -DCMAKE_OSX_ARCHITECTURES="${ARCH}" \
            -DCMAKE_INSTALL_PREFIX="${STAGE_DIR}" \
            -DCMAKE_PREFIX_PATH="${STAGE_DIR}" \
            -DOPENSSL_ROOT_DIR="${STAGE_DIR}" \
            -DOPENSSL_USE_STATIC_LIBS=TRUE \
            -DLIBUV_INCLUDE_DIRS="${STAGE_DIR}/include" \
            -DLIBUV_LIBRARIES="${STAGE_DIR}/lib/libuv.a" \
            -DLWS_WITH_SSL=ON \
            -DLWS_WITH_LIBUV=ON \
            -DLWS_STATIC_PIC=ON \
            -DLWS_WITH_SHARED=OFF \
            -DLWS_WITHOUT_TESTAPPS=ON \
            -DLWS_WITHOUT_CLIENT=ON \
            -DLWS_WITH_HTTP2=ON \
            -DLWS_WITH_HTTP_STREAM_COMPRESSION=ON \
            -DLWS_UNIX_SOCK=ON \
            -DLWS_IPV6=ON \
            -DLWS_WITHOUT_EXTENSIONS=OFF \
            -DLWS_ROLE_RAW_FILE=OFF \
            -DLWS_WITH_HTTP_BASIC_AUTH=OFF \
            -DLWS_WITH_UDP=OFF \
            -DLWS_WITH_LEJP=OFF \
            -DLWS_WITH_LEJP_CONF=OFF \
            -DLWS_WITH_LWSAC=OFF \
            -DLWS_WITH_SEQUENCER=OFF \
            -DLWS_WITH_UPNG=OFF \
            -DLWS_WITH_JPEG=OFF \
            -DLWS_WITH_DLO=OFF \
            -DLWS_WITH_SYS_STATE=OFF \
            -DLWS_WITH_SYS_SMD=OFF \
            -DLWS_WITH_SECURE_STREAMS=OFF \
            -DLWS_CTEST_INTERNET_AVAILABLE=OFF \
            ..
        make -j"${NPROC}" install
    popd >/dev/null
}

build_ttyd() {
    echo "=== Building ttyd (${ARCH})..."
    cd "${ROOT}"
    rm -rf build && mkdir -p build && cd build
    # macOS link notes:
    #   * No -static: macOS has no static libSystem, so a fully static link is
    #     impossible. Third-party libs resolve statically from STAGE_DIR (which
    #     holds only .a archives); zlib, libSystem and libutil resolve
    #     dynamically -- expected on macOS.
    #   * libuv on macOS needs the CoreFoundation/CoreServices/IOKit frameworks.
    #   * -dead_strip is the macOS analogue of GNU ld's --gc-sections.
    cmake -DCMAKE_BUILD_TYPE=RELEASE \
        -DCMAKE_OSX_ARCHITECTURES="${ARCH}" \
        -DCMAKE_PREFIX_PATH="${STAGE_DIR}" \
        -DOPENSSL_ROOT_DIR="${STAGE_DIR}" \
        -DOPENSSL_USE_STATIC_LIBS=TRUE \
        -DCMAKE_C_FLAGS="-Os -ffunction-sections -fdata-sections" \
        -DCMAKE_EXE_LINKER_FLAGS="-Wl,-dead_strip -framework CoreFoundation -framework CoreServices -framework IOKit" \
        ..
    make
    strip -S ttyd          # -S drops debug symbols; binary stays runnable
}

build_jsonc
build_openssl
build_libuv
build_libwebsockets
build_ttyd

echo "=== Done. Verifying linkage:"
otool -L "${ROOT}/build/ttyd"
"${ROOT}/build/ttyd" --version
