const path = require('path');
const merge = require('webpack-merge');
const config = require('./webpack.config.js');

const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = merge(config, {
    mode: 'development',
    devServer: {
        contentBase: path.join(__dirname, 'dist'),
        compress: true,
        port: 9000,
        proxy: [{
            context: ['/auth_token.js', '/ws'],
            target: 'http://localhost:7681',
            ws: true
        }]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html'
        })
    ]
});
