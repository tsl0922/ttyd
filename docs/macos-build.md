# Build ttyd from source on macOS

This guide builds a self-contained `ttyd` binary natively on macOS. The
third-party dependencies json-c, OpenSSL, libuv and libwebsockets are linked
statically; zlib is provided by the macOS system `libz` and, together with
`libSystem` and `libutil`, stays dynamically linked. That is normal and
unavoidable on macOS, which ships no static `libSystem`.

You do **not** need Homebrew for the resulting binary. Homebrew (or any other
source) is only used to obtain the build-time tool CMake; it is not linked into
`ttyd`. (For a fully Homebrew-free recipe that also fetches CMake itself, see the
standalone gist linked from the issue tracker.)

> Prefer a package manager? `brew install ttyd` and `sudo port install ttyd`
> remain the easiest options. This guide is for building from source or
> producing your own static binary.

## Prerequisites

- macOS 11 or newer (Apple Silicon or Intel)
- Xcode Command Line Tools: `xcode-select --install`
- CMake. Easiest via Homebrew:

  ```bash
  brew install cmake
  ```

  (CMake is a build-time tool only and is not linked into `ttyd`; ttyd finds its
  dependencies via CMake's own `find_package`/`find_library`, so `pkg-config` is
  not required. libuv builds with its own CMake build here, so no
  autoconf/automake/libtool are required.)

## Build

Build on a Mac of the architecture you are targeting (the project's CI builds
arm64 on `macos-14` and x86_64 on `macos-13`). From a clone of this repository:

```bash
# arm64 (Apple Silicon)
env BUILD_TARGET=arm64 ./scripts/macos-build.sh

# x86_64 (Intel)
env BUILD_TARGET=x86_64 ./scripts/macos-build.sh
```

`BUILD_TARGET` defaults to your machine's native architecture (`uname -m`) if
unset. The dependency versions match `scripts/cross-build.sh`:

| dependency | version |
|---|---|
| json-c | 0.18 |
| OpenSSL | 3.6.1 |
| libuv | 1.52.1 |
| libwebsockets | 4.5.7 |

(zlib is the macOS system `libz`, not built here — the one dependency that differs from `cross-build.sh`.)

The finished binary is written to `build/ttyd`.

## Verify

```bash
./build/ttyd --version
otool -L ./build/ttyd
```

A correct build links only macOS system libraries. Expected `otool -L` output
(verified on macOS arm64 with ttyd 1.7.7):

```
/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation
/System/Library/Frameworks/CoreServices.framework/Versions/A/CoreServices
/System/Library/Frameworks/IOKit.framework/Versions/A/IOKit
/usr/lib/libz.1.dylib
/usr/lib/libutil.dylib
/usr/lib/libSystem.B.dylib
```

OpenSSL, libwebsockets, libuv and json-c do not appear — they are statically
linked. `CoreFoundation`, `CoreServices` and `IOKit` are required by libuv. The
dynamic `libz`, `libutil` and `libSystem` links are expected macOS behavior, not
a problem.

## How it differs from the Linux cross build

`scripts/macos-build.sh` is the macOS companion to `scripts/cross-build.sh`. It
uses the same dependency versions and the same libwebsockets feature flags; only
the platform-specific pieces differ:

| Concern | Linux (`cross-build.sh`) | macOS (`macos-build.sh`) |
|---|---|---|
| Toolchain | musl cross compiler | native clang |
| Per-arch select | `CHOST` / CMake cross file | `CMAKE_OSX_ARCHITECTURES` + OpenSSL `darwin64-*-cc` |
| Final link | `-static ...` | `-Wl,-dead_strip` + CoreFoundation/CoreServices/IOKit frameworks (no `-static`) |
| Strip | `-Wl,-s` at link | `strip -S` afterward |
| `sed -i` | GNU form | BSD form (`-i ''`) |

## Gatekeeper and quarantine on downloaded release binaries

> **The macOS binaries attached to GitHub Releases are not codesigned or
> notarized.** macOS Gatekeeper quarantines any executable downloaded from the
> internet that lacks a Developer ID signature and a notarization ticket. After
> downloading `ttyd.aarch64-apple-darwin` or `ttyd.x86_64-apple-darwin` you will
> likely see *"ttyd cannot be opened because the developer cannot be verified"*
> or *"is damaged and can't be opened"*. Clear the quarantine attribute to run
> it:
>
> ```bash
> xattr -d com.apple.quarantine ./ttyd.aarch64-apple-darwin
> ```
>
> (Or right-click the binary in Finder and choose **Open** once.)
>
> Binaries you build yourself with this guide are **not** quarantined and need
> no such step.
>
> Removing this friction would require codesigning + notarization with a paid
> Apple Developer ID, which only the project maintainer can set up. It is an
> open question, not something these instructions claim to provide.
