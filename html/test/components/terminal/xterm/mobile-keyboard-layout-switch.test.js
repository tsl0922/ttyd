const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const outDir = process.env.UNIT_TEST_OUT_DIR || path.resolve(__dirname, '../../../../.tmp-test');
const { MobileKeyboardController } = require(path.join(outDir, 'src/components/terminal/xterm/mobile-keyboard.js'));

const proto = MobileKeyboardController.prototype;

function createResolvedLayout(keys, switchMap = {}) {
    return keys.map((keyId, index) => ({
        keyId,
        switchToLayoutIndex: Object.prototype.hasOwnProperty.call(switchMap, index) ? switchMap[index] : null,
    }));
}

test('switchLayoutForDynamicSlot switches page when slot has target page', () => {
    let syncCount = 0;
    let stopHoldCount = 0;
    const host = {
        dynamicLayouts: [
            createResolvedLayout(['home', 'tmux_copy_mode', 'end', 'left', 'down', 'right'], { 1: 1 }),
            createResolvedLayout(['pageup', 'up', 'pagedown', 'left', 'down', 'right']),
        ],
        currentLayoutIndex: 0,
        syncDynamicButtons: () => {
            syncCount += 1;
        },
        stopHoldTimers: () => {
            stopHoldCount += 1;
        },
        getCurrentLayout: proto.getCurrentLayout,
        getDynamicLayoutItemBySlot: proto.getDynamicLayoutItemBySlot,
        switchToLayout: proto.switchToLayout,
        switchLayoutForDynamicSlot: proto.switchLayoutForDynamicSlot,
    };

    host.switchLayoutForDynamicSlot(1);

    assert.equal(host.currentLayoutIndex, 1);
    assert.equal(syncCount, 1);
    assert.equal(stopHoldCount, 1);
});

test('stopButtonPress does not run callback when hold already triggered', () => {
    let dispatchCount = 0;
    let callbackCount = 0;
    const host = {
        holdTriggered: true,
        stopHoldTimers: () => {
            host.holdTriggered = false;
        },
        dispatchSinglePress: () => {
            dispatchCount += 1;
        },
    };
    const state = {
        pressArmed: true,
        holdSpec: {
            id: 'up',
            label: 'up',
            behavior: { kind: 'send-virtual', key: 'up' },
            repeat: { kind: 'hold', interval: 'default' },
            consumesModifiers: false,
            className: 'key-up',
        },
        holdModifiers: { ctrl: false, alt: false, shift: false },
    };

    proto.stopButtonPress.call(host, undefined, state, () => {
        callbackCount += 1;
    });

    assert.equal(dispatchCount, 0);
    assert.equal(callbackCount, 0);
});

test('stopButtonPress runs callback for non-hold single press', () => {
    let dispatchCount = 0;
    let callbackCount = 0;
    const host = {
        holdTriggered: false,
        stopHoldTimers: () => {
            host.holdTriggered = false;
        },
        dispatchSinglePress: () => {
            dispatchCount += 1;
        },
    };
    const state = {
        pressArmed: true,
        holdSpec: {
            id: 'tmux_copy_mode',
            label: 'C-b [',
            behavior: { kind: 'send-combo', combo: [] },
            repeat: { kind: 'none' },
            consumesModifiers: false,
            className: 'key-custom-tmux_copy_mode',
        },
        holdModifiers: { ctrl: false, alt: false, shift: false },
    };

    proto.stopButtonPress.call(host, undefined, state, () => {
        callbackCount += 1;
    });

    assert.equal(dispatchCount, 1);
    assert.equal(callbackCount, 1);
});

test('bindClipboardClickEvents dispatches clipboard-smart on click and swallows event', () => {
    const calls = {
        dispatched: 0,
        pointerDownPreventDefault: 0,
        pointerDownStopPropagation: 0,
        pointerUpPreventDefault: 0,
        pointerUpStopPropagation: 0,
        preventDefault: 0,
        stopPropagation: 0,
    };
    let pointerDownHandler;
    let pointerUpHandler;
    let clickHandler;
    const host = {
        options: {
            onDispatchAction: action => {
                assert.deepEqual(action, { kind: 'clipboard-smart' });
                calls.dispatched += 1;
            },
        },
    };
    const button = {
        addEventListener: (type, handler) => {
            if (type === 'pointerdown') pointerDownHandler = handler;
            if (type === 'pointerup') pointerUpHandler = handler;
            if (type === 'click') clickHandler = handler;
        },
    };

    proto.bindClipboardClickEvents.call(host, button);
    pointerDownHandler({
        preventDefault: () => {
            calls.pointerDownPreventDefault += 1;
        },
        stopPropagation: () => {
            calls.pointerDownStopPropagation += 1;
        },
    });
    pointerUpHandler({
        preventDefault: () => {
            calls.pointerUpPreventDefault += 1;
        },
        stopPropagation: () => {
            calls.pointerUpStopPropagation += 1;
        },
    });
    clickHandler({
        preventDefault: () => {
            calls.preventDefault += 1;
        },
        stopPropagation: () => {
            calls.stopPropagation += 1;
        },
    });

    assert.equal(calls.pointerDownPreventDefault, 1);
    assert.equal(calls.pointerDownStopPropagation, 1);
    assert.equal(calls.pointerUpPreventDefault, 1);
    assert.equal(calls.pointerUpStopPropagation, 1);
    assert.equal(calls.dispatched, 1);
    assert.equal(calls.preventDefault, 1);
    assert.equal(calls.stopPropagation, 1);
});
