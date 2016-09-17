FROM ubuntu:16.04
MAINTAINER Shuanglei Tao "tsl0922@gmail.com"

RUN apt-get update && \
    apt-get install -y cmake g++ pkg-config git vim-common libwebsockets-dev libjson-c-dev libssl-dev && \
    rm -rf /var/lib/apt/lists/* && \
    git clone --depth=1 https://github.com/tsl0922/ttyd.git /tmp/ttyd && \
    cd /tmp/ttyd && mkdir build && cd build && \
    cmake .. && make && make install && \
    rm -rf /tmp/ttyd

EXPOSE 7681

ENTRYPOINT ["ttyd"]

CMD ["bash"]
