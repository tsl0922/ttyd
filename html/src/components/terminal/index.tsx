import { bind } from 'decko';
import { Component, h } from 'preact';
import { Xterm, XtermOptions } from './xterm';

import '@xterm/xterm/css/xterm.css';
import { Modal } from '../modal';

interface Props extends XtermOptions {
    id: string;
}

interface State {
    modal: boolean;
    ctrlActive: boolean;
}

export class Terminal extends Component<Props, State> {
    private container: HTMLElement;
    private xterm: Xterm;

    constructor(props: Props) {
        super();
        this.xterm = new Xterm(props, this.showModal);
    }

    async componentDidMount() {
        await this.xterm.refreshToken();
        this.xterm.open(this.container);
        this.xterm.connect();
    }

    componentWillUnmount() {
        this.xterm.dispose();
    }

    render({ id }: Props, { modal, ctrlActive }: State) {
        return (
            <div id={id} class="terminal-wrapper">
                <div class="toolbar">
                    <button class={`toolbar-btn ${ctrlActive ? 'active' : ''}`} onMouseDown={this.onCtrl}>
                        Ctrl
                    </button>
                    <button class="toolbar-btn" onMouseDown={this.onEsc}>
                        Esc
                    </button>
                    <button class="toolbar-btn" onMouseDown={this.onArrowUp}>
                        ↑
                    </button>
                    <button class="toolbar-btn" onMouseDown={this.onArrowDown}>
                        ↓
                    </button>
                    <button class="toolbar-btn" onMouseDown={this.onArrowLeft}>
                        ←
                    </button>
                    <button class="toolbar-btn" onMouseDown={this.onArrowRight}>
                        →
                    </button>
                </div>
                <div class="terminal-main" ref={c => { this.container = c as HTMLElement; }}>
                    <Modal show={modal}>
                        <label class="file-label">
                            <input onChange={this.sendFile} class="file-input" type="file" multiple />
                            <span class="file-cta">Choose files…</span>
                        </label>
                    </Modal>
                </div>
            </div>
        );
    }

    @bind
    showModal() {
        this.setState({ modal: true });
    }

    @bind
    sendFile(event: Event) {
        this.setState({ modal: false });
        const files = (event.target as HTMLInputElement).files;
        if (files) this.xterm.sendFile(files);
    }

    @bind
    onEsc(event: Event) {
        event.preventDefault();
        this.xterm.sendEscape();
    }

    @bind
    onCtrl(event: Event) {
        event.preventDefault();
        const { ctrlActive } = this.state;
        if (ctrlActive) {
            this.xterm.disableCtrlMode();
            this.setState({ ctrlActive: false });
        } else {
            this.xterm.enableCtrlMode(() => this.setState({ ctrlActive: false }));
            this.setState({ ctrlActive: true });
        }
    }

    @bind
    onArrowUp(event: Event) {
        event.preventDefault();
        this.xterm.sendArrowUp();
    }

    @bind
    onArrowDown(event: Event) {
        event.preventDefault();
        this.xterm.sendArrowDown();
    }

    @bind
    onArrowLeft(event: Event) {
        event.preventDefault();
        this.xterm.sendArrowLeft();
    }

    @bind
    onArrowRight(event: Event) {
        event.preventDefault();
        this.xterm.sendArrowRight();
    }
}
