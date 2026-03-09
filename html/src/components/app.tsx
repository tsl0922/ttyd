import { h, Component } from 'preact';

import { Terminal } from './terminal';

import type { ITerminalOptions, ITheme } from '@xterm/xterm';
import type { ClientOptions, FlowControl } from './terminal/xterm';
import { DEFAULT_DYNAMIC_LAYOUTS, MobileKeyboardLayoutSpec } from './terminal/xterm/mobile-keyboard';

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const path = window.location.pathname.replace(/[/]+$/, '');
const wsUrl = [protocol, '//', window.location.host, path, '/ws', window.location.search].join('');
const tokenUrl = [window.location.protocol, '//', window.location.host, path, '/token'].join('');
const clientOptions = {
    rendererType: 'webgl',
    disableLeaveAlert: false,
    disableResizeOverlay: false,
    enableZmodem: false,
    enableTrzsz: false,
    enableSixel: false,
    closeOnDisconnect: false,
    isWindows: false,
    unicodeVersion: '11',
    mobileTapSelectionEnabled: true,
    mobileKeyboardEnabled: true,
    mobileKeyboardOpacity: 0.72,
    mobileKeyboardScale: 1,
    mobileKeyboardCustomKeys: [
        { id: 'tmux_copy_mode', label: 'C-b [', combo: ['Ctrl+b', '['] },
        { id: 'tmux_detach', label: 'C-b d', combo: ['Ctrl+b', 'd'] },
        { id: 'tmux_new_window', label: 'C-b c', combo: ['Ctrl+b', 'c'] },
        { id: 'tmux_next_window', label: 'C-b n', combo: ['Ctrl+b', 'n'] },
        { id: 'tmux_list_windows', label: 'C-b w', combo: ['Ctrl+b', 'w'] },
    ],
    mobileKeyboardLayouts: [
        ...DEFAULT_DYNAMIC_LAYOUTS.map(layout => [...layout] as MobileKeyboardLayoutSpec),
        [
            'space',
            { key: 'tmux_copy_mode', page: 2 },
            'tmux_detach',
            { key: 'tmux_new_window', page: 1 },
            'tmux_next_window',
            { key: 'tmux_list_windows', page: 1 },
        ],
    ],
    mobileKeyboardHoldDelayMs: 300,
    mobileKeyboardHoldIntervalMs: 120,
    mobileKeyboardHoldWheelIntervalMs: 120,
} as ClientOptions;
const termOptions = {
    fontSize: 13,
    fontFamily: 'Consolas,Liberation Mono,Menlo,Courier,monospace',
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
        brightWhite: '#f1f1f0',
    } as ITheme,
    allowProposedApi: true,
} as ITerminalOptions;
const flowControl = {
    limit: 100000,
    highWater: 10,
    lowWater: 4,
} as FlowControl;

export class App extends Component {
    render() {
        return (
            <Terminal
                id="terminal-container"
                wsUrl={wsUrl}
                tokenUrl={tokenUrl}
                clientOptions={clientOptions}
                termOptions={termOptions}
                flowControl={flowControl}
            />
        );
    }
}
