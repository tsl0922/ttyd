const merge = require('webpack-merge');
const config = require('./webpack.config.js');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackInlineSourcePlugin = require('html-webpack-inline-source-plugin');

module.exports = merge(config, {
    mode: 'production',
    plugins: [
        new HtmlWebpackPlugin({
            inlineSource: '.(js|css)$',
            template: 'index.html',
        }),
        new HtmlWebpackInlineSourcePlugin(),
    ]
});
