cmake_minimum_required(VERSION 2.8)

project(ttyd)
set(PROJECT_VERSION "1.4.2")

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

set(SOURCE_FILES src/server.c src/http.c src/protocol.c src/utils.c)

include(FindPackageHandleStandardArgs)

find_package(OpenSSL REQUIRED)
find_package(PkgConfig REQUIRED)

pkg_check_modules(libwebsockets REQUIRED libwebsockets>=1.7.0})
find_path(LIBWEBSOCKETS_INCLUDE_DIR libwebsockets.h
        HINTS ${LIBWEBSOCKETS_INCLUDE_DIRS} ${LIBWEBSOCKETS_INCLUDEDIR})
find_library(LIBWEBSOCKETS_LIBRARY NAMES websockets libwebsockets
        HINTS ${LIBWEBSOCKETS_LIBRARY_DIRS} ${LIBWEBSOCKETS_LIBDIR})
find_package_handle_standard_args(LIBWEBSOCKETS DEFAULT_MSG LIBWEBSOCKETS_LIBRARY LIBWEBSOCKETS_INCLUDE_DIR)
mark_as_advanced(LIBWEBSOCKETS_INCLUDE_DIR LIBWEBSOCKETS_LIBRARY)

pkg_check_modules(PC_JSON-C REQUIRED json-c)
find_path(JSON-C_INCLUDE_DIR json.h
        HINTS ${JSON-C_INCLUDE_DIRS} ${JSON-C_INCLUDEDIR} PATH_SUFFIXES json-c json)
find_library(JSON-C_LIBRARY NAMES json-c libjson-c
        HINTS ${JSON-C_LIBRARY_DIRS} ${JSON-C_LIBDIR})
find_package_handle_standard_args(JSON-C DEFAULT_MSG JSON-C_LIBRARY JSON-C_INCLUDE_DIR)
mark_as_advanced(JSON-C_INCLUDE_DIR JSON-C_LIBRARY)

pkg_check_modules(LIBUV REQUIRED libuv)
find_path(LIBUV_INCLUDE_DIR NAMES uv.h
        HINTS ${LIBUV_INCLUDEDIRS} ${LIBUV_INCLUDEDIR})
find_library(LIBUV_LIBRARY NAMES uv libuv
        HINTS ${LIBUV_LIBRARY_DIRS} ${LIBUV_LIBDIR})
find_package_handle_standard_args(LIBUV DEFAULT_MSG LIBUV_LIBRARY LIBUV_INCLUDE_DIR)
mark_as_advanced(LIBUV_INCLUDE_DIR LIBUV_LIBRARY)

find_program(CMAKE_XXD NAMES xxd)
add_custom_command(OUTPUT html.h
        COMMAND ${CMAKE_XXD} -i index.html html.h
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}/src
        COMMENT "Generating html.h from index.html")
list(APPEND SOURCE_FILES html.h)

set(INCLUDE_DIRS ${OPENSSL_INCLUDE_DIR} ${LIBWEBSOCKETS_INCLUDE_DIR} ${JSON-C_INCLUDE_DIR} ${LIBUV_INCLUDE_DIR})
set(LINK_LIBS ${OPENSSL_LIBRARIES} ${LIBWEBSOCKETS_LIBRARY} ${JSON-C_LIBRARY} ${LIBUV_LIBRARY})

if(APPLE)
    # required for the new homebrew version of libwebsockets
    find_path(LIBEVENT_INCLUDE_DIR NAMES event2/event.h)
    list(APPEND INCLUDE_DIRS ${LIBEVENT_INCLUDE_DIR})
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
