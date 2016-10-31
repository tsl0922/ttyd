#!/bin/bash

if [ "${INITSH}" != "" ]; then
    wget "${INITSH}" -O /root/init/init.sh
    chmod +x /root/init/init.sh
    /root/init/init.sh
fi

ttyd --credential "${USER}":"${PASSWORD}" $@
