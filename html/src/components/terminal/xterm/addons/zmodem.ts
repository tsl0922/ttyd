import { bind } from 'decko';
import { saveAs } from 'file-saver';
import { IDisposable, ITerminalAddon, Terminal } from '@xterm/xterm';
import * as Zmodem from 'zmodem.js/src/zmodem_browser';
import { TrzszFilter } from 'trzsz';

export interface ZmodeOptions {
    zmodem: boolean;
    trzsz: boolean;
    windows: boolean;
    trzszDragInitTimeout: number;
    onSend: () => void;
    sender: (data: string | Uint8Array) => void;
    writer: (data: string | Uint8Array) => void;
}

export class ZmodemAddon implements ITerminalAddon {
    private disposables: IDisposable[] = [];
    private terminal: Terminal;
    private sentry: Zmodem.Sentry;
    private session: Zmodem.Session;
    private denier: () => void;
    private trzszFilter: TrzszFilter;

    constructor(private options: ZmodeOptions) {}

    activate(terminal: Terminal) {
        this.terminal = terminal;
        if (this.options.zmodem) this.zmodemInit();
        if (this.options.trzsz) this.trzszInit();
    }

    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    consume(data: ArrayBuffer) {
        try {
            if (this.options.trzsz) {
                this.trzszFilter.processServerOutput(data);
            } else {
                this.sentry.consume(data);
            }
        } catch (e) {
            console.error('[ttyd] zmodem consume: ', e);
            this.reset();
        }
    }

    @bind
    private reset() {
        this.terminal.options.disableStdin = false;
        this.terminal.focus();
    }

    private addDisposableListener(target: EventTarget, type: string, listener: EventListener) {
        target.addEventListener(type, listener);
        this.disposables.push({ dispose: () => target.removeEventListener(type, listener) });
    }

    @bind
    private trzszInit() {
        const { terminal } = this;
        const { sender, writer, zmodem } = this.options;
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
            isWindowsShell: this.options.windows,
            dragInitTimeout: this.options.trzszDragInitTimeout,
        });
        const element = terminal.element as EventTarget;
        this.addDisposableListener(element, 'dragover', event => event.preventDefault());
        this.addDisposableListener(element, 'drop', event => {
            event.preventDefault();
            this.trzszFilter
                .uploadFiles((event as DragEvent).dataTransfer?.items as DataTransferItemList)
                .then(() => console.log('[ttyd] upload success'))
                .catch(err => console.log('[ttyd] upload failed: ' + err));
        });
        this.disposables.push(terminal.onResize(size => this.trzszFilter.setTerminalColumns(size.cols)));
    }

    @bind
    private zmodemInit() {
        const { sender, writer } = this.options;
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
        const { terminal, receiveFile } = this;
        terminal.options.disableStdin = true;

        this.denier = () => detection.deny();
        this.session = detection.confirm();
        this.session.on('session_end', () => this.reset());

        if (this.session.type === 'send') {
            this.options.onSend();
        } else {
            receiveFile();
        }
    }

    @bind
    public sendFile(files: FileList) {
        const { session, writeProgress } = this;
        Zmodem.Browser.send_files(session, files, {
            on_progress: (_, offer) => writeProgress(offer),
        })
            .then(() => session.close())
            .catch(() => this.reset());
    }

    @bind
    private receiveFile() {
        const { session, writeProgress } = this;

        session.on('offer', offer => {
            offer.on('input', () => writeProgress(offer));
            offer
                .accept()
                .then(payloads => {
                    const blob = new Blob(payloads, { type: 'application/octet-stream' });
                    saveAs(blob, offer.get_details().name);
                })
                .catch(() => this.reset());
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

        this.options.writer(`${name} ${percent}% ${bytesHuman(offset, 2)}/${bytesHuman(size, 2)}\r`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
