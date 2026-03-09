const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

process.env.NODE_PATH = path.resolve(__dirname, '../../../../node_modules');
Module._initPaths();

const originalLoad = Module._load;
const moduleStubs = new Map([
    ['decko', { bind: () => (_target, _key, descriptor) => descriptor }],
    ['@xterm/xterm', { Terminal: class {} }],
    ['@xterm/addon-canvas', { CanvasAddon: class {} }],
    ['@xterm/addon-clipboard', { ClipboardAddon: class {} }],
    ['@xterm/addon-webgl', { WebglAddon: class {} }],
    ['@xterm/addon-fit', { FitAddon: class {} }],
    ['@xterm/addon-web-links', { WebLinksAddon: class {} }],
    ['@xterm/addon-image', { ImageAddon: class {} }],
    ['@xterm/addon-unicode11', { Unicode11Addon: class {} }],
    ['./addons/overlay', { OverlayAddon: class {} }],
    ['./addons/zmodem', { ZmodemAddon: class {} }],
]);
Module._load = function (request, parent, isMain) {
    if (request.endsWith('.css')) return {};
    if (moduleStubs.has(request)) return moduleStubs.get(request);
    return originalLoad.call(this, request, parent, isMain);
};

const outDir = process.env.UNIT_TEST_OUT_DIR || path.resolve(__dirname, '../../../../.tmp-test');
const { Xterm } = require(path.join(outDir, 'src/components/terminal/xterm/index.js'));
Module._load = originalLoad;

const proto = Xterm.prototype;

function createActionHost() {
    const calls = {
        sendData: [],
        clearModifiers: 0,
        sendVirtualKey: [],
        sendVirtualWheelStep: [],
        keepTerminalFocus: 0,
        handleClipboardAction: 0,
    };

    const host = {
        calls,
        mobileKeyboard: {
            clearModifiers: () => {
                calls.clearModifiers += 1;
            },
        },
        sendData: data => {
            calls.sendData.push(data);
        },
        sendVirtualKey: (key, modifiers) => {
            calls.sendVirtualKey.push({ key, modifiers });
        },
        sendVirtualWheelStep: direction => {
            calls.sendVirtualWheelStep.push(direction);
        },
        keepTerminalFocus: () => {
            calls.keepTerminalFocus += 1;
        },
        handleClipboardAction: async () => {
            calls.handleClipboardAction += 1;
        },
        hasModifiers: proto.hasModifiers,
        applyShift: proto.applyShift,
        applyCtrl: proto.applyCtrl,
        encodeCharWithModifiers: proto.encodeCharWithModifiers,
        sendDynamicChar: proto.sendDynamicChar,
        sendDynamicCombo: proto.sendDynamicCombo,
        onMobileKeyboardAction: proto.onMobileKeyboardAction,
    };

    return host;
}

function createVirtualKeyHost() {
    const calls = { sendData: [] };
    const host = {
        calls,
        terminal: { modes: { applicationCursorKeysMode: false } },
        sendData: data => {
            calls.sendData.push(data);
        },
        hasModifiers: proto.hasModifiers,
        getCsiModifier: proto.getCsiModifier,
        inApplicationCursorKeysMode: proto.inApplicationCursorKeysMode,
        applyShift: proto.applyShift,
        applyCtrl: proto.applyCtrl,
        encodeCharWithModifiers: proto.encodeCharWithModifiers,
        sendVirtualKey: proto.sendVirtualKey,
    };
    return host;
}

test('sendDynamicChar sends raw char without modifiers', () => {
    const host = createActionHost();
    host.sendDynamicChar('x', { ctrl: false, alt: false, shift: false });
    assert.deepEqual(host.calls.sendData, ['x']);
});

test('sendDynamicChar encodes ctrl and alt modifiers', () => {
    const host = createActionHost();

    host.sendDynamicChar('a', { ctrl: true, alt: false, shift: false });
    host.sendDynamicChar('x', { ctrl: false, alt: true, shift: false });

    assert.equal(host.calls.sendData[0], '\x01');
    assert.equal(host.calls.sendData[1], '\x1bx');
});

test('sendDynamicCombo dispatches virtual and char steps', () => {
    const host = createActionHost();

    host.sendDynamicCombo([
        { kind: 'virtual', key: 'up', modifiers: { ctrl: false, alt: false, shift: false } },
        { kind: 'char', char: 'b', modifiers: { ctrl: true, alt: false, shift: false } },
    ]);

    assert.equal(host.calls.sendVirtualKey.length, 1);
    assert.deepEqual(host.calls.sendVirtualKey[0], {
        key: 'up',
        modifiers: { ctrl: false, alt: false, shift: false },
    });
    assert.equal(host.calls.sendData.length, 1);
    assert.equal(host.calls.sendData[0], '\x02');
});

test('onMobileKeyboardAction routes to expected handlers', () => {
    const host = createActionHost();

    host.onMobileKeyboardAction({ kind: 'send-char', char: '\r' }, { ctrl: false, alt: false, shift: false });
    host.onMobileKeyboardAction(
        {
            kind: 'send-combo',
            combo: [{ kind: 'char', char: 'c', modifiers: { ctrl: true, alt: false, shift: false } }],
        },
        { ctrl: true, alt: false, shift: false }
    );
    host.onMobileKeyboardAction({ kind: 'wheel-step', direction: -1 }, { ctrl: false, alt: false, shift: false });
    host.onMobileKeyboardAction({ kind: 'clipboard-smart' }, { ctrl: false, alt: false, shift: false });

    assert.equal(host.calls.clearModifiers, 1, 'only send-combo should clear modifiers');
    assert.deepEqual(host.calls.sendVirtualWheelStep, [-1]);
    assert.equal(host.calls.keepTerminalFocus, 1);
    assert.equal(host.calls.handleClipboardAction, 1);
    assert.equal(host.calls.sendData[0], '\r');
    assert.equal(host.calls.sendData[1], '\x03');
});

test('sendVirtualKey uses CSI or SS3 sequences based on application cursor mode', () => {
    const host = createVirtualKeyHost();

    host.sendVirtualKey('up', { ctrl: false, alt: false, shift: false });
    host.sendVirtualKey('home', { ctrl: false, alt: false, shift: false });
    host.terminal.modes.applicationCursorKeysMode = true;
    host.sendVirtualKey('up', { ctrl: false, alt: false, shift: false });
    host.sendVirtualKey('home', { ctrl: false, alt: false, shift: false });

    assert.deepEqual(host.calls.sendData, ['\x1b[A', '\x1b[H', '\x1bOA', '\x1bOH']);
});

test('sendVirtualKey emits modified CSI sequences', () => {
    const host = createVirtualKeyHost();

    host.sendVirtualKey('up', { ctrl: true, alt: false, shift: false });
    host.sendVirtualKey('tab', { ctrl: false, alt: false, shift: true });
    host.sendVirtualKey('tab', { ctrl: true, alt: false, shift: true });
    host.sendVirtualKey('pageup', { ctrl: false, alt: true, shift: false });

    assert.deepEqual(host.calls.sendData, ['\x1b[1;5A', '\x1b[Z', '\x1b[1;6I', '\x1b[5;3~']);
});
