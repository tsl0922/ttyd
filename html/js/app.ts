import '../sass/app.scss';

import { Terminal, ITerminalOptions, ITheme } from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';
import * as Zmodem from 'zmodem.js/src/zmodem_browser';

import * as overlay from './overlay';
import { Modal } from './zmodem';

Terminal.applyAddon(fit);
Terminal.applyAddon(overlay);

const enum TtydCommand {
    // server side
    OUTPUT = '0',
    SET_WINDOW_TITLE = '1',
    SET_PREFERENCES = '2',
    SET_RECONNECT = '3',
    // client side
    INPUT = '0',
    RESIZE_TERMINAL = '1'
}

interface ITtydTerminal extends Terminal {
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
const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsPath = window.location.pathname.endsWith('/') ? 'ws' : '/ws';
const url = [protocol, window.location.host, window.location.pathname, wsPath, window.location.search].join('');
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const termOptions = {
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
    } as ITheme
} as ITerminalOptions;

const authToken = (typeof window.tty_auth_token !== 'undefined') ? window.tty_auth_token : null;
let autoReconnect = -1;
let term: ITtydTerminal;
let title: string;
let wsError: boolean;

const openWs = function(): void {
    const ws = new WebSocket(url, ['tty']);
    const sendMessage = function (message: string): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(textEncoder.encode(message));
        }
    };
    const unloadCallback = function (event: BeforeUnloadEvent): string {
        const message = 'Close terminal? this will also terminate the command.';
        event.returnValue = message;
        return message;
    };
    const resetTerm = function(): void {
        modal.hide();
        clearTimeout(term.reconnectTimeout);
        if (ws.readyState !== WebSocket.CLOSED) {
            ws.close();
        }
        openWs();
    };

    const zsentry = new Zmodem.Sentry({
        to_terminal: function(octets: ArrayBuffer): any {
            const buffer = new Uint8Array(octets).buffer;
            term.write(textDecoder.decode(buffer));
        },

        sender: function(octets: number[]): any {
            // limit max packet size to 4096
            while (octets.length) {
                const chunk = octets.splice(0, 4095);
                const buffer = new Uint8Array(chunk.length + 1);
                buffer[0] = TtydCommand.INPUT.charCodeAt(0);
                buffer.set(chunk, 1);
                ws.send(buffer);
            }
        },

        on_retract: function(): any {
            // console.log('on_retract');
        },

        on_detect: function(detection: any): any {
            term.setOption('disableStdin', true);
            const zsession = detection.confirm();
            const promise = zsession.type === 'send' ? modal.handleSend(zsession) : modal.handleReceive(zsession);
            promise.catch(console.error.bind(console)).then(() => {
                modal.hide();
                term.setOption('disableStdin', false);
            });
        }
    });

    ws.binaryType = 'arraybuffer';

    ws.onopen = function(): void {
        console.log('[ttyd] websocket opened');
        wsError = false;
        sendMessage(JSON.stringify({AuthToken: authToken}));

        if (typeof term !== 'undefined') {
            term.dispose();
        }

        // expose term handle for some programatic cases
        // which need to get the content of the terminal
        term = window.term = <ITtydTerminal>new Terminal(termOptions);

        term.onResize((size: {cols: number, rows: number}) => {
            if (ws.readyState === WebSocket.OPEN) {
                sendMessage(TtydCommand.RESIZE_TERMINAL + JSON.stringify({columns: size.cols, rows: size.rows}));
            }
            setTimeout(() => term.showOverlay(size.cols + 'x' + size.rows), 500);
        });

        term.onTitleChange((data: string) => {
            if (data && data !== '') {
                document.title = (data + ' | ' + title);
            }
        });

        term.onData((data: string) => sendMessage(TtydCommand.INPUT + data));

        while (terminalContainer.firstChild) {
            terminalContainer.removeChild(terminalContainer.firstChild);
        }

        // https://stackoverflow.com/a/27923937/1727928
        window.addEventListener('resize', () => {
            clearTimeout(window.resizeTimeout);
            window.resizeTimeout = <number><any>setTimeout(() => term.fit(), 250);
        });
        window.addEventListener('beforeunload', unloadCallback);

        term.open(terminalContainer);
        term.fit();
        term.focus();
    };

    ws.onmessage = function(event: MessageEvent): void {
        const rawData = new Uint8Array(event.data);
        const cmd = String.fromCharCode(rawData[0]);
        const data = rawData.slice(1).buffer;
        switch (cmd) {
            case TtydCommand.OUTPUT:
                try {
                    zsentry.consume(data);
                } catch (e) {
                    console.error(e);
                    resetTerm();
                }
                break;
            case TtydCommand.SET_WINDOW_TITLE:
                title = textDecoder.decode(data);
                document.title = title;
                break;
            case TtydCommand.SET_PREFERENCES:
                const preferences = JSON.parse(textDecoder.decode(data));
                Object.keys(preferences).forEach((key) => {
                    console.log('[ttyd] xterm option: ' + key + '=' +  preferences[key]);
                    term.setOption(key, preferences[key]);
                });
                break;
            case TtydCommand.SET_RECONNECT:
                autoReconnect = JSON.parse(textDecoder.decode(data));
                console.log('[ttyd] reconnect: ' + autoReconnect + ' seconds');
                break;
            default:
                console.log('[ttyd] unknown command: ' + cmd);
                break;
        }
    };

    ws.onclose = function(event: CloseEvent): void {
        console.log('[ttyd] websocket closed, code: ' + event.code);
        modal.hide();
        if (term) {
            if (!wsError) {
                term.showOverlay('Connection Closed', null);
            }
        }
        window.removeEventListener('beforeunload', unloadCallback);
        // 1008: POLICY_VIOLATION - Auth failure
        if (event.code === 1008) {
            window.location.reload();
        }
        // 1000: CLOSE_NORMAL
        if (event.code !== 1000 && autoReconnect > 0) {
            term.reconnectTimeout = <number><any>setTimeout(openWs, autoReconnect * 1000);
        }
    };
};

if (document.readyState === 'complete' || document.readyState !== 'loading') {
    openWs();
} else {
    document.addEventListener('DOMContentLoaded', openWs);
}
