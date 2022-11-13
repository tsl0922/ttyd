#!/bin/bash

set -eo pipefail

build_libwebsockets() {
  svn co https://github.com/msys2/MINGW-packages/trunk/mingw-w64-libwebsockets
  sed -i 's/openssl/mbedtls/' mingw-w64-libwebsockets/PKGBUILD
  sed -i '/-DCMAKE_INSTALL_PREFIX=${MINGW_PREFIX}/a \    -DLWS_WITH_MBEDTLS=ON \\' mingw-w64-libwebsockets/PKGBUILD
  sed -i '/-DCMAKE_INSTALL_PREFIX=${MINGW_PREFIX}/a \    -DLWS_WITH_LIBUV=ON \\' mingw-w64-libwebsockets/PKGBUILD
  pushd mingw-w64-libwebsockets
    makepkg-mingw --cleanbuild --syncdeps --force --noconfirm
    pacman -U *.pkg.tar.zst --noconfirm
  popd
}

build_libwebsockets

# workaround for the lib name change
cp ${MINGW_PREFIX}/lib/libuv_a.a ${MINGW_PREFIX}/lib/libuv.a

rm -rf build && mkdir -p build && cd build
cmake -DCMAKE_BUILD_TYPE=RELEASE \
    -DCMAKE_FIND_LIBRARY_SUFFIXES=".a" \
    -DCMAKE_C_FLAGS="-Os -ffunction-sections -fdata-sections -fno-unwind-tables -fno-asynchronous-unwind-tables -flto" \
    -DCMAKE_EXE_LINKER_FLAGS="-static -no-pie -Wl,-s -Wl,-Bsymbolic -Wl,--gc-sections" \
    ..
cmake --build .
