'use strict';
const globals = require('globals');
const gtsConfig = require('gts/build/eslint.config.js');

module.exports = [
    ...gtsConfig,
    {
        ignores: ['dist/'],
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parserOptions: {
                ecmaVersion: 2018,
                sourceType: 'module',
                project: './tsconfig.json',
                tsconfigRootDir: __dirname,
                jsxPragma: 'h',
            },
        },
        rules: {
            '@typescript-eslint/no-duplicate-enum-values': 'off',
        },
    },
    {
        files: ['gulpfile.js', 'webpack.config.js', 'eslint.config.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: globals.node,
        },
        rules: {
            'n/no-unpublished-require': 'off',
        },
    },
];
