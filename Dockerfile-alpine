FROM tsl0922/musl-cross
RUN git clone --depth=1 https://github.com/tsl0922/ttyd.git /ttyd \
    && cd /ttyd && env BUILD_TARGET=x86_64 WITH_SSL=true ./scripts/cross-build.sh

FROM alpine:3.10
COPY --from=0 /ttyd/build/ttyd /usr/bin/ttyd
RUN apk add --no-cache bash tini

EXPOSE 7681

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["ttyd", "bash"]
