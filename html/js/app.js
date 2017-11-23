var Zmodem = require('zmodem.js/src/zmodem_browser');
var Terminal = require('xterm').Terminal;

require('xterm/lib/addons/fit');
require('./overlay');

function showReceiveModal(xfer) {
    resetModal('Receiving files');
    var fileInfo = xfer.get_details();
    document.getElementById('name').textContent = fileInfo.name;
    document.getElementById('size').textContent = bytesHuman(fileInfo.size, 2);
    document.getElementById('mtime').textContent = fileInfo.mtime;
    document.getElementById('files-remaining').textContent = fileInfo.files_remaining;
    document.getElementById('bytes-remaining').textContent = bytesHuman(fileInfo.bytes_remaining, 2);
    document.getElementById('mode').textContent = '0' + fileInfo.mode.toString(8);
    document.getElementById('choose').style.display = 'none';
    document.getElementById('file').style.display = '';
    var skip = document.getElementById('skip');
    skip.disabled = false;
    skip.onclick = function () {
        this.disabled = true;
        xfer.skip();
    };
    skip.style.display = '';
    document.getElementById('modal').classList.add('is-active');
}

function showSendModal(callback) {
    resetModal('Sending files');
    document.getElementById('file').style.display = 'none';
    document.getElementById('skip').style.display = 'none';
    document.getElementById('choose').style.display = '';
    var filesInput = document.getElementById('files');
    filesInput.disabled = false;
    filesInput.value = '';
    filesInput.onchange = function () {
        this.disabled = true;
        var files = this.files;
        var fileNames = '';
        for (var i = 0; i < files.length; i++) {
            if (i === 0) {
                fileNames = files[i].name;
            } else {
                fileNames += ' | ' + files[i].name;
            }
        }
        document.getElementById('file-names').textContent = fileNames;
        callback(files);
    };
    document.getElementById('modal').classList.add('is-active');
}

function hideModal() {
    document.getElementById('modal').classList.remove('is-active');
}

function resetModal(title) {
    document.getElementById('header').textContent = title;
    document.getElementById('bytes-received').textContent = '-';
    document.getElementById('percent-received').textContent = '-%';
    document.getElementById('progress-info').style.display = 'none';
    var progressBar = document.getElementById('progress-bar');
    progressBar.textContent = '0%';
    progressBar.value = 0;
}

function updateProgress(xfer) {
    var size = xfer.get_details().size;
    var offset = xfer.get_offset();
    document.getElementById('bytes-received').textContent = bytesHuman(offset, 2);
    document.getElementById('bytes-file').textContent = bytesHuman(size, 2);

    var percentReceived = (100 * offset / size).toFixed(2);
    document.getElementById('percent-received').textContent = percentReceived + '%';
    document.getElementById('progress-info').style.display = '';

    var progressBar = document.getElementById('progress-bar');
    progressBar.textContent = percentReceived + '%';
    progressBar.setAttribute('value', percentReceived);
}

function bytesHuman (bytes, precision) {
    if (isNaN(parseFloat(bytes)) || !isFinite(bytes)) return '-';
    if (bytes === 0) return 0;
    if (typeof precision === 'undefined') precision = 1;
    var units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'],
        number = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, Math.floor(number))).toFixed(precision) +  ' ' + units[number];
}

function handleSend(zsession) {
    return new Promise(function (res) {
        showSendModal(function (files) {
            Zmodem.Browser.send_files(
                zsession,
                files,
                {
                    on_progress: function(obj, xfer) {
                        updateProgress(xfer);
                    },
                    on_file_complete: function(obj) {
                        hideModal();
                    }
                }
            ).then(
                zsession.close.bind(zsession),
                console.error.bind(console)
            ).then(function () {
                hideModal();
                res();
            });
        });
    });
}

function handleReceive(zsession) {
    zsession.on('offer', function (xfer) {
        showReceiveModal(xfer);
        var fileBuffer = [];
        xfer.on('input', function (payload) {
            updateProgress(xfer);
            fileBuffer.push(new Uint8Array(payload));
        });
        xfer.accept().then(function () {
            Zmodem.Browser.save_to_disk(
                fileBuffer,
                xfer.get_details().name
            );
        }, console.error.bind(console));
    });
    var promise = new Promise(function (res) {
        zsession.on('session_end', function () {
            hideModal();
            res();
        });
    });
    zsession.start();
    return promise;
}

var terminalContainer = document.getElementById('terminal-container'),
    httpsEnabled = window.location.protocol === 'https:',
    url = (httpsEnabled ? 'wss://' : 'ws://') + window.location.host + window.location.pathname + 'ws',
    textDecoder = new TextDecoder(),
    textEncoder = new TextEncoder(),
    authToken = (typeof tty_auth_token !== 'undefined') ? tty_auth_token : null,
    autoReconnect = -1,
    term, pingTimer, wsError;

var openWs = function() {
    var ws = new WebSocket(url, ['tty']);
    var sendMessage = function (message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(textEncoder.encode(message));
        }
    };
    var sendData = function (data) {
        sendMessage('0' + data);
    };
    var unloadCallback = function (event) {
        var message = 'Close terminal? this will also terminate the command.';
        (event || window.event).returnValue = message;
        return message;
    };
    var zsentry = new Zmodem.Sentry({
        to_terminal: function _to_terminal(octets) {
            var buffer = new Uint8Array(octets).buffer;
            term.write(textDecoder.decode(buffer));
        },

        sender: function _ws_sender_func(octets) {
            var array = new Uint8Array(octets.length + 1);
            array[0] = '0'.charCodeAt(0);
            array.set(new Uint8Array(octets), 1);
            ws.send(array.buffer);
        },

        on_retract: function _on_retract() {
            // console.log('on_retract');
        },

        on_detect: function _on_detect(detection) {
            term.off('data');
            var zsession = detection.confirm();
            var promise = zsession.type === 'send' ? handleSend(zsession) : handleReceive(zsession);
            promise.catch(console.error.bind(console)).then(function () {
                hideModal();
                term.on('data', sendData);
            });
        }
    });

    ws.binaryType = 'arraybuffer';

    ws.onopen = function(event) {
        console.log('Websocket connection opened');
        wsError = false;
        sendMessage(JSON.stringify({AuthToken: authToken}));
        pingTimer = setInterval(function() {
            sendMessage('1');
        }, 30 * 1000);

        if (typeof term !== 'undefined') {
            term.destroy();
        }

        term = new Terminal({
            fontSize: 13,
            fontFamily: '"Menlo for Powerline", Menlo, Consolas, "Liberation Mono", Courier, monospace'
        });

        term.on('resize', function(size) {
            if (ws.readyState === WebSocket.OPEN) {
                sendMessage('2' + JSON.stringify({columns: size.cols, rows: size.rows}));
            }
            setTimeout(function() {
                term.showOverlay(size.cols + 'x' + size.rows);
            }, 500);
        });

        term.on('data', sendData);

        while (terminalContainer.firstChild) {
            terminalContainer.removeChild(terminalContainer.firstChild);
        }

        term.open(terminalContainer, true);

        // https://stackoverflow.com/a/27923937/1727928
        window.addEventListener('resize', function() {
            clearTimeout(window.resizedFinished);
            window.resizedFinished = setTimeout(function () {
                term.fit();
            }, 250);
        });
        window.addEventListener('beforeunload', unloadCallback);
        term.fit();
    };

    ws.onmessage = function(event) {
        var cmd = String.fromCharCode(new DataView(event.data).getUint8()),
            data = event.data.slice(1);
        switch(cmd) {
            case '0':
                zsentry.consume(data);
                break;
            case '1': // pong
                break;
            case '2':
                document.title = textDecoder.decode(data);
                break;
            case '3':
                var preferences = JSON.parse(textDecoder.decode(data));
                Object.keys(preferences).forEach(function(key) {
                    console.log('Setting ' + key + ': ' +  preferences[key]);
                    term.setOption(key, preferences[key]);
                });
                break;
            case '4':
                autoReconnect = JSON.parse(textDecoder.decode(data));
                console.log('Enabling reconnect: ' + autoReconnect + ' seconds');
                break;
            default:
                console.log('Unknown command: ' + cmd);
                break;
        }
    };

    ws.onclose = function(event) {
        console.log('Websocket connection closed with code: ' + event.code);
        if (term) {
            term.off('data');
            term.off('resize');
            if (!wsError) {
                term.showOverlay('Connection Closed', null);
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

if (document.readyState === 'complete' || document.readyState !== 'loading') {
    openWs();
} else {
    document.addEventListener('DOMContentLoaded', openWs);
}