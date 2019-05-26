const { src, dest, task } = require("gulp");
const clean = require('gulp-clean');
const inlinesource = require('gulp-inline-source');

task('clean', () => {
    return src('build', {read: false, allowEmpty: true})
        .pipe(clean());
});

task('default', () => {
    return src('build/index.html')
        .pipe(inlinesource())
        .pipe(dest('../src/'));
});
