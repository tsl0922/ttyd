export type ModifierFlags = {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
};

export type VirtualKey = 'esc' | 'tab' | 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'pageup' | 'pagedown';

export type KeyRole = 'action' | 'state' | 'clipboard';

type RepeatPolicy = { kind: 'none' } | { kind: 'hold'; interval: 'default' | 'wheel' };

export type KeyBehavior =
    | { kind: 'send-virtual'; key: VirtualKey }
    | { kind: 'send-char'; char: string }
    | { kind: 'wheel-step'; direction: 1 | -1 }
    | { kind: 'toggle-modifier'; modifier: keyof ModifierFlags }
    | { kind: 'clipboard-smart' };

type KeySpec = {
    id: string;
    label: string;
    role: KeyRole;
    behavior: KeyBehavior;
    repeat: RepeatPolicy;
    consumesModifiers: boolean;
    className: string;
};

const KEY_REGISTRY = {
    esc: {
        id: 'esc',
        label: 'Esc',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'esc' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-esc',
    },
    tab: {
        id: 'tab',
        label: 'Tab',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'tab' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-tab',
    },
    up: {
        id: 'up',
        label: '↑',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'up' },
        repeat: { kind: 'hold', interval: 'default' },
        consumesModifiers: true,
        className: 'key-up',
    },
    down: {
        id: 'down',
        label: '↓',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'down' },
        repeat: { kind: 'hold', interval: 'default' },
        consumesModifiers: true,
        className: 'key-down',
    },
    left: {
        id: 'left',
        label: '←',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'left' },
        repeat: { kind: 'hold', interval: 'default' },
        consumesModifiers: true,
        className: 'key-left',
    },
    right: {
        id: 'right',
        label: '→',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'right' },
        repeat: { kind: 'hold', interval: 'default' },
        consumesModifiers: true,
        className: 'key-right',
    },
    home: {
        id: 'home',
        label: 'Home',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'home' },
        repeat: { kind: 'hold', interval: 'default' },
        consumesModifiers: true,
        className: 'key-home',
    },
    end: {
        id: 'end',
        label: 'End',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'end' },
        repeat: { kind: 'hold', interval: 'default' },
        consumesModifiers: true,
        className: 'key-end',
    },
    pageup: {
        id: 'pageup',
        label: 'PgUp',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'pageup' },
        repeat: { kind: 'hold', interval: 'default' },
        consumesModifiers: true,
        className: 'key-pageup',
    },
    pagedown: {
        id: 'pagedown',
        label: 'PgDn',
        role: 'action',
        behavior: { kind: 'send-virtual', key: 'pagedown' },
        repeat: { kind: 'hold', interval: 'default' },
        consumesModifiers: true,
        className: 'key-pagedown',
    },
    wheel_up: {
        id: 'wheel_up',
        label: 'Wh↑',
        role: 'action',
        behavior: { kind: 'wheel-step', direction: -1 },
        repeat: { kind: 'hold', interval: 'wheel' },
        consumesModifiers: false,
        className: 'key-wheel-up',
    },
    wheel_down: {
        id: 'wheel_down',
        label: 'Wh↓',
        role: 'action',
        behavior: { kind: 'wheel-step', direction: 1 },
        repeat: { kind: 'hold', interval: 'wheel' },
        consumesModifiers: false,
        className: 'key-wheel-down',
    },
    '/': {
        id: '/',
        label: '/',
        role: 'action',
        behavior: { kind: 'send-char', char: '/' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-slash',
    },
    '\\': {
        id: '\\',
        label: '\\',
        role: 'action',
        behavior: { kind: 'send-char', char: '\\' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-backslash',
    },
    '-': {
        id: '-',
        label: '-',
        role: 'action',
        behavior: { kind: 'send-char', char: '-' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-minus',
    },
    _: {
        id: '_',
        label: '_',
        role: 'action',
        behavior: { kind: 'send-char', char: '_' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-underscore',
    },
    '.': {
        id: '.',
        label: '.',
        role: 'action',
        behavior: { kind: 'send-char', char: '.' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-dot',
    },
    ':': {
        id: ':',
        label: ':',
        role: 'action',
        behavior: { kind: 'send-char', char: ':' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-colon',
    },
    '@': {
        id: '@',
        label: '@',
        role: 'action',
        behavior: { kind: 'send-char', char: '@' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-at',
    },
    '#': {
        id: '#',
        label: '#',
        role: 'action',
        behavior: { kind: 'send-char', char: '#' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-hash',
    },
    '|': {
        id: '|',
        label: '|',
        role: 'action',
        behavior: { kind: 'send-char', char: '|' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-pipe',
    },
    '~': {
        id: '~',
        label: '~',
        role: 'action',
        behavior: { kind: 'send-char', char: '~' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-tilde',
    },
    '[': {
        id: '[',
        label: '[',
        role: 'action',
        behavior: { kind: 'send-char', char: '[' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-left-bracket',
    },
    ']': {
        id: ']',
        label: ']',
        role: 'action',
        behavior: { kind: 'send-char', char: ']' },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: 'key-char-right-bracket',
    },
    shift: {
        id: 'shift',
        label: 'Shift',
        role: 'state',
        behavior: { kind: 'toggle-modifier', modifier: 'shift' },
        repeat: { kind: 'none' },
        consumesModifiers: false,
        className: 'modifier-shift',
    },
    alt: {
        id: 'alt',
        label: 'Alt',
        role: 'state',
        behavior: { kind: 'toggle-modifier', modifier: 'alt' },
        repeat: { kind: 'none' },
        consumesModifiers: false,
        className: 'modifier-alt',
    },
    ctrl: {
        id: 'ctrl',
        label: 'Ctrl',
        role: 'state',
        behavior: { kind: 'toggle-modifier', modifier: 'ctrl' },
        repeat: { kind: 'none' },
        consumesModifiers: false,
        className: 'modifier-ctrl',
    },
    clipboard: {
        id: 'clipboard',
        label: 'Paste',
        role: 'clipboard',
        behavior: { kind: 'clipboard-smart' },
        repeat: { kind: 'none' },
        consumesModifiers: false,
        className: 'copy-btn',
    },
} as const satisfies Record<string, KeySpec>;

type KeyId = keyof typeof KEY_REGISTRY;

export const DYNAMIC_KEY_IDS = [
    'up',
    'down',
    'left',
    'right',
    'home',
    'end',
    'pageup',
    'pagedown',
    'wheel_up',
    'wheel_down',
    '/',
    '\\',
    '-',
    '_',
    '.',
    ':',
    '@',
    '#',
    '|',
    '~',
    '[',
    ']',
] as const;

export type DynamicKeyId = (typeof DYNAMIC_KEY_IDS)[number];
export type DynamicLayout = [DynamicKeyId, DynamicKeyId, DynamicKeyId, DynamicKeyId, DynamicKeyId, DynamicKeyId];

type ModifierKey = keyof ModifierFlags;

interface MobileKeyboardControllerOptions {
    mountElement: HTMLElement;
    opacity: number;
    scale: number;
    dynamicLayouts: DynamicLayout[];
    onDispatchAction: (action: KeyBehavior, modifiers: ModifierFlags) => void;
    holdDelayMs: number;
    holdIntervalMs: number;
    holdWheelIntervalMs: number;
}

const MODIFIER_KEYS: ModifierKey[] = ['ctrl', 'alt', 'shift'];

const PANEL_INITIAL_MARGIN = 15;
const PANEL_MIN_MARGIN = 10;
const DOUBLE_TAP_INTERVAL_MS = 320;
const TAP_MOVE_THRESHOLD_PX = 8;

export const DEFAULT_DYNAMIC_LAYOUTS: DynamicLayout[] = [
    ['home', 'up', 'end', 'left', 'down', 'right'],
    ['pageup', 'up', 'pagedown', 'left', 'down', 'right'],
    ['wheel_up', 'up', 'wheel_down', 'left', 'down', 'right'],
];

const DYNAMIC_KEY_ID_SET = new Set<DynamicKeyId>(DYNAMIC_KEY_IDS);

export function isDynamicKeyId(value: unknown): value is DynamicKeyId {
    return typeof value === 'string' && DYNAMIC_KEY_ID_SET.has(value as DynamicKeyId);
}

function emptyModifiers(): ModifierFlags {
    return { ctrl: false, alt: false, shift: false };
}

export class MobileKeyboardController {
    private root: HTMLDivElement;
    private panel: HTMLDivElement;
    private dragBar?: HTMLDivElement;
    private dynamicButtons = new Map<number, HTMLButtonElement>();
    private modifiers: ModifierFlags = { ctrl: false, alt: false, shift: false };
    private modifierButtons = new Map<ModifierKey, HTMLButtonElement>();
    private clipboardButton?: HTMLButtonElement;
    private clipboardButtonMode: 'copy' | 'paste' = 'paste';
    private usesPointerPanelGuard = 'PointerEvent' in window;
    private dynamicLayouts: DynamicLayout[];
    private currentLayoutIndex = 0;
    private dragging = false;
    private dragPointerId = -1;
    private dragStartX = 0;
    private dragStartY = 0;
    private panelStartX = 0;
    private panelStartY = 0;
    private panelX = 0;
    private panelY = 0;
    private dragBoundsWidth = 0;
    private dragBoundsHeight = 0;
    private dragPanelWidth = 0;
    private dragPanelHeight = 0;
    private initializedPosition = false;
    private ensureInBoundsRaf = -1;
    private boundsResizeObserver?: ResizeObserver;
    private holdDelayTimer = -1;
    private holdIntervalTimer = -1;
    private holdTriggered = false;
    private lastDragTapTime = 0;

    constructor(private options: MobileKeyboardControllerOptions) {
        this.dynamicLayouts = this.cloneLayouts(options.dynamicLayouts);
        this.currentLayoutIndex = 0;

        this.root = document.createElement('div');
        this.root.className = 'mobile-keyboard-overlay';

        this.panel = document.createElement('div');
        this.panel.className = 'mobile-keyboard-panel';
        this.root.appendChild(this.panel);

        this.render();
        this.applyAppearance();
        this.options.mountElement.appendChild(this.root);
        this.initPosition();
        if ('ResizeObserver' in window) {
            this.boundsResizeObserver = new ResizeObserver(() => this.requestEnsureInBounds());
            this.boundsResizeObserver.observe(this.options.mountElement);
        }
        window.addEventListener('resize', this.onBoundsChange);
        window.visualViewport?.addEventListener('resize', this.onBoundsChange);
        window.visualViewport?.addEventListener('scroll', this.onBoundsChange);
    }

    dispose() {
        this.stopHoldTimers();
        this.panel.removeEventListener('pointermove', this.onDragMove);
        this.panel.removeEventListener('pointerup', this.onDragEnd);
        this.panel.removeEventListener('pointercancel', this.onDragEnd);
        this.panel.removeEventListener('contextmenu', this.onPanelContextMenu);
        if (this.dragBar) {
            this.dragBar.removeEventListener('pointerdown', this.onDragStart);
        }
        if (this.usesPointerPanelGuard) {
            this.panel.removeEventListener('pointerdown', this.onPanelPointerDown);
        } else {
            this.panel.removeEventListener('touchstart', this.onPanelTouchStart as EventListener);
            this.panel.removeEventListener('mousedown', this.onPanelMouseDown as EventListener);
        }
        window.removeEventListener('resize', this.onBoundsChange);
        window.visualViewport?.removeEventListener('resize', this.onBoundsChange);
        window.visualViewport?.removeEventListener('scroll', this.onBoundsChange);
        if (this.ensureInBoundsRaf >= 0) {
            window.cancelAnimationFrame(this.ensureInBoundsRaf);
            this.ensureInBoundsRaf = -1;
        }
        this.boundsResizeObserver?.disconnect();
        this.boundsResizeObserver = undefined;
        this.root.remove();
    }

    updateAppearance(opacity: number, scale: number) {
        this.options.opacity = opacity;
        this.options.scale = scale;
        this.applyAppearance();
        window.requestAnimationFrame(() => this.ensureInBounds());
    }

    updateHoldBehavior(delayMs: number, intervalMs: number, wheelIntervalMs: number) {
        this.options.holdDelayMs = delayMs;
        this.options.holdIntervalMs = intervalMs;
        this.options.holdWheelIntervalMs = wheelIntervalMs;
        this.stopHoldTimers();
    }

    updateLayouts(dynamicLayouts: DynamicLayout[]) {
        this.dynamicLayouts = this.cloneLayouts(dynamicLayouts);
        this.currentLayoutIndex = 0;
        this.syncDynamicButtons();
        this.stopHoldTimers();
    }

    setClipboardButtonMode(mode: 'copy' | 'paste') {
        this.clipboardButtonMode = mode;
        if (!this.clipboardButton) return;
        const label = mode === 'copy' ? 'Copy' : 'Paste';
        this.clipboardButton.textContent = label;
        this.clipboardButton.setAttribute('aria-label', label);
    }

    consumeModifiers(): ModifierFlags {
        const consumed = { ...this.modifiers };
        if (consumed.ctrl || consumed.alt || consumed.shift) {
            this.modifiers = emptyModifiers();
            this.syncModifierButtons();
        }
        return consumed;
    }

    clearModifiers() {
        if (!this.hasModifierOn()) return;
        this.modifiers = emptyModifiers();
        this.syncModifierButtons();
    }

    consumeModifierForTapSelection(modifier: 'alt' | 'shift'): boolean {
        if (!this.modifiers[modifier]) return false;
        this.modifiers[modifier] = false;
        this.syncModifierButtons();
        return true;
    }

    private hasModifierOn(): boolean {
        return this.modifiers.ctrl || this.modifiers.alt || this.modifiers.shift;
    }

    private cloneLayouts(dynamicLayouts: DynamicLayout[]): DynamicLayout[] {
        return dynamicLayouts.map(layout => [...layout] as DynamicLayout);
    }

    private getCurrentLayout(): DynamicLayout {
        if (this.dynamicLayouts.length === 0) {
            return DEFAULT_DYNAMIC_LAYOUTS[0];
        }
        return this.dynamicLayouts[this.currentLayoutIndex % this.dynamicLayouts.length];
    }

    private getDynamicKeyBySlot(slot: number): DynamicKeyId {
        const layout = this.getCurrentLayout();
        return layout[slot] ?? layout[0];
    }

    private getKeySpecById(keyId: KeyId): KeySpec {
        return KEY_REGISTRY[keyId];
    }

    private getDynamicKeySpecBySlot(slot: number): KeySpec {
        const keyId = this.getDynamicKeyBySlot(slot);
        return this.getKeySpecById(keyId);
    }

    private cycleLayout() {
        const total = this.dynamicLayouts.length;
        if (total <= 1) return;
        this.currentLayoutIndex = (this.currentLayoutIndex + 1) % total;
        this.syncDynamicButtons();
        this.stopHoldTimers();
    }

    private syncDynamicButtons() {
        this.dynamicButtons.forEach((button, slot) => {
            const keySpec = this.getDynamicKeySpecBySlot(slot);
            button.textContent = keySpec.label;
            button.setAttribute('aria-label', keySpec.label);
        });
        if (this.dragBar) {
            const current = this.currentLayoutIndex + 1;
            const total = Math.max(1, this.dynamicLayouts.length);
            this.dragBar.textContent = `Drag · L${current}/${total}`;
            this.dragBar.setAttribute('aria-label', `Drag bar, layout ${current} of ${total}`);
        }
    }

    private getHoldDelayMs() {
        return Math.max(100, this.options.holdDelayMs);
    }

    private getHoldIntervalMs(spec: KeySpec) {
        if (spec.repeat.kind !== 'hold') return 0;
        if (spec.repeat.interval === 'wheel') {
            return Math.max(30, this.options.holdWheelIntervalMs);
        }
        return Math.max(30, this.options.holdIntervalMs);
    }

    private resolveModifiers(spec: KeySpec): ModifierFlags {
        return spec.consumesModifiers ? this.consumeModifiers() : emptyModifiers();
    }

    private dispatchWithModifiers(spec: KeySpec, modifiers: ModifierFlags) {
        const behavior = spec.behavior;
        if (behavior.kind === 'toggle-modifier') {
            this.modifiers[behavior.modifier] = !this.modifiers[behavior.modifier];
            this.syncModifierButtons();
            return;
        }
        this.options.onDispatchAction(behavior, modifiers);
    }

    private dispatchSinglePress(spec: KeySpec) {
        const modifiers = this.resolveModifiers(spec);
        this.dispatchWithModifiers(spec, modifiers);
    }

    private bindPressEvents(button: HTMLButtonElement, resolveSpec: () => KeySpec) {
        let pressArmed = false;
        let holdSpec = resolveSpec();
        let holdModifiers = emptyModifiers();

        const startPress = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();

            holdSpec = resolveSpec();
            const repeat = holdSpec.repeat;
            if (repeat.kind === 'none') {
                this.dispatchSinglePress(holdSpec);
                return;
            }

            pressArmed = true;
            holdModifiers = emptyModifiers();
            this.stopHoldTimers();
            this.holdTriggered = false;

            const delayMs = this.getHoldDelayMs();
            const intervalMs = this.getHoldIntervalMs(holdSpec);
            this.holdDelayTimer = window.setTimeout(() => {
                this.holdTriggered = true;
                holdModifiers = this.resolveModifiers(holdSpec);
                this.dispatchWithModifiers(holdSpec, holdModifiers);
                this.holdIntervalTimer = window.setInterval(() => {
                    this.dispatchWithModifiers(holdSpec, holdModifiers);
                }, intervalMs);
            }, delayMs);
        };

        const stopPress = (event?: Event) => {
            event?.preventDefault();
            event?.stopPropagation();
            if (!pressArmed) return;
            pressArmed = false;
            const triggered = this.holdTriggered;
            this.stopHoldTimers();
            if (!triggered) {
                this.dispatchSinglePress(holdSpec);
            }
        };

        if ('PointerEvent' in window) {
            button.addEventListener('pointerdown', startPress);
            button.addEventListener('pointerup', stopPress as EventListener);
            button.addEventListener('pointercancel', stopPress as EventListener);
            button.addEventListener('pointerleave', stopPress as EventListener);
        } else {
            button.addEventListener('touchstart', startPress as EventListener, { passive: false });
            button.addEventListener('touchend', stopPress as EventListener);
            button.addEventListener('touchcancel', stopPress as EventListener);
            button.addEventListener('mousedown', startPress as EventListener);
            button.addEventListener('mouseup', stopPress as EventListener);
            button.addEventListener('mouseleave', stopPress as EventListener);
        }
        button.addEventListener('click', event => event.preventDefault());
    }

    private render() {
        this.dragBar = document.createElement('div');
        this.dragBar.className = 'mobile-keyboard-dragbar';
        this.dragBar.addEventListener('pointerdown', this.onDragStart);
        this.panel.appendChild(this.dragBar);

        const row1 = document.createElement('div');
        row1.className = 'mobile-keyboard-row';
        row1.appendChild(this.createDynamicButton(0));
        row1.appendChild(this.createDynamicButton(1));
        row1.appendChild(this.createDynamicButton(2));

        const row2 = document.createElement('div');
        row2.className = 'mobile-keyboard-row';
        row2.appendChild(this.createDynamicButton(3));
        row2.appendChild(this.createDynamicButton(4));
        row2.appendChild(this.createDynamicButton(5));

        const row3 = document.createElement('div');
        row3.className = 'mobile-keyboard-row';
        row3.appendChild(this.createStaticButton('esc'));
        row3.appendChild(this.createStaticButton('shift'));
        row3.appendChild(this.createStaticButton('alt'));

        const row4 = document.createElement('div');
        row4.className = 'mobile-keyboard-row';
        row4.appendChild(this.createStaticButton('tab'));
        row4.appendChild(this.createStaticButton('ctrl'));
        row4.appendChild(this.createStaticButton('clipboard'));

        this.panel.appendChild(row1);
        this.panel.appendChild(row2);
        this.panel.appendChild(row3);
        this.panel.appendChild(row4);
        this.panel.addEventListener('contextmenu', this.onPanelContextMenu);
        if (this.usesPointerPanelGuard) {
            this.panel.addEventListener('pointerdown', this.onPanelPointerDown);
        } else {
            this.panel.addEventListener('touchstart', this.onPanelTouchStart as EventListener, { passive: false });
            this.panel.addEventListener('mousedown', this.onPanelMouseDown as EventListener);
        }
        this.setClipboardButtonMode(this.clipboardButtonMode);
        this.syncDynamicButtons();
    }

    private createStaticButton(keyId: KeyId): HTMLButtonElement {
        const keySpec = this.getKeySpecById(keyId);
        const button = this.createBaseButton(keySpec.label, keySpec.className);
        if (keySpec.behavior.kind === 'clipboard-smart') {
            this.bindClipboardClickEvents(button);
        } else {
            this.bindPressEvents(button, () => this.getKeySpecById(keyId));
        }

        if (keySpec.behavior.kind === 'toggle-modifier') {
            this.modifierButtons.set(keySpec.behavior.modifier, button);
        }
        if (keySpec.behavior.kind === 'clipboard-smart') {
            this.clipboardButton = button;
        }

        return button;
    }

    private bindClipboardClickEvents(button: HTMLButtonElement) {
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.options.onDispatchAction({ kind: 'clipboard-smart' }, emptyModifiers());
        });
    }

    private createDynamicButton(slot: number): HTMLButtonElement {
        const keySpec = this.getDynamicKeySpecBySlot(slot);
        const button = this.createBaseButton(keySpec.label, `key-dynamic-${slot}`);
        this.bindPressEvents(button, () => this.getDynamicKeySpecBySlot(slot));
        this.dynamicButtons.set(slot, button);
        return button;
    }

    private isInteractivePanelTarget(target: EventTarget | null) {
        if (!(target instanceof Element)) return false;
        return !!target.closest('.mobile-keyboard-btn, .mobile-keyboard-dragbar');
    }

    private swallowPanelGapEvent(event: Event) {
        if (this.isInteractivePanelTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
    }

    private onPanelPointerDown = (event: PointerEvent) => {
        this.swallowPanelGapEvent(event);
    };

    private onPanelTouchStart = (event: TouchEvent) => {
        this.swallowPanelGapEvent(event);
    };

    private onPanelMouseDown = (event: MouseEvent) => {
        this.swallowPanelGapEvent(event);
    };

    private onPanelContextMenu = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    private createBaseButton(label: string, className: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `mobile-keyboard-btn ${className}`;
        button.textContent = label;
        button.setAttribute('aria-label', label);
        button.tabIndex = -1;
        return button;
    }

    private stopHoldTimers() {
        if (this.holdDelayTimer >= 0) {
            window.clearTimeout(this.holdDelayTimer);
            this.holdDelayTimer = -1;
        }
        if (this.holdIntervalTimer >= 0) {
            window.clearInterval(this.holdIntervalTimer);
            this.holdIntervalTimer = -1;
        }
        this.holdTriggered = false;
    }

    private syncModifierButtons() {
        MODIFIER_KEYS.forEach(key => {
            const button = this.modifierButtons.get(key);
            if (!button) return;
            button.classList.toggle('is-active', this.modifiers[key]);
        });
        this.panel.classList.toggle('has-active-modifier', this.hasModifierOn());
    }

    private applyAppearance() {
        const opacity = Number.isFinite(this.options.opacity) ? this.options.opacity : 0.72;
        const scale = Number.isFinite(this.options.scale) ? this.options.scale : 1;
        const clampedOpacity = Math.max(0.4, Math.min(0.95, opacity));
        const clampedScale = Math.max(0.85, Math.min(1.2, scale));
        this.panel.style.setProperty('--mobile-keyboard-opacity', String(clampedOpacity));
        this.panel.style.setProperty('--mobile-keyboard-scale', String(clampedScale));
    }

    private initPosition() {
        if (this.initializedPosition) return;
        this.initializedPosition = true;

        const panelRect = this.panel.getBoundingClientRect();
        const boundsRect = this.options.mountElement.getBoundingClientRect();
        this.panelX = Math.max(PANEL_MIN_MARGIN, Math.round(boundsRect.width - panelRect.width - PANEL_INITIAL_MARGIN));
        this.panelY = PANEL_INITIAL_MARGIN;
        this.applyPanelPosition();
        this.ensureInBounds();
    }

    private clampPosition(
        x: number,
        y: number,
        boundsWidth = this.options.mountElement.getBoundingClientRect().width,
        boundsHeight = this.options.mountElement.getBoundingClientRect().height,
        panelWidth = this.panel.getBoundingClientRect().width,
        panelHeight = this.panel.getBoundingClientRect().height
    ): { x: number; y: number } {
        const minX = PANEL_MIN_MARGIN;
        const minY = PANEL_MIN_MARGIN;
        const maxX = Math.max(minX, Math.round(boundsWidth - panelWidth - PANEL_MIN_MARGIN));
        const maxY = Math.max(minY, Math.round(boundsHeight - panelHeight - PANEL_MIN_MARGIN));
        return {
            x: Math.min(Math.max(minX, x), maxX),
            y: Math.min(Math.max(minY, y), maxY),
        };
    }

    private applyPanelPosition() {
        this.panel.style.transform = `translate3d(${Math.round(this.panelX)}px, ${Math.round(
            this.panelY
        )}px, 0) scale(var(--mobile-keyboard-scale))`;
    }

    private onDragStart = (event: PointerEvent) => {
        if (this.dragging) return;
        event.preventDefault();
        this.dragging = true;
        this.dragPointerId = event.pointerId;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.panelStartX = this.panelX;
        this.panelStartY = this.panelY;
        // Snapshot dimensions once so onDragMove avoids repeated getBoundingClientRect calls
        const boundsRect = this.options.mountElement.getBoundingClientRect();
        const panelRect = this.panel.getBoundingClientRect();
        this.dragBoundsWidth = boundsRect.width;
        this.dragBoundsHeight = boundsRect.height;
        this.dragPanelWidth = panelRect.width;
        this.dragPanelHeight = panelRect.height;
        this.panel.classList.add('is-dragging');
        this.panel.setPointerCapture(this.dragPointerId);

        this.panel.addEventListener('pointermove', this.onDragMove);
        this.panel.addEventListener('pointerup', this.onDragEnd);
        this.panel.addEventListener('pointercancel', this.onDragEnd);
    };

    private onDragMove = (event: PointerEvent) => {
        if (!this.dragging || event.pointerId !== this.dragPointerId) return;
        const nextX = this.panelStartX + (event.clientX - this.dragStartX);
        const nextY = this.panelStartY + (event.clientY - this.dragStartY);
        const clamped = this.clampPosition(
            nextX,
            nextY,
            this.dragBoundsWidth,
            this.dragBoundsHeight,
            this.dragPanelWidth,
            this.dragPanelHeight
        );
        this.panelX = clamped.x;
        this.panelY = clamped.y;
        this.applyPanelPosition();
    };

    private onDragEnd = (event: PointerEvent) => {
        if (!this.dragging || event.pointerId !== this.dragPointerId) return;
        const movedDistance = Math.max(
            Math.abs(event.clientX - this.dragStartX),
            Math.abs(event.clientY - this.dragStartY)
        );
        const now = Date.now();

        this.dragging = false;
        this.panel.classList.remove('is-dragging');
        this.panel.releasePointerCapture(this.dragPointerId);
        this.panel.removeEventListener('pointermove', this.onDragMove);
        this.panel.removeEventListener('pointerup', this.onDragEnd);
        this.panel.removeEventListener('pointercancel', this.onDragEnd);
        this.dragPointerId = -1;

        const clamped = this.clampPosition(this.panelX, this.panelY);
        this.panelX = clamped.x;
        this.panelY = clamped.y;
        this.applyPanelPosition();

        if (movedDistance > TAP_MOVE_THRESHOLD_PX) {
            this.lastDragTapTime = 0;
            return;
        }
        if (now - this.lastDragTapTime <= DOUBLE_TAP_INTERVAL_MS) {
            this.lastDragTapTime = 0;
            this.cycleLayout();
            return;
        }
        this.lastDragTapTime = now;
    };

    private onBoundsChange = () => {
        if (!this.initializedPosition) return;
        this.requestEnsureInBounds();
    };

    private requestEnsureInBounds() {
        if (this.ensureInBoundsRaf >= 0) return;
        this.ensureInBoundsRaf = window.requestAnimationFrame(() => {
            this.ensureInBoundsRaf = -1;
            this.ensureInBounds();
        });
    }

    private ensureInBounds() {
        const clamped = this.clampPosition(this.panelX, this.panelY);
        this.panelX = clamped.x;
        this.panelY = clamped.y;
        this.applyPanelPosition();
    }
}
