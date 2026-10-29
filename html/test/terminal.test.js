/* eslint-env browser, node */
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { gunzipSync } = require('node:zlib');
const { chromium } = require('playwright');
const { WebSocketServer } = require('ws');

let browser;

before(async () => {
    browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
});

after(async () => {
    if (browser) await browser.close();
});

// Test the compressed frontend actually embedded in the native ttyd binary.
function embeddedHtml() {
    const header = fs.readFileSync(path.join(__dirname, '../../src/html.h'), 'utf8');
    const data = header.match(/index_html\[\]\s*=\s*\{([\s\S]*?)\};/);
    const size = header.match(/index_html_size\s*=\s*(\d+)/);
    assert.ok(data && size, 'Could not read the embedded frontend header');
    const bytes = data[1].match(/0x[0-9a-f]{2}/gi).map(value => Number.parseInt(value, 16));
    const html = gunzipSync(Buffer.from(bytes));
    assert.equal(html.length, Number(size[1]));
    return html;
}

function frame(command, data) {
    return Buffer.concat([Buffer.from(command), Buffer.from(data)]);
}

async function fixture(t, { preferences = {}, query = '', blockWebgl = false } = {}) {
    const html = embeddedHtml();
    const changes = new EventEmitter();
    const state = { input: '', resize: null, handshake: null, socket: null };
    const server = http.createServer((request, response) => {
        if (request.url === '/token') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ token: 'test-token' }));
        } else {
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end(html);
        }
    });
    const wss = new WebSocketServer({
        server,
        path: '/ws',
        handleProtocols: protocols => (protocols.has('tty') ? 'tty' : false),
    });
    wss.on('connection', socket => {
        state.socket = socket;
        socket.on('error', () => {});
        socket.on('message', data => {
            const bytes = Buffer.from(data);
            if (!state.handshake) {
                state.handshake = JSON.parse(bytes.toString());
                socket.send(frame('2', JSON.stringify({ disableLeaveAlert: true, ...preferences })));
                socket.send(frame('0', 'ttyd test ready\r\n'));
            } else if (bytes[0] === 48) {
                const input = bytes.subarray(1).toString();
                state.input += input;
                socket.send(frame('0', input));
            } else if (bytes[0] === 49) {
                state.resize = JSON.parse(bytes.subarray(1).toString());
            }
            changes.emit('message');
        });
    });

    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    t.after(async () => {
        await context.close();
        for (const client of wss.clients) client.terminate();
        await new Promise(resolve => wss.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });
    server.listen(0, '0.0.0.0');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const page = await context.newPage();
    const logs = [];
    const errors = [];
    page.on('console', message => logs.push(message.text()));
    page.on('pageerror', error => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, [], 'Unexpected browser errors'));

    if (blockWebgl) {
        await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            window.restoreWebglForTest = () => (HTMLCanvasElement.prototype.getContext = original);
            HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                if (type === 'webgl2') return null;
                return original.call(this, type, ...args);
            };
        });
    }
    await page.goto(origin + '/' + query);
    await waitForTerminalText(page, 'ttyd test ready');

    const waitForMessage = predicate =>
        new Promise((resolve, reject) => {
            const onMessage = () => {
                if (!predicate()) return;
                clearTimeout(timer);
                changes.removeListener('message', onMessage);
                resolve();
            };
            const timer = setTimeout(() => {
                changes.removeListener('message', onMessage);
                reject(new Error('Timed out waiting for a WebSocket message'));
            }, 5000);
            changes.on('message', onMessage);
            onMessage();
        });

    return {
        page,
        state,
        logs,
        waitForMessage,
        sendPreferences: prefs => state.socket.send(frame('2', JSON.stringify(prefs))),
    };
}

async function waitForTerminalText(page, text) {
    await page.waitForFunction(expected => {
        const buffer = window.term && window.term.buffer.active;
        if (!buffer) return false;
        return Array.from({ length: buffer.length }, (_, index) => {
            const line = buffer.getLine(index);
            return line ? line.translateToString(true) : '';
        })
            .join('\n')
            .includes(expected);
    }, text);
}

async function waitForWebgl(page) {
    await page.waitForFunction(() => {
        const canvas = document.querySelector('.xterm-screen canvas:not([class])');
        return canvas && !!canvas.getContext('webgl2');
    });
}

async function assertFitted(page) {
    const before = await page.evaluate(() => ({ cols: window.term.cols, rows: window.term.rows }));
    const afterFit = await page.evaluate(() => {
        window.term.fit();
        return { cols: window.term.cols, rows: window.term.rows };
    });
    assert.deepEqual(afterFit, before, 'Switching renderer should refit the terminal immediately');
}

test('the embedded header contains the built frontend', () => {
    const inline = path.join(__dirname, '../dist/inline.html');
    assert.ok(fs.existsSync(inline), 'Run yarn build before yarn test');
    assert.deepEqual(embeddedHtml(), fs.readFileSync(inline));
});

test('DOM renderer handles input, resize, Unicode, clipboard and sixel', async t => {
    const { page, state, waitForMessage } = await fixture(t, {
        preferences: {
            rendererType: 'dom',
            enableSixel: true,
            overviewRuler: { width: 40 },
            lineHeight: 1.25,
            letterSpacing: 1,
        },
    });
    await page.waitForSelector('.xterm-screen .xterm-rows');
    assert.equal(state.handshake.AuthToken, 'test-token');
    assert.equal(await page.evaluate(() => window.term.unicode.activeVersion), '11');
    await assertFitted(page);

    await page.keyboard.type('hello-xterm6');
    await waitForTerminalText(page, 'hello-xterm6');
    await waitForMessage(() => state.input.includes('hello-xterm6'));

    const initial = await page.evaluate(() => ({ cols: window.term.cols, rows: window.term.rows }));
    await page.setViewportSize({ width: 750, height: 500 });
    await page.waitForFunction(
        oldSize => window.term.cols !== oldSize.cols && window.term.rows !== oldSize.rows,
        initial
    );
    const size = await page.evaluate(() => ({ cols: window.term.cols, rows: window.term.rows }));
    await waitForMessage(() => state.resize && state.resize.columns === size.cols && state.resize.rows === size.rows);

    await page.evaluate(() => window.term.write('\x1b]52;c;Q2xpcGJvYXJkIHY2\x07'));
    await page.waitForFunction(async () => (await navigator.clipboard.readText()) === 'Clipboard v6');
    await page.evaluate(() => window.term.write('\r\n\x1bPq#0;2;100;0;0!8~\x1b\\'));
    await page.waitForFunction(() => {
        const canvas = document.querySelector('canvas.xterm-image-layer');
        if (!canvas) return false;
        const pixels = canvas.getContext('2d').getImageData(0, 0, 150, 150).data;
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 150 && pixels[i + 1] < 50 && pixels[i + 2] < 50 && pixels[i + 3] > 0) return true;
        }
        return false;
    });
});

test('the web-links addon activates URLs', async t => {
    const { page } = await fixture(t, { preferences: { rendererType: 'dom' } });
    await page.evaluate(() => {
        window.open = () => {
            const location = {};
            Object.defineProperty(location, 'href', {
                set: value => {
                    window.openedLinkForTest = value;
                },
            });
            return { opener: window, location };
        };
        window.term.write('\r\nhttps://example.com/xterm6');
    });
    const link = page.locator('.xterm-rows > div').filter({ hasText: 'https://example.com/xterm6' });
    await link.waitFor();
    const box = await link.boundingBox();
    await page.mouse.move(box.x + 16, box.y + box.height / 2);
    await page.waitForFunction(() =>
        document.querySelector('.xterm-screen').classList.contains('xterm-cursor-pointer')
    );
    await page.mouse.click(box.x + 16, box.y + box.height / 2);
    await page.waitForFunction(() => window.openedLinkForTest === 'https://example.com/xterm6');
});

test('ZMODEM and trzsz can be enabled without breaking terminal output', async t => {
    const { page, logs } = await fixture(t, {
        preferences: { rendererType: 'dom', enableZmodem: true, enableTrzsz: true },
    });
    assert.ok(logs.some(message => message.includes('Zmodem enabled')));
    assert.ok(logs.some(message => message.includes('trzsz enabled')));
    await page.keyboard.type('transfer-addon-test');
    await waitForTerminalText(page, 'transfer-addon-test');
});

test('WebGL refits, falls back on context loss, and can be re-enabled', async t => {
    const { page, logs, sendPreferences } = await fixture(t);
    await waitForWebgl(page);
    await assertFitted(page);

    sendPreferences({ rendererType: 'dom' });
    await page.waitForSelector('.xterm-screen .xterm-rows');
    await assertFitted(page);
    sendPreferences({ rendererType: 'webgl' });
    await waitForWebgl(page);
    await assertFitted(page);

    const contextLost = await page.evaluate(() => {
        const canvas = document.querySelector('.xterm-screen canvas:not([class])');
        const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
        if (!extension) return false;
        extension.loseContext();
        return true;
    });
    assert.ok(contextLost, 'The test browser must support WEBGL_lose_context');
    await page.waitForSelector('.xterm-screen .xterm-rows', { timeout: 10000 });
    assert.ok(logs.some(message => message.includes('WebGL context lost, falling back to dom renderer')));
    await assertFitted(page);
    sendPreferences({ rendererType: 'webgl' });
    await waitForWebgl(page);
    await assertFitted(page);
});

test('the legacy canvas option falls back to DOM', async t => {
    const { page, logs } = await fixture(t, { query: '?rendererType=canvas' });
    await page.waitForSelector('.xterm-screen .xterm-rows');
    assert.ok(logs.some(message => message.includes('canvas renderer is no longer available')));
    await page.keyboard.type('canvas-fallback');
    await waitForTerminalText(page, 'canvas-fallback');
});

test('WebGL initialization failure falls back to DOM and can be retried', async t => {
    const { page, logs, sendPreferences } = await fixture(t, { blockWebgl: true });
    await page.waitForSelector('.xterm-screen .xterm-rows');
    assert.ok(logs.some(message => message.includes('WebGL renderer could not be loaded')));
    await page.keyboard.type('webgl-fallback');
    await waitForTerminalText(page, 'webgl-fallback');
    await page.evaluate(() => window.restoreWebglForTest());
    sendPreferences({ rendererType: 'webgl' });
    await waitForWebgl(page);
    await assertFitted(page);
});
