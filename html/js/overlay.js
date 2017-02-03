// ported from hterm.Terminal.prototype.showOverlay
// https://chromium.googlesource.com/apps/libapps/+/master/hterm/js/hterm_terminal.js

Terminal.prototype.showOverlay = function(msg, timeout) {
    if (!this.overlayNode_) {
        if (!this.element)
            return;
        this.overlayNode_ = document.createElement('div');
        this.overlayNode_.style.cssText = (
        'border-radius: 15px;' +
        'font-size: xx-large;' +
        'opacity: 0.75;' +
        'padding: 0.2em 0.5em 0.2em 0.5em;' +
        'position: absolute;' +
        '-webkit-user-select: none;' +
        '-webkit-transition: opacity 180ms ease-in;' +
        '-moz-user-select: none;' +
        '-moz-transition: opacity 180ms ease-in;');

        this.overlayNode_.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
        }, true);
    }
    this.overlayNode_.style.color = "#101010";
    this.overlayNode_.style.backgroundColor = "#f0f0f0";

    this.overlayNode_.textContent = msg;
    this.overlayNode_.style.opacity = '0.75';

    if (!this.overlayNode_.parentNode)
        this.element.appendChild(this.overlayNode_);

    var divSize = this.element.getBoundingClientRect();
    var overlaySize = this.overlayNode_.getBoundingClientRect();

    this.overlayNode_.style.top =
        (divSize.height - overlaySize.height) / 2 + 'px';
    this.overlayNode_.style.left = (divSize.width - overlaySize.width) / 2 + 'px';

    var self = this;

    if (this.overlayTimeout_)
        clearTimeout(this.overlayTimeout_);

    if (timeout === null)
        return;

    this.overlayTimeout_ = setTimeout(function() {
        self.overlayNode_.style.opacity = '0';
        self.overlayTimeout_ = setTimeout(function() {
            if (self.overlayNode_.parentNode)
                self.overlayNode_.parentNode.removeChild(self.overlayNode_);
            self.overlayTimeout_ = null;
            self.overlayNode_.style.opacity = '0.75';
        }, 200);
    }, timeout || 1500);
};