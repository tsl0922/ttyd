export type ModifierFlags = {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
};

export type VirtualKey = 'esc' | 'tab' | 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'pageup' | 'pagedown';

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
    | { kind: 'clipboard-smart' }
    | { kind: 'batch-input-toggle' };

type KeySpec = {
    id: string;
    label: string;
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
        behavior: { kind: 'clipboard-smart' },
        repeat: { kind: 'none' },
        consumesModifiers: false,
        className: 'copy-btn',
    };
}

function createBatchInputKeySpec(): KeySpec {
    return {
        id: 'batch_input',
        label: 'Input',
        behavior: { kind: 'batch-input-toggle' },
        repeat: { kind: 'none' },
        consumesModifiers: false,
        className: 'key-batch-input',
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
    batch_input: createBatchInputKeySpec(),
} as const satisfies Record<string, KeySpec>;

type KeyId = keyof typeof KEY_REGISTRY;

const ACTION_CHAR_DYNAMIC_KEY_IDS = ['enter', 'space', 'batch_input'] as const;

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
const FORBIDDEN_CUSTOM_KEY_IDS = new Set<string>(['__proto__', 'prototype', 'constructor', 'toString', 'valueOf']);
const CUSTOM_KEY_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

export function isReservedMobileKeyId(id: string): boolean {
    return RESERVED_KEY_ID_SET.has(id);
}

export function isValidMobileKeyboardCustomKeyId(id: string): boolean {
    return CUSTOM_KEY_ID_PATTERN.test(id) && !FORBIDDEN_CUSTOM_KEY_IDS.has(id);
}

export type DynamicLayout = [string, string, string, string, string, string];
export type MobileKeyboardLayoutItemSpec = string | { key: string; page?: number };
export type MobileKeyboardLayoutSpec = [
    MobileKeyboardLayoutItemSpec,
    MobileKeyboardLayoutItemSpec,
    MobileKeyboardLayoutItemSpec,
    MobileKeyboardLayoutItemSpec,
    MobileKeyboardLayoutItemSpec,
    MobileKeyboardLayoutItemSpec,
];
export interface MobileKeyboardCustomKeySpec {
    id: string;
    label: string;
    combo: string[];
}
export interface MobileKeyboardTheme {
    panelBackground: string;
    dragbarColor: string;
    dragbarBorderColor: string;
    buttonColor: string;
    buttonBackground: string;
    buttonPressedBackground: string;
    buttonActiveBackground: string;
    batchPanelBackground: string;
    batchPanelBorderColor: string;
    batchHeaderColor: string;
    batchCloseButtonColor: string;
    batchCloseButtonBackground: string;
    batchTextareaColor: string;
    batchTextareaBackground: string;
    batchTextareaFocusOutline: string;
}
export type MobileKeyboardThemeSpec = Partial<Record<keyof MobileKeyboardTheme, string>>;
export type MobileKeyboardCustomKey = {
    id: string;
    label: string;
    combo: ComboStep[];
};
type ResolvedDynamicLayoutItem = {
    keyId: string;
    switchToLayoutIndex: number | null;
};
type ResolvedDynamicLayout = [
    ResolvedDynamicLayoutItem,
    ResolvedDynamicLayoutItem,
    ResolvedDynamicLayoutItem,
    ResolvedDynamicLayoutItem,
    ResolvedDynamicLayoutItem,
    ResolvedDynamicLayoutItem,
];

type ModifierKey = keyof ModifierFlags;

interface MobileKeyboardControllerOptions {
    mountElement: HTMLElement;
    opacity: number;
    scale: number;
    theme: MobileKeyboardTheme;
    dynamicLayouts: ResolvedDynamicLayout[];
    customKeys: MobileKeyboardCustomKey[];
    onDispatchAction: (action: KeyBehavior, modifiers: ModifierFlags) => void;
    onBatchInputSubmit: (text: string) => void;
    onBatchInputClose: () => void;
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

const PANEL_INITIAL_MARGIN = 36;
const PANEL_MIN_MARGIN = 18;
const TAP_MOVE_THRESHOLD_PX = 10;
const BATCH_INPUT_GAP_PX = 10;
const BATCH_INPUT_MIN_WIDTH_PX = 180;
const BATCH_INPUT_MAX_WIDTH_PX = 320;
const BATCH_INPUT_MIN_HEIGHT_PX = 120;
const BATCH_INPUT_VIEWPORT_MARGIN_PX = 8;
const MOBILE_KEYBOARD_THEME_KEYS: Array<keyof MobileKeyboardTheme> = [
    'panelBackground',
    'dragbarColor',
    'dragbarBorderColor',
    'buttonColor',
    'buttonBackground',
    'buttonPressedBackground',
    'buttonActiveBackground',
    'batchPanelBackground',
    'batchPanelBorderColor',
    'batchHeaderColor',
    'batchCloseButtonColor',
    'batchCloseButtonBackground',
    'batchTextareaColor',
    'batchTextareaBackground',
    'batchTextareaFocusOutline',
];
const MOBILE_KEYBOARD_THEME_CSS_VARIABLES: Record<keyof MobileKeyboardTheme, string> = {
    panelBackground: '--mobile-kb-panel-bg',
    dragbarColor: '--mobile-kb-dragbar-color',
    dragbarBorderColor: '--mobile-kb-dragbar-border',
    buttonColor: '--mobile-kb-btn-color',
    buttonBackground: '--mobile-kb-btn-bg',
    buttonPressedBackground: '--mobile-kb-btn-pressed-bg',
    buttonActiveBackground: '--mobile-kb-btn-active-bg',
    batchPanelBackground: '--mobile-kb-batch-panel-bg',
    batchPanelBorderColor: '--mobile-kb-batch-panel-border',
    batchHeaderColor: '--mobile-kb-batch-header-color',
    batchCloseButtonColor: '--mobile-kb-batch-close-color',
    batchCloseButtonBackground: '--mobile-kb-batch-close-bg',
    batchTextareaColor: '--mobile-kb-batch-textarea-color',
    batchTextareaBackground: '--mobile-kb-batch-textarea-bg',
    batchTextareaFocusOutline: '--mobile-kb-batch-textarea-focus-outline',
};

export const DEFAULT_DYNAMIC_LAYOUTS: DynamicLayout[] = [
    ['home', 'up', 'end', 'left', 'down', 'right'],
    ['enter', 'up', 'batch_input', 'left', 'down', 'right'],
];
export const DEFAULT_MOBILE_KEYBOARD_THEME: MobileKeyboardTheme = {
    panelBackground: 'rgba(20, 20, 20, 0.65)',
    dragbarColor: 'rgba(255, 255, 255, 0.8)',
    dragbarBorderColor: 'rgba(255, 255, 255, 0.2)',
    buttonColor: '#f1f1f1',
    buttonBackground: 'rgba(57, 57, 57, 0.86)',
    buttonPressedBackground: 'rgba(99, 99, 99, 0.96)',
    buttonActiveBackground: 'rgba(22, 132, 219, 0.92)',
    batchPanelBackground: 'rgba(24, 24, 24, 0.9)',
    batchPanelBorderColor: 'rgba(255, 255, 255, 0.25)',
    batchHeaderColor: '#d8d8d8',
    batchCloseButtonColor: '#f5f5f5',
    batchCloseButtonBackground: 'rgba(70, 70, 70, 0.95)',
    batchTextareaColor: '#f0f0f0',
    batchTextareaBackground: 'rgba(9, 9, 9, 0.86)',
    batchTextareaFocusOutline: 'rgba(120, 180, 235, 0.95)',
};

export function cloneDefaultMobileKeyboardLayouts(): DynamicLayout[] {
    return DEFAULT_DYNAMIC_LAYOUTS.map(layout => [...layout] as DynamicLayout);
}

export function cloneDefaultMobileKeyboardTheme(): MobileKeyboardTheme {
    return { ...DEFAULT_MOBILE_KEYBOARD_THEME };
}

function mapDynamicLayoutKeyId(layout: DynamicLayout): ResolvedDynamicLayout {
    return layout.map(keyId => ({ keyId, switchToLayoutIndex: null })) as ResolvedDynamicLayout;
}

function cloneResolvedDynamicLayouts(dynamicLayouts: ResolvedDynamicLayout[]): ResolvedDynamicLayout[] {
    return dynamicLayouts.map(layout => {
        return layout.map(item => ({
            keyId: item.keyId,
            switchToLayoutIndex: item.switchToLayoutIndex,
        })) as ResolvedDynamicLayout;
    });
}

function resolveDynamicLayoutItem(
    item: unknown,
    allowedLayoutKeyIds: Set<string>
): { valid: boolean; keyId: string; switchToPage: number | null } {
    if (typeof item === 'string') {
        const keyId = item.trim();
        if (keyId === '' || !allowedLayoutKeyIds.has(keyId)) return { valid: false, keyId: '', switchToPage: null };
        return { valid: true, keyId, switchToPage: null };
    }
    if (typeof item !== 'object' || item === null) return { valid: false, keyId: '', switchToPage: null };
    const layoutItem = item as { key?: unknown; page?: unknown };
    const keyId = typeof layoutItem.key === 'string' ? layoutItem.key.trim() : '';
    if (keyId === '' || !allowedLayoutKeyIds.has(keyId)) return { valid: false, keyId: '', switchToPage: null };
    const rawPage = layoutItem.page;
    if (typeof rawPage !== 'number' || !Number.isFinite(rawPage)) {
        return { valid: true, keyId, switchToPage: null };
    }
    const roundedPage = Math.trunc(rawPage);
    if (roundedPage !== rawPage || roundedPage < 1) {
        return { valid: true, keyId, switchToPage: null };
    }
    return { valid: true, keyId, switchToPage: roundedPage };
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

export function normalizeMobileKeyboardTheme(value: unknown): {
    valid: boolean;
    theme: MobileKeyboardTheme;
} {
    if (value === undefined) {
        return { valid: true, theme: cloneDefaultMobileKeyboardTheme() };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { valid: false, theme: cloneDefaultMobileKeyboardTheme() };
    }

    const theme = cloneDefaultMobileKeyboardTheme();
    let valid = true;
    const spec = value as Record<string, unknown>;
    MOBILE_KEYBOARD_THEME_KEYS.forEach(key => {
        const rawValue = spec[key];
        if (rawValue === undefined) return;
        if (typeof rawValue !== 'string') {
            valid = false;
            return;
        }
        const trimmedValue = rawValue.trim();
        if (trimmedValue === '') {
            valid = false;
            return;
        }
        theme[key] = trimmedValue;
    });
    return { valid, theme };
}

export function normalizeMobileKeyboardLayouts(
    value: unknown,
    allowedLayoutKeyIds: Set<string>
): {
    valid: boolean;
    layouts: ResolvedDynamicLayout[];
} {
    if (!Array.isArray(value) || value.length === 0) {
        return {
            valid: true,
            layouts: cloneDefaultMobileKeyboardLayouts().map(layout => mapDynamicLayoutKeyId(layout)),
        };
    }
    const layouts: ResolvedDynamicLayout[] = [];
    for (const layout of value) {
        if (!Array.isArray(layout) || layout.length !== 6) return { valid: false, layouts: [] };
        const normalized = layout.map(item => resolveDynamicLayoutItem(item, allowedLayoutKeyIds));
        if (normalized.some(item => !item.valid)) return { valid: false, layouts: [] };
        layouts.push(
            normalized.map(item => ({
                keyId: item.keyId,
                switchToLayoutIndex: item.switchToPage,
            })) as ResolvedDynamicLayout
        );
    }
    if (layouts.length === 0) {
        return { valid: false, layouts: [] };
    }
    const total = layouts.length;
    layouts.forEach(layout => {
        layout.forEach(item => {
            const targetPage = item.switchToLayoutIndex;
            if (targetPage === null) return;
            if (targetPage < 1 || targetPage > total) {
                item.switchToLayoutIndex = null;
                return;
            }
            item.switchToLayoutIndex = targetPage - 1;
        });
    });
    return { valid: true, layouts };
}

export function resolveMobileKeyboardConfig(
    layoutValue: unknown,
    customKeyValue: unknown
): {
    layouts: ResolvedDynamicLayout[];
    customKeys: MobileKeyboardCustomKey[];
} {
    const normalizedCustomKeys = normalizeMobileKeyboardCustomKeys(customKeyValue);
    if (!normalizedCustomKeys.valid) {
        console.warn('[ttyd] invalid mobileKeyboardCustomKeys, fallback to default mobile keyboard');
        return {
            layouts: cloneDefaultMobileKeyboardLayouts().map(layout => mapDynamicLayoutKeyId(layout)),
            customKeys: [],
        };
    }

    const allowedLayoutKeyIds = new Set<string>([...DYNAMIC_KEY_IDS, ...normalizedCustomKeys.keys.map(key => key.id)]);
    const normalizedLayouts = normalizeMobileKeyboardLayouts(layoutValue, allowedLayoutKeyIds);
    if (!normalizedLayouts.valid) {
        console.warn('[ttyd] invalid mobileKeyboardLayouts, fallback to default mobile keyboard');
        return {
            layouts: cloneDefaultMobileKeyboardLayouts().map(layout => mapDynamicLayoutKeyId(layout)),
            customKeys: [],
        };
    }

    return {
        layouts: normalizedLayouts.layouts,
        customKeys: normalizedCustomKeys.keys,
    };
}

class BatchInputPanelController {
    private panel?: HTMLDivElement;
    private closeBtn?: HTMLButtonElement;
    private textarea?: HTMLTextAreaElement;
    private draft = '';
    private open = false;
    private onCloseClick = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        this.close(false);
    };
    private onTextareaInput = () => {
        if (!this.textarea) return;
        this.draft = this.textarea.value;
    };

    constructor(
        private options: {
            mountElement: HTMLElement;
            getKeyboardPanelRect: () => DOMRect;
            onSubmit: (text: string) => void;
            onClose: () => void;
        }
    ) {}

    dispose() {
        if (this.closeBtn) {
            this.closeBtn.removeEventListener('click', this.onCloseClick);
        }
        if (this.textarea) {
            this.textarea.removeEventListener('input', this.onTextareaInput);
        }
        this.panel?.remove();
        this.panel = undefined;
        this.closeBtn = undefined;
        this.textarea = undefined;
        this.draft = '';
        this.open = false;
    }

    toggle() {
        if (this.open) {
            this.close(true);
            return;
        }
        this.openPanel();
    }

    close(shouldSubmit: boolean) {
        if (!this.open) return;
        const textarea = this.textarea;
        const text = textarea?.value ?? this.draft;
        if (shouldSubmit && text !== '') {
            this.options.onSubmit(text);
        }
        textarea?.blur();
        this.open = false;
        this.panel?.classList.remove('is-open');
        this.panel?.setAttribute('aria-hidden', 'true');
        this.draft = '';
        if (textarea) {
            textarea.value = '';
        }
        this.options.onClose();
    }

    repositionIfOpen() {
        if (!this.open) return;
        this.reposition();
    }

    private ensurePanel() {
        if (this.panel) return;

        const panel = document.createElement('div');
        panel.className = 'mobile-batch-input-panel';
        panel.setAttribute('aria-hidden', 'true');

        const header = document.createElement('div');
        header.className = 'mobile-batch-input-header';
        const title = document.createElement('span');
        title.textContent = 'Input Panel';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'mobile-batch-input-close';
        closeBtn.textContent = 'Cancel';
        closeBtn.addEventListener('click', this.onCloseClick);
        header.appendChild(title);
        header.appendChild(closeBtn);

        const textarea = document.createElement('textarea');
        textarea.className = 'mobile-batch-input-textarea';
        textarea.setAttribute('aria-label', 'Input panel');
        textarea.setAttribute('spellcheck', 'false');
        textarea.setAttribute('autocapitalize', 'off');
        textarea.setAttribute('autocorrect', 'off');
        textarea.value = this.draft;
        textarea.addEventListener('input', this.onTextareaInput);

        panel.appendChild(header);
        panel.appendChild(textarea);
        this.options.mountElement.appendChild(panel);

        this.panel = panel;
        this.closeBtn = closeBtn;
        this.textarea = textarea;
    }

    private openPanel() {
        this.ensurePanel();
        const panel = this.panel;
        const textarea = this.textarea;
        if (!panel || !textarea) return;

        textarea.value = this.draft;
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        this.open = true;
        this.reposition();
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    private reposition() {
        const panel = this.panel;
        if (!panel) return;

        const viewport = window.visualViewport;
        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportWidth = viewport?.width ?? window.innerWidth;
        const viewportHeight = viewport?.height ?? window.innerHeight;
        const viewportRight = viewportLeft + viewportWidth;
        const viewportBottom = viewportTop + viewportHeight;
        const viewportMaxHeight = Math.max(
            BATCH_INPUT_MIN_HEIGHT_PX,
            viewportHeight - BATCH_INPUT_VIEWPORT_MARGIN_PX * 2
        );
        const keyboardRect = this.options.getKeyboardPanelRect();

        const targetHeight = keyboardRect.height || Math.round(viewportHeight * 0.34);
        const panelHeight = Math.max(BATCH_INPUT_MIN_HEIGHT_PX, Math.min(targetHeight, viewportMaxHeight));
        panel.style.height = `${Math.round(panelHeight)}px`;

        let left = viewportLeft + BATCH_INPUT_VIEWPORT_MARGIN_PX;
        let top = viewportTop + BATCH_INPUT_VIEWPORT_MARGIN_PX;
        let panelWidth = Math.max(
            BATCH_INPUT_MIN_WIDTH_PX,
            Math.min(BATCH_INPUT_MAX_WIDTH_PX, Math.round(viewportWidth * 0.42))
        );

        const leftSpace = keyboardRect.left - viewportLeft;
        const rightSpace = viewportRight - keyboardRect.right;
        const preferredRight = rightSpace >= leftSpace;
        const primarySpace = preferredRight ? rightSpace : leftSpace;
        const secondarySpace = preferredRight ? leftSpace : rightSpace;
        const requiredMin = BATCH_INPUT_MIN_WIDTH_PX + BATCH_INPUT_GAP_PX;
        const useSecondarySide = primarySpace < requiredMin && secondarySpace > primarySpace;
        const placeRight = useSecondarySide ? !preferredRight : preferredRight;
        const activeSpace = placeRight ? rightSpace : leftSpace;
        const availableWidth = Math.max(0, activeSpace - BATCH_INPUT_GAP_PX);
        const maxWidth = Math.min(BATCH_INPUT_MAX_WIDTH_PX, Math.round(viewportWidth * 0.42));

        if (availableWidth >= BATCH_INPUT_MIN_WIDTH_PX) {
            panelWidth = Math.max(BATCH_INPUT_MIN_WIDTH_PX, Math.min(maxWidth, availableWidth));
            left = placeRight
                ? keyboardRect.right + BATCH_INPUT_GAP_PX
                : keyboardRect.left - BATCH_INPUT_GAP_PX - panelWidth;
            top = keyboardRect.top;
        } else {
            panelWidth = Math.max(
                BATCH_INPUT_MIN_WIDTH_PX,
                Math.min(BATCH_INPUT_MAX_WIDTH_PX, viewportWidth - BATCH_INPUT_VIEWPORT_MARGIN_PX * 2)
            );
            left = keyboardRect.left + (keyboardRect.width - panelWidth) / 2;
            top = keyboardRect.top - BATCH_INPUT_GAP_PX - panelHeight;
        }

        panel.style.width = `${Math.round(panelWidth)}px`;
        const maxLeft = viewportRight - panelWidth - BATCH_INPUT_VIEWPORT_MARGIN_PX;
        const maxTop = viewportBottom - panelHeight - BATCH_INPUT_VIEWPORT_MARGIN_PX;
        const clampedLeft = Math.min(Math.max(left, viewportLeft + BATCH_INPUT_VIEWPORT_MARGIN_PX), maxLeft);
        const clampedTop = Math.min(Math.max(top, viewportTop + BATCH_INPUT_VIEWPORT_MARGIN_PX), maxTop);
        panel.style.left = `${Math.round(clampedLeft)}px`;
        panel.style.top = `${Math.round(clampedTop)}px`;
    }
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
    private keyRegistry: Record<string, KeySpec>;
    private dynamicLayouts: ResolvedDynamicLayout[];
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
    private batchInputPanel: BatchInputPanelController;
    private buttonListenerCleanups: Array<() => void> = [];

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
        this.batchInputPanel = new BatchInputPanelController({
            mountElement: this.options.mountElement,
            getKeyboardPanelRect: () => this.getPanelRect(),
            onSubmit: this.options.onBatchInputSubmit,
            onClose: this.options.onBatchInputClose,
        });

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
        this.buttonListenerCleanups.forEach(cleanup => cleanup());
        this.buttonListenerCleanups = [];
        if (this.dragging || this.dragPointerId >= 0) {
            this.finishDrag();
        }
        this.panel.removeEventListener('pointermove', this.onDragMove);
        this.panel.removeEventListener('pointerup', this.onDragEnd);
        this.panel.removeEventListener('pointercancel', this.onDragEnd);
        this.panel.removeEventListener('contextmenu', this.onPanelContextMenu);
        if (this.dragBar) {
            this.dragBar.removeEventListener('pointerdown', this.onDragStart);
        }
        this.panel.removeEventListener('pointerdown', this.onPanelPressStart);
        window.removeEventListener('resize', this.onBoundsChange);
        window.visualViewport?.removeEventListener('resize', this.onBoundsChange);
        window.visualViewport?.removeEventListener('scroll', this.onBoundsChange);
        if (this.ensureInBoundsRaf >= 0) {
            window.cancelAnimationFrame(this.ensureInBoundsRaf);
            this.ensureInBoundsRaf = -1;
        }
        this.batchInputPanel.dispose();
        this.boundsResizeObserver?.disconnect();
        this.boundsResizeObserver = undefined;
        this.dynamicButtons.clear();
        this.modifierButtons.clear();
        this.clipboardButton = undefined;
        this.dragBar = undefined;
        this.root.remove();
        this.clearThemeVariables();
    }

    updateAppearance(opacity: number, scale: number, theme: MobileKeyboardTheme) {
        this.options.opacity = opacity;
        this.options.scale = scale;
        this.options.theme = theme;
        this.applyAppearance();
        this.requestEnsureInBounds();
    }

    updateHoldBehavior(delayMs: number, intervalMs: number, wheelIntervalMs: number) {
        this.options.holdDelayMs = delayMs;
        this.options.holdIntervalMs = intervalMs;
        this.options.holdWheelIntervalMs = wheelIntervalMs;
        this.stopHoldTimers();
    }

    updateDynamicConfig(dynamicLayouts: ResolvedDynamicLayout[], customKeys: MobileKeyboardCustomKey[]) {
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

    getPanelRect(): DOMRect {
        return this.panel.getBoundingClientRect();
    }

    toggleBatchInputPanel() {
        this.batchInputPanel.toggle();
    }

    closeBatchInputPanel(shouldSubmit = false) {
        this.batchInputPanel.close(shouldSubmit);
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

    private cloneLayouts(dynamicLayouts: ResolvedDynamicLayout[]): ResolvedDynamicLayout[] {
        return cloneResolvedDynamicLayouts(dynamicLayouts);
    }

    private buildRuntimeKeyRegistry(customKeys: MobileKeyboardCustomKey[]): Record<string, KeySpec> {
        const registry = Object.assign(Object.create(null), KEY_REGISTRY) as Record<string, KeySpec>;
        customKeys.forEach(customKey => {
            const classSuffix = sanitizeClassName(customKey.id);
            registry[customKey.id] = {
                id: customKey.id,
                label: customKey.label,
                behavior: { kind: 'send-combo', combo: customKey.combo },
                repeat: { kind: 'none' },
                consumesModifiers: false,
                className: `key-custom-${classSuffix}`,
            };
        });
        return registry;
    }

    private getCurrentLayout(): ResolvedDynamicLayout {
        if (this.dynamicLayouts.length === 0) {
            return mapDynamicLayoutKeyId(DEFAULT_DYNAMIC_LAYOUTS[0]);
        }
        return this.dynamicLayouts[this.currentLayoutIndex % this.dynamicLayouts.length];
    }

    private getDynamicLayoutItemBySlot(slot: number): ResolvedDynamicLayoutItem {
        const layout = this.getCurrentLayout();
        return layout[slot] ?? layout[0];
    }

    private getDynamicKeyBySlot(slot: number): string {
        return this.getDynamicLayoutItemBySlot(slot).keyId;
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

    private switchToLayout(targetLayoutIndex: number) {
        const total = this.dynamicLayouts.length;
        if (total <= 0) return;
        if (!Number.isInteger(targetLayoutIndex) || targetLayoutIndex < 0 || targetLayoutIndex >= total) return;
        if (this.currentLayoutIndex === targetLayoutIndex) return;
        this.currentLayoutIndex = targetLayoutIndex;
        this.syncDynamicButtons();
        this.stopHoldTimers();
    }

    private switchLayoutForDynamicSlot(slot: number) {
        const targetLayoutIndex = this.getDynamicLayoutItemBySlot(slot).switchToLayoutIndex;
        if (targetLayoutIndex === null) return;
        this.switchToLayout(targetLayoutIndex);
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
            this.dragBar.textContent = `Drag / Tap · L${current}/${total}`;
            this.dragBar.setAttribute('aria-label', `Drag bar, layout ${current} of ${total}. Tap to cycle layout`);
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

    private bindPressEvents(
        button: HTMLButtonElement,
        resolveSpec: () => KeySpec,
        onSinglePressDispatched?: () => void
    ) {
        const pressState: PressState = {
            pressArmed: false,
            holdSpec: resolveSpec(),
            holdModifiers: emptyModifiers(),
        };

        const startPress = (event: Event) =>
            this.startButtonPress(event, resolveSpec, pressState, onSinglePressDispatched);
        const stopPress = (event?: Event) => this.stopButtonPress(event, pressState, onSinglePressDispatched);
        const preventClick = (event: Event) => event.preventDefault();

        button.addEventListener('pointerdown', startPress);
        button.addEventListener('pointerup', stopPress as EventListener);
        button.addEventListener('pointercancel', stopPress as EventListener);
        button.addEventListener('pointerleave', stopPress as EventListener);
        button.addEventListener('click', preventClick);
        const cleanups = this.buttonListenerCleanups ?? [];
        this.buttonListenerCleanups = cleanups;
        cleanups.push(() => {
            button.removeEventListener('pointerdown', startPress);
            button.removeEventListener('pointerup', stopPress as EventListener);
            button.removeEventListener('pointercancel', stopPress as EventListener);
            button.removeEventListener('pointerleave', stopPress as EventListener);
            button.removeEventListener('click', preventClick);
        });
    }

    private startButtonPress(
        event: Event,
        resolveSpec: () => KeySpec,
        state: PressState,
        onSinglePressDispatched?: () => void
    ) {
        event.preventDefault();
        event.stopPropagation();

        state.holdSpec = resolveSpec();
        if (state.holdSpec.repeat.kind === 'none') {
            this.dispatchSinglePress(state.holdSpec);
            onSinglePressDispatched?.();
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

    private stopButtonPress(event: Event | undefined, state: PressState, onSinglePressDispatched?: () => void) {
        event?.preventDefault();
        event?.stopPropagation();
        if (!state.pressArmed) return;
        state.pressArmed = false;
        const triggered = this.holdTriggered;
        this.stopHoldTimers();
        if (!triggered) {
            this.dispatchSinglePress(state.holdSpec);
            onSinglePressDispatched?.();
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
        this.panel.addEventListener('pointerdown', this.onPanelPressStart);
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
        const onPointerDown = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
        };
        const onPointerUp = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
        };
        const onClick = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            this.options.onDispatchAction({ kind: 'clipboard-smart' }, emptyModifiers());
        };
        button.addEventListener('pointerdown', onPointerDown);
        button.addEventListener('pointerup', onPointerUp);
        button.addEventListener('click', onClick);
        const cleanups = this.buttonListenerCleanups ?? [];
        this.buttonListenerCleanups = cleanups;
        cleanups.push(() => {
            button.removeEventListener('pointerdown', onPointerDown);
            button.removeEventListener('pointerup', onPointerUp);
            button.removeEventListener('click', onClick);
        });
    }

    private createDynamicButton(slot: number): HTMLButtonElement {
        const keySpec = this.getDynamicKeySpecBySlot(slot);
        const button = this.createBaseButton(keySpec.label, `key-dynamic-${slot}`);
        this.bindPressEvents(
            button,
            () => this.getDynamicKeySpecBySlot(slot),
            () => this.switchLayoutForDynamicSlot(slot)
        );
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
        MOBILE_KEYBOARD_THEME_KEYS.forEach(key => {
            this.options.mountElement.style.setProperty(
                MOBILE_KEYBOARD_THEME_CSS_VARIABLES[key],
                this.options.theme[key]
            );
        });
    }

    private clearThemeVariables() {
        MOBILE_KEYBOARD_THEME_KEYS.forEach(key => {
            this.options.mountElement.style.removeProperty(MOBILE_KEYBOARD_THEME_CSS_VARIABLES[key]);
        });
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
        event.stopPropagation();
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
        event.preventDefault();
        event.stopPropagation();
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
        this.batchInputPanel.repositionIfOpen();
    };

    private onDragEnd = (event: PointerEvent) => {
        if (!this.dragging || event.pointerId !== this.dragPointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const movedDistance = Math.max(
            Math.abs(event.clientX - this.dragStartX),
            Math.abs(event.clientY - this.dragStartY)
        );

        this.finishDrag();

        const clamped = this.clampPosition(this.panelX, this.panelY);
        this.panelX = clamped.x;
        this.panelY = clamped.y;
        this.applyPanelPosition();
        this.batchInputPanel.repositionIfOpen();

        if (movedDistance > TAP_MOVE_THRESHOLD_PX) {
            return;
        }
        this.cycleLayout();
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
        this.batchInputPanel.repositionIfOpen();
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
