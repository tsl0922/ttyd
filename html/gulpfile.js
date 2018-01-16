const gulp = require('gulp'),
    inlinesource = require('gulp-inline-source'),
    webpack = require('webpack-stream');

gulp.task('webpack', function() {
    return gulp.src([
            'js/app.js',
            'sass/app.scss'
        ])
        .pipe(webpack(require('./webpack.config.js')))
        .pipe(gulp.dest('dist/'));
});

gulp.task('inlinesource', ['webpack'], function () {
    return gulp.src('index.html')
        .pipe(inlinesource())
        .pipe(gulp.dest('../src/'));
});

gulp.task('default', ['inlinesource']);