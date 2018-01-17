cmake_minimum_required(VERSION 2.8)
cmake_policy(SET CMP0048 NEW)

project(ttyd VERSION "1.4.0")

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
set(SOURCE_FILES src/server.c src/http.c src/protocol.c src/utils.c)

find_package(OpenSSL REQUIRED)
find_package(Libwebsockets ${LIBWEBSOCKETS_MIN_VERSION} QUIET)

find_package(PkgConfig)

if(Libwebsockets_FOUND)
    set(LIBWEBSOCKETS_INCLUDE_DIR ${LIBWEBSOCKETS_INCLUDE_DIR} ${LIBWEBSOCKETS_INCLUDE_DIRS})
else() # try to find libwebsockets with pkg-config
    pkg_check_modules(Libwebsockets REQUIRED libwebsockets>=${LIBWEBSOCKETS_MIN_VERSION})
    find_path(LIBWEBSOCKETS_INCLUDE_DIR libwebsockets.h
            HINTS ${LIBWEBSOCKETS_INCLUDEDIR} ${LIBWEBSOCKETS_INCLUDE_DIRS})
    find_library(LIBWEBSOCKETS_LIBRARIES NAMES websockets libwebsockets
            HINTS ${LIBWEBSOCKETS_LIBDIR} ${LIBWEBSOCKETS_LIBRARY_DIRS})
    include(FindPackageHandleStandardArgs)
    find_package_handle_standard_args(LIBWEBSOCKETS DEFAULT_MSG LIBWEBSOCKETS_LIBRARIES LIBWEBSOCKETS_INCLUDE_DIR)
    mark_as_advanced(LIBWEBSOCKETS_INCLUDE_DIR LIBWEBSOCKETS_LIBRARIES)
endif()

include(CheckIncludeFile)
check_include_file(lws_config.h HAVE_LWS_CONFIG_H)

pkg_check_modules(PC_JSON-C REQUIRED json-c)
find_path(JSON-C_INCLUDE_DIR json.h
        HINTS ${PC_JSON-C_INCLUDEDIR} ${PC_JSON-C_INCLUDE_DIRS} PATH_SUFFIXES json-c json)
find_library(JSON-C_LIBRARY NAMES json-c libjson-c
        HINTS ${PC_JSON-C_LIBDIR} ${PC_JSON-C_LIBRARY_DIRS})
include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(JSON-C DEFAULT_MSG JSON-C_LIBRARY JSON-C_INCLUDE_DIR)
mark_as_advanced(JSON-C_INCLUDE_DIR JSON-C_LIBRARY)

find_program(CMAKE_XXD NAMES xxd)
add_custom_command(OUTPUT html.h
        COMMAND ${CMAKE_XXD} -i index.html html.h
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}/src
        COMMENT "Generating html.h from index.html")
list(APPEND SOURCE_FILES html.h)

set(INCLUDE_DIRS ${OPENSSL_INCLUDE_DIR} ${LIBWEBSOCKETS_INCLUDE_DIR} ${JSON-C_INCLUDE_DIR})
set(LINK_LIBS util pthread ${OPENSSL_LIBRARIES} ${LIBWEBSOCKETS_LIBRARIES} ${JSON-C_LIBRARY})

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

set(CPACK_PACKAGE_NAME "${PROJECT_NAME}")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "${PROJECT_NAME} - Share your terminal over the web")
set(CPACK_PACKAGE_CONTACT "Shuanglei Tao <tsl0922@gmail.com>")
set(CPACK_PACKAGE_FILE_NAME "${CPACK_PACKAGE_NAME}-${CPACK_PACKAGE_VERSION}_${CMAKE_SYSTEM_PROCESSOR}")

set(CPACK_GENERATOR "DEB")
SET(CPACK_DEBIAN_ARCHITECTURE ${CMAKE_SYSTEM_PROCESSOR})
set(CPACK_DEBIAN_PACKAGE_SECTION "shells")
set(CPACK_DEBIAN_PACKAGE_HOMEPAGE "https://tsl0922.github.io/ttyd")
set(CPACK_DEBIAN_PACKAGE_DEPENDS "libjson-c2, libwebsockets7, libssl1.0.0, libc6 (>= 2.14)")

include(CPack)
