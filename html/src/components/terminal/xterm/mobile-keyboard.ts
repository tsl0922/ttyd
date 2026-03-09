export type ModifierFlags = {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
};

export type VirtualKey = 'esc' | 'tab' | 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'pageup' | 'pagedown';

export type KeyRole = 'action' | 'state' | 'clipboard';

type RepeatPolicy = { kind: 'none' } | { kind: 'hold'; interval: 'default' | 'wheel' };

export type ComboStep =
    | { kind: 'virtual'; key: VirtualKey; modifiers: ModifierFlags }
    | { kind: 'char'; char: string; modifiers: ModifierFlags };

export type KeyBehavior =
    | { kind: 'send-virtual'; key: VirtualKey }
    | { kind: 'send-char'; char: string }
    | { kind: 'send-combo'; combo: ComboStep[] }
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

function createActionVirtualKeySpec(
    id: string,
    label: string,
    key: VirtualKey,
    repeat: RepeatPolicy,
    className: string
): KeySpec {
    return {
        id,
        label,
        role: 'action',
        behavior: { kind: 'send-virtual', key },
        repeat,
        consumesModifiers: true,
        className,
    };
}

function createActionCharKeySpec(id: string, label: string, char: string, className: string): KeySpec {
    return {
        id,
        label,
        role: 'action',
        behavior: { kind: 'send-char', char },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className,
    };
}

function createWheelStepKeySpec(id: string, label: string, direction: 1 | -1, className: string): KeySpec {
    return {
        id,
        label,
        role: 'action',
        behavior: { kind: 'wheel-step', direction },
        repeat: { kind: 'hold', interval: 'wheel' },
        consumesModifiers: false,
        className,
    };
}

function createModifierToggleKeySpec(id: keyof ModifierFlags, label: string, className: string): KeySpec {
    return {
        id,
        label,
        role: 'state',
        behavior: { kind: 'toggle-modifier', modifier: id },
        repeat: { kind: 'none' },
        consumesModifiers: false,
        className,
    };
}

function createClipboardKeySpec(): KeySpec {
    return {
        id: 'clipboard',
        label: 'Paste',
        role: 'clipboard',
        behavior: { kind: 'clipboard-smart' },
        repeat: { kind: 'none' },
        consumesModifiers: false,
        className: 'copy-btn',
    };
}

const KEY_REGISTRY = {
    esc: createActionVirtualKeySpec('esc', 'Esc', 'esc', { kind: 'none' }, 'key-esc'),
    tab: createActionVirtualKeySpec('tab', 'Tab', 'tab', { kind: 'none' }, 'key-tab'),
    enter: createActionCharKeySpec('enter', 'Enter', '\r', 'key-enter'),
    space: createActionCharKeySpec('space', 'Space', ' ', 'key-space'),
    up: createActionVirtualKeySpec('up', '↑', 'up', { kind: 'hold', interval: 'default' }, 'key-up'),
    down: createActionVirtualKeySpec('down', '↓', 'down', { kind: 'hold', interval: 'default' }, 'key-down'),
    left: createActionVirtualKeySpec('left', '←', 'left', { kind: 'hold', interval: 'default' }, 'key-left'),
    right: createActionVirtualKeySpec('right', '→', 'right', { kind: 'hold', interval: 'default' }, 'key-right'),
    home: createActionVirtualKeySpec('home', 'Home', 'home', { kind: 'hold', interval: 'default' }, 'key-home'),
    end: createActionVirtualKeySpec('end', 'End', 'end', { kind: 'hold', interval: 'default' }, 'key-end'),
    pageup: createActionVirtualKeySpec('pageup', 'PgUp', 'pageup', { kind: 'hold', interval: 'default' }, 'key-pageup'),
    pagedown: createActionVirtualKeySpec(
        'pagedown',
        'PgDn',
        'pagedown',
        { kind: 'hold', interval: 'default' },
        'key-pagedown'
    ),
    wheel_up: createWheelStepKeySpec('wheel_up', 'Wh↑', -1, 'key-wheel-up'),
    wheel_down: createWheelStepKeySpec('wheel_down', 'Wh↓', 1, 'key-wheel-down'),
    shift: createModifierToggleKeySpec('shift', 'Shift', 'modifier-shift'),
    alt: createModifierToggleKeySpec('alt', 'Alt', 'modifier-alt'),
    ctrl: createModifierToggleKeySpec('ctrl', 'Ctrl', 'modifier-ctrl'),
    clipboard: createClipboardKeySpec(),
} as const satisfies Record<string, KeySpec>;

type KeyId = keyof typeof KEY_REGISTRY;

const ACTION_CHAR_DYNAMIC_KEY_IDS = ['enter', 'space'] as const;

const NAVIGATION_DYNAMIC_KEY_IDS = [
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
] as const;

const COMMON_SYMBOL_DYNAMIC_KEY_IDS = [
    '!',
    '"',
    '#',
    '$',
    '%',
    '&',
    "'",
    '(',
    ')',
    '*',
    '+',
    ',',
    '-',
    '.',
    '/',
    ':',
    ';',
    '<',
    '=',
    '>',
    '?',
    '@',
    '[',
    '\\',
    ']',
    '^',
    '_',
    '{',
    '|',
    '}',
    '~',
    '`',
] as const;

const ALPHABET_DYNAMIC_KEY_IDS = [
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'g',
    'h',
    'i',
    'j',
    'k',
    'l',
    'm',
    'n',
    'o',
    'p',
    'q',
    'r',
    's',
    't',
    'u',
    'v',
    'w',
    'x',
    'y',
    'z',
] as const;

export const DYNAMIC_KEY_IDS = [
    ...ACTION_CHAR_DYNAMIC_KEY_IDS,
    ...NAVIGATION_DYNAMIC_KEY_IDS,
    ...COMMON_SYMBOL_DYNAMIC_KEY_IDS,
    ...ALPHABET_DYNAMIC_KEY_IDS,
] as const;

const BUILTIN_DYNAMIC_CHAR_KEY_SET = new Set<string>([...COMMON_SYMBOL_DYNAMIC_KEY_IDS, ...ALPHABET_DYNAMIC_KEY_IDS]);

export const STATIC_KEY_IDS = ['esc', 'tab', 'shift', 'alt', 'ctrl', 'clipboard'] as const;

const RESERVED_KEY_ID_SET = new Set<string>([...DYNAMIC_KEY_IDS, ...STATIC_KEY_IDS]);
const FORBIDDEN_CUSTOM_KEY_IDS = new Set<string>(['__proto__', 'prototype', 'constructor']);
const CUSTOM_KEY_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

export function isReservedMobileKeyId(id: string): boolean {
    return RESERVED_KEY_ID_SET.has(id);
}

export function isValidMobileKeyboardCustomKeyId(id: string): boolean {
    return CUSTOM_KEY_ID_PATTERN.test(id) && !FORBIDDEN_CUSTOM_KEY_IDS.has(id);
}

export type DynamicLayout = [string, string, string, string, string, string];
export interface MobileKeyboardCustomKeySpec {
    id: string;
    label: string;
    combo: string[];
}
export type MobileKeyboardCustomKey = {
    id: string;
    label: string;
    combo: ComboStep[];
};

type ModifierKey = keyof ModifierFlags;

interface MobileKeyboardControllerOptions {
    mountElement: HTMLElement;
    opacity: number;
    scale: number;
    dynamicLayouts: DynamicLayout[];
    customKeys: MobileKeyboardCustomKey[];
    onDispatchAction: (action: KeyBehavior, modifiers: ModifierFlags) => void;
    holdDelayMs: number;
    holdIntervalMs: number;
    holdWheelIntervalMs: number;
}

type PressState = {
    pressArmed: boolean;
    holdSpec: KeySpec;
    holdModifiers: ModifierFlags;
};

const MODIFIER_KEYS: ModifierKey[] = ['ctrl', 'alt', 'shift'];

const PANEL_INITIAL_MARGIN = 24;
const PANEL_MIN_MARGIN = 18;
const DOUBLE_TAP_INTERVAL_MS = 320;
const TAP_MOVE_THRESHOLD_PX = 8;

export const DEFAULT_DYNAMIC_LAYOUTS: DynamicLayout[] = [
    ['home', 'up', 'end', 'left', 'down', 'right'],
    ['pageup', 'up', 'pagedown', 'left', 'down', 'right'],
    ['=', '+', '\\', '|', '~', '#'],
];

export function cloneDefaultMobileKeyboardLayouts(): DynamicLayout[] {
    return DEFAULT_DYNAMIC_LAYOUTS.map(layout => [...layout] as DynamicLayout);
}

function sanitizeClassName(id: string) {
    return id.replace(/[^a-zA-Z0-9_-]/g, char => `u${char.codePointAt(0)!.toString(16).padStart(4, '0')}`);
}

function getBuiltinDynamicCharClassName(keyId: string): string {
    return `key-char-${sanitizeClassName(keyId)}`;
}

export function createBuiltinDynamicCharKeySpec(keyId: string): KeySpec | null {
    if (keyId.length !== 1 || !BUILTIN_DYNAMIC_CHAR_KEY_SET.has(keyId)) return null;
    return {
        id: keyId,
        label: keyId,
        role: 'action',
        behavior: { kind: 'send-char', char: keyId },
        repeat: { kind: 'none' },
        consumesModifiers: true,
        className: getBuiltinDynamicCharClassName(keyId),
    };
}

function emptyModifiers(): ModifierFlags {
    return { ctrl: false, alt: false, shift: false };
}

export function parseMobileKeyComboStep(rawStep: string): ComboStep | null {
    const step = rawStep.trim();
    if (step === '') return null;

    const rawParts = step.split('+').map(part => part.trim());
    if (rawParts.length === 0) return null;

    // Trailing "++" means the actual key is "+" (e.g. "Ctrl++").
    const plusKeyAtEnd =
        rawParts.length === 2
            ? rawParts[0] === '' && rawParts[1] === ''
            : rawParts.length >= 3 && rawParts[rawParts.length - 1] === '' && rawParts[rawParts.length - 2] === '';

    const modifierTokens = plusKeyAtEnd ? rawParts.slice(0, -2) : rawParts.slice(0, -1);
    const keyRaw = plusKeyAtEnd ? '+' : rawParts[rawParts.length - 1];
    if (keyRaw === '' || modifierTokens.some(token => token === '')) return null;

    const modifiers: ModifierFlags = { ctrl: false, alt: false, shift: false };
    if (modifierTokens.length > 0) {
        for (const modifierToken of modifierTokens) {
            switch (modifierToken.toLowerCase()) {
                case 'ctrl':
                case 'control':
                    modifiers.ctrl = true;
                    break;
                case 'alt':
                case 'option':
                    modifiers.alt = true;
                    break;
                case 'shift':
                    modifiers.shift = true;
                    break;
                default:
                    return null;
            }
        }
    }

    const keyToken = keyRaw.toLowerCase();
    switch (keyToken) {
        case 'esc':
        case 'escape':
            return { kind: 'virtual', key: 'esc', modifiers };
        case 'tab':
            return { kind: 'virtual', key: 'tab', modifiers };
        case 'up':
        case 'arrowup':
            return { kind: 'virtual', key: 'up', modifiers };
        case 'down':
        case 'arrowdown':
            return { kind: 'virtual', key: 'down', modifiers };
        case 'left':
        case 'arrowleft':
            return { kind: 'virtual', key: 'left', modifiers };
        case 'right':
        case 'arrowright':
            return { kind: 'virtual', key: 'right', modifiers };
        case 'home':
            return { kind: 'virtual', key: 'home', modifiers };
        case 'end':
            return { kind: 'virtual', key: 'end', modifiers };
        case 'pageup':
        case 'pgup':
            return { kind: 'virtual', key: 'pageup', modifiers };
        case 'pagedown':
        case 'pgdn':
            return { kind: 'virtual', key: 'pagedown', modifiers };
        case 'enter':
        case 'return':
            return { kind: 'char', char: '\r', modifiers };
        case 'space':
            return { kind: 'char', char: ' ', modifiers };
        default:
            break;
    }

    if ([...keyRaw].length === 1) {
        return { kind: 'char', char: keyRaw, modifiers };
    }
    return null;
}

export function parseMobileKeyComboSteps(steps: unknown): ComboStep[] | null {
    if (!Array.isArray(steps) || steps.length === 0) return null;
    const combo: ComboStep[] = [];
    for (const rawStep of steps) {
        if (typeof rawStep !== 'string') return null;
        const parsed = parseMobileKeyComboStep(rawStep);
        if (!parsed) return null;
        combo.push(parsed);
    }
    return combo.length > 0 ? combo : null;
}

export function normalizeMobileKeyboardCustomKeys(value: unknown): {
    valid: boolean;
    keys: MobileKeyboardCustomKey[];
} {
    if (value === undefined) {
        return { valid: true, keys: [] };
    }
    if (!Array.isArray(value)) {
        return { valid: false, keys: [] };
    }

    const usedCustomIds = new Set<string>();
    const keys: MobileKeyboardCustomKey[] = [];
    for (const keySpec of value) {
        if (typeof keySpec !== 'object' || keySpec === null) return { valid: false, keys: [] };
        const id = typeof keySpec.id === 'string' ? keySpec.id.trim() : '';
        const label = typeof keySpec.label === 'string' ? keySpec.label.trim() : '';
        if (id === '' || label === '') return { valid: false, keys: [] };
        if (!isValidMobileKeyboardCustomKeyId(id)) return { valid: false, keys: [] };
        if (isReservedMobileKeyId(id) || usedCustomIds.has(id)) return { valid: false, keys: [] };
        const combo = parseMobileKeyComboSteps(keySpec.combo);
        if (!combo) return { valid: false, keys: [] };
        usedCustomIds.add(id);
        keys.push({ id, label, combo });
    }
    return { valid: true, keys };
}

export function normalizeMobileKeyboardLayouts(
    value: unknown,
    allowedLayoutKeyIds: Set<string>
): {
    valid: boolean;
    layouts: DynamicLayout[];
} {
    if (!Array.isArray(value) || value.length === 0) {
        return { valid: true, layouts: cloneDefaultMobileKeyboardLayouts() };
    }
    const layouts: DynamicLayout[] = [];
    for (const layout of value) {
        if (!Array.isArray(layout) || layout.length !== 6) return { valid: false, layouts: [] };
        const normalized = layout.map(item => (typeof item === 'string' ? item.trim() : ''));
        if (normalized.some(item => item === '' || !allowedLayoutKeyIds.has(item))) {
            return { valid: false, layouts: [] };
        }
        layouts.push(normalized as DynamicLayout);
    }
    if (layouts.length === 0) {
        return { valid: false, layouts: [] };
    }
    return { valid: true, layouts };
}

export function resolveMobileKeyboardConfig(
    layoutValue: unknown,
    customKeyValue: unknown
): {
    layouts: DynamicLayout[];
    customKeys: MobileKeyboardCustomKey[];
} {
    const normalizedCustomKeys = normalizeMobileKeyboardCustomKeys(customKeyValue);
    if (!normalizedCustomKeys.valid) {
        console.warn('[ttyd] invalid mobileKeyboardCustomKeys, fallback to default mobile keyboard');
        return { layouts: cloneDefaultMobileKeyboardLayouts(), customKeys: [] };
    }

    const allowedLayoutKeyIds = new Set<string>([...DYNAMIC_KEY_IDS, ...normalizedCustomKeys.keys.map(key => key.id)]);
    const normalizedLayouts = normalizeMobileKeyboardLayouts(layoutValue, allowedLayoutKeyIds);
    if (!normalizedLayouts.valid) {
        console.warn('[ttyd] invalid mobileKeyboardLayouts, fallback to default mobile keyboard');
        return { layouts: cloneDefaultMobileKeyboardLayouts(), customKeys: [] };
    }

    return {
        layouts: normalizedLayouts.layouts,
        customKeys: normalizedCustomKeys.keys,
    };
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
    private keyRegistry: Record<string, KeySpec>;
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
    private pendingSingleTapTimer = -1;

    // Lifecycle
    constructor(private options: MobileKeyboardControllerOptions) {
        this.keyRegistry = this.buildRuntimeKeyRegistry(options.customKeys);
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
        this.clearPendingSingleTap();
        this.panel.removeEventListener('pointermove', this.onDragMove);
        this.panel.removeEventListener('pointerup', this.onDragEnd);
        this.panel.removeEventListener('pointercancel', this.onDragEnd);
        this.panel.removeEventListener('contextmenu', this.onPanelContextMenu);
        if (this.dragBar) {
            this.dragBar.removeEventListener('pointerdown', this.onDragStart);
        }
        if (this.usesPointerPanelGuard) {
            this.panel.removeEventListener('pointerdown', this.onPanelPressStart);
        } else {
            this.panel.removeEventListener('touchstart', this.onPanelPressStart as EventListener);
            this.panel.removeEventListener('mousedown', this.onPanelPressStart as EventListener);
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

    updateDynamicConfig(dynamicLayouts: DynamicLayout[], customKeys: MobileKeyboardCustomKey[]) {
        this.keyRegistry = this.buildRuntimeKeyRegistry(customKeys);
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

    // Public state operations
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

    // Key registry and layout resolution
    private hasModifierOn(): boolean {
        return this.modifiers.ctrl || this.modifiers.alt || this.modifiers.shift;
    }

    private cloneLayouts(dynamicLayouts: DynamicLayout[]): DynamicLayout[] {
        return dynamicLayouts.map(layout => [...layout] as DynamicLayout);
    }

    private buildRuntimeKeyRegistry(customKeys: MobileKeyboardCustomKey[]): Record<string, KeySpec> {
        const registry = Object.assign(Object.create(null), KEY_REGISTRY) as Record<string, KeySpec>;
        customKeys.forEach(customKey => {
            const classSuffix = sanitizeClassName(customKey.id);
            registry[customKey.id] = {
                id: customKey.id,
                label: customKey.label,
                role: 'action',
                behavior: { kind: 'send-combo', combo: customKey.combo },
                repeat: { kind: 'none' },
                consumesModifiers: false,
                className: `key-custom-${classSuffix}`,
            };
        });
        return registry;
    }

    private getCurrentLayout(): DynamicLayout {
        if (this.dynamicLayouts.length === 0) {
            return [...DEFAULT_DYNAMIC_LAYOUTS[0]];
        }
        return this.dynamicLayouts[this.currentLayoutIndex % this.dynamicLayouts.length];
    }

    private getDynamicKeyBySlot(slot: number): string {
        const layout = this.getCurrentLayout();
        return layout[slot] ?? layout[0];
    }

    private getKeySpecById(keyId: string): KeySpec {
        if (this.keyRegistry[keyId]) return this.keyRegistry[keyId];
        const builtinCharSpec = createBuiltinDynamicCharKeySpec(keyId);
        if (builtinCharSpec) return builtinCharSpec;
        return KEY_REGISTRY.up;
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
            this.dragBar.setAttribute(
                'aria-label',
                `Drag bar, layout ${current} of ${total}. Tap to cycle layout, double-tap to send Enter`
            );
        }
    }

    // Key dispatch and press/hold handling
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

    private bindPressEvents(button: HTMLButtonElement, resolveSpec: () => KeySpec) {
        const pressState: PressState = {
            pressArmed: false,
            holdSpec: resolveSpec(),
            holdModifiers: emptyModifiers(),
        };

        const startPress = (event: Event) => this.startButtonPress(event, resolveSpec, pressState);
        const stopPress = (event?: Event) => this.stopButtonPress(event, pressState);

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

    private startButtonPress(event: Event, resolveSpec: () => KeySpec, state: PressState) {
        event.preventDefault();
        event.stopPropagation();

        state.holdSpec = resolveSpec();
        if (state.holdSpec.repeat.kind === 'none') {
            this.dispatchSinglePress(state.holdSpec);
            return;
        }

        state.pressArmed = true;
        state.holdModifiers = emptyModifiers();
        this.stopHoldTimers();

        const delayMs = this.getHoldDelayMs();
        const intervalMs = this.getHoldIntervalMs(state.holdSpec);
        this.holdDelayTimer = window.setTimeout(() => {
            this.holdTriggered = true;
            state.holdModifiers = this.resolveModifiers(state.holdSpec);
            this.dispatchWithModifiers(state.holdSpec, state.holdModifiers);
            this.holdIntervalTimer = window.setInterval(() => {
                this.dispatchWithModifiers(state.holdSpec, state.holdModifiers);
            }, intervalMs);
        }, delayMs);
    }

    private stopButtonPress(event: Event | undefined, state: PressState) {
        event?.preventDefault();
        event?.stopPropagation();
        if (!state.pressArmed) return;
        state.pressArmed = false;
        const triggered = this.holdTriggered;
        this.stopHoldTimers();
        if (!triggered) {
            this.dispatchSinglePress(state.holdSpec);
        }
    }

    // DOM rendering and button wiring
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
            this.panel.addEventListener('pointerdown', this.onPanelPressStart);
        } else {
            this.panel.addEventListener('touchstart', this.onPanelPressStart as EventListener, { passive: false });
            this.panel.addEventListener('mousedown', this.onPanelPressStart as EventListener);
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

    private onPanelPressStart = (event: Event) => {
        this.swallowPanelGapEvent(event);
    };

    private onPanelContextMenu = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    // General UI helpers
    private createBaseButton(label: string, className: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `mobile-keyboard-btn ${className}`;
        button.textContent = label;
        button.setAttribute('aria-label', label);
        button.tabIndex = -1;
        return button;
    }

    private clearPendingSingleTap() {
        if (this.pendingSingleTapTimer >= 0) {
            window.clearTimeout(this.pendingSingleTapTimer);
            this.pendingSingleTapTimer = -1;
        }
    }

    private scheduleSingleTapLayoutCycle() {
        this.clearPendingSingleTap();
        this.pendingSingleTapTimer = window.setTimeout(() => {
            this.pendingSingleTapTimer = -1;
            this.lastDragTapTime = 0;
            this.cycleLayout();
        }, DOUBLE_TAP_INTERVAL_MS);
    }

    private dispatchHeaderEnter() {
        this.options.onDispatchAction({ kind: 'send-char', char: '\r' }, emptyModifiers());
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
        this.clearPendingSingleTap();
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

        this.finishDrag();

        const clamped = this.clampPosition(this.panelX, this.panelY);
        this.panelX = clamped.x;
        this.panelY = clamped.y;
        this.applyPanelPosition();

        if (movedDistance > TAP_MOVE_THRESHOLD_PX) {
            this.clearPendingSingleTap();
            this.lastDragTapTime = 0;
            return;
        }
        if (now - this.lastDragTapTime <= DOUBLE_TAP_INTERVAL_MS) {
            this.clearPendingSingleTap();
            this.lastDragTapTime = 0;
            this.dispatchHeaderEnter();
            return;
        }
        this.lastDragTapTime = now;
        this.scheduleSingleTapLayoutCycle();
    };

    private finishDrag() {
        this.dragging = false;
        this.panel.classList.remove('is-dragging');
        this.releaseDragPointerCapture(this.dragPointerId);
        this.panel.removeEventListener('pointermove', this.onDragMove);
        this.panel.removeEventListener('pointerup', this.onDragEnd);
        this.panel.removeEventListener('pointercancel', this.onDragEnd);
        this.dragPointerId = -1;
    }

    private releaseDragPointerCapture(pointerId: number) {
        if (pointerId < 0) return;
        try {
            if (!this.panel.hasPointerCapture(pointerId)) return;
            this.panel.releasePointerCapture(pointerId);
        } catch {
            // Ignore pointer capture race conditions on some browsers.
        }
    }

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
