import { h, Component } from 'preact';
import { bind } from 'decko';
import { Terminal as TERMINAL } from 'xterm';
import style from 'xterm/dist/xterm.css';

require('fast-text-encoding');

export default class Terminal extends Component {
    componentDidMount() {
        TERMINAL.applyAddon(require('xterm/dist/addons/fit'));
        TERMINAL.applyAddon(require('xterm/dist/addons/winptyCompat'));
        TERMINAL.applyAddon(require('./overlay'));

        this.url = (window.location.protocol === 'https:' ? 'wss://' : 'ws://')
            + window.location.host + window.location.pathname + 'ws';

        this.autoReconnect = 0;
        this.textDecoder = new TextDecoder();
        this.textEncoder = new TextEncoder();
        this.connectWebsocket();

        window.addEventListener('resize', this.onWindowSize);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.onWindowSize);
    }

    @bind
    onWindowSize() {
        const { terminal } = this;

        clearTimeout(this.resizedFinished);
        this.resizedFinished = setTimeout(function () {
            if (terminal) {
                terminal.fit();
            }
        }, 250);
    }

    @bind
    connectWebsocket() {
        this.socket = new WebSocket(this.url, ['tty']);
        const { socket } = this;

        socket.binaryType = 'arraybuffer';

        socket.onopen = this.onSocketOpen;
        socket.onmessage = this.onSocketData;
        socket.onclose = this.onSocketClose;
    }

    @bind
    onSocketOpen(event) {
        console.log('Websocket connection opened');
        const { socket, textEncoder } = this;
        socket.send(textEncoder.encode(JSON.stringify({AuthToken: ''})));

        if (this.terminal) {
            this.terminal.destroy();
        }

        this.terminal = new TERMINAL({
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
            },
        });

        const { terminal } = this;

        terminal.on('title', this.onTerminalTitle);
        terminal.on('data', this.onTerminalData);
        terminal.on('resize', this.onTerminalResize);

        terminal.open(this.container, true);
        terminal.winptyCompatInit();
        terminal.fit();
        terminal.focus();
    }

    @bind
    onSocketClose(event) {
        console.log('Websocket connection closed with code: ' + event.code);

        const { terminal, autoReconnect, connectWebsocket } = this;
        terminal.showOverlay('Connection Closed', null);

        // 1000: CLOSE_NORMAL
        if (event.code !== 1000 && autoReconnect > 0) {
            setTimeout(connectWebsocket, autoReconnect * 1000);
        }
    }

    @bind
    onSocketData(event) {
        const { terminal, textDecoder } = this;

        let rawData = new Uint8Array(event.data),
            cmd = String.fromCharCode(rawData[0]),
            data = rawData.slice(1).buffer;

        switch(cmd) {
            case '0':
                terminal.write(textDecoder.decode(data));
                break;
            case '1':
                let title = textDecoder.decode(data);
                document.title = title;
                break;
            case '2':
                let preferences = JSON.parse(textDecoder.decode(data));
                Object.keys(preferences).forEach(function(key) {
                    console.log('Setting ' + key + ': ' +  preferences[key]);
                    terminal.setOption(key, preferences[key]);
                });
                break;
            case '3':
                this.autoReconnect = JSON.parse(textDecoder.decode(data));
                console.log('Enabling reconnect: ' + this.autoReconnect + ' seconds');
                break;
            default:
                console.warn('Unknown command: ' + cmd);
                break;
        }
    }

    @bind
    onTerminalTitle(title) {
        if (title && title !== '') {
            document.title = title;
        }
    }

    @bind
    onTerminalResize({ cols, rows }) {
        const { terminal, socket, textEncoder } = this;
        if (socket.readyState === WebSocket.OPEN) {
            let msg = '1' + JSON.stringify({columns: cols, rows: rows});
            socket.send(textEncoder.encode(msg));
        }
        setTimeout(function() {
            terminal.showOverlay(cols + 'x' + rows);
        }, 500);
    }

    @bind
    onTerminalData(data) {
        const { terminal, socket, textEncoder } = this;
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(textEncoder.encode('0' + data));
        }
    }

    render() {
        return (
            <div id="terminal-container" ref={(div) => { this.container = div; }}></div>
        );
    }
}