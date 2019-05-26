import { h, Component } from 'preact';

import { ITerminalOptions, ITheme } from 'xterm';
import Terminal from './terminal';

if ((module as any).hot) {
    require('preact/debug');
}

const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const wsPath = window.location.pathname.endsWith('/') ? 'ws' : '/ws';
const url = [protocol, window.location.host, window.location.pathname, wsPath, window.location.search].join('');
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

export default class App extends Component {
    public render() {
        return (
            <Terminal id='terminal-container' url={url} options={termOptions} />
        );
    }
}
