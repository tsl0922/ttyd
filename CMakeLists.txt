cmake_minimum_required(VERSION 2.8.12)

if(${CMAKE_VERSION} VERSION_LESS "3.12.0")
    project(ttyd C) 
    set(PROJECT_VERSION_MAJOR "1")
    set(PROJECT_VERSION_MINOR "7")
    set(PROJECT_VERSION_PATCH "4")
    set(PROJECT_VERSION "${PROJECT_VERSION_MAJOR}.${PROJECT_VERSION_MINOR}.${PROJECT_VERSION_PATCH}")
else()
    cmake_policy(SET CMP0048 NEW)
    project(ttyd VERSION 1.7.4 LANGUAGES C)
endif()

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

set(SOURCE_FILES src/utils.c src/pty.c src/protocol.c src/http.c src/server.c)

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
find_package_handle_standard_args(JSON-C REQUIRED_VARS JSON-C_LIBRARY JSON-C_INCLUDE_DIR)
mark_as_advanced(JSON-C_INCLUDE_DIR JSON-C_LIBRARY)
if(JSON-C_FOUND)
    SET(JSON-C_INCLUDE_DIRS "${JSON-C_INCLUDE_DIR}")
    SET(JSON-C_LIBRARIES "${JSON-C_LIBRARY}")
endif()

find_package(ZLIB REQUIRED)
find_package(Libwebsockets 3.2.0 REQUIRED)

set(INCLUDE_DIRS ${ZLIB_INCLUDE_DIR} ${LIBWEBSOCKETS_INCLUDE_DIRS} ${JSON-C_INCLUDE_DIRS} ${LIBUV_INCLUDE_DIRS})
set(LINK_LIBS ${ZLIB_LIBRARIES} ${LIBWEBSOCKETS_LIBRARIES} ${JSON-C_LIBRARIES} ${LIBUV_LIBRARIES})

set (CMAKE_REQUIRED_INCLUDES ${INCLUDE_DIRS})
include(CheckSymbolExists)
check_symbol_exists(LWS_WITH_LIBUV "lws_config.h" LWS_WITH_LIBUV)
check_symbol_exists(LWS_OPENSSL_SUPPORT "lws_config.h" LWS_OPENSSL_ENABLED)
check_symbol_exists(LWS_WITH_MBEDTLS "lws_config.h" LWS_MBEDTLS_ENABLED)
if(NOT LWS_WITH_LIBUV)
    message(FATAL_ERROR "libwebsockets was not build with libuv support (-DLWS_WITH_LIBUV=ON)")
endif()
if(LWS_OPENSSL_ENABLED AND NOT LWS_MBEDTLS_ENABLED)
    find_package(OpenSSL REQUIRED)
    list(APPEND INCLUDE_DIRS ${OPENSSL_INCLUDE_DIR})
    list(APPEND LINK_LIBS ${OPENSSL_LIBRARIES})
endif()

if(WIN32)
    list(APPEND LINK_LIBS shell32 ws2_32)
    configure_file(${CMAKE_CURRENT_SOURCE_DIR}/app.rc.in ${CMAKE_CURRENT_BINARY_DIR}/app.rc @ONLY)
    list(APPEND SOURCE_FILES ${CMAKE_CURRENT_BINARY_DIR}/app.rc)
else()
    find_library(LIBUTIL NAMES util)
    if(LIBUTIL)
        list(APPEND LINK_LIBS util)
    endif()
endif()

add_executable(${PROJECT_NAME} ${SOURCE_FILES})
target_include_directories(${PROJECT_NAME} PUBLIC ${INCLUDE_DIRS})
target_link_libraries(${PROJECT_NAME} ${LINK_LIBS})
target_compile_definitions(${PROJECT_NAME} PUBLIC
    TTYD_VERSION="${PROJECT_VERSION}"
    $<$<PLATFORM_ID:Windows>:_WIN32_WINNT=0xa00 WINVER=0xa00>
)

include(GNUInstallDirs)

install(TARGETS ${PROJECT_NAME} DESTINATION "${CMAKE_INSTALL_BINDIR}" COMPONENT prog)
install(FILES man/ttyd.1 DESTINATION "${CMAKE_INSTALL_MANDIR}/man1" COMPONENT doc)
