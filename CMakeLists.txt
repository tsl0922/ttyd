cmake_minimum_required(VERSION 2.8)

project(ttyd)
set(PROJECT_VERSION "1.5.2")

find_package(Git)
if(GIT_FOUND)
    execute_process(
            COMMAND ${GIT_EXECUTABLE} rev-parse --short HEAD
            WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
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

set(LIBWEBSOCKETS_MIN_VERSION 1.7.0)
set(SOURCE_FILES src/server.c src/http.c src/protocol.c src/terminal.c src/utils.c)

find_package(OpenSSL REQUIRED)
find_package(Libwebsockets ${LIBWEBSOCKETS_MIN_VERSION} QUIET)

find_package(PkgConfig)

if(NOT Libwebsockets_FOUND)
    pkg_check_modules(PC_LIBWEBSOCKETS REQUIRED libwebsockets>=${LIBWEBSOCKETS_MIN_VERSION})
    find_path(LIBWEBSOCKETS_INCLUDE_DIRS libwebsockets.h HINTS ${PC_LIBWEBSOCKETS_INCLUDEDIR})
    find_library(LIBWEBSOCKETS_LIBRARIES NAMES websockets libwebsockets HINTS ${PC_LIBWEBSOCKETS_LIBDIR})
    include(FindPackageHandleStandardArgs)
    find_package_handle_standard_args(LIBWEBSOCKETS DEFAULT_MSG LIBWEBSOCKETS_LIBRARIES LIBWEBSOCKETS_INCLUDE_DIRS)
    mark_as_advanced(LIBWEBSOCKETS_INCLUDE_DIRS LIBWEBSOCKETS_LIBRARIES)
endif()

pkg_check_modules(PC_JSON-C REQUIRED json-c)
find_path(JSON-C_INCLUDE_DIRS json.h HINTS ${PC_JSON-C_INCLUDEDIR} PATH_SUFFIXES json-c json)
find_library(JSON-C_LIBRARIES NAMES json-c libjson-c HINTS ${PC_JSON-C_LIBDIR})
include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(JSON-C DEFAULT_MSG JSON-C_LIBRARIES JSON-C_INCLUDE_DIRS)
mark_as_advanced(JSON-C_INCLUDE_DIRS JSON-C_LIBRARIES)

pkg_check_modules(PC_LIBUV REQUIRED libuv>=1.0.0)
find_path(LIBUV_INCLUDE_DIRS NAMES uv.h HINTS ${PC_LIBUV_INCLUDEDIR})
find_library(LIBUV_LIBRARIES NAMES uv libuv HINTS ${PC_LIBUV_LIBDIR})
find_package_handle_standard_args(LIBUV DEFAULT_MSG LIBUV_LIBRARIES LIBUV_INCLUDE_DIRS)
mark_as_advanced(LIBUV_INCLUDE_DIRS LIBUV_LIBRARIES)

find_program(CMAKE_XXD NAMES xxd)
add_custom_command(OUTPUT html.h
        COMMAND ${CMAKE_XXD} -i index.html html.h
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}/src
        COMMENT "Generating html.h from index.html")
list(APPEND SOURCE_FILES html.h)

set(INCLUDE_DIRS ${OPENSSL_INCLUDE_DIR} ${LIBWEBSOCKETS_INCLUDE_DIRS} ${JSON-C_INCLUDE_DIRS} ${LIBUV_INCLUDE_DIRS})
set(LINK_LIBS ${OPENSSL_LIBRARIES} ${LIBWEBSOCKETS_LIBRARIES} ${JSON-C_LIBRARIES} ${LIBUV_LIBRARIES})

if(APPLE)
    # required for the new homebrew version of libwebsockets
    find_path(LIBUV_INCLUDE_DIR NAMES uv.h)
    find_path(LIBEVENT_INCLUDE_DIR NAMES event2/event.h)
    list(APPEND INCLUDE_DIRS ${LIBUV_INCLUDE_DIR} ${LIBEVENT_INCLUDE_DIR})
else()
    list(APPEND LINK_LIBS util)
endif()

if(WIN32)
    list(APPEND LINK_LIBS shell32)
endif()

add_executable(${PROJECT_NAME} ${SOURCE_FILES})
target_include_directories(${PROJECT_NAME} PUBLIC ${INCLUDE_DIRS})
target_link_libraries(${PROJECT_NAME} ${LINK_LIBS})
target_compile_definitions(${PROJECT_NAME} PRIVATE TTYD_VERSION="${PROJECT_VERSION}")

include(GNUInstallDirs)

install(TARGETS ${PROJECT_NAME} DESTINATION "${CMAKE_INSTALL_BINDIR}" COMPONENT prog)
install(FILES man/ttyd.1 DESTINATION "${CMAKE_INSTALL_MANDIR}/man1" COMPONENT doc)
