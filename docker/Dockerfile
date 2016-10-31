FROM ubuntu:16.04
MAINTAINER lyc <imyikong@gmail.com>

ADD entry.sh /entry.sh
ADD makefile /Makefile

WORKDIR /root/

RUN apt-get update && \
    apt-get install -y cmake g++ pkg-config git vim-common libwebsockets-dev libjson-c-dev libssl-dev && \
    git clone --depth=1 https://github.com/MrLYC/ttyd.git /tmp/ttyd && \
    cd /tmp/ttyd && mkdir build && cd build && \
    cmake .. && make && make install && \
    rm -rf /tmp/ttyd && \
    mkdir /root/init/ && \
    apt-get install -y wget curl && \
    cp /Makefile /root/init/

ENV USER admin
ENV PASSWORD admin
ENV INITSH ""
ENV PORT 80

EXPOSE 80

EXPOSE 8080
EXPOSE 8081
EXPOSE 8082
EXPOSE 8083
EXPOSE 8084
EXPOSE 8085

ENTRYPOINT ["/entry.sh"]

CMD ["bash"]
