const { src, dest, task } = require("gulp");
const clean = require('gulp-clean');
const inlinesource = require('gulp-inline-source');

task('clean', () => {
    return src('dist', {read: false, allowEmpty: true})
        .pipe(clean());
});

task('default', () => {
    return src('dist/index.html')
        .pipe(inlinesource())
        .pipe(dest('../src/'));
});
