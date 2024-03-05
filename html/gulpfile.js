const { src, dest, task, series } = require('gulp');
const clean = require('gulp-clean');
const gzip = require('gulp-gzip');
const inlineSource = require('gulp-inline-source');
const rename = require('gulp-rename');
const through2 = require('through2');

const genHeader = (size, buf, len) => {
    let idx = 0;
    let data = 'unsigned char index_html[] = {\n  ';

    for (const value of buf) {
        idx++;

        const current = value < 0 ? value + 256 : value;

        data += '0x';
        data += (current >>> 4).toString(16);
        data += (current & 0xf).toString(16);

        if (idx === len) {
            data += '\n';
        } else {
            data += idx % 12 === 0 ? ',\n  ' : ', ';
        }
    }

    data += '};\n';
    data += `unsigned int index_html_len = ${len};\n`;
    data += `unsigned int index_html_size = ${size};\n`;
    return data;
};
let fileSize = 0;

task('clean', () => {
    return src('dist', { read: false, allowEmpty: true }).pipe(clean());
});

task('inline', () => {
    const options = {
        compress: false,
    };

    return src('dist/index.html').pipe(inlineSource(options)).pipe(rename('inline.html')).pipe(dest('dist/'));
});

task(
    'default',
    series('inline', () => {
        return src('dist/inline.html')
            .pipe(
                through2.obj((file, enc, cb) => {
                    fileSize = file.contents.length;
                    return cb(null, file);
                })
            )
            .pipe(gzip())
            .pipe(
                through2.obj((file, enc, cb) => {
                    const buf = file.contents;
                    file.contents = Buffer.from(genHeader(fileSize, buf, buf.length));
                    return cb(null, file);
                })
            )
            .pipe(rename('html.h'))
            .pipe(dest('../src/'));
    })
);
