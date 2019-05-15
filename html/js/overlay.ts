// ported from hterm.Terminal.prototype.showOverlay
// https://chromium.googlesource.com/apps/libapps/+/master/hterm/js/hterm_terminal.js
import { Terminal } from 'xterm';

interface IOverlayAddonTerminal extends Terminal {
    __overlayNode?: HTMLElement
    __overlayTimeout?: number
}

export function showOverlay(term: Terminal, msg: string, timeout: number): void {
    const addonTerminal = <IOverlayAddonTerminal> term;
    if (!addonTerminal.__overlayNode) {
        if (!term.element)
            return;
        addonTerminal.__overlayNode = document.createElement('div');
        addonTerminal.__overlayNode.style.cssText = (
            'border-radius: 15px;' +
            'font-size: xx-large;' +
            'opacity: 0.75;' +
            'padding: 0.2em 0.5em 0.2em 0.5em;' +
            'position: absolute;' +
            '-webkit-user-select: none;' +
            '-webkit-transition: opacity 180ms ease-in;' +
            '-moz-user-select: none;' +
            '-moz-transition: opacity 180ms ease-in;');

        addonTerminal.__overlayNode.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, true);
    }
    addonTerminal.__overlayNode.style.color = "#101010";
    addonTerminal.__overlayNode.style.backgroundColor = "#f0f0f0";

    addonTerminal.__overlayNode.textContent = msg;
    addonTerminal.__overlayNode.style.opacity = '0.75';

    if (!addonTerminal.__overlayNode.parentNode)
        term.element.appendChild(addonTerminal.__overlayNode);

    const divSize = term.element.getBoundingClientRect();
    const overlaySize = addonTerminal.__overlayNode.getBoundingClientRect();

    addonTerminal.__overlayNode.style.top = (divSize.height - overlaySize.height) / 2 + 'px';
    addonTerminal.__overlayNode.style.left = (divSize.width - overlaySize.width) / 2 + 'px';

    if (addonTerminal.__overlayTimeout)
        clearTimeout(addonTerminal.__overlayTimeout);

    if (timeout === null)
        return;

    addonTerminal.__overlayTimeout = <number><any>setTimeout(() => {
        addonTerminal.__overlayNode.style.opacity = '0';
        addonTerminal.__overlayTimeout = <number><any>setTimeout(() => {
            if (addonTerminal.__overlayNode.parentNode)
                addonTerminal.__overlayNode.parentNode.removeChild(addonTerminal.__overlayNode);
            addonTerminal.__overlayTimeout = null;
            addonTerminal.__overlayNode.style.opacity = '0.75';
        }, 200);
    }, timeout || 1500);
}

export function apply(terminalConstructor: typeof Terminal): void {
    (<any>terminalConstructor.prototype).showOverlay = function (msg: string, timeout?: number): void {
        return showOverlay(this, msg, timeout);
    };
}
