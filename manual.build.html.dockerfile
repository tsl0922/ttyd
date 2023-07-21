FROM sitespeedio/node:ubuntu-20.04-nodejs-16.13.1

# Install CMAKE
# https://www.softwarepronto.com/2022/09/dockerubuntu-installing-latest-cmake-on.html?lr=1
RUN apt-get update \
  && apt-get -y install build-essential \
  && apt-get install -y wget \
  && rm -rf /var/lib/apt/lists/* \
  && wget https://github.com/Kitware/CMake/releases/download/v3.24.1/cmake-3.24.1-Linux-x86_64.sh \
      -q -O /tmp/cmake-install.sh \
      && chmod u+x /tmp/cmake-install.sh \
      && mkdir /opt/cmake-3.24.1 \
      && /tmp/cmake-install.sh --skip-license --prefix=/opt/cmake-3.24.1 \
      && rm /tmp/cmake-install.sh \
      && ln -s /opt/cmake-3.24.1/bin/* /usr/local/bin

# Install other dependencies
RUN apt-get update && apt-get install -y bash
RUN apt-get install -y build-essential git libjson-c-dev libwebsockets-dev
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

# Copy TTYD source code
COPY ./ /ttyd
WORKDIR /ttyd/html
RUN npm install
RUN npm run build

# Build TTYD
WORKDIR /ttyd
RUN mkdir build && cd build \
  && cmake .. \
  && make && make install

# ARG TARGETARCH
# RUN cp ./dist/${TARGETARCH}/ttyd /usr/bin/ttyd

EXPOSE 7681
WORKDIR /root

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["ttyd", "-W", "bash"]

# Set Bash as the default command when the container runs
# CMD ["bash"]