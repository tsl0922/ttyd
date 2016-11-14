# Building with OpenWrt/LEDE SDK

Ubuntu 64bit and LEDE `ar71xx` as example:

```bash
sudo apt-get install build-essential subversion libncurses5-dev zlib1g-dev gawk gcc-multilib flex git-core gettext libssl-dev
curl -sLo- https://downloads.lede-project.org/snapshots/targets/ar71xx/generic/lede-sdk-ar71xx-generic_gcc-5.4.0_musl-1.1.15.Linux-x86_64.tar.xz | tar Jx
cd lede-sdk-ar71xx-generic_gcc-5.4.0_musl-1.1.15.Linux-x86_64
./scripts/feeds update -a
./scripts/feeds install -a
sed -i 's/$(eval $(call BuildPackage,libwebsockets-cyassl))/#\0/' package/feeds/packages/libwebsockets/Makefile
make defconfig
make package/feeds/packages/ttyd/compile V=99
```

The compiled `.ipk` package will be in the `bin/packages` folder.