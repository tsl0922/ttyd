#!/bin/bash

if [ "${INITSH}" != "" ]; then
    wget "${INITSH}" -O /root/init/init.sh
    chmod +x /root/init/init.sh
    cd /root/init && /root/init/init.sh
fi

cd /root/
ttyd --credential "${USER}":"${PASSWORD}" $@
