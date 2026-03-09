const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const outDir = process.env.UNIT_TEST_OUT_DIR || path.resolve(__dirname, '../../../../.tmp-test');
const {
    DYNAMIC_KEY_IDS,
    cloneDefaultMobileKeyboardLayouts,
    isValidMobileKeyboardCustomKeyId,
    normalizeMobileKeyboardCustomKeys,
    normalizeMobileKeyboardLayouts,
    parseMobileKeyComboStep,
    resolveMobileKeyboardConfig,
} = require(path.join(outDir, 'src/components/terminal/xterm/mobile-keyboard.js'));

function toResolvedLayout(layout, pageMap = {}) {
    return layout.map((keyId, index) => ({
        keyId,
        switchToLayoutIndex: Object.prototype.hasOwnProperty.call(pageMap, index) ? pageMap[index] : null,
    }));
}

function resolveDefaultLayouts() {
    return cloneDefaultMobileKeyboardLayouts().map(layout => toResolvedLayout(layout));
}

test('parseComboStep supports virtual keys, aliases and char mappings', () => {
    assert.deepEqual(parseMobileKeyComboStep('Ctrl+b'), {
        kind: 'char',
        char: 'b',
        modifiers: { ctrl: true, alt: false, shift: false },
    });
    assert.deepEqual(parseMobileKeyComboStep('control+b'), {
        kind: 'char',
        char: 'b',
        modifiers: { ctrl: true, alt: false, shift: false },
    });
    assert.deepEqual(parseMobileKeyComboStep('ArrowUp'), {
        kind: 'virtual',
        key: 'up',
        modifiers: { ctrl: false, alt: false, shift: false },
    });
    assert.deepEqual(parseMobileKeyComboStep('enter'), {
        kind: 'char',
        char: '\r',
        modifiers: { ctrl: false, alt: false, shift: false },
    });
    assert.deepEqual(parseMobileKeyComboStep('space'), {
        kind: 'char',
        char: ' ',
        modifiers: { ctrl: false, alt: false, shift: false },
    });
    assert.deepEqual(parseMobileKeyComboStep('+'), {
        kind: 'char',
        char: '+',
        modifiers: { ctrl: false, alt: false, shift: false },
    });
    assert.deepEqual(parseMobileKeyComboStep('Ctrl++'), {
        kind: 'char',
        char: '+',
        modifiers: { ctrl: true, alt: false, shift: false },
    });

    assert.equal(parseMobileKeyComboStep('meta+x'), null);
    assert.equal(parseMobileKeyComboStep('Ctrl+'), null);
    assert.equal(parseMobileKeyComboStep(''), null);
});

test('normalizeCustomMobileKeys validates ids and combo', () => {
    const valid = normalizeMobileKeyboardCustomKeys([
        { id: 'tmux_copy_mode', label: 'C-b [', combo: ['Ctrl+b', '['] },
        { id: 'tmux_next_window', label: 'C-b n', combo: ['Ctrl+b', 'n'] },
    ]);
    assert.equal(valid.valid, true);
    assert.equal(valid.keys.length, 2);
    assert.deepEqual(valid.keys[0].combo[0], {
        kind: 'char',
        char: 'b',
        modifiers: { ctrl: true, alt: false, shift: false },
    });

    const withPlusKey = normalizeMobileKeyboardCustomKeys([{ id: 'plus_key', label: 'C-+', combo: ['Ctrl++'] }]);
    assert.equal(withPlusKey.valid, true);
    assert.equal(withPlusKey.keys.length, 1);
    assert.deepEqual(withPlusKey.keys[0].combo[0], {
        kind: 'char',
        char: '+',
        modifiers: { ctrl: true, alt: false, shift: false },
    });

    assert.equal(normalizeMobileKeyboardCustomKeys('invalid').valid, false);
    assert.equal(
        normalizeMobileKeyboardCustomKeys([{ id: 'up', label: 'bad', combo: ['Ctrl+b'] }]).valid,
        false,
        'reserved id should be rejected'
    );
    assert.equal(
        normalizeMobileKeyboardCustomKeys([
            { id: 'dup', label: 'one', combo: ['Ctrl+b'] },
            { id: 'dup', label: 'two', combo: ['Ctrl+n'] },
        ]).valid,
        false,
        'duplicated custom id should be rejected'
    );
    assert.equal(
        normalizeMobileKeyboardCustomKeys([{ id: 'x', label: 'x', combo: [] }]).valid,
        false,
        'empty combo should be rejected'
    );
    assert.equal(
        normalizeMobileKeyboardCustomKeys([{ id: '__proto__', label: 'bad', combo: ['Ctrl+b'] }]).valid,
        false,
        'prototype-polluting id should be rejected'
    );
    assert.equal(
        normalizeMobileKeyboardCustomKeys([{ id: 'constructor', label: 'bad', combo: ['Ctrl+b'] }]).valid,
        false,
        'constructor id should be rejected'
    );
    assert.equal(
        normalizeMobileKeyboardCustomKeys([{ id: 'tmux-copy-mode', label: 'bad', combo: ['Ctrl+b'] }]).valid,
        false,
        'dash should be rejected by strict id rule'
    );
    assert.equal(
        normalizeMobileKeyboardCustomKeys([{ id: 'Tmux_copy_mode', label: 'bad', combo: ['Ctrl+b'] }]).valid,
        false,
        'uppercase should be rejected by strict id rule'
    );
});

test('custom key id validator enforces strict naming pattern', () => {
    assert.equal(isValidMobileKeyboardCustomKeyId('tmux_copy_mode'), true);
    assert.equal(isValidMobileKeyboardCustomKeyId('a'), true);
    assert.equal(isValidMobileKeyboardCustomKeyId('a1234567890123456789012345678901'), true);

    assert.equal(isValidMobileKeyboardCustomKeyId(''), false);
    assert.equal(isValidMobileKeyboardCustomKeyId('1prefix'), false);
    assert.equal(isValidMobileKeyboardCustomKeyId('_prefix'), false);
    assert.equal(isValidMobileKeyboardCustomKeyId('tmux-copy-mode'), false);
    assert.equal(isValidMobileKeyboardCustomKeyId('tmux copy mode'), false);
    assert.equal(isValidMobileKeyboardCustomKeyId('a12345678901234567890123456789012'), false);
    assert.equal(isValidMobileKeyboardCustomKeyId('__proto__'), false);
    assert.equal(isValidMobileKeyboardCustomKeyId('prototype'), false);
    assert.equal(isValidMobileKeyboardCustomKeyId('constructor'), false);
});

test('normalizeDynamicLayouts validates shape and allowed key ids', () => {
    const allowed = new Set([...DYNAMIC_KEY_IDS, 'tmux_copy_mode']);

    const fallback = normalizeMobileKeyboardLayouts(undefined, allowed);
    assert.equal(fallback.valid, true);
    assert.equal(Array.isArray(fallback.layouts), true);
    assert.equal(fallback.layouts.length > 0, true);

    assert.equal(normalizeMobileKeyboardLayouts([['up', 'down']], allowed).valid, false);
    assert.equal(
        normalizeMobileKeyboardLayouts([['up', 'down', 'left', 'right', 'home', 'UNKNOWN']], allowed).valid,
        false
    );

    const valid = normalizeMobileKeyboardLayouts(
        [[' pageup ', ' tmux_copy_mode ', 'pagedown', 'left', 'down', 'right']],
        allowed
    );
    assert.equal(valid.valid, true);
    assert.deepEqual(
        valid.layouts[0],
        toResolvedLayout(['pageup', 'tmux_copy_mode', 'pagedown', 'left', 'down', 'right'])
    );
});

test('normalizeDynamicLayouts supports optional page switch and ignores invalid page values', () => {
    const allowed = new Set([...DYNAMIC_KEY_IDS, 'tmux_copy_mode']);

    const valid = normalizeMobileKeyboardLayouts(
        [
            ['pageup', { key: 'tmux_copy_mode', page: 2 }, 'pagedown', 'left', 'down', 'right'],
            ['home', 'up', 'end', 'left', 'down', 'right'],
        ],
        allowed
    );
    assert.equal(valid.valid, true);
    assert.equal(valid.layouts[0][1].keyId, 'tmux_copy_mode');
    assert.equal(valid.layouts[0][1].switchToLayoutIndex, 1);

    const invalidPageIgnored = normalizeMobileKeyboardLayouts(
        [['pageup', { key: 'tmux_copy_mode', page: 9 }, 'pagedown', 'left', 'down', 'right']],
        allowed
    );
    assert.equal(invalidPageIgnored.valid, true);
    assert.equal(invalidPageIgnored.layouts[0][1].switchToLayoutIndex, null);

    const invalidFractionPageIgnored = normalizeMobileKeyboardLayouts(
        [['pageup', { key: 'tmux_copy_mode', page: 1.5 }, 'pagedown', 'left', 'down', 'right']],
        allowed
    );
    assert.equal(invalidFractionPageIgnored.valid, true);
    assert.equal(invalidFractionPageIgnored.layouts[0][1].switchToLayoutIndex, null);
});

test('resolveMobileKeyboardConfig falls back when custom/layout config is invalid', () => {
    const invalidCustom = resolveMobileKeyboardConfig(undefined, { bad: true });
    assert.equal(invalidCustom.customKeys.length, 0);
    assert.deepEqual(invalidCustom.layouts, resolveDefaultLayouts());

    const validCustomButInvalidLayout = resolveMobileKeyboardConfig(
        [['up', 'down', 'left', 'right', 'home', 'unknown_key']],
        [{ id: 'tmux_copy_mode', label: 'C-b [', combo: ['Ctrl+b', '['] }]
    );
    assert.equal(validCustomButInvalidLayout.customKeys.length, 0);
    assert.deepEqual(validCustomButInvalidLayout.layouts, resolveDefaultLayouts());

    const validAll = resolveMobileKeyboardConfig(
        [['pageup', 'tmux_copy_mode', 'pagedown', 'left', 'down', 'right']],
        [{ id: 'tmux_copy_mode', label: 'C-b [', combo: ['Ctrl+b', '['] }]
    );
    assert.equal(validAll.customKeys.length, 1);
    assert.deepEqual(
        validAll.layouts[0],
        toResolvedLayout(['pageup', 'tmux_copy_mode', 'pagedown', 'left', 'down', 'right'])
    );
});

test('resolveMobileKeyboardConfig keeps key dispatch even when page is out of range', () => {
    const validAll = resolveMobileKeyboardConfig(
        [['pageup', { key: 'tmux_copy_mode', page: 9 }, 'pagedown', 'left', 'down', 'right']],
        [{ id: 'tmux_copy_mode', label: 'C-b [', combo: ['Ctrl+b', '['] }]
    );
    assert.equal(validAll.customKeys.length, 1);
    assert.equal(validAll.layouts[0][1].keyId, 'tmux_copy_mode');
    assert.equal(validAll.layouts[0][1].switchToLayoutIndex, null);
});
