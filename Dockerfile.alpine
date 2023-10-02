FROM alpine

ARG TARGETARCH

# Dependencies
RUN apk add --no-cache bash tini

# Application
COPY ./dist/${TARGETARCH}/ttyd /usr/bin/ttyd

EXPOSE 7681
WORKDIR /root

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["ttyd", "-W", "bash"]
