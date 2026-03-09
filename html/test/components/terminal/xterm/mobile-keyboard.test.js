const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const outDir = process.env.UNIT_TEST_OUT_DIR || path.resolve(__dirname, '../../../../.tmp-test');
const {
    DEFAULT_DYNAMIC_LAYOUTS,
    DYNAMIC_KEY_IDS,
    STATIC_KEY_IDS,
    createBuiltinDynamicCharKeySpec,
    isReservedMobileKeyId,
} = require(path.join(outDir, 'src/components/terminal/xterm/mobile-keyboard.js'));

test('reserved mobile key ids include all built-in static keys', () => {
    for (const keyId of STATIC_KEY_IDS) {
        assert.equal(isReservedMobileKeyId(keyId), true, `expected static key "${keyId}" to be reserved`);
    }
});

test('reserved mobile key ids include dynamic keys and exclude custom ids', () => {
    for (const keyId of DYNAMIC_KEY_IDS) {
        assert.equal(isReservedMobileKeyId(keyId), true, `expected dynamic key "${keyId}" to be reserved`);
    }
    assert.equal(isReservedMobileKeyId('tmux_copy_mode'), false);
    assert.equal(isReservedMobileKeyId('my_custom_key'), false);
});

test('dynamic key ids include alphabet and common english symbols', () => {
    const dynamicKeyIdSet = new Set(DYNAMIC_KEY_IDS);
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
        assert.equal(dynamicKeyIdSet.has(letter), true, `expected "${letter}" in dynamic key ids`);
    }
    for (const symbol of [
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
        ';',
        '<',
        '>',
        '?',
        '^',
        '`',
        '{',
        '}',
    ]) {
        assert.equal(dynamicKeyIdSet.has(symbol), true, `expected "${symbol}" in dynamic key ids`);
    }
});

test('builtin dynamic char key spec keeps behavior stable and class names deterministic', () => {
    const plusSpec = createBuiltinDynamicCharKeySpec('+');
    assert.ok(plusSpec);
    assert.equal(plusSpec.behavior.kind, 'send-char');
    assert.equal(plusSpec.behavior.char, '+');
    assert.equal(plusSpec.repeat.kind, 'none');
    assert.equal(plusSpec.consumesModifiers, true);
    assert.equal(plusSpec.className, 'key-char-u002b');

    const letterSpec = createBuiltinDynamicCharKeySpec('a');
    assert.ok(letterSpec);
    assert.equal(letterSpec.className, 'key-char-a');

    const slashSpec = createBuiltinDynamicCharKeySpec('\\');
    assert.ok(slashSpec);
    assert.equal(slashSpec.className, 'key-char-u005c');

    const unknownSpec = createBuiltinDynamicCharKeySpec(' ');
    assert.equal(unknownSpec, null);
});

test('default dynamic layouts include two pages', () => {
    assert.equal(DEFAULT_DYNAMIC_LAYOUTS.length, 2);
});
