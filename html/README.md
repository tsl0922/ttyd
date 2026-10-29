## Prerequisites

Node.js 18.20 or newer and Yarn 3 are required. Enable [Corepack](https://yarnpkg.com/getting-started/install), then run `yarn install`.

## Development

1. Start ttyd: `ttyd bash`
2. Start the dev server: `yarn run start`

## Publish

Run `yarn run build`, this will compile the inlined html to `../src/html.h`.

## Tests

Build the frontend, install Chromium once, and run the browser integration tests:

```bash
yarn run build
yarn playwright install chromium
yarn run test
```

To use an existing Chromium installation instead, set `CHROMIUM_EXECUTABLE_PATH` when running the tests.
