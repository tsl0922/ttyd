const { src, dest, task, series } = require("gulp");
const clean = require('gulp-clean');
const gzip = require('gulp-gzip');
const inlineSource = require('gulp-inline-source');
const rename = require("gulp-rename");
const through2 = require('through2');

const genHeader = (size, buf, len) => {
    let idx = 0;
    let data = "unsigned char index_html[] = {\n  ";

    for (const value of buf) {
        idx++;

        let current = value < 0 ? value + 256 : value;

        data += "0x";
        data += (current >>> 4).toString(16);
        data += (current & 0xF).toString(16);

        if (idx === len) {
            data += "\n";
        } else {
            data += idx % 12 === 0 ? ",\n  " : ", ";
        }
    }

    data += "};\n";
    data += `unsigned int index_html_len = ${len};\n`;
    data += `unsigned int index_html_size = ${size};\n`;
    return data;
};
let fileSize = 0;

task('clean', () => {
    return src('dist', { read: false, allowEmpty: true })
        .pipe(clean());
});

const insertImageWorker = (content) => {
    const SENTINEL = '#IMAGEWORKER_PLACEHOLDER#';
    const idx = content.indexOf(SENTINEL);
    const worker = require('fs').readFileSync('node_modules/xterm-addon-image/lib/xterm-addon-image-worker.js', {encoding: 'utf8'});
    /**
     * hacky strip + cat insert of worker code:
     * - strip first and last line from worker, assuming it was packed into 3 lines - comment, code, sourcemap_comment
     * - insert with single quote string markers, assuming worker code got cleaned of those and will not clash
     *
     * Well, the current bundling of the worker kinda guarantees the assumed structure above, but this might not be the case
     * for later versions anymore. A safer but more involved approach would extract the active code parts with a parser and
     * identify+escape string marker clashes.
     */
    return [
        content.slice(0, idx - 1),
        "'", worker.split('\n')[1], "'",
        content.slice(idx + SENTINEL.length + 1)
    ].join('');
};

task('inline', () => {
    return src('dist/index.html')
        .pipe(inlineSource())
	.pipe(through2.obj((file, enc, cb) => {
            file.contents = Buffer.from(insertImageWorker(file.contents.toString()));
            return cb(null, file);
        }))
        .pipe(rename("inline.html"))
        .pipe(dest('dist/'));
});

task('default', series('inline', () => {
    return src('dist/inline.html')
        .pipe(through2.obj((file, enc, cb) => {
            fileSize = file.contents.length;
            return cb(null, file);
        }))
        .pipe(gzip())
        .pipe(through2.obj((file, enc, cb) => {
            const buf = file.contents;
            file.contents = Buffer.from(genHeader(fileSize, buf, buf.length));
            return cb(null, file);
        }))
        .pipe(rename("html.h"))
        .pipe(dest('../src/'));
}));

