import { bind } from 'decko';
import * as backoff from 'backoff';
import { Component, h } from 'preact';
import { ITerminalOptions, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import { WebLinksAddon } from 'xterm-addon-web-links';

import { OverlayAddon } from './overlay';
import { ZmodemAddon, FlowControl } from '../zmodem';

import 'xterm/css/xterm.css';

interface TtydTerminal extends Terminal {
    fit(): void;
}

declare global {
    interface Window {
        term: TtydTerminal;
    }
}

const enum Command {
    // server side
    OUTPUT = '0',
    SET_WINDOW_TITLE = '1',
    SET_PREFERENCES = '2',

    // client side
    INPUT = '0',
    RESIZE_TERMINAL = '1',
    PAUSE = '2',
    RESUME = '3',
}

export interface ClientOptions {
    rendererType: 'dom' | 'canvas' | 'webgl';
    disableLeaveAlert: boolean;
    disableResizeOverlay: boolean;
    titleFixed: string;
}

interface Props {
    id: string;
    wsUrl: string;
    tokenUrl: string;
    clientOptions: ClientOptions;
    termOptions: ITerminalOptions;
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
    private token: string;
    private title: string;
    private titleFixed: string;
    private resizeTimeout: number;
    private resizeOverlay = true;

    private backoff: backoff.Backoff;
    private backoffLock = false;
    private doBackoff = true;
    private reconnect = false;

    constructor(props: Props) {
        super(props);

        this.textEncoder = new TextEncoder();
        this.textDecoder = new TextDecoder();
        this.fitAddon = new FitAddon();
        this.overlayAddon = new OverlayAddon();
        this.backoff = backoff.exponential({
            initialDelay: 100,
            maxDelay: 10000,
        });
        this.backoff.failAfter(15);
        this.backoff.on('ready', () => {
            this.backoffLock = false;
            this.refreshToken().then(this.connect);
        });
        this.backoff.on('backoff', (_, delay: number) => {
            console.log(`[ttyd] will attempt to reconnect websocket in ${delay}ms`);
            this.backoffLock = true;
        });
        this.backoff.on('fail', () => {
            this.backoffLock = true; // break backoff
        });
    }

    async componentDidMount() {
        await this.refreshToken();
        this.openTerminal();
        this.connect();

        window.addEventListener('resize', this.onWindowResize);
        window.addEventListener('beforeunload', this.onWindowUnload);
    }

    componentWillUnmount() {
        this.socket.close();
        this.terminal.dispose();

        window.removeEventListener('resize', this.onWindowResize);
        window.removeEventListener('beforeunload', this.onWindowUnload);
    }

    render({ id }: Props) {
        const control = {
            limit: 100000,
            highWater: 10,
            lowWater: 4,
            pause: () => this.pause(),
            resume: () => this.resume(),
        } as FlowControl;

        return (
            <div id={id} ref={c => (this.container = c)}>
                <ZmodemAddon ref={c => (this.zmodemAddon = c)} sender={this.sendData} control={control} />
            </div>
        );
    }

    @bind
    private pause() {
        const { textEncoder, socket } = this;
        socket.send(textEncoder.encode(Command.PAUSE));
    }

    @bind
    private resume() {
        const { textEncoder, socket } = this;
        socket.send(textEncoder.encode(Command.RESUME));
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
    private async refreshToken() {
        try {
            const resp = await fetch(this.props.tokenUrl);
            if (resp.ok) {
                const json = await resp.json();
                this.token = json.token;
            }
        } catch (e) {
            console.error(`[ttyd] fetch ${this.props.tokenUrl}: `, e);
        }
    }

    @bind
    private onWindowResize() {
        const { fitAddon } = this;
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => fitAddon.fit(), 250) as any;
    }

    @bind
    private onWindowUnload(event: BeforeUnloadEvent): any {
        const { socket } = this;
        if (socket && socket.readyState === WebSocket.OPEN) {
            const message = 'Close terminal? this will also terminate the command.';
            event.returnValue = message;
            return message;
        }
        event.preventDefault();
    }

    @bind
    private openTerminal() {
        this.terminal = new Terminal(this.props.termOptions);
        const { terminal, container, fitAddon, overlayAddon } = this;
        window.term = terminal as TtydTerminal;
        window.term.fit = () => {
            this.fitAddon.fit();
        };

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(overlayAddon);
        terminal.loadAddon(new WebLinksAddon());
        terminal.loadAddon(this.zmodemAddon);

        terminal.onTitleChange(data => {
            if (data && data !== '' && !this.titleFixed) {
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
    }

    @bind
    private connect() {
        this.socket = new WebSocket(this.props.wsUrl, ['tty']);
        const { socket } = this;

        socket.binaryType = 'arraybuffer';
        socket.onopen = this.onSocketOpen;
        socket.onmessage = this.onSocketData;
        socket.onclose = this.onSocketClose;
        socket.onerror = this.onSocketError;
    }

    @bind
    private applyOptions(options: any) {
        const { terminal, fitAddon } = this;
        const isWebGL2Available = () => {
            try {
                const canvas = document.createElement('canvas');
                return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
            } catch (e) {
                return false;
            }
        };

        Object.keys(options).forEach(key => {
            const value = options[key];
            switch (key) {
                case 'rendererType':
                    if (value === 'webgl' && isWebGL2Available()) {
                        terminal.loadAddon(new WebglAddon());
                        console.log(`[ttyd] WebGL renderer enabled`);
                    }
                    break;
                case 'disableLeaveAlert':
                    if (value) {
                        window.removeEventListener('beforeunload', this.onWindowUnload);
                        console.log('[ttyd] Leave site alert disabled');
                    }
                    break;
                case 'disableResizeOverlay':
                    if (value) {
                        console.log(`[ttyd] Resize overlay disabled`);
                        this.resizeOverlay = false;
                    }
                    break;
                case 'disableReconnect':
                    if (value) {
                        console.log(`[ttyd] Reconnect disabled`);
                        this.doBackoff = false;
                    }
                    break;
                case 'titleFixed':
                    if (!value || value === '') return;
                    console.log(`[ttyd] setting fixed title: ${value}`);
                    this.titleFixed = value;
                    document.title = value;
                    break;
                default:
                    console.log(`[ttyd] option: ${key}=${value}`);
                    terminal.setOption(key, value);
                    if (key.indexOf('font') === 0) fitAddon.fit();
                    break;
            }
        });
    }

    @bind
    private onSocketOpen() {
        console.log('[ttyd] websocket connection opened');
        this.backoff.reset();

        const { socket, textEncoder, terminal, fitAddon, overlayAddon } = this;
        socket.send(textEncoder.encode(JSON.stringify({ AuthToken: this.token })));

        if (this.reconnect) {
            const dims = fitAddon.proposeDimensions();
            terminal.reset();
            terminal.resize(dims.cols, dims.rows);
            this.onTerminalResize(dims); // may not be triggered by terminal.resize
            overlayAddon.showOverlay('Reconnected', 300);
        } else {
            this.reconnect = true;
            fitAddon.fit();
        }

        this.applyOptions(this.props.clientOptions);

        terminal.focus();
    }

    @bind
    private onSocketClose(event: CloseEvent) {
        console.log(`[ttyd] websocket connection closed with code: ${event.code}`);

        const { backoff, doBackoff, backoffLock, overlayAddon } = this;
        overlayAddon.showOverlay('Connection Closed', null);

        // 1000: CLOSE_NORMAL
        if (event.code !== 1000 && doBackoff && !backoffLock) {
            backoff.backoff();
        }
    }

    @bind
    private onSocketError(event: Event) {
        console.error('[ttyd] websocket connection error: ', event);
        const { backoff, doBackoff, backoffLock } = this;
        if (doBackoff && !backoffLock) {
            backoff.backoff();
        }
    }

    @bind
    private onSocketData(event: MessageEvent) {
        const { textDecoder, zmodemAddon } = this;
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
                this.applyOptions(JSON.parse(textDecoder.decode(data)));
                break;
            default:
                console.warn(`[ttyd] unknown command: ${cmd}`);
                break;
        }
    }

    @bind
    private onTerminalResize(size: { cols: number; rows: number }) {
        const { overlayAddon, socket, textEncoder, resizeOverlay } = this;
        if (socket.readyState === WebSocket.OPEN) {
            const msg = JSON.stringify({ columns: size.cols, rows: size.rows });
            socket.send(textEncoder.encode(Command.RESIZE_TERMINAL + msg));
        }
        if (resizeOverlay) {
            setTimeout(() => {
                overlayAddon.showOverlay(`${size.cols}x${size.rows}`);
            }, 500);
        }
    }

    @bind
    private onTerminalData(data: string) {
        const { socket, textEncoder } = this;
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(textEncoder.encode(Command.INPUT + data));
        }
    }
}
