const merge = require('webpack-merge');
const convert = require('koa-connect');
const proxy = require('http-proxy-middleware');
const config = require('./webpack.config.js');

const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = merge(config, {
    mode: 'development',
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html',
        }),
    ],
    serve: {
        content: __dirname + '/dist',
        add: (app, middleware, options) => {
            var ttydProxy = proxy(
                [
                    '/ws',
                    '/auth_token.js',
                ],
                {
                    target: 'http://127.0.0.1:7681',
                    ws: true,
                }
            );
            app.use(convert(ttydProxy));
        },
    }
});
