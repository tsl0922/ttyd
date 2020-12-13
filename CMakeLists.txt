cmake_minimum_required(VERSION 2.8)

project(ttyd C)
set(PROJECT_VERSION "1.6.2")

find_package(Git)
if(GIT_FOUND)
    execute_process(
            COMMAND ${GIT_EXECUTABLE} --git-dir ${CMAKE_CURRENT_SOURCE_DIR}/.git rev-parse --short HEAD
            RESULT_VARIABLE GIT_RET
            OUTPUT_VARIABLE GIT_COMMIT
            OUTPUT_STRIP_TRAILING_WHITESPACE
            ERROR_QUIET
    )
    if("${GIT_RET}" STREQUAL "0")
        set(PROJECT_VERSION "${PROJECT_VERSION}-${GIT_COMMIT}")
    endif()
endif()

set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -D_GNU_SOURCE")
if(CMAKE_VERSION VERSION_LESS "3.1")
    if ("${CMAKE_C_COMPILER_ID}" STREQUAL "GNU")
        set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -std=gnu99")
    else()
        set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -std=c99")
    endif()
else()
    set(CMAKE_C_STANDARD 99)
endif()

set(SOURCE_FILES src/server.c src/http.c src/protocol.c src/terminal.c src/utils.c)

include(FindPackageHandleStandardArgs)

find_path(LIBUV_INCLUDE_DIR NAMES uv.h)
find_library(LIBUV_LIBRARY NAMES uv libuv)
find_package_handle_standard_args(LIBUV REQUIRED_VARS LIBUV_LIBRARY LIBUV_INCLUDE_DIR)
mark_as_advanced(LIBUV_INCLUDE_DIR LIBUV_LIBRARY)
if(LIBUV_FOUND)
    SET(LIBUV_INCLUDE_DIRS "${LIBUV_INCLUDE_DIR}")
    SET(LIBUV_LIBRARIES "${LIBUV_LIBRARY}")
endif()

find_path(JSON-C_INCLUDE_DIR NAMES json.h PATH_SUFFIXES json-c)
find_library(JSON-C_LIBRARY NAMES json-c)
find_package_handle_standard_args(JSON-C REQUIRED_VARS JSON-C_INCLUDE_DIR JSON-C_LIBRARY)
mark_as_advanced(JSON-C_INCLUDE_DIR JSON-C_LIBRARY)
if(JSON-C_FOUND)
    SET(JSON-C_INCLUDE_DIRS "${JSON-C_INCLUDE_DIR}")
    SET(JSON-C_LIBRARIES "${JSON-C_LIBRARY}")
endif()

find_package(ZLIB REQUIRED)
find_package(Libwebsockets 1.7.0 QUIET)

if(NOT Libwebsockets_FOUND) # for libwebsockets-dev on ubuntu 16.04
    find_path(LIBWEBSOCKETS_INCLUDE_DIR NAMES libwebsockets.h)
    find_library(LIBWEBSOCKETS_LIBRARY NAMES websockets)
    find_package_handle_standard_args(Libwebsockets REQUIRED_VARS LIBWEBSOCKETS_LIBRARY LIBWEBSOCKETS_INCLUDE_DIR)
    mark_as_advanced(LIBWEBSOCKETS_INCLUDE_DIR LIBWEBSOCKETS_LIBRARY)
    if(Libwebsockets_FOUND)
        SET(LIBWEBSOCKETS_INCLUDE_DIRS "${LIBWEBSOCKETS_INCLUDE_DIR}")
        SET(LIBWEBSOCKETS_LIBRARIES "${LIBWEBSOCKETS_LIBRARY}")
    endif()
endif()

set(INCLUDE_DIRS ${ZLIB_INCLUDE_DIR} ${LIBWEBSOCKETS_INCLUDE_DIRS} ${JSON-C_INCLUDE_DIRS} ${LIBUV_INCLUDE_DIRS})
set(LINK_LIBS ${ZLIB_LIBRARIES} ${LIBWEBSOCKETS_LIBRARIES} ${JSON-C_LIBRARIES} ${LIBUV_LIBRARIES})

set (CMAKE_REQUIRED_INCLUDES ${INCLUDE_DIRS})
include(CheckCSourceCompiles)
check_c_source_compiles("#include <lws_config.h>
int main(void) {
#if defined(LWS_OPENSSL_SUPPORT) || defined(LWS_WITH_TLS)
    return 0;
#else
    return error;
#endif
}" LWS_SSL_ENABLED)

if(LWS_SSL_ENABLED)
    find_package(OpenSSL REQUIRED)
    list(APPEND INCLUDE_DIRS ${OPENSSL_INCLUDE_DIR})
    list(APPEND LINK_LIBS ${OPENSSL_LIBRARIES})
endif()

if(WIN32)
    list(APPEND LINK_LIBS shell32)
elseif(NOT APPLE)
    list(APPEND LINK_LIBS util)
endif()

add_executable(${PROJECT_NAME} ${SOURCE_FILES})
target_include_directories(${PROJECT_NAME} PUBLIC ${INCLUDE_DIRS})
target_link_libraries(${PROJECT_NAME} ${LINK_LIBS})
target_compile_definitions(${PROJECT_NAME} PRIVATE TTYD_VERSION="${PROJECT_VERSION}")

include(GNUInstallDirs)

install(TARGETS ${PROJECT_NAME} DESTINATION "${CMAKE_INSTALL_BINDIR}" COMPONENT prog)
install(FILES man/ttyd.1 DESTINATION "${CMAKE_INSTALL_MANDIR}/man1" COMPONENT doc)
