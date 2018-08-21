# Building ttyd with [MSYS2][1]

1. Download and install the **latest** version of [MSYS2][1], make sure you've updated the package database.
2. Install required dependencies: `pacman -S git binutils` and if you are using a 32bit Windows, also: `pacman -S mingw-w64-i686-cmake`
3. Build json-c and libwebsockets: cd to package dir and run `makepkg -s && pacman -U *.pkg.tar.xz`.
4. Build ttyd: cd to ttyd dir and run `makepkg --skipchecksums`.

  [1]: http://msys2.github.io
