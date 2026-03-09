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
            role: 'action',
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
            role: 'action',
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
