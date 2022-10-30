import { bind } from 'decko';
import { h, Component } from 'preact';
import { saveAs } from 'file-saver';
import { IDisposable, ITerminalAddon, Terminal } from 'xterm';
import * as Zmodem from 'zmodem.js/src/zmodem_browser';
import { TrzszFilter } from 'trzsz';

import { Modal } from '../modal';

interface Props {
    callback: (addon: ZmodemAddon) => void;
    sender: (data: string | Uint8Array) => void;
    writer: (data: string | Uint8Array) => void;
}

interface State {
    modal: boolean;
}

export class ZmodemAddon extends Component<Props, State> implements ITerminalAddon {
    private terminal: Terminal | undefined;
    private keyDispose: IDisposable | undefined;
    private sentry: Zmodem.Sentry;
    private session: Zmodem.Session;
    private trzszFilter: TrzszFilter;

    constructor(props: Props) {
        super(props);
    }

    render(_: Props, { modal }: State) {
        return (
            <Modal show={modal}>
                <label class="file-label">
                    <input onChange={this.sendFile} class="file-input" type="file" multiple />
                    <span class="file-cta">Choose files…</span>
                </label>
            </Modal>
        );
    }

    componentDidMount() {
        this.props.callback(this);
    }

    activate(terminal: Terminal): void {
        this.terminal = terminal;
        this.zmodemInit();
        this.trzszInit();
    }

    dispose(): void {}

    consume(data: ArrayBuffer) {
        try {
            this.trzszFilter.processServerOutput(data);
        } catch (e) {
            this.handleError(e, 'consume');
        }
    }

    @bind
    private handleError(e: Error, reason: string) {
        console.error(`[ttyd] zmodem ${reason}: `, e);
        this.zmodemReset();
    }

    @bind
    private trzszInit() {
        this.trzszFilter = new TrzszFilter({
            writeToTerminal: data => this.trzszWrite(data),
            sendToServer: data => this.trzszSend(data),
            terminalColumns: this.terminal.cols,
        });
        this.terminal.onResize(size => this.trzszFilter.setTerminalColumns(size.cols));
    }

    @bind
    private trzszWrite(data: string | ArrayBuffer | Uint8Array | Blob) {
        if (this.trzszFilter.isTransferringFiles()) {
            this.props.writer(data as string);
        } else {
            this.sentry.consume(data as ArrayBuffer);
        }
    }

    @bind
    private trzszSend(data: string | Uint8Array) {
        this.props.sender(data);
    }

    @bind
    private zmodemInit() {
        this.session = null;
        this.sentry = new Zmodem.Sentry({
            to_terminal: octets => this.zmodemWrite(octets),
            sender: octets => this.zmodemSend(octets),
            on_retract: () => this.zmodemReset(),
            on_detect: detection => this.zmodemDetect(detection),
        });
    }

    @bind
    private zmodemReset() {
        this.terminal.options.disableStdin = false;

        if (this.keyDispose) {
            this.keyDispose.dispose();
            this.keyDispose = null;
        }
        this.zmodemInit();

        this.terminal.focus();
    }

    @bind
    private zmodemWrite(data: ArrayBuffer): void {
        this.props.writer(new Uint8Array(data));
    }

    @bind
    private zmodemSend(data: ArrayLike<number>): void {
        this.props.sender(new Uint8Array(data));
    }

    @bind
    private zmodemDetect(detection: Zmodem.Detection): void {
        const { terminal, receiveFile, zmodemReset } = this;
        terminal.options.disableStdin = true;

        this.keyDispose = terminal.onKey(e => {
            const event = e.domEvent;
            if (event.ctrlKey && event.key === 'c') {
                detection.deny();
            }
        });

        this.session = detection.confirm();
        this.session.on('session_end', zmodemReset);

        if (this.session.type === 'send') {
            this.setState({ modal: true });
        } else {
            receiveFile();
        }
    }

    @bind
    private sendFile(event: Event) {
        this.setState({ modal: false });

        const { session, writeProgress, handleError } = this;
        const files: FileList = (event.target as HTMLInputElement).files;

        Zmodem.Browser.send_files(session, files, {
            on_progress: (_, offer) => writeProgress(offer),
        })
            .then(() => session.close())
            .catch(e => handleError(e, 'send'));
    }

    @bind
    private receiveFile() {
        const { session, writeProgress, handleError } = this;

        session.on('offer', offer => {
            const fileBuffer = [];
            offer.on('input', payload => {
                writeProgress(offer);
                fileBuffer.push(new Uint8Array(payload));
            });
            offer
                .accept()
                .then(() => {
                    const blob = new Blob(fileBuffer, { type: 'application/octet-stream' });
                    saveAs(blob, offer.get_details().name);
                })
                .catch(e => handleError(e, 'receive'));
        });

        session.start();
    }

    @bind
    private writeProgress(offer: Zmodem.Offer) {
        const { bytesHuman } = this;
        const file = offer.get_details();
        const name = file.name;
        const size = file.size;
        const offset = offer.get_offset();
        const percent = ((100 * offset) / size).toFixed(2);

        this.props.writer(`${name} ${percent}% ${bytesHuman(offset, 2)}/${bytesHuman(size, 2)}\r`);
    }

    private bytesHuman(bytes: any, precision: number): string {
        if (!/^([-+])?|(\.\d+)(\d+(\.\d+)?|(\d+\.)|Infinity)$/.test(bytes)) {
            return '-';
        }
        if (bytes === 0) return '0';
        if (typeof precision === 'undefined') precision = 1;
        const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const num = Math.floor(Math.log(bytes) / Math.log(1024));
        const value = (bytes / Math.pow(1024, Math.floor(num))).toFixed(precision);
        return `${value} ${units[num]}`;
    }
}
