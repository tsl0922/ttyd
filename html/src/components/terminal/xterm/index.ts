import { bind } from 'decko';
import type { IDisposable, ITerminalOptions } from '@xterm/xterm';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ImageAddon } from '@xterm/addon-image';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { OverlayAddon } from './addons/overlay';
import { ZmodemAddon } from './addons/zmodem';
import { MobileKeysController, ModifierFlags, VirtualKey } from './mobile-keys';

import '@xterm/xterm/css/xterm.css';

interface TtydTerminal extends Terminal {
    fit(): void;
}

declare global {
    interface Window {
        term: TtydTerminal;
    }
}

enum Command {
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
type Preferences = ITerminalOptions & ClientOptions;

export type RendererType = 'dom' | 'canvas' | 'webgl';

export interface ClientOptions {
    rendererType: RendererType;
    disableLeaveAlert: boolean;
    disableResizeOverlay: boolean;
    enableZmodem: boolean;
    enableTrzsz: boolean;
    enableSixel: boolean;
    titleFixed?: string;
    isWindows: boolean;
    trzszDragInitTimeout: number;
    unicodeVersion: string;
    closeOnDisconnect: boolean;
    mobileKeysEnabled?: boolean;
    mobileKeysOpacity?: number;
    mobileKeysScale?: number;
}

export interface FlowControl {
    limit: number;
    highWater: number;
    lowWater: number;
}

export interface XtermOptions {
    wsUrl: string;
    tokenUrl: string;
    flowControl: FlowControl;
    clientOptions: ClientOptions;
    termOptions: ITerminalOptions;
}

function toDisposable(f: () => void): IDisposable {
    return { dispose: f };
}

function addEventListener(target: EventTarget, type: string, listener: EventListener): IDisposable {
    target.addEventListener(type, listener);
    return toDisposable(() => target.removeEventListener(type, listener));
}

export class Xterm {
    private disposables: IDisposable[] = [];
    private textEncoder = new TextEncoder();
    private textDecoder = new TextDecoder();
    private written = 0;
    private pending = 0;

    private terminal: Terminal;
    private fitAddon = new FitAddon();
    private overlayAddon = new OverlayAddon();
    private clipboardAddon = new ClipboardAddon();
    private webLinksAddon = new WebLinksAddon();
    private webglAddon?: WebglAddon;
    private canvasAddon?: CanvasAddon;
    private zmodemAddon?: ZmodemAddon;
    private mobileKeys?: MobileKeysController;

    private socket?: WebSocket;
    private token: string;
    private opened = false;
    private title?: string;
    private titleFixed?: string;
    private resizeOverlay = true;
    private reconnect = true;
    private doReconnect = true;
    private closeOnDisconnect = false;
    private parent?: HTMLElement;

    private writeFunc = (data: ArrayBuffer) => this.writeData(new Uint8Array(data));

    constructor(
        private options: XtermOptions,
        private sendCb: () => void
    ) {}

    dispose() {
        this.mobileKeys?.dispose();
        this.mobileKeys = undefined;
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    @bind
    private register<T extends IDisposable>(d: T): T {
        this.disposables.push(d);
        return d;
    }

    @bind
    public sendFile(files: FileList) {
        this.zmodemAddon?.sendFile(files);
    }

    @bind
    public async refreshToken() {
        try {
            const resp = await fetch(this.options.tokenUrl);
            if (resp.ok) {
                const json = await resp.json();
                this.token = json.token;
            }
        } catch (e) {
            console.error(`[ttyd] fetch ${this.options.tokenUrl}: `, e);
        }
    }

    @bind
    private onWindowUnload(event: BeforeUnloadEvent) {
        event.preventDefault();
        if (this.socket?.readyState === WebSocket.OPEN) {
            const message = 'Close terminal? this will also terminate the command.';
            event.returnValue = message;
            return message;
        }
        return undefined;
    }

    @bind
    public open(parent: HTMLElement) {
        this.parent = parent;
        this.terminal = new Terminal(this.options.termOptions);
        const { terminal, fitAddon, overlayAddon, clipboardAddon, webLinksAddon } = this;
        window.term = terminal as TtydTerminal;
        window.term.fit = () => {
            this.fitAddon.fit();
        };

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(overlayAddon);
        terminal.loadAddon(clipboardAddon);
        terminal.loadAddon(webLinksAddon);

        terminal.open(parent);
        this.syncPageBackground();
        this.syncViewport();
        fitAddon.fit();
        this.syncMobileKeys();
    }

    @bind
    private syncPageBackground() {
        const themeBackground = this.terminal?.options.theme?.background;
        const color = typeof themeBackground === 'string' && themeBackground !== '' ? themeBackground : '#2b2b2b';
        document.documentElement.style.backgroundColor = color;
        document.body.style.backgroundColor = color;
    }

    @bind
    private syncViewport() {
        if (!this.parent) return;
        const viewport = window.visualViewport;
        if (viewport) {
            const offsetTop = Math.max(0, Math.round(viewport.offsetTop));
            this.parent.style.height = `${Math.round(viewport.height)}px`;
            this.parent.style.top = `${offsetTop}px`;
        } else {
            this.parent.style.height = '';
            this.parent.style.top = '';
        }
    }

    @bind
    private isTouchDevice() {
        const supportsTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
        const coarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        return supportsTouch && coarsePointer;
    }

    @bind
    private shouldEnableMobileKeys() {
        const enabled = this.options.clientOptions.mobileKeysEnabled;
        return enabled !== false && this.isTouchDevice();
    }

    @bind
    private syncMobileKeys() {
        if (!this.shouldEnableMobileKeys()) {
            this.mobileKeys?.dispose();
            this.mobileKeys = undefined;
            return;
        }

        const opacity = this.options.clientOptions.mobileKeysOpacity ?? 0.72;
        const scale = this.options.clientOptions.mobileKeysScale ?? 1;
        if (!this.mobileKeys) {
            this.mobileKeys = new MobileKeysController({
                opacity,
                scale,
                onSendVirtualKey: this.sendVirtualKey,
                onKeepFocus: this.keepTerminalFocus,
            });
            return;
        }
        this.mobileKeys.updateAppearance(opacity, scale);
    }

    @bind
    private keepTerminalFocus() {
        this.terminal?.focus();
        window.setTimeout(() => this.terminal?.focus(), 0);
    }

    @bind
    private initListeners() {
        const { terminal, fitAddon, overlayAddon, register, sendData } = this;
        register(
            terminal.onTitleChange(data => {
                if (data && data !== '' && !this.titleFixed) {
                    document.title = data + ' | ' + this.title;
                }
            })
        );
        register(terminal.onData(data => sendData(data)));
        register(terminal.onBinary(data => sendData(Uint8Array.from(data, v => v.charCodeAt(0)))));
        register(
            terminal.onResize(({ cols, rows }) => {
                const msg = JSON.stringify({ columns: cols, rows: rows });
                this.socket?.send(this.textEncoder.encode(Command.RESIZE_TERMINAL + msg));
                if (this.resizeOverlay) overlayAddon.showOverlay(`${cols}x${rows}`, 300);
            })
        );
        register(
            terminal.onSelectionChange(() => {
                if (this.terminal.getSelection() === '') return;
                try {
                    document.execCommand('copy');
                } catch (e) {
                    return;
                }
                this.overlayAddon?.showOverlay('\u2702', 200);
            })
        );
        register(
            addEventListener(window, 'resize', () => {
                this.syncViewport();
                fitAddon.fit();
            })
        );
        if (window.visualViewport) {
            register(
                addEventListener(window.visualViewport, 'resize', () => {
                    this.syncViewport();
                    fitAddon.fit();
                })
            );
            register(
                addEventListener(window.visualViewport, 'scroll', () => {
                    this.syncViewport();
                })
            );
        }
        register(addEventListener(window, 'beforeunload', this.onWindowUnload));
    }

    @bind
    public writeData(data: string | Uint8Array) {
        const { terminal, textEncoder } = this;
        const { limit, highWater, lowWater } = this.options.flowControl;

        this.written += data.length;
        if (this.written > limit) {
            terminal.write(data, () => {
                this.pending = Math.max(this.pending - 1, 0);
                if (this.pending < lowWater) {
                    this.socket?.send(textEncoder.encode(Command.RESUME));
                }
            });
            this.pending++;
            this.written = 0;
            if (this.pending > highWater) {
                this.socket?.send(textEncoder.encode(Command.PAUSE));
            }
        } else {
            terminal.write(data);
        }
    }

    @bind
    public sendData(data: string | Uint8Array) {
        const { socket, textEncoder } = this;
        if (socket?.readyState !== WebSocket.OPEN) return;

        if (typeof data === 'string') {
            const outgoing = this.applyModifierToText(data);
            const payload = new Uint8Array(outgoing.length * 3 + 1);
            payload[0] = Command.INPUT.charCodeAt(0);
            const stats = textEncoder.encodeInto(outgoing, payload.subarray(1));
            socket.send(payload.subarray(0, (stats.written as number) + 1));
        } else {
            const payload = new Uint8Array(data.length + 1);
            payload[0] = Command.INPUT.charCodeAt(0);
            payload.set(data, 1);
            socket.send(payload);
        }
    }

    @bind
    private applyModifierToText(data: string) {
        if (!data || data.length === 0) return data;
        const modifiers = this.mobileKeys?.consumeModifiers();
        if (!modifiers || (!modifiers.ctrl && !modifiers.alt && !modifiers.shift)) {
            return data;
        }

        const chars = Array.from(data);
        const first = chars.shift();
        if (!first) return data;
        const firstEncoded = this.encodeCharWithModifiers(first, modifiers);
        return firstEncoded + chars.join('');
    }

    @bind
    private encodeCharWithModifiers(char: string, modifiers: ModifierFlags) {
        let value = modifiers.shift ? this.applyShift(char) : char;
        if (modifiers.ctrl) value = this.applyCtrl(value);
        if (modifiers.alt) value = `\x1b${value}`;
        return value;
    }

    @bind
    private applyShift(char: string) {
        if (/^[a-z]$/.test(char)) return char.toUpperCase();
        return char;
    }

    @bind
    private applyCtrl(char: string) {
        if (char.length !== 1) return char;
        const code = char.charCodeAt(0);
        if (code >= 97 && code <= 122) return String.fromCharCode(code - 96);
        if (code >= 65 && code <= 90) return String.fromCharCode(code - 64);

        switch (char) {
            case ' ':
            case '@':
                return String.fromCharCode(0);
            case '[':
                return String.fromCharCode(27);
            case '\\':
                return String.fromCharCode(28);
            case ']':
                return String.fromCharCode(29);
            case '^':
                return String.fromCharCode(30);
            case '_':
                return String.fromCharCode(31);
            case '?':
                return String.fromCharCode(127);
            default:
                return char;
        }
    }

    @bind
    private hasModifiers(modifiers: ModifierFlags) {
        return modifiers.ctrl || modifiers.alt || modifiers.shift;
    }

    @bind
    private getCsiModifier(modifiers: ModifierFlags) {
        return 1 + (modifiers.shift ? 1 : 0) + (modifiers.alt ? 2 : 0) + (modifiers.ctrl ? 4 : 0);
    }

    @bind
    private sendVirtualKey(key: VirtualKey, modifiers: ModifierFlags) {
        if (!this.hasModifiers(modifiers)) {
            switch (key) {
                case 'esc':
                    this.sendData('\x1b');
                    return;
                case 'tab':
                    this.sendData('\t');
                    return;
                case 'up':
                    this.sendData('\x1b[A');
                    return;
                case 'down':
                    this.sendData('\x1b[B');
                    return;
                case 'right':
                    this.sendData('\x1b[C');
                    return;
                case 'left':
                    this.sendData('\x1b[D');
                    return;
                case 'home':
                    this.sendData('\x1b[H');
                    return;
                case 'end':
                    this.sendData('\x1b[F');
                    return;
                default:
                    return;
            }
        }

        const csiModifier = this.getCsiModifier(modifiers);
        switch (key) {
            case 'esc':
                this.sendData(this.encodeCharWithModifiers('\x1b', modifiers));
                return;
            case 'tab':
                if (modifiers.shift && !modifiers.ctrl && !modifiers.alt) {
                    this.sendData('\x1b[Z');
                    return;
                }
                this.sendData(`\x1b[1;${csiModifier}I`);
                return;
            case 'up':
                this.sendData(`\x1b[1;${csiModifier}A`);
                return;
            case 'down':
                this.sendData(`\x1b[1;${csiModifier}B`);
                return;
            case 'right':
                this.sendData(`\x1b[1;${csiModifier}C`);
                return;
            case 'left':
                this.sendData(`\x1b[1;${csiModifier}D`);
                return;
            case 'home':
                this.sendData(`\x1b[1;${csiModifier}H`);
                return;
            case 'end':
                this.sendData(`\x1b[1;${csiModifier}F`);
                return;
            default:
                return;
        }
    }

    @bind
    public connect() {
        this.socket = new WebSocket(this.options.wsUrl, ['tty']);
        const { socket, register } = this;

        socket.binaryType = 'arraybuffer';
        register(addEventListener(socket, 'open', this.onSocketOpen));
        register(addEventListener(socket, 'message', this.onSocketData as EventListener));
        register(addEventListener(socket, 'close', this.onSocketClose as EventListener));
        register(addEventListener(socket, 'error', () => (this.doReconnect = false)));
    }

    @bind
    private onSocketOpen() {
        console.log('[ttyd] websocket connection opened');

        const { textEncoder, terminal, overlayAddon } = this;
        const msg = JSON.stringify({ AuthToken: this.token, columns: terminal.cols, rows: terminal.rows });
        this.socket?.send(textEncoder.encode(msg));

        if (this.opened) {
            terminal.reset();
            terminal.options.disableStdin = false;
            overlayAddon.showOverlay('Reconnected', 300);
        } else {
            this.opened = true;
        }

        this.doReconnect = this.reconnect;
        this.initListeners();
        terminal.focus();
    }

    @bind
    private onSocketClose(event: CloseEvent) {
        console.log(`[ttyd] websocket connection closed with code: ${event.code}`);

        const { refreshToken, connect, doReconnect, overlayAddon } = this;
        overlayAddon.showOverlay('Connection Closed');
        this.dispose();

        // 1000: CLOSE_NORMAL
        if (event.code !== 1000 && doReconnect) {
            overlayAddon.showOverlay('Reconnecting...');
            refreshToken().then(connect);
        } else if (this.closeOnDisconnect) {
            window.close();
        } else {
            const { terminal } = this;
            const keyDispose = terminal.onKey(e => {
                const event = e.domEvent;
                if (event.key === 'Enter') {
                    keyDispose.dispose();
                    overlayAddon.showOverlay('Reconnecting...');
                    refreshToken().then(connect);
                }
            });
            overlayAddon.showOverlay('Press ⏎ to Reconnect');
        }
    }

    @bind
    private parseOptsFromUrlQuery(query: string): Preferences {
        const { terminal } = this;
        const { clientOptions } = this.options;
        const prefs = {} as Preferences;
        const queryObj = Array.from(new URLSearchParams(query) as unknown as Iterable<[string, string]>);

        for (const [k, queryVal] of queryObj) {
            let v = clientOptions[k];
            if (v === undefined) v = terminal.options[k];
            switch (typeof v) {
                case 'boolean':
                    prefs[k] = queryVal === 'true' || queryVal === '1';
                    break;
                case 'number':
                    {
                        const parsed = Number.parseFloat(queryVal);
                        prefs[k] = Number.isNaN(parsed) ? queryVal : parsed;
                    }
                    break;
                case 'bigint':
                    prefs[k] = Number.parseInt(queryVal, 10);
                    break;
                case 'string':
                    prefs[k] = queryVal;
                    break;
                case 'object':
                    prefs[k] = JSON.parse(queryVal);
                    break;
                default:
                    console.warn(`[ttyd] maybe unknown option: ${k}=${queryVal}, treating as string`);
                    prefs[k] = queryVal;
                    break;
            }
        }

        return prefs;
    }

    @bind
    private onSocketData(event: MessageEvent) {
        const { textDecoder } = this;
        const rawData = event.data as ArrayBuffer;
        const cmd = String.fromCharCode(new Uint8Array(rawData)[0]);
        const data = rawData.slice(1);

        switch (cmd) {
            case Command.OUTPUT:
                this.writeFunc(data);
                break;
            case Command.SET_WINDOW_TITLE:
                this.title = textDecoder.decode(data);
                document.title = this.title;
                break;
            case Command.SET_PREFERENCES:
                this.applyPreferences({
                    ...this.options.clientOptions,
                    ...JSON.parse(textDecoder.decode(data)),
                    ...this.parseOptsFromUrlQuery(window.location.search),
                } as Preferences);
                break;
            default:
                console.warn(`[ttyd] unknown command: ${cmd}`);
                break;
        }
    }

    @bind
    private applyPreferences(prefs: Preferences) {
        const { terminal, fitAddon, register } = this;
        let needsFit = false;
        if (prefs.enableZmodem || prefs.enableTrzsz) {
            this.zmodemAddon = new ZmodemAddon({
                zmodem: prefs.enableZmodem,
                trzsz: prefs.enableTrzsz,
                windows: prefs.isWindows,
                trzszDragInitTimeout: prefs.trzszDragInitTimeout,
                onSend: this.sendCb,
                sender: this.sendData,
                writer: this.writeData,
            });
            this.writeFunc = data => this.zmodemAddon?.consume(data);
            terminal.loadAddon(register(this.zmodemAddon));
        }

        for (const [key, value] of Object.entries(prefs)) {
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
                        console.log('[ttyd] Resize overlay disabled');
                        this.resizeOverlay = false;
                    }
                    break;
                case 'disableReconnect':
                    if (value) {
                        console.log('[ttyd] Reconnect disabled');
                        this.reconnect = false;
                        this.doReconnect = false;
                    }
                    break;
                case 'enableZmodem':
                    if (value) console.log('[ttyd] Zmodem enabled');
                    break;
                case 'enableTrzsz':
                    if (value) console.log('[ttyd] trzsz enabled');
                    break;
                case 'trzszDragInitTimeout':
                    if (value) console.log(`[ttyd] trzsz drag init timeout: ${value}`);
                    break;
                case 'enableSixel':
                    if (value) {
                        terminal.loadAddon(register(new ImageAddon()));
                        console.log('[ttyd] Sixel enabled');
                    }
                    break;
                case 'closeOnDisconnect':
                    if (value) {
                        console.log('[ttyd] close on disconnect enabled (Reconnect disabled)');
                        this.closeOnDisconnect = true;
                        this.reconnect = false;
                        this.doReconnect = false;
                    }
                    break;
                case 'mobileKeysEnabled':
                    this.options.clientOptions.mobileKeysEnabled = value;
                    break;
                case 'mobileKeysOpacity':
                    this.options.clientOptions.mobileKeysOpacity = value;
                    break;
                case 'mobileKeysScale':
                    this.options.clientOptions.mobileKeysScale = value;
                    break;
                case 'titleFixed':
                    if (!value || value === '') return;
                    console.log(`[ttyd] setting fixed title: ${value}`);
                    this.titleFixed = value;
                    document.title = value;
                    break;
                case 'isWindows':
                    if (value) console.log('[ttyd] is windows');
                    break;
                case 'unicodeVersion':
                    switch (value) {
                        case 6:
                        case '6':
                            console.log('[ttyd] setting Unicode version: 6');
                            break;
                        case 11:
                        case '11':
                        default:
                            console.log('[ttyd] setting Unicode version: 11');
                            terminal.loadAddon(new Unicode11Addon());
                            terminal.unicode.activeVersion = '11';
                            break;
                    }
                    break;
                default:
                    console.log(`[ttyd] option: ${key}=${JSON.stringify(value)}`);
                    if (terminal.options[key] instanceof Object) {
                        terminal.options[key] = Object.assign({}, terminal.options[key], value);
                    } else {
                        terminal.options[key] = value;
                    }
                    if (key.indexOf('font') === 0 || key === 'lineHeight' || key === 'letterSpacing') {
                        needsFit = true;
                    }
                    break;
            }
        }

        this.syncPageBackground();
        this.syncMobileKeys();
        if (needsFit) fitAddon.fit();
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
                console.log('[ttyd] canvas renderer loaded');
            } catch (e) {
                console.log('[ttyd] canvas renderer could not be loaded, falling back to dom renderer', e);
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
                console.log('[ttyd] WebGL renderer loaded');
            } catch (e) {
                console.log('[ttyd] WebGL renderer could not be loaded, falling back to canvas renderer', e);
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
                disposeWebglRenderer();
                disposeCanvasRenderer();
                console.log('[ttyd] dom renderer loaded');
                break;
            default:
                break;
        }
    }
}
