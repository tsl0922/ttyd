/**
 * Function that mutates original webpack config.
 * Supports asynchronous changes when promise is returned.
 *
 * @param {object} config - original webpack config.
 * @param {object} env - options passed to CLI.
 * @param {WebpackConfigHelpers} helpers - object with useful helpers when working with config.
 **/
export default function (config, env, helpers) {
	const { devServer, plugins } = config;
	if (devServer) {
		devServer.proxy = {
			'/ws': {
				target: 'ws://127.0.0.1:7681',
				ws: true
			},
		};
	}
}