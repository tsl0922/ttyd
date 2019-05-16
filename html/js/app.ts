import '../sass/app.scss';

import { Terminal, ITerminalOptions, IDisposable } from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit'
import * as overlay from './overlay'
import { Modal } from './zmodem'
import * as Zmodem from 'zmodem.js/src/zmodem_browser';
import * as urljoin from 'url-join';

Terminal.applyAddon(fit);
Terminal.applyAddon(overlay);

interface ITtydTerminal extends Terminal {
    resizeDisposable: IDisposable;
    dataDisposable: IDisposable;
    reconnectTimeout: number;

    showOverlay(msg: string, timeout?: number): void;
    fit(): void;
}

export interface IWindowWithTerminal extends Window {
    term: ITtydTerminal;
    resizeTimeout?: number;
    tty_auth_token?: string;
}
declare let window: IWindowWithTerminal;

const modal = new Modal();
const terminalContainer = document.getElementById('terminal-container');
const protocol = window.location.protocol === 'https:' ? 'wss://': 'ws://';
const url = urljoin(protocol, window.location.host, window.location.pathname, 'ws', window.location.search);
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

let authToken = (typeof window.tty_auth_token !== 'undefined') ? window.tty_auth_token : null;
let autoReconnect = -1;
let term: ITtydTerminal;
let title: string;
let wsError: boolean;

let openWs = function() {
    let ws = new WebSocket(url, ['tty']);
    let sendMessage = function (message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(textEncoder.encode(message));
        }
    };
    let unloadCallback = function (event) {
        let message = 'Close terminal? this will also terminate the command.';
        event.returnValue = message;
        return message;
    };
    let resetTerm = function() {
        modal.hide();
        clearTimeout(term.reconnectTimeout);
        if (ws.readyState !== WebSocket.CLOSED) {
            ws.close();
        }
        openWs();
    };

    let zsentry = new Zmodem.Sentry({
        to_terminal: function _to_terminal(octets) {
            let buffer = new Uint8Array(octets).buffer;
            term.write(textDecoder.decode(buffer));
        },

        sender: function _ws_sender_func(octets) {
            // limit max packet size to 4096
            while (octets.length) {
                let chunk = octets.splice(0, 4095);
                let buffer = new Uint8Array(chunk.length + 1);
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
            let zsession = detection.confirm();
            let promise = zsession.type === 'send' ? modal.handleSend(zsession) : modal.handleReceive(zsession);
            promise.catch(console.error.bind(console)).then(() => {
                modal.hide();
                term.setOption('disableStdin', false);
            });
        }
    });

    ws.binaryType = 'arraybuffer';

    ws.onopen = function() {
        console.log('[ttyd] websocket opened');
        wsError = false;
        sendMessage(JSON.stringify({AuthToken: authToken}));

        if (typeof term !== 'undefined') {
            term.dispose();
        }

        // expose term handle for some programatic cases
        // which need to get the content of the terminal
        term = window.term = <ITtydTerminal>new Terminal({
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
        } as ITerminalOptions);

        term.resizeDisposable = term.onResize((size: {cols: number, rows: number}) => {
            if (ws.readyState === WebSocket.OPEN) {
                sendMessage('1' + JSON.stringify({columns: size.cols, rows: size.rows}));
            }
            setTimeout(() => term.showOverlay(size.cols + 'x' + size.rows), 500);
        });

        term.onTitleChange((data: string) => {
            if (data && data !== '') {
                document.title = (data + ' | ' + title);
            }
        });

        term.dataDisposable = term.onData((data: string) => sendMessage('0' + data));

        while (terminalContainer.firstChild) {
            terminalContainer.removeChild(terminalContainer.firstChild);
        }

        // https://stackoverflow.com/a/27923937/1727928
        window.addEventListener('resize', () => {
            clearTimeout(window.resizeTimeout);
            window.resizeTimeout = setTimeout(() => term.fit(), 250);
        });
        window.addEventListener('beforeunload', unloadCallback);

        term.open(terminalContainer);
        term.fit();
        term.focus();
    };

    ws.onmessage = function(event: MessageEvent) {
        let rawData = new Uint8Array(event.data),
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
                let preferences = JSON.parse(textDecoder.decode(data));
                Object.keys(preferences).forEach((key) => {
                    console.log('[ttyd] xterm option: ' + key + '=' +  preferences[key]);
                    term.setOption(key, preferences[key]);
                });
                break;
            case '3':
                autoReconnect = JSON.parse(textDecoder.decode(data));
                console.log('[ttyd] reconnect: ' + autoReconnect + ' seconds');
                break;
            default:
                console.log('[ttyd] unknown command: ' + cmd);
                break;
        }
    };

    ws.onclose = function(event: CloseEvent) {
        console.log('[ttyd] websocket closed, code: ' + event.code);
        if (term) {
            term.resizeDisposable.dispose();
            term.dataDisposable.dispose();
            if (!wsError) {
                term.showOverlay('Connection Closed', null);
            }
        }
        window.removeEventListener('beforeunload', unloadCallback);
        // 1000: CLOSE_NORMAL
        if (event.code !== 1000 && autoReconnect > 0) {
            term.reconnectTimeout = setTimeout(openWs, autoReconnect * 1000);
        }
    };
};

if (document.readyState === 'complete' || document.readyState !== 'loading') {
    openWs();
} else {
    document.addEventListener('DOMContentLoaded', openWs);
}
