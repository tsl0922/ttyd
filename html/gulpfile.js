var gulp = require('gulp'),
    fs = require("fs"),
    browserify = require('browserify'),
    inlinesource = require('gulp-inline-source');

gulp.task('browserify', function () {
    return browserify('./js/app.js')
        .transform("babelify", {
            presets: ["env"],
            global: true,
            ignore: /\/node_modules\/(?!zmodem.js\/)/
        })
        .bundle()
        .pipe(fs.createWriteStream("./js/bundle.js"));
});

gulp.task('inlinesource', ['browserify'], function () {
    return gulp.src('index.html')
        .pipe(inlinesource())
        .pipe(gulp.dest('../src'));
});

gulp.task('default', ['inlinesource']);