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
import {
    ComboStep,
    DynamicLayout,
    KeyBehavior,
    MobileKeyboardLayoutSpec,
    MobileKeyboardCustomKeySpec,
    MobileKeyboardController,
    ModifierFlags,
    VirtualKey,
    resolveMobileKeyboardConfig,
} from './mobile-keyboard';

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
    mobileTapSelectionEnabled?: boolean;
    mobileKeyboardEnabled?: boolean;
    mobileKeyboardOpacity?: number;
    mobileKeyboardScale?: number;
    mobileKeyboardLayouts?: Array<DynamicLayout | MobileKeyboardLayoutSpec>;
    mobileKeyboardCustomKeys?: MobileKeyboardCustomKeySpec[];
    mobileKeyboardHoldDelayMs?: number;
    mobileKeyboardHoldIntervalMs?: number;
    mobileKeyboardHoldWheelIntervalMs?: number;
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
    private mobileKeyboard?: MobileKeyboardController;

    private socket?: WebSocket;
    private token: string;
    private opened = false;
    private title?: string;
    private titleFixed?: string;
    private resizeOverlay = true;
    private reconnect = true;
    private doReconnect = true;
    private closeOnDisconnect = false;
    private reconnectKeyDisposable?: IDisposable;
    private parent?: HTMLElement;
    private touchTapCount = 0;
    private lastTouchTapTime = 0;
    private lastTouchTapX = 0;
    private lastTouchTapY = 0;

    private writeFunc = (data: ArrayBuffer) => this.writeData(new Uint8Array(data));

    constructor(
        private options: XtermOptions,
        private sendCb: () => void
    ) {}

    dispose() {
        this.reconnectKeyDisposable?.dispose();
        this.reconnectKeyDisposable = undefined;
        this.mobileKeyboard?.dispose();
        this.mobileKeyboard = undefined;
        this.touchTapCount = 0;
        this.lastTouchTapTime = 0;
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
        this.syncMobileKeyboard();
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
    private shouldEnableMobileKeyboard() {
        const enabled = this.options.clientOptions.mobileKeyboardEnabled;
        return enabled !== false && this.isTouchDevice();
    }

    @bind
    private shouldEnableMobileTapSelection() {
        const enabled = this.options.clientOptions.mobileTapSelectionEnabled;
        return enabled !== false && this.isTouchDevice();
    }

    @bind
    private syncMobileKeyboard() {
        if (!this.shouldEnableMobileKeyboard()) {
            this.mobileKeyboard?.dispose();
            this.mobileKeyboard = undefined;
            return;
        }

        const opacity = this.options.clientOptions.mobileKeyboardOpacity ?? 0.72;
        const scale = this.options.clientOptions.mobileKeyboardScale ?? 1;
        const mobileKeyboardConfig = resolveMobileKeyboardConfig(
            this.options.clientOptions.mobileKeyboardLayouts,
            this.options.clientOptions.mobileKeyboardCustomKeys
        );
        const holdDelayMs = Math.max(100, this.options.clientOptions.mobileKeyboardHoldDelayMs ?? 300);
        const holdIntervalMs = Math.max(30, this.options.clientOptions.mobileKeyboardHoldIntervalMs ?? 120);
        const holdWheelIntervalMs = Math.max(30, this.options.clientOptions.mobileKeyboardHoldWheelIntervalMs ?? 120);
        const mountElement = this.parent;
        if (!mountElement) return;
        if (!this.mobileKeyboard) {
            this.mobileKeyboard = new MobileKeyboardController({
                mountElement,
                opacity,
                scale,
                dynamicLayouts: mobileKeyboardConfig.layouts,
                customKeys: mobileKeyboardConfig.customKeys,
                onDispatchAction: this.onMobileKeyboardAction,
                holdDelayMs,
                holdIntervalMs,
                holdWheelIntervalMs,
            });
            this.syncClipboardButtonMode();
            return;
        }
        this.mobileKeyboard.updateAppearance(opacity, scale);
        this.mobileKeyboard.updateDynamicConfig(mobileKeyboardConfig.layouts, mobileKeyboardConfig.customKeys);
        this.mobileKeyboard.updateHoldBehavior(holdDelayMs, holdIntervalMs, holdWheelIntervalMs);
        this.syncClipboardButtonMode();
    }

    @bind
    private keepTerminalFocus() {
        this.terminal?.focus();
        window.setTimeout(() => this.terminal?.focus(), 0);
    }

    @bind
    private registerTouchSelection() {
        if (!this.isTouchDevice()) return;
        const element = this.terminal?.element;
        if (!element) return;
        this.register(addEventListener(element, 'touchend', this.onTouchSelectionEnd as EventListener));
    }

    @bind
    private onTouchSelectionEnd(event: TouchEvent) {
        if (!this.shouldEnableMobileTapSelection()) return;
        const touch = event.changedTouches.item(0);
        if (!touch) return;

        const now = Date.now();
        const withinTapWindow = now - this.lastTouchTapTime <= 300;
        const closeEnough =
            Math.abs(touch.clientX - this.lastTouchTapX) <= 24 && Math.abs(touch.clientY - this.lastTouchTapY) <= 24;

        if (withinTapWindow && closeEnough) {
            this.touchTapCount += 1;
        } else {
            this.touchTapCount = 1;
        }

        this.lastTouchTapTime = now;
        this.lastTouchTapX = touch.clientX;
        this.lastTouchTapY = touch.clientY;

        if (this.touchTapCount === 2) {
            event.preventDefault();
            event.stopPropagation();
            this.dispatchTouchMultiClick(2, touch.clientX, touch.clientY);
        } else if (this.touchTapCount === 3) {
            event.preventDefault();
            event.stopPropagation();
            const shouldSelectVisible = this.mobileKeyboard?.consumeModifierForTapSelection('shift') ?? false;
            const shouldSelectAll = this.mobileKeyboard?.consumeModifierForTapSelection('alt') ?? false;
            if (shouldSelectVisible) {
                this.selectVisibleViewportLines();
            } else if (shouldSelectAll) {
                this.terminal?.selectAll();
            } else {
                this.dispatchTouchMultiClick(3, touch.clientX, touch.clientY);
            }
            this.touchTapCount = 0;
        } else if (this.touchTapCount > 3) {
            this.touchTapCount = 1;
        }
    }

    @bind
    private selectVisibleViewportLines() {
        const terminal = this.terminal;
        if (!terminal) return;
        const start = Math.max(0, terminal.buffer.active.viewportY);
        const end = Math.min(terminal.buffer.active.length - 1, start + Math.max(1, terminal.rows) - 1);
        if (end < start) return;
        terminal.selectLines(start, end);
    }

    @bind
    private dispatchTouchMultiClick(detail: number, clientX: number, clientY: number) {
        const element = this.terminal?.element;
        if (!element) return;
        const ownerDocument = element.ownerDocument ?? document;
        const eventInit = {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            detail,
            clientX,
            clientY,
            screenX: clientX,
            screenY: clientY,
            view: ownerDocument.defaultView ?? window,
        };
        element.dispatchEvent(new MouseEvent('mousedown', eventInit));
        element.dispatchEvent(new MouseEvent('mouseup', eventInit));
    }

    @bind
    private syncClipboardButtonMode() {
        const selection = this.terminal?.getSelection() ?? '';
        this.mobileKeyboard?.setClipboardButtonMode(selection === '' ? 'paste' : 'copy');
    }

    @bind
    private onSelectionChange() {
        this.syncClipboardButtonMode();
        if (this.shouldEnableMobileTapSelection()) return;
        const selection = this.terminal?.getSelection() ?? '';
        if (selection === '') return;
        void this.copySelection(selection);
    }

    @bind
    private async handleClipboardAction() {
        const selection = this.terminal?.getSelection() ?? '';
        if (selection !== '') {
            await this.copySelection(selection);
            return;
        }
        await this.pasteFromClipboard();
    }

    @bind
    private async copySelection(selection: string) {
        if (selection === '') {
            this.overlayAddon?.showOverlay('Nothing selected', 500);
            return;
        }
        if (!this.shouldEnableMobileTapSelection()) {
            let copied = false;
            try {
                copied = typeof document.execCommand === 'function' && document.execCommand('copy');
            } catch (e) {
                console.warn('[ttyd] execCommand copy failed', e);
            }
            if (copied) {
                this.overlayAddon?.showOverlay('\u2702', 300);
                return;
            }
            this.overlayAddon?.showOverlay('Copy failed', 700);
            return;
        }
        if (typeof navigator.clipboard?.writeText !== 'function') {
            this.overlayAddon?.showOverlay('Copy unsupported', 700);
            return;
        }
        try {
            await navigator.clipboard.writeText(selection);
            this.overlayAddon?.showOverlay('\u2702', 300);
            return;
        } catch (e) {
            console.warn('[ttyd] clipboard api copy failed', e);
        }
        this.overlayAddon?.showOverlay('Copy failed', 700);
    }

    @bind
    private async pasteFromClipboard() {
        if (!navigator.clipboard?.readText) {
            this.overlayAddon?.showOverlay('Paste unsupported', 700);
            return;
        }
        try {
            const text = await navigator.clipboard.readText();
            if (text === '') {
                this.overlayAddon?.showOverlay('Clipboard empty', 700);
                return;
            }
            this.mobileKeyboard?.clearModifiers();
            this.terminal?.paste(text);
            this.overlayAddon?.showOverlay('Paste', 300);
        } catch (e) {
            console.warn('[ttyd] paste failed', e);
            this.overlayAddon?.showOverlay('Paste failed', 700);
        }
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
        register(terminal.onSelectionChange(this.onSelectionChange));
        register(
            terminal.onResize(({ cols, rows }) => {
                const msg = JSON.stringify({ columns: cols, rows: rows });
                this.socket?.send(this.textEncoder.encode(Command.RESIZE_TERMINAL + msg));
                if (this.resizeOverlay) overlayAddon.showOverlay(`${cols}x${rows}`, 300);
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
        this.registerTouchSelection();
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
        const modifiers = this.mobileKeyboard?.consumeModifiers();
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
    private inApplicationCursorKeysMode() {
        return this.terminal?.modes.applicationCursorKeysMode ?? false;
    }

    @bind
    private onMobileKeyboardAction(action: KeyBehavior, modifiers: ModifierFlags) {
        switch (action.kind) {
            case 'send-virtual':
                this.sendVirtualKey(action.key, modifiers);
                return;
            case 'send-char':
                this.sendDynamicChar(action.char, modifiers);
                return;
            case 'send-combo':
                this.mobileKeyboard?.clearModifiers();
                this.sendDynamicCombo(action.combo);
                return;
            case 'wheel-step':
                this.sendVirtualWheelStep(action.direction);
                return;
            case 'clipboard-smart':
                void this.handleClipboardAction();
                this.keepTerminalFocus();
                return;
            case 'toggle-modifier':
                console.warn('[ttyd] unexpected toggle-modifier action in xterm handler');
                return;
            default:
                return;
        }
    }

    @bind
    private sendVirtualKey(key: VirtualKey, modifiers: ModifierFlags) {
        const appCursorKeysMode = this.inApplicationCursorKeysMode();
        if (!this.hasModifiers(modifiers)) {
            switch (key) {
                case 'esc':
                    this.sendData('\x1b');
                    return;
                case 'tab':
                    this.sendData('\t');
                    return;
                case 'up':
                    this.sendData(appCursorKeysMode ? '\x1bOA' : '\x1b[A');
                    return;
                case 'down':
                    this.sendData(appCursorKeysMode ? '\x1bOB' : '\x1b[B');
                    return;
                case 'right':
                    this.sendData(appCursorKeysMode ? '\x1bOC' : '\x1b[C');
                    return;
                case 'left':
                    this.sendData(appCursorKeysMode ? '\x1bOD' : '\x1b[D');
                    return;
                case 'home':
                    this.sendData(appCursorKeysMode ? '\x1bOH' : '\x1b[H');
                    return;
                case 'end':
                    this.sendData(appCursorKeysMode ? '\x1bOF' : '\x1b[F');
                    return;
                case 'pageup':
                    this.sendData('\x1b[5~');
                    return;
                case 'pagedown':
                    this.sendData('\x1b[6~');
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
            case 'pageup':
                this.sendData(`\x1b[5;${csiModifier}~`);
                return;
            case 'pagedown':
                this.sendData(`\x1b[6;${csiModifier}~`);
                return;
            default:
                return;
        }
    }

    @bind
    private sendDynamicChar(char: string, modifiers: ModifierFlags) {
        if (!char || char.length === 0) return;
        if (!this.hasModifiers(modifiers)) {
            this.sendData(char);
            return;
        }
        this.sendData(this.encodeCharWithModifiers(char, modifiers));
    }

    @bind
    private sendDynamicCombo(combo: ComboStep[]) {
        if (!Array.isArray(combo) || combo.length === 0) return;
        combo.forEach(step => {
            switch (step.kind) {
                case 'virtual':
                    this.sendVirtualKey(step.key, step.modifiers);
                    return;
                case 'char':
                    this.sendDynamicChar(step.char, step.modifiers);
                    return;
                default:
                    return;
            }
        });
    }

    @bind
    private sendVirtualWheelStep(direction: 1 | -1) {
        const element = this.terminal?.element;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        this.dispatchVirtualWheelStep(clientX, clientY, direction);
    }

    @bind
    private dispatchVirtualWheelStep(clientX: number, clientY: number, direction: 1 | -1) {
        const element = this.terminal?.element;
        if (!element) return;
        const wheelEvent = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaMode: 0,
            deltaX: 0,
            deltaY: direction * 100,
            clientX,
            clientY,
        });
        element.dispatchEvent(wheelEvent);
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
        this.reconnectKeyDisposable?.dispose();
        this.reconnectKeyDisposable = undefined;
        this.syncMobileKeyboard();
        this.initListeners();
        terminal.focus();
    }

    @bind
    private onSocketClose(event: CloseEvent) {
        console.log(`[ttyd] websocket connection closed with code: ${event.code}`);

        const { refreshToken, connect, doReconnect, overlayAddon } = this;
        overlayAddon.showOverlay('Connection Closed');
        this.reconnectKeyDisposable?.dispose();
        this.reconnectKeyDisposable = undefined;
        this.dispose();

        // 1000: CLOSE_NORMAL
        if (event.code !== 1000 && doReconnect) {
            overlayAddon.showOverlay('Reconnecting...');
            refreshToken().then(connect);
        } else if (this.closeOnDisconnect) {
            window.close();
        } else {
            const { terminal } = this;
            this.reconnectKeyDisposable = terminal.onKey(e => {
                const event = e.domEvent;
                if (event.key === 'Enter') {
                    this.reconnectKeyDisposable?.dispose();
                    this.reconnectKeyDisposable = undefined;
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
                case 'mobileTapSelectionEnabled':
                    this.options.clientOptions.mobileTapSelectionEnabled = value;
                    break;
                case 'mobileKeyboardEnabled':
                    this.options.clientOptions.mobileKeyboardEnabled = value;
                    break;
                case 'mobileKeyboardOpacity':
                    this.options.clientOptions.mobileKeyboardOpacity = value;
                    break;
                case 'mobileKeyboardScale':
                    this.options.clientOptions.mobileKeyboardScale = value;
                    break;
                case 'mobileKeyboardLayouts':
                    this.options.clientOptions.mobileKeyboardLayouts = value;
                    break;
                case 'mobileKeyboardCustomKeys':
                    this.options.clientOptions.mobileKeyboardCustomKeys = value;
                    break;
                case 'mobileKeyboardHoldDelayMs':
                    this.options.clientOptions.mobileKeyboardHoldDelayMs = value;
                    break;
                case 'mobileKeyboardHoldIntervalMs':
                    this.options.clientOptions.mobileKeyboardHoldIntervalMs = value;
                    break;
                case 'mobileKeyboardHoldWheelIntervalMs':
                    this.options.clientOptions.mobileKeyboardHoldWheelIntervalMs = value;
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
        this.syncMobileKeyboard();
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
