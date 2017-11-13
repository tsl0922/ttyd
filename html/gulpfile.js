var gulp = require('gulp'),
    inlinesource = require('gulp-inline-source');

gulp.task('inlinesource', function () {
    return gulp.src('*.html')
        .pipe(inlinesource())
        .pipe(gulp.dest('../src'));
});

gulp.task('default', ['inlinesource']);