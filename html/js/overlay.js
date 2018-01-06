// ported from hterm.Terminal.prototype.showOverlay
// https://chromium.googlesource.com/apps/libapps/+/master/hterm/js/hterm_terminal.js
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

function showOverlay(term, msg, timeout) {
    if (!term.overlayNode_) {
        if (!term.element)
            return;
        term.overlayNode_ = document.createElement('div');
        term.overlayNode_.style.cssText = (
            'border-radius: 15px;' +
            'font-size: xx-large;' +
            'opacity: 0.75;' +
            'padding: 0.2em 0.5em 0.2em 0.5em;' +
            'position: absolute;' +
            '-webkit-user-select: none;' +
            '-webkit-transition: opacity 180ms ease-in;' +
            '-moz-user-select: none;' +
            '-moz-transition: opacity 180ms ease-in;');

        term.overlayNode_.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
        }, true);
    }
    term.overlayNode_.style.color = "#101010";
    term.overlayNode_.style.backgroundColor = "#f0f0f0";

    term.overlayNode_.textContent = msg;
    term.overlayNode_.style.opacity = '0.75';

    if (!term.overlayNode_.parentNode)
        term.element.appendChild(term.overlayNode_);

    var divSize = term.element.getBoundingClientRect();
    var overlaySize = term.overlayNode_.getBoundingClientRect();

    term.overlayNode_.style.top =
        (divSize.height - overlaySize.height) / 2 + 'px';
    term.overlayNode_.style.left = (divSize.width - overlaySize.width) / 2 + 'px';

    if (term.overlayTimeout_)
        clearTimeout(term.overlayTimeout_);

    if (timeout === null)
        return;

    term.overlayTimeout_ = setTimeout(function() {
        term.overlayNode_.style.opacity = '0';
        term.overlayTimeout_ = setTimeout(function() {
            if (term.overlayNode_.parentNode)
                term.overlayNode_.parentNode.removeChild(term.overlayNode_);
            term.overlayTimeout_ = null;
            term.overlayNode_.style.opacity = '0.75';
        }, 200);
    }, timeout || 1500);
}
exports.showOverlay = showOverlay;

function apply(terminalConstructor) {
    terminalConstructor.prototype.showOverlay = function (msg, timeout) {
        return showOverlay(this, msg, timeout);
    };
}
exports.apply = apply;
