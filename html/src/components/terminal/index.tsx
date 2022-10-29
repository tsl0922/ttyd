import { bind } from 'decko';
import { Component, h } from 'preact';
import { ITerminalOptions, Terminal } from 'xterm';
import { CanvasAddon } from 'xterm-addon-canvas';
import { WebglAddon } from 'xterm-addon-webgl';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { ImageAddon } from 'xterm-addon-image';
import { OverlayAddon } from './overlay';
import { ZmodemAddon } from '../zmodem';

import 'xterm/css/xterm.css';
import worker from 'xterm-addon-image/lib/xterm-addon-image-worker';

const imageWorkerUrl = window.URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }));

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

export type RendererType = 'dom' | 'canvas' | 'webgl';

export interface ClientOptions {
    rendererType: RendererType;
    disableLeaveAlert: boolean;
    disableResizeOverlay: boolean;
    titleFixed: string;
}

export interface FlowControl {
    limit: number;
    highWater: number;
    lowWater: number;
}

interface Props {
    id: string;
    wsUrl: string;
    tokenUrl: string;
    clientOptions: ClientOptions;
    termOptions: ITerminalOptions;
    flowControl: FlowControl;
}

export class Xterm extends Component<Props> {
    private textEncoder: TextEncoder;
    private textDecoder: TextDecoder;
    private container: HTMLElement;
    private terminal: Terminal;

    private written = 0;
    private pending = 0;

    private fitAddon: FitAddon;
    private overlayAddon: OverlayAddon;
    private zmodemAddon: ZmodemAddon;
    private webglAddon: WebglAddon;
    private canvasAddon: CanvasAddon;

    private socket: WebSocket;
    private token: string;
    private opened = false;
    private title: string;
    private titleFixed: string;
    private resizeTimeout: number;
    private resizeOverlay = true;
    private reconnect = true;
    private doReconnect = true;

    constructor(props: Props) {
        super(props);

        this.textEncoder = new TextEncoder();
        this.textDecoder = new TextDecoder();
        this.fitAddon = new FitAddon();
        this.overlayAddon = new OverlayAddon();
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
        return (
            <div id={id} ref={c => (this.container = c)}>
                <ZmodemAddon ref={c => (this.zmodemAddon = c)} sender={this.sendData} writer={this.writeData} />
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
    private sendData(data: string | Uint8Array) {
        const { socket, textEncoder } = this;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        if (typeof data === 'string') {
            socket.send(textEncoder.encode(Command.INPUT + data));
        } else {
            const payload = new Uint8Array(data.length + 1);
            payload[0] = Command.INPUT.charCodeAt(0);
            payload.set(data, 1);
            socket.send(payload);
        }
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
        terminal.loadAddon(new ImageAddon(imageWorkerUrl));

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
        fitAddon.fit();
    }

    @bind
    private writeData(data: string | Uint8Array) {
        const { terminal, pause, resume } = this;
        const { limit, highWater, lowWater } = this.props.flowControl;

        this.written += data.length;
        if (this.written > limit) {
            terminal.write(data, () => {
                this.pending = Math.max(this.pending - 1, 0);
                if (this.pending < lowWater) {
                    resume();
                }
            });
            this.pending++;
            this.written = 0;
            if (this.pending > highWater) {
                pause();
            }
        } else {
            terminal.write(data);
        }
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
    private setRendererType(value: RendererType) {
        const { terminal } = this;
        const disposeCanvasRenderer = () => {
            try {
                this.canvasAddon?.dispose();
            } catch {
                // ignore
            }
            this.canvasAddon = undefined;
        };
        const disposeWebglRenderer = () => {
            try {
                this.webglAddon?.dispose();
            } catch {
                // ignore
            }
            this.webglAddon = undefined;
        };
        const enableCanvasRenderer = () => {
            if (this.canvasAddon) return;
            this.canvasAddon = new CanvasAddon();
            disposeWebglRenderer();
            try {
                this.terminal.loadAddon(this.canvasAddon);
                console.log(`[ttyd] canvas renderer loaded`);
            } catch (e) {
                console.log(`[ttyd] canvas renderer could not be loaded, falling back to dom renderer`, e);
                disposeCanvasRenderer();
            }
        };
        const enableWebglRenderer = () => {
            if (this.webglAddon) return;
            this.webglAddon = new WebglAddon();
            disposeCanvasRenderer();
            try {
                this.webglAddon.onContextLoss(() => {
                    this.webglAddon?.dispose();
                });
                terminal.loadAddon(this.webglAddon);
                console.log(`[ttyd] WebGL renderer loaded`);
            } catch (e) {
                console.log(`[ttyd] WebGL renderer could not be loaded, falling back to canvas renderer`, e);
                disposeWebglRenderer();
                enableCanvasRenderer();
            }
        };

        switch (value) {
            case 'canvas':
                enableCanvasRenderer();
                break;
            case 'webgl':
                enableWebglRenderer();
                break;
            case 'dom':
            default:
                break;
        }
    }

    @bind
    private applyOptions(options: ITerminalOptions) {
        const { terminal, fitAddon } = this;

        Object.keys(options).forEach(key => {
            const value = options[key];
            switch (key) {
                case 'rendererType':
                    this.setRendererType(value);
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
                        this.reconnect = false;
                        this.doReconnect = false;
                    }
                    break;
                case 'titleFixed':
                    if (!value || value === '') return;
                    console.log(`[ttyd] setting fixed title: ${value}`);
                    this.titleFixed = value;
                    document.title = value;
                    break;
                default:
                    console.log(`[ttyd] option: ${key}=${JSON.stringify(value)}`);
                    if (terminal.options[key] instanceof Object) {
                        terminal.options[key] = Object.assign({}, terminal.options[key], value);
                    } else {
                        terminal.options[key] = value;
                    }
                    if (key.indexOf('font') === 0) fitAddon.fit();
                    break;
            }
        });
    }

    @bind
    private onSocketOpen() {
        console.log('[ttyd] websocket connection opened');

        const { socket, textEncoder, terminal, fitAddon, overlayAddon } = this;
        const dims = fitAddon.proposeDimensions();
        socket.send(
            textEncoder.encode(
                JSON.stringify({
                    AuthToken: this.token,
                    columns: dims.cols,
                    rows: dims.rows,
                })
            )
        );

        if (this.opened) {
            terminal.reset();
            terminal.resize(dims.cols, dims.rows);
            overlayAddon.showOverlay('Reconnected', 300);
        } else {
            this.opened = true;
        }

        this.doReconnect = this.reconnect;

        terminal.focus();
    }

    @bind
    private onSocketClose(event: CloseEvent) {
        console.log(`[ttyd] websocket connection closed with code: ${event.code}`);

        const { refreshToken, connect, doReconnect, overlayAddon } = this;
        overlayAddon.showOverlay('Connection Closed', null);

        // 1000: CLOSE_NORMAL
        if (event.code !== 1000 && doReconnect) {
            overlayAddon.showOverlay('Reconnecting...', null);
            refreshToken().then(connect);
        } else {
            const { terminal } = this;
            const keyDispose = terminal.onKey(e => {
                const event = e.domEvent;
                if (event.key === 'Enter') {
                    keyDispose.dispose();
                    overlayAddon.showOverlay('Reconnecting...', null);
                    refreshToken().then(connect);
                }
            });
            overlayAddon.showOverlay('Press ⏎ to Reconnect', null);
        }
    }

    @bind
    private onSocketError(event: Event) {
        console.error('[ttyd] websocket connection error: ', event);
        this.doReconnect = false;
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
                const prefs = JSON.parse(textDecoder.decode(data));
                const options = Object.assign({}, this.props.clientOptions, prefs) as ITerminalOptions;
                this.applyOptions(options);
                break;
            default:
                console.warn(`[ttyd] unknown command: ${cmd}`);
                break;
        }
    }

    @bind
    private onTerminalResize(size: { cols: number; rows: number }) {
        const { overlayAddon, socket, textEncoder, resizeOverlay } = this;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        const msg = JSON.stringify({ columns: size.cols, rows: size.rows });
        socket.send(textEncoder.encode(Command.RESIZE_TERMINAL + msg));

        if (resizeOverlay) {
            setTimeout(() => {
                overlayAddon.showOverlay(`${size.cols}x${size.rows}`);
            }, 500);
        }
    }

    @bind
    private onTerminalData(data: string) {
        this.sendData(data);
    }
}
