import { bind } from 'decko';
import { h, Component } from 'preact';
import { saveAs } from 'file-saver';
import { IDisposable, ITerminalAddon, Terminal } from 'xterm';
import * as Zmodem from 'zmodem.js/src/zmodem_browser';
import { TrzszFilter } from 'trzsz';

import { Modal } from '../modal';

interface Props {
    zmodem: boolean;
    trzsz: boolean;
    callback: (addon: ZmodemAddon) => void;
    sender: (data: string | Uint8Array) => void;
    writer: (data: string | Uint8Array) => void;
}

interface State {
    modal: boolean;
}

export class ZmodemAddon extends Component<Props, State> implements ITerminalAddon {
    private terminal: Terminal;
    private disposables: IDisposable[] = [];
    private sentry: Zmodem.Sentry;
    private session: Zmodem.Session;
    private denier: () => void;
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

    componentWillUnmount() {
        this.dispose();
    }

    activate(terminal: Terminal) {
        this.terminal = terminal;
        if (this.props.zmodem) this.zmodemInit();
        if (this.props.trzsz) this.trzszInit();
    }

    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    consume(data: ArrayBuffer) {
        try {
            if (this.props.trzsz) {
                this.trzszFilter.processServerOutput(data);
            } else {
                this.sentry.consume(data);
            }
        } catch (e) {
            this.handleError(e, 'consume');
        }
    }

    private reset() {
        this.terminal.options.disableStdin = false;
        this.terminal.focus();
    }

    @bind
    private handleError(e: any, reason: string) {
        console.error(`[ttyd] zmodem ${reason}: `, e);
        this.reset();
    }

    @bind
    private trzszInit() {
        const { writer, sender, zmodem } = this.props;
        const { terminal } = this;
        this.trzszFilter = new TrzszFilter({
            writeToTerminal: data => {
                if (!this.trzszFilter.isTransferringFiles() && zmodem) {
                    this.sentry.consume(data);
                } else {
                    writer(typeof data === 'string' ? data : new Uint8Array(data as ArrayBuffer));
                }
            },
            sendToServer: data => sender(data),
            terminalColumns: terminal.cols,
        });
        this.disposables.push(terminal.onResize(size => this.trzszFilter.setTerminalColumns(size.cols)));
    }

    @bind
    private zmodemInit() {
        const { writer, sender } = this.props;
        const { terminal, reset, zmodemDetect } = this;
        this.session = null;
        this.sentry = new Zmodem.Sentry({
            to_terminal: octets => writer(new Uint8Array(octets)),
            sender: octets => sender(new Uint8Array(octets)),
            on_retract: () => reset(),
            on_detect: detection => zmodemDetect(detection),
        });
        this.disposables.push(
            terminal.onKey(e => {
                const event = e.domEvent;
                if (event.ctrlKey && event.key === 'c') {
                    if (this.denier) this.denier();
                }
            })
        );
    }

    @bind
    private zmodemDetect(detection: Zmodem.Detection): void {
        const { terminal, receiveFile, reset } = this;
        terminal.options.disableStdin = true;

        this.denier = () => detection.deny();
        this.session = detection.confirm();
        this.session.on('session_end', () => reset());

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
        const files = (event.target as HTMLInputElement).files;

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
            offer.on('input', () => writeProgress(offer));
            offer
                .accept()
                .then(payloads => {
                    const blob = new Blob(payloads, { type: 'application/octet-stream' });
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
