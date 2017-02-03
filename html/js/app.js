(function() {
    var terminalContainer = document.getElementById('terminal-container'),
        httpsEnabled = window.location.protocol == "https:",
        url = (httpsEnabled ? 'wss://' : 'ws://') + window.location.host + window.location.pathname + 'ws',
        protocols = ["tty"],
        autoReconnect = -1,
        term, pingTimer, wsError;

    var openWs = function() {
        var ws = new WebSocket(url, protocols);

        ws.onopen = function(event) {
            wsError = false;
            if (typeof tty_auth_token !== 'undefined') {
                ws.send(JSON.stringify({AuthToken: tty_auth_token}));
            }
            pingTimer = setInterval(sendPing, 30 * 1000, ws);

            if (typeof term !== 'undefined') {
                term.destroy();
            }

            term = new Terminal();

            term.on('resize', function (size) {
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
            window.onresize = function(event) {
                term.fit();
            };

            while (terminalContainer.firstChild) {
                terminalContainer.removeChild(terminalContainer.firstChild);
            }

            term.open(terminalContainer);
            term.fit();
            term.focus();
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
                    console.log("Enabling reconnect: " + autoReconnect + " seconds")
                    break;
            }
        };

        ws.onclose = function(event) {
            if (term) {
                term.off('data');
                term.off('resize');
                if (!wsError) {
                    term.showOverlay("Connection Closed", null);
                }
            }
            clearInterval(pingTimer);
            if (autoReconnect > 0) {
                setTimeout(openWs, autoReconnect * 1000);
            }
        };

        ws.onerror = function(event) {
            wsError = true;
            term.showOverlay("Websocket handshake failed", null);
        };
    };

    var sendPing = function(ws) {
        ws.send("1");
    };

    openWs();
})();