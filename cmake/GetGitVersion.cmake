find_package(Git)

function(get_git_version var1 var2)
  if(GIT_EXECUTABLE)
    execute_process(
      COMMAND ${GIT_EXECUTABLE} describe --tags --match "[0-9]*.[0-9]*.[0-9]*" --abbrev=8
      WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
      RESULT_VARIABLE status
      OUTPUT_VARIABLE GIT_VERSION
    )
    if (${status})
      set(GIT_VERSION "0.0.0")
    else()
      string(STRIP ${GIT_VERSION} GIT_VERSION)
      string(REGEX REPLACE "-[0-9]+-g" "-" GIT_VERSION ${GIT_VERSION})
    endif()
  else()
    set(GIT_VERSION "0.0.0")
  endif()

  string(REGEX MATCH "^[0-9]+.[0-9]+.[0-9]+" SEM_VER "${GIT_VERSION}")

  message("-- Git Tag: ${GIT_VERSION}, Sem Ver: ${SEM_VER}")

  set(${var1} ${GIT_VERSION} PARENT_SCOPE)
  set(${var2} ${SEM_VER} PARENT_SCOPE)
endfunction()

function(get_git_head var1)
  if(GIT_EXECUTABLE)
    execute_process(
      COMMAND ${GIT_EXECUTABLE} --git-dir ${CMAKE_CURRENT_SOURCE_DIR}/.git rev-parse --short HEAD
      RESULT_VARIABLE status
      OUTPUT_VARIABLE GIT_COMMIT
      OUTPUT_STRIP_TRAILING_WHITESPACE
      ERROR_QUIET
    )

    if(${status})
      set(GIT_COMMIT "unknown")
    endif()

    message("-- Git Commit: ${GIT_COMMIT}")

    set(${var1} ${GIT_COMMIT} PARENT_SCOPE)
  endif()
endfunction()
