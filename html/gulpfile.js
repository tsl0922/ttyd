const gulp = require('gulp'),
    clean = require('gulp-clean'),
    inlinesource = require('gulp-inline-source');

gulp.task('clean', function () {
    return gulp.src('dist', {read: false})
        .pipe(clean());
});

gulp.task('inlinesource', function () {
    return gulp.src('dist/index.html')
        .pipe(inlinesource())
        .pipe(gulp.dest('../src/'));
});

gulp.task('default', ['inlinesource']);