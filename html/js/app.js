require('../sass/app.scss');

// polyfills for ie11
require('core-js/fn/array');
require('core-js/fn/object');
require('core-js/fn/promise');
require('core-js/fn/typed');
require('core-js/fn/string/ends-with');
require('fast-text-encoding');

var Zmodem = require('zmodem.js/src/zmodem_browser');
var Terminal = require('xterm').Terminal;

Terminal.applyAddon(require('xterm/lib/addons/fit/fit'));
Terminal.applyAddon(require('./overlay'));

var modal = {
    self: document.getElementById('modal'),
    header: document.getElementById('header'),
    status: {
        self: document.getElementById('status'),
        filesRemaining: document.getElementById('files-remaining'),
        bytesRemaining: document.getElementById('bytes-remaining')
    },
    choose: {
        self: document.getElementById('choose'),
        files: document.getElementById('files'),
        filesNames: document.getElementById('file-names')
    },
    progress: {
        self: document.getElementById('progress'),
        fileName: document.getElementById('file-name'),
        progressBar: document.getElementById('progress-bar'),
        bytesReceived: document.getElementById('bytes-received'),
        bytesFile: document.getElementById('bytes-file'),
        percentReceived: document.getElementById('percent-received'),
        skip: document.getElementById('skip')
    }
};

function updateFileInfo(fileInfo) {
    modal.status.self.style.display = '';
    modal.choose.self.style.display = 'none';
    modal.progress.self.style.display = '';
    modal.status.filesRemaining.textContent = fileInfo.files_remaining;
    modal.status.bytesRemaining.textContent = bytesHuman(fileInfo.bytes_remaining, 2);
    modal.progress.fileName.textContent = fileInfo.name;
}

function showReceiveModal(xfer) {
    resetModal('Receiving files');
    updateFileInfo(xfer.get_details());
    modal.progress.skip.disabled = false;
    modal.progress.skip.onclick = function () {
        this.disabled = true;
        xfer.skip();
    };
    modal.progress.skip.style.display = '';
    modal.self.classList.add('is-active');
}

function showSendModal(callback) {
    resetModal('Sending files');
    modal.choose.self.style.display = '';
    modal.choose.files.disabled = false;
    modal.choose.files.value = '';
    modal.choose.filesNames.textContent = '';
    modal.choose.files.onchange = function () {
        this.disabled = true;
        var files = this.files;
        var fileNames = '';
        for (var i = 0; i < files.length; i++) {
            if (i === 0) {
                fileNames = files[i].name;
            } else {
                fileNames += ', ' + files[i].name;
            }
        }
        modal.choose.filesNames.textContent = fileNames;
        callback(files);
    };
    modal.self.classList.add('is-active');
}

function hideModal() {
    modal.self.classList.remove('is-active');
}

function resetModal(title) {
    modal.header.textContent = title;
    modal.status.self.style.display = 'none';
    modal.choose.self.style.display = 'none';
    modal.progress.self.style.display = 'none';
    modal.progress.bytesReceived.textContent = '-';
    modal.progress.percentReceived.textContent = '-%';
    modal.progress.progressBar.textContent = '0%';
    modal.progress.progressBar.value = 0;
    modal.progress.skip.style.display = 'none';
}

function updateProgress(xfer) {
    var size = xfer.get_details().size;
    var offset = xfer.get_offset();
    modal.progress.bytesReceived.textContent = bytesHuman(offset, 2);
    modal.progress.bytesFile.textContent = bytesHuman(size, 2);

    var percentReceived = (100 * offset / size).toFixed(2);
    modal.progress.percentReceived.textContent = percentReceived + '%';

    modal.progress.progressBar.textContent = percentReceived + '%';
    modal.progress.progressBar.setAttribute('value', percentReceived);
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
                        updateFileInfo(xfer.get_details());
                        updateProgress(xfer);
                    },
                    on_file_complete: function(obj) {
                        // console.log(obj);
                    }
                }
            ).then(
                zsession.close.bind(zsession),
                console.error.bind(console)
            ).then(function () {
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
            res();
        });
    });
    zsession.start();
    return promise;
}

var terminalContainer = document.getElementById('terminal-container'),
    httpsEnabled = window.location.protocol === 'https:',
    url = (httpsEnabled ? 'wss://' : 'ws://') + window.location.host + window.location.pathname
        + (window.location.pathname.endsWith('/') ? '' : '/') + 'ws',
    textDecoder = new TextDecoder(),
    textEncoder = new TextEncoder(),
    authToken = (typeof tty_auth_token !== 'undefined') ? tty_auth_token : null,
    autoReconnect = -1,
    reconnectTimer, term, title, wsError;

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
    var resetTerm = function() {
        hideModal();
        clearTimeout(reconnectTimer);
        if (ws.readyState !== WebSocket.CLOSED) {
            ws.close();
        }
        openWs();
    };

    var zsentry = new Zmodem.Sentry({
        to_terminal: function _to_terminal(octets) {
            var buffer = new Uint8Array(octets).buffer;
            term.write(textDecoder.decode(buffer));
        },

        sender: function _ws_sender_func(octets) {
            // limit max packet size to 4096
            while (octets.length) {
                var chunk = octets.splice(0, 4095);
                var buffer = new Uint8Array(chunk.length + 1);
                buffer[0]= '0'.charCodeAt(0);
                buffer.set(chunk, 1);
                ws.send(buffer);
            }
        },

        on_retract: function _on_retract() {
            // console.log('on_retract');
        },

        on_detect: function _on_detect(detection) {
            term.setOption('disableStdin', true);
            var zsession = detection.confirm();
            var promise = zsession.type === 'send' ? handleSend(zsession) : handleReceive(zsession);
            promise.catch(console.error.bind(console)).then(function () {
                hideModal();
                term.setOption('disableStdin', false);
            });
        }
    });

    ws.binaryType = 'arraybuffer';

    ws.onopen = function(event) {
        console.log('Websocket connection opened');
        wsError = false;
        sendMessage(JSON.stringify({AuthToken: authToken}));

        if (typeof term !== 'undefined') {
            term.dispose();
        }

        // expose term handle for some programatic cases
        // which need to get the content of the terminal
        term = window.term = new Terminal({
            fontSize: 13,
            fontFamily: '"Menlo for Powerline", Menlo, Consolas, "Liberation Mono", Courier, monospace',
            theme: {
                foreground: '#d2d2d2',
                background: '#2b2b2b',
                cursor: '#adadad',
                black: '#000000',
                red: '#d81e00',
                green: '#5ea702',
                yellow: '#cfae00',
                blue: '#427ab3',
                magenta: '#89658e',
                cyan: '#00a7aa',
                white: '#dbded8',
                brightBlack: '#686a66',
                brightRed: '#f54235',
                brightGreen: '#99e343',
                brightYellow: '#fdeb61',
                brightBlue: '#84b0d8',
                brightMagenta: '#bc94b7',
                brightCyan: '#37e6e8',
                brightWhite: '#f1f1f0'
            }
        });

        term.on('resize', function(size) {
            if (ws.readyState === WebSocket.OPEN) {
                sendMessage('1' + JSON.stringify({columns: size.cols, rows: size.rows}));
            }
            setTimeout(function() {
                term.showOverlay(size.cols + 'x' + size.rows);
            }, 500);
        });

        term.on('title', function (data) {
            if (data && data !== '') {
                document.title = (data + ' | ' + title);
            }
        });

        term.on('data', sendData);

        while (terminalContainer.firstChild) {
            terminalContainer.removeChild(terminalContainer.firstChild);
        }

        // https://stackoverflow.com/a/27923937/1727928
        window.addEventListener('resize', function() {
            clearTimeout(window.resizedFinished);
            window.resizedFinished = setTimeout(function () {
                term.fit();
            }, 250);
        });
        window.addEventListener('beforeunload', unloadCallback);

        term.open(terminalContainer, true);
        term.fit();
        term.focus();
    };

    ws.onmessage = function(event) {
        var rawData = new Uint8Array(event.data),
            cmd = String.fromCharCode(rawData[0]),
            data = rawData.slice(1).buffer;
        switch(cmd) {
            case '0':
                try {
                    zsentry.consume(data);
                } catch (e) {
                    console.error(e);
                    resetTerm();
                }
                break;
            case '1':
                title = textDecoder.decode(data);
                document.title = title;
                break;
            case '2':
                var preferences = JSON.parse(textDecoder.decode(data));
                Object.keys(preferences).forEach(function(key) {
                    console.log('Setting ' + key + ': ' +  preferences[key]);
                    term.setOption(key, preferences[key]);
                });
                break;
            case '3':
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
        // 1000: CLOSE_NORMAL
        if (event.code !== 1000 && autoReconnect > 0) {
            reconnectTimer = setTimeout(openWs, autoReconnect * 1000);
        }
    };
};

if (document.readyState === 'complete' || document.readyState !== 'loading') {
    openWs();
} else {
    document.addEventListener('DOMContentLoaded', openWs);
}
