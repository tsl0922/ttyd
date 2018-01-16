const ExtractTextPlugin = require("extract-text-webpack-plugin");

module.exports = {
    output: {
        filename: 'bundle.js'
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules\/(?!zmodem.js\/)/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['env']
            }
          }
        }, {
            test: /\.scss$/,
            use: ExtractTextPlugin.extract({
                use: [{
                    loader: "css-loader"
                }, {
                    loader: "sass-loader"
                }],
                fallback: "style-loader"
            })
        }
      ]
    },
    plugins: [
        new ExtractTextPlugin({
            filename: 'bundle.css',
        })
    ]
}