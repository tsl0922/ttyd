import { bind } from 'decko';
import * as backoff from 'backoff';
import { Component, h } from 'preact';
import { ITerminalOptions, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';

import { OverlayAddon } from './overlay';
import { ZmodemAddon } from '../zmodem';

import 'xterm/css/xterm.css';

export interface TerminalExtended extends Terminal {
    fit();
}

export interface WindowExtended extends Window {
    term: TerminalExtended;
    tty_auth_token?: string;
}
declare let window: WindowExtended;

const enum Command {
    // server side
    OUTPUT = '0',
    SET_WINDOW_TITLE = '1',
    SET_PREFERENCES = '2',

    // client side
    INPUT = '0',
    RESIZE_TERMINAL = '1',
}

interface Props {
    id: string;
    url: string;
    options: ITerminalOptions;
}

export class Xterm extends Component<Props> {
    private textEncoder: TextEncoder;
    private textDecoder: TextDecoder;
    private container: HTMLElement;
    private terminal: Terminal;
    private fitAddon: FitAddon;
    private overlayAddon: OverlayAddon;
    private zmodemAddon: ZmodemAddon;
    private socket: WebSocket;
    private title: string;
    private resizeTimeout: number;
    private backoff: backoff.Backoff;
    private backoffLock = false;

    constructor(props) {
        super(props);

        this.textEncoder = new TextEncoder();
        this.textDecoder = new TextDecoder();
        this.fitAddon = new FitAddon();
        this.overlayAddon = new OverlayAddon();
        this.backoff = backoff.exponential({
            initialDelay: 100,
            maxDelay: 10000,
        });
        this.backoff.on('ready', () => {
            this.backoffLock = false;
            this.openTerminal();
        });
        this.backoff.on('backoff', (_, delay: number) => {
            console.log(`[ttyd] will attempt to reconnect websocket in ${delay}ms`);
            this.backoffLock = true;
        });
    }

    componentDidMount() {
        this.openTerminal();
    }

    componentWillUnmount() {
        this.socket.close();
        this.terminal.dispose();

        window.removeEventListener('resize', this.onWindowResize);
        window.removeEventListener('beforeunload', this.onWindowUnload);
    }

    render({ id }: Props) {
        return (
            <div id={id} ref={c => (this.container = c)}>
                <ZmodemAddon ref={c => (this.zmodemAddon = c)} sender={this.sendData} />
            </div>
        );
    }

    @bind
    private sendData(data: ArrayLike<number>) {
        const { socket } = this;
        const payload = new Uint8Array(data.length + 1);
        payload[0] = Command.INPUT.charCodeAt(0);
        payload.set(data, 1);
        socket.send(payload);
    }

    @bind
    private onWindowResize() {
        const { fitAddon } = this;
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => fitAddon.fit(), 250) as any;
    }

    private onWindowUnload(event: BeforeUnloadEvent): string {
        const message = 'Close terminal? this will also terminate the command.';
        event.returnValue = message;
        return message;
    }

    @bind
    private openTerminal() {
        if (this.terminal) {
            this.terminal.dispose();
        }

        this.socket = new WebSocket(this.props.url, ['tty']);
        this.terminal = new Terminal(this.props.options);
        const { socket, terminal, container, fitAddon, overlayAddon } = this;
        window.term = terminal as TerminalExtended;
        window.term.fit = () => {
            this.fitAddon.fit();
        };

        socket.binaryType = 'arraybuffer';
        socket.onopen = this.onSocketOpen;
        socket.onmessage = this.onSocketData;
        socket.onclose = this.onSocketClose;
        socket.onerror = this.onSocketError;

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(overlayAddon);
        terminal.loadAddon(new WebLinksAddon());
        terminal.loadAddon(this.zmodemAddon);

        terminal.onTitleChange(data => {
            if (data && data !== '') {
                document.title = data + ' | ' + this.title;
            }
        });
        terminal.onData(this.onTerminalData);
        terminal.onResize(this.onTerminalResize);
        if (document.queryCommandSupported && document.queryCommandSupported('copy')) {
            terminal.onSelectionChange(() => {
                if (terminal.getSelection() === '') return;
                overlayAddon.showOverlay('\u2702', 200);
                document.execCommand('copy');
            });
        }
        terminal.open(container);
        terminal.focus();

        window.addEventListener('resize', this.onWindowResize);
        window.addEventListener('beforeunload', this.onWindowUnload);
    }

    @bind
    private reconnect() {
        if (!this.backoffLock) {
            this.backoff.backoff();
        }
    }

    @bind
    private onSocketOpen() {
        console.log('[ttyd] Websocket connection opened');
        this.backoff.reset();

        const { socket, textEncoder, fitAddon } = this;
        const authToken = window.tty_auth_token;

        socket.send(textEncoder.encode(JSON.stringify({ AuthToken: authToken })));
        fitAddon.fit();
    }

    @bind
    private onSocketClose(event: CloseEvent) {
        console.log(`[ttyd] websocket connection closed with code: ${event.code}`);

        const { overlayAddon } = this;
        overlayAddon.showOverlay('Connection Closed', null);
        window.removeEventListener('beforeunload', this.onWindowUnload);

        // 1008: POLICY_VIOLATION - Auth failure
        if (event.code === 1008) {
            window.location.reload();
        }

        // 1000: CLOSE_NORMAL
        if (event.code !== 1000) {
            this.reconnect();
        }
    }

    @bind
    private onSocketError() {
        this.reconnect();
    }

    @bind
    private onSocketData(event: MessageEvent) {
        const { terminal, textDecoder, zmodemAddon } = this;
        const rawData = event.data as ArrayBuffer;
        const cmd = String.fromCharCode(new Uint8Array(rawData)[0]);
        const data = rawData.slice(1);

        switch (cmd) {
            case Command.OUTPUT:
                zmodemAddon.consume(data);
                break;
            case Command.SET_WINDOW_TITLE:
                this.title = textDecoder.decode(data);
                document.title = this.title;
                break;
            case Command.SET_PREFERENCES:
                const preferences = JSON.parse(textDecoder.decode(data));
                Object.keys(preferences).forEach(key => {
                    console.log(`[ttyd] setting ${key}: ${preferences[key]}`);
                    terminal.setOption(key, preferences[key]);
                });
                break;
            default:
                console.warn(`[ttyd] unknown command: ${cmd}`);
                break;
        }
    }

    @bind
    private onTerminalResize(size: { cols: number; rows: number }) {
        const { overlayAddon, socket, textEncoder } = this;
        if (socket.readyState === WebSocket.OPEN) {
            const msg = JSON.stringify({ columns: size.cols, rows: size.rows });
            socket.send(textEncoder.encode(Command.RESIZE_TERMINAL + msg));
        }
        setTimeout(() => {
            overlayAddon.showOverlay(`${size.cols}x${size.rows}`);
        }, 500);
    }

    @bind
    private onTerminalData(data: string) {
        const { socket, textEncoder } = this;
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(textEncoder.encode(Command.INPUT + data));
        }
    }
}
