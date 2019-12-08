FROM tsl0922/musl-cross
RUN git clone --depth=1 https://github.com/tsl0922/ttyd.git /tmp/ttyd \
    && cd /tmp/ttyd && ./scripts/cross-build.sh x86_64

FROM ubuntu:18.04
COPY --from=0 /tmp/ttyd/build/ttyd /usr/local/bin/ttyd

ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

EXPOSE 7681

ENTRYPOINT ["/tini", "--"]
CMD ["ttyd", "sh"]
