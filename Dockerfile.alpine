FROM alpine

ARG TARGETARCH
COPY ./dist/${TARGETARCH}/ttyd /usr/bin/ttyd
RUN apk add --no-cache bash tini

EXPOSE 7681
WORKDIR /root

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["ttyd", "-W", "bash"]
