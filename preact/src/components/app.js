import { h, Component } from 'preact';

import Terminal from './terminal';

if (module.hot) {
	require('preact/debug');
}

export default class App extends Component {
	render() {
		return (
			<Terminal />
		);
	}
}
