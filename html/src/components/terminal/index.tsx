import { bind } from 'decko';
import { Component, h } from 'preact';
import { ITerminalOptions, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { OverlayAddon } from './overlay';

import 'xterm/dist/xterm.css';

const enum Command {
    // server side
    OUTPUT = '0',
    SET_WINDOW_TITLE = '1',
    SET_PREFERENCES = '2',
    SET_RECONNECT = '3',

    // client side
    INPUT = '0',
    RESIZE_TERMINAL = '1'
}

interface Props {
    id: string;
    url: string;
    options: ITerminalOptions;
}

export default class Xterm extends Component<Props> {
    private textEncoder: TextEncoder;
    private textDecoder: TextDecoder;
    private container: HTMLElement;
    private terminal: Terminal;
    private fitAddon: FitAddon;
    private overlayAddon: OverlayAddon;
    private socket: WebSocket;
    private title: string;
    private autoReconnect: number;
    private resizeTimeout: number;

    constructor(props) {
        super(props);

        this.textEncoder = new TextEncoder();
        this.textDecoder = new TextDecoder();
        this.fitAddon = new FitAddon();
        this.overlayAddon = new OverlayAddon();
    }

    public componentDidMount() {
        this.openTerminal();
    }

    public componentWillUnmount() {
        this.socket.close();
        this.terminal.dispose();

        window.removeEventListener('resize', this.onWindowResize);
        window.removeEventListener('beforeunload', this.onWindowUnload);
    }

    public render({ id }: Props) {
        return (
            <div id={id} ref={(c) => this.container = c} />
        );
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
        const { socket, terminal, container } = this;

        socket.binaryType = 'arraybuffer';
        socket.onopen = this.onSocketOpen;
        socket.onmessage = this.onSocketData;
        socket.onclose = this.onSocketClose;

        terminal.loadAddon(this.fitAddon);
        terminal.loadAddon(this.overlayAddon);

        terminal.onTitleChange((data) => {
            if (data && data !== '') {
                document.title = (data + ' | ' + this.title);
            }
        });
        terminal.onData(this.onTerminalData);
        terminal.onResize(this.onTerminalResize);
        terminal.open(container);
        terminal.focus();

        window.addEventListener('resize', this.onWindowResize);
        window.addEventListener('beforeunload', this.onWindowUnload);
    }

    @bind
    private onSocketOpen() {
        console.log('Websocket connection opened');
        const { socket, textEncoder, fitAddon } = this;

        socket.send(textEncoder.encode(JSON.stringify({AuthToken: ''})));
        fitAddon.fit();
    }

    @bind
    private onSocketClose(event: CloseEvent) {
        console.log('Websocket connection closed with code: ' + event.code);

        const { overlayAddon, openTerminal, autoReconnect } = this;
        overlayAddon.showOverlay('Connection Closed', null);
        window.removeEventListener('beforeunload', this.onWindowUnload);

        // 1008: POLICY_VIOLATION - Auth failure
        if (event.code === 1008) {
            window.location.reload();
        }
        // 1000: CLOSE_NORMAL
        if (event.code !== 1000 && autoReconnect > 0) {
            setTimeout(openTerminal, autoReconnect * 1000);
        }
    }

    @bind
    private onSocketData(event: MessageEvent) {
        const { terminal, textDecoder } = this;

        const rawData = new Uint8Array(event.data);
        const cmd = String.fromCharCode(rawData[0]);
        const data = rawData.slice(1);

        switch(cmd) {
            case Command.OUTPUT:
                terminal.writeUtf8(data);
                break;
            case Command.SET_WINDOW_TITLE:
                this.title = textDecoder.decode(data.buffer);
                document.title = this.title;
                break;
            case Command.SET_PREFERENCES:
                const preferences = JSON.parse(textDecoder.decode(data.buffer));
                Object.keys(preferences).forEach((key) => {
                    console.log('Setting ' + key + ': ' +  preferences[key]);
                    terminal.setOption(key, preferences[key]);
                });
                break;
            case Command.SET_RECONNECT:
                this.autoReconnect = parseInt(textDecoder.decode(data.buffer));
                console.log('Enabling reconnect: ' + this.autoReconnect + ' seconds');
                break;
            default:
                console.warn('Unknown command: ' + cmd);
                break;
        }
    }

    @bind
    private onTerminalResize(size: {cols: number, rows: number}) {
        const { overlayAddon, socket, textEncoder } = this;
        if (socket.readyState === WebSocket.OPEN) {
            const msg = JSON.stringify({columns: size.cols, rows: size.rows});
            socket.send(textEncoder.encode(Command.RESIZE_TERMINAL + msg));
        }
        setTimeout(() => {overlayAddon.showOverlay(size.cols + 'x' + size.rows)}, 500);
    }

    @bind
    private onTerminalData(data: string) {
        const { socket, textEncoder } = this;
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(textEncoder.encode(Command.INPUT + data));
        }
    }
}
