// ported from hterm.Terminal.IO.prototype.writeUTF8
// https://chromium.googlesource.com/apps/libapps/+/master/hterm/js/hterm_terminal_io.js

UTF8Decoder = function() {
    this.bytesLeft = 0;
    this.codePoint = 0;
    this.lowerBound = 0;
};

UTF8Decoder.prototype.decode = function(str) {
    var ret = '';
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (this.bytesLeft == 0) {
            if (c <= 0x7F) {
                ret += str.charAt(i);
            } else if (0xC0 <= c && c <= 0xDF) {
                this.codePoint = c - 0xC0;
                this.bytesLeft = 1;
                this.lowerBound = 0x80;
            } else if (0xE0 <= c && c <= 0xEF) {
                this.codePoint = c - 0xE0;
                this.bytesLeft = 2;
                this.lowerBound = 0x800;
            } else if (0xF0 <= c && c <= 0xF7) {
                this.codePoint = c - 0xF0;
                this.bytesLeft = 3;
                this.lowerBound = 0x10000;
            } else if (0xF8 <= c && c <= 0xFB) {
                this.codePoint = c - 0xF8;
                this.bytesLeft = 4;
                this.lowerBound = 0x200000;
            } else if (0xFC <= c && c <= 0xFD) {
                this.codePoint = c - 0xFC;
                this.bytesLeft = 5;
                this.lowerBound = 0x4000000;
            } else {
                ret += '\ufffd';
            }
        } else {
            if (0x80 <= c && c <= 0xBF) {
                this.bytesLeft--;
                this.codePoint = (this.codePoint << 6) + (c - 0x80);
                if (this.bytesLeft == 0) {
                    var codePoint = this.codePoint;
                    if (codePoint < this.lowerBound
                        || (0xD800 <= codePoint && codePoint <= 0xDFFF)
                        || codePoint > 0x10FFFF) {
                        ret += '\ufffd';
                    } else {
                        if (codePoint < 0x10000) {
                            ret += String.fromCharCode(codePoint);
                        } else {
                            codePoint -= 0x10000;
                            ret += String.fromCharCode(
                                0xD800 + ((codePoint >>> 10) & 0x3FF),
                                0xDC00 + (codePoint & 0x3FF));
                        }
                    }
                }
            } else {
                ret += '\ufffd';
                this.bytesLeft = 0;
                i--;
            }
        }
    }
    return ret;
};

Terminal.prototype.decodeUTF8 = function(str) {
    return (new UTF8Decoder()).decode(str);
};

Terminal.prototype.encodeUTF8 = function(str) {
    var ret = '';
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (0xDC00 <= c && c <= 0xDFFF) {
            c = 0xFFFD;
        } else if (0xD800 <= c && c <= 0xDBFF) {
            if (i+1 < str.length) {
                var d = str.charCodeAt(i+1);
                if (0xDC00 <= d && d <= 0xDFFF) {
                    c = 0x10000 + ((c & 0x3FF) << 10) + (d & 0x3FF);
                    i++;
                } else {
                    c = 0xFFFD;
                }
            } else {
                c = 0xFFFD;
            }
        }
        var bytesLeft;
        if (c <= 0x7F) {
            ret += str.charAt(i);
            continue;
        } else if (c <= 0x7FF) {
            ret += String.fromCharCode(0xC0 | (c >>> 6));
            bytesLeft = 1;
        } else if (c <= 0xFFFF) {
            ret += String.fromCharCode(0xE0 | (c >>> 12));
            bytesLeft = 2;
        } else {
            ret += String.fromCharCode(0xF0 | (c >>> 18));
            bytesLeft = 3;
        }
        while (bytesLeft > 0) {
            bytesLeft--;
            ret += String.fromCharCode(0x80 | ((c >>> (6 * bytesLeft)) & 0x3F));
        }
    }
    return ret;
};

Terminal.prototype.writeUTF8 = function (str) {
    this.write(this.decodeUTF8(str));
};
