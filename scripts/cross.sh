#!/bin/bash
#
# This script should be run inside the tsl0922/musl-cross docker image
#

set -eo pipefail

export PATH="$PATH:/opt/cross/bin"

STAGE_ROOT="${STAGE_ROOT:-/opt/stage}"
BUILD_ROOT="${BUILD_ROOT:-/opt/build}"

download_sources() {
	rm -rf sources && mkdir sources
	pushd sources
		curl -L -O https://zlib.net/zlib-1.2.11.tar.gz
		curl -L -O https://s3.amazonaws.com/json-c_releases/releases/json-c-0.13.1.tar.gz
		curl -L -O https://www.openssl.org/source/openssl-1.0.2l.tar.gz
		curl -L -O https://github.com/warmcat/libwebsockets/archive/v2.4.2.tar.gz
		curl -L -O https://github.com/tsl0922/ttyd/archive/1.4.0.tar.gz
		curl -L -o queue.h "https://sourceware.org/git/?p=glibc.git;a=blob_plain;f=misc/sys/queue.h;hb=HEAD"
	popd
}

build_zlib() {
	tar zxf sources/zlib-1.2.11.tar.gz -C $BUILD_DIR
	pushd $BUILD_DIR/zlib-1.2.11
		env CHOST=$TARGET ./configure --static --archs="-fPIC" --prefix=$STAGE_DIR
		make install
	popd
}

build_json-c() {
	tar zxf sources/json-c-0.13.1.tar.gz -C $BUILD_DIR
	pushd $BUILD_DIR/json-c-0.13.1
		env CFLAGS=-fPIC ./configure --prefix=$STAGE_DIR --host $TARGET
		make install
	popd
}

build_openssl() {
	tar zxf sources/openssl-1.0.2l.tar.gz -C $BUILD_DIR
	pushd $BUILD_DIR/openssl-1.0.2l
		env CC=$TARGET-gcc AR=$TARGET-ar RANLIB=$TARGET-ranlib C_INCLUDE_PATH=$STAGE_DIR/include \
			./Configure dist -fPIC --prefix=/ --install_prefix=$STAGE_DIR
		make && make install_sw
	popd
}

install_sys_queue_h() {
	cp sources/queue.h /opt/cross/$TARGET/include/sys
}

install_cmake_cross_file() {
	cat << EOF > $BUILD_DIR/cross-$TARGET.cmake
set(CMAKE_SYSTEM_NAME Linux)

set(CMAKE_C_COMPILER "$TARGET-gcc")
set(CMAKE_CXX_COMPILER "$TARGET-g++")

set(CMAKE_FIND_ROOT_PATH "$STAGE_DIR")
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
EOF
}

build_libwebsockets() {
	tar zxf sources/v2.4.2.tar.gz -C $BUILD_DIR
	pushd $BUILD_DIR/libwebsockets-2.4.2
		sed -i '13s;^;\nSET(CMAKE_FIND_LIBRARY_SUFFIXES ".a")\nSET(CMAKE_EXE_LINKER_FLAGS "-static")\n;' CMakeLists.txt
		sed -i 's/ websockets_shared//g' cmake/LibwebsocketsConfig.cmake.in
		mkdir build && cd build
		cmake -DLWS_WITHOUT_TESTAPPS=ON \
		    -DLWS_STATIC_PIC=ON \
		    -DLWS_WITH_SHARED=OFF \
		    -DLWS_UNIX_SOCK=ON \
		    -DCMAKE_TOOLCHAIN_FILE=../../cross-$TARGET.cmake \
		    -DCMAKE_INSTALL_PREFIX=$STAGE_DIR \
		    ..
		make install
	popd
}

build_ttyd() {
	tar zxf sources/1.4.0.tar.gz -C $BUILD_DIR
	pushd $BUILD_DIR/ttyd-1.4.0
		sed -i '5s;^;\nSET(CMAKE_FIND_LIBRARY_SUFFIXES ".a")\nSET(CMAKE_EXE_LINKER_FLAGS "-static -no-pie -s")\n;' CMakeLists.txt
		mkdir build && cd build
		cmake -DCMAKE_TOOLCHAIN_FILE=../../cross-$TARGET.cmake \
		    -DCMAKE_BUILD_TYPE=RELEASE \
		    ..
		make
	popd
	cp $BUILD_DIR/ttyd-1.4.0/build/ttyd bin/ttyd.$ALIAS
}

build() {
	TARGET="$1"
	ALIAS="$2"
	STAGE_DIR="$STAGE_ROOT/$TARGET"
	BUILD_DIR="$BUILD_ROOT/$TARGET"

	mkdir -p $STAGE_DIR $BUILD_DIR
	export PKG_CONFIG_PATH="$STAGE_DIR/lib/pkgconfig"

	install_cmake_cross_file
	install_sys_queue_h

	build_zlib
	build_json-c
	build_openssl
	build_libwebsockets
	build_ttyd
}

TARGETS=(
	i686    i686-linux-musl
	x86_64  x86_64-linux-musl
	arm     arm-linux-musleabi
	armhf   arm-linux-musleabihf
	aarch64 aarch64-linux-musl
	mips    mips-linux-musl
	mipsel  mipsel-linux-musl
)

echo "=== Downloading sources..."
download_sources

rm -rf bin && mkdir bin
for ((i=0; i<${#TARGETS[@]}; i+=2)); do
	alias="${TARGETS[$i]}"
	target="${TARGETS[$i+1]}"
	echo "=== Building target $alias ($target)..."
	build $target $alias
done

echo "=== Archiving bin to a tarball..."
pushd bin
	tar czvf ../ttyd-musl-static.tar.gz ttyd.*
popd