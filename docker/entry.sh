#!/bin/bash

init_env() {
    if [ "${INITSH}" != "" ]; then
        cd /root/init
        wget "${INITSH}" -O init.sh
        chmod +x init.sh
        ./init.sh
    fi
}


init_env >/tmp/init_env.log 2>&1 &

ttyd \
    --reconnect "${RECONNECT}" \
    --port "${PORT}" \
    --credential "${USER}":"${PASSWORD}" \
    ${TTYDOP} \
    $@
