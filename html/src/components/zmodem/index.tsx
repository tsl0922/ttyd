import { bind } from 'decko';
import { Component, h } from 'preact';
import { ITerminalAddon, Terminal } from 'xterm';
import * as Zmodem from 'zmodem.js/src/zmodem_browser';

import { Modal } from '../modal';

interface Props {
    sender: (data: ArrayLike<number>) => void;
}

interface State {
    modal: boolean;
}

export class ZmodemAddon extends Component<Props, State> implements ITerminalAddon {
    private terminal: Terminal | undefined;
    private sentry: Zmodem.Sentry;
    private session: Zmodem.Session;

    constructor(props) {
        super(props);

        this.sentry = new Zmodem.Sentry({
            to_terminal: (octets: ArrayBuffer) => this.zmodemWrite(octets),
            sender: (octets: ArrayLike<number>) => this.zmodemSend(octets),
            on_retract: () => this.zmodemRetract(),
            on_detect: (detection: any) => this.zmodemDetect(detection),
        });
    }

    render(_, { modal }: State) {
        return (
            <Modal show={modal}>
                <label class="file-label">
                    <input onChange={this.sendFile} class="file-input" type="file" multiple />
                    <span class="file-cta">
                        <strong>Choose files…</strong>
                    </span>
                </label>
            </Modal>
        );
    }

    activate(terminal: Terminal): void {
        this.terminal = terminal;
    }

    dispose(): void {}

    consume(data: ArrayBuffer) {
        const { sentry, terminal } = this;
        try {
            sentry.consume(data);
        } catch (e) {
            console.log(`[ttyd] zmodem consume: `, e);
            terminal.setOption('disableStdin', false);
        }
    }

    @bind
    private zmodemWrite(data: ArrayBuffer): void {
        this.terminal.writeUtf8(new Uint8Array(data));
    }

    @bind
    private zmodemSend(data: ArrayLike<number>): void {
        this.props.sender(data);
    }

    @bind
    private zmodemRetract(): void {
        this.terminal.setOption('disableStdin', false);
    }

    @bind
    private zmodemDetect(detection: Zmodem.Detection): void {
        const { terminal, receiveFile } = this;
        terminal.setOption('disableStdin', true);
        this.session = detection.confirm();

        if (this.session.type === 'send') {
            this.setState({ modal: true });
        } else {
            receiveFile();
        }
    }

    @bind
    private sendFile(event: Event) {
        this.setState({ modal: false });

        const { terminal, session, writeProgress } = this;
        const files: FileList = (event.target as HTMLInputElement).files;

        Zmodem.Browser.send_files(session, files, {
            on_progress: (_, xfer: any) => writeProgress(xfer),
        })
            .then(() => {
                session.close();
                terminal.setOption('disableStdin', false);
            })
            .catch(e => {
                console.log(`[ttyd] zmodem send: `, e);
            });
    }

    @bind
    private receiveFile() {
        const { terminal, session, writeProgress } = this;

        session.on('offer', (xfer: any) => {
            const fileBuffer = [];
            xfer.on('input', payload => {
                writeProgress(xfer);
                fileBuffer.push(new Uint8Array(payload));
            });
            xfer.accept().then(() => {
                Zmodem.Browser.save_to_disk(fileBuffer, xfer.get_details().name);
            });
        });

        session.on('session_end', () => {
            terminal.setOption('disableStdin', false);
        });

        session.start();
    }

    @bind
    private writeProgress(xfer: any) {
        const { terminal, bytesHuman } = this;

        const file = xfer.get_details();
        const name = file.name;
        const size = file.size;
        const offset = xfer.get_offset();
        const percent = ((100 * offset) / size).toFixed(2);

        terminal.write(`${name} ${percent}% ${bytesHuman(offset, 2)}/${bytesHuman(size, 2)}\r`);
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
