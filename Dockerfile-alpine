FROM alpine:3.6
LABEL maintainer "Shuanglei Tao - tsl0922@gmail.com" \
    maintainer "Damien Duportal - damien.duportal@gmail.com"

RUN apk add --update \
    bash \
    ttyd \
  && rm -rf /var/cache/apk/*

EXPOSE 7681

ENTRYPOINT ["ttyd"]

CMD ["bash"]
