(function() {
    var terminalContainer = document.getElementById('terminal-container'),
        httpsEnabled = window.location.protocol === "https:",
        url = (httpsEnabled ? 'wss://' : 'ws://') + window.location.host + window.location.pathname + 'ws',
        authToken = (typeof tty_auth_token !== 'undefined') ? tty_auth_token : null,
        protocols = ["tty"],
        autoReconnect = -1,
        term, pingTimer, wsError;

    var openWs = function() {
        var ws = new WebSocket(url, protocols);
        var unloadCallback = function(event) {
            var message = 'Close terminal? this will also terminate the command.';
            (event || window.event).returnValue = message;
            return message;
        };

        ws.onopen = function(event) {
            console.log("Websocket connection opened");
            wsError = false;
            ws.send(JSON.stringify({AuthToken: authToken}));
            pingTimer = setInterval(sendPing, 30 * 1000, ws);

            if (typeof term !== 'undefined') {
                term.destroy();
            }

            term = new Terminal();

            term.on('resize', function(size) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send("2" + JSON.stringify({columns: size.cols, rows: size.rows}));
                }
                setTimeout(function() {
                    term.showOverlay(size.cols + 'x' + size.rows);
                }, 500);
            });

            term.on("data", function(data) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send("0" + data);
                }
            });

            term.on('open', function() {
                // https://stackoverflow.com/a/27923937/1727928
                window.addEventListener('resize', function() {
                    clearTimeout(window.resizedFinished);
                    window.resizedFinished = setTimeout(function () {
                        term.fit();
                    }, 250);
                });
                window.addEventListener('beforeunload', unloadCallback);
                term.fit();
            });

            while (terminalContainer.firstChild) {
                terminalContainer.removeChild(terminalContainer.firstChild);
            }

            term.open(terminalContainer, true);
        };

        ws.onmessage = function(event) {
            var data = event.data.slice(1);
            switch(event.data[0]) {
                case '0':
                    term.writeUTF8(window.atob(data));
                    break;
                case '1': // pong
                    break;
                case '2':
                    document.title = data;
                    break;
                case '3':
                    var preferences = JSON.parse(data);
                    Object.keys(preferences).forEach(function(key) {
                        console.log("Setting " + key + ": " +  preferences[key]);
                        term.setOption(key, preferences[key]);
                    });
                    break;
                case '4':
                    autoReconnect = JSON.parse(data);
                    console.log("Enabling reconnect: " + autoReconnect + " seconds");
                    break;
            }
        };

        ws.onclose = function(event) {
            console.log("Websocket connection closed with code: " + event.code);
            if (term) {
                term.off('data');
                term.off('resize');
                if (!wsError) {
                    term.showOverlay("Connection Closed", null);
                }
            }
            window.removeEventListener('beforeunload', unloadCallback);
            clearInterval(pingTimer);
            // 1000: CLOSE_NORMAL
            if (event.code !== 1000 && autoReconnect > 0) {
                setTimeout(openWs, autoReconnect * 1000);
            }
        };
    };

    var sendPing = function(ws) {
        ws.send("1");
    };

    openWs();
})();