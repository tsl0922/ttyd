import { bind } from 'decko';
import { Component, h } from 'preact';
import { ITerminalOptions, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import * as Zmodem from 'zmodem.js/src/zmodem_browser';

import { OverlayAddon } from './overlay';
import { Modal } from '../modal';

import 'xterm/dist/xterm.css';

export interface WindowExtended extends Window {
  term: Terminal;
  tty_auth_token?: string;
}
declare let window: WindowExtended;

const enum Command {
  // server side
  OUTPUT = '0',
  SET_WINDOW_TITLE = '1',
  SET_PREFERENCES = '2',
  SET_RECONNECT = '3',

  // client side
  INPUT = '0',
  RESIZE_TERMINAL = '1',
}

interface Props {
  id: string;
  url: string;
  options: ITerminalOptions;
}

interface State {
  modal: boolean;
}

export class Xterm extends Component<Props, State> {
  private textEncoder: TextEncoder;
  private textDecoder: TextDecoder;
  private container: HTMLElement;
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private overlayAddon: OverlayAddon;
  private socket: WebSocket;
  private title: string;
  private autoReconnect: number;
  private resizeTimeout: number;
  private sentry: Zmodem.Sentry;
  private session: Zmodem.Session;

  constructor(props) {
    super(props);

    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder();
    this.fitAddon = new FitAddon();
    this.overlayAddon = new OverlayAddon();
    this.sentry = new Zmodem.Sentry({
      to_terminal: (octets: ArrayBuffer) => this.zmodemWrite(octets),
      sender: (octets: number[]) => this.zmodemSend(octets),
      on_retract: () => {},
      on_detect: (detection: any) => this.zmodemDetect(detection),
    });
  }

  componentDidMount() {
    this.openTerminal();
  }

  componentWillUnmount() {
    this.socket.close();
    this.terminal.dispose();

    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('beforeunload', this.onWindowUnload);
  }

  render({ id }: Props, { modal }: State) {
    return (
      <div id={id} ref={c => (this.container = c)}>
        <Modal show={modal}>
          <label class="file-label">
            <input
              onChange={this.sendFile}
              class="file-input"
              type="file"
              multiple
            />
            <span class="file-cta">
              <strong>Choose files…</strong>
            </span>
          </label>
        </Modal>
      </div>
    );
  }

  @bind
  private zmodemWrite(data: ArrayBuffer): void {
    const { terminal } = this;
    terminal.writeUtf8(new Uint8Array(data));
  }

  @bind
  private zmodemSend(data: number[]): void {
    const { socket } = this;
    const buffer = new Uint8Array(data.length + 1);
    buffer[0] = Command.INPUT.charCodeAt(0);
    buffer.set(data, 1);
    socket.send(buffer);
  }

  @bind
  private zmodemDetect(detection: any): void {
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
    if (files.length === 0) {
      session.close();
      terminal.setOption('disableStdin', false);
      return;
    }

    Zmodem.Browser.send_files(session, files, {
      on_progress: (_, xfer) => writeProgress(xfer),
      on_file_complete: () => {},
    }).then(() => {
      session.close();
      terminal.setOption('disableStdin', false);
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
        terminal.setOption('disableStdin', false);
      });
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

    terminal.write(
      `${name} ${percent}% ${bytesHuman(offset, 2)}/${bytesHuman(size, 2)}\r`
    );
  }

  @bind
  private onWindowResize() {
    const { fitAddon } = this;
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => fitAddon.fit(), 250) as any;
  }

  private onWindowUnload(event: BeforeUnloadEvent): string {
    const message = 'Close terminal? this will also terminate the command.';
    event.returnValue = message;
    return message;
  }

  @bind
  private openTerminal() {
    if (this.terminal) {
      this.terminal.dispose();
    }

    this.socket = new WebSocket(this.props.url, ['tty']);
    this.terminal = new Terminal(this.props.options);
    const { socket, terminal, container, fitAddon, overlayAddon } = this;
    window.term = terminal;

    socket.binaryType = 'arraybuffer';
    socket.onopen = this.onSocketOpen;
    socket.onmessage = this.onSocketData;
    socket.onclose = this.onSocketClose;

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(overlayAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.onTitleChange(data => {
      if (data && data !== '') {
        document.title = data + ' | ' + this.title;
      }
    });
    terminal.onData(this.onTerminalData);
    terminal.onResize(this.onTerminalResize);
    if (
      document.queryCommandSupported &&
      document.queryCommandSupported('copy')
    ) {
      terminal.onSelectionChange(() => {
        overlayAddon.showOverlay('\u2702', 200);
        document.execCommand('copy');
      });
    }
    terminal.open(container);
    terminal.focus();

    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('beforeunload', this.onWindowUnload);
  }

  @bind
  private onSocketOpen() {
    console.log('[ttyd] Websocket connection opened');
    const { socket, textEncoder, fitAddon } = this;
    const authToken = window.tty_auth_token;

    socket.send(textEncoder.encode(JSON.stringify({ AuthToken: authToken })));
    fitAddon.fit();
  }

  @bind
  private onSocketClose(event: CloseEvent) {
    console.log(`[ttyd] websocket connection closed with code: ${event.code}`);

    const { overlayAddon, openTerminal, autoReconnect } = this;
    overlayAddon.showOverlay('Connection Closed', null);
    window.removeEventListener('beforeunload', this.onWindowUnload);

    // 1008: POLICY_VIOLATION - Auth failure
    if (event.code === 1008) {
      window.location.reload();
    }
    // 1000: CLOSE_NORMAL
    if (event.code !== 1000 && autoReconnect > 0) {
      setTimeout(openTerminal, autoReconnect * 1000);
    }
  }

  @bind
  private onSocketData(event: MessageEvent) {
    const { terminal, textDecoder, socket, openTerminal } = this;
    const rawData = event.data as ArrayBuffer;
    const cmd = String.fromCharCode(new Uint8Array(rawData)[0]);
    const data = rawData.slice(1);

    switch (cmd) {
      case Command.OUTPUT:
        try {
          this.sentry.consume(data);
        } catch (e) {
          console.log(`[ttyd] zmodem consume: `, e);
          socket.close();
          setTimeout(() => openTerminal(), 500);
        }
        break;
      case Command.SET_WINDOW_TITLE:
        this.title = textDecoder.decode(data);
        document.title = this.title;
        break;
      case Command.SET_PREFERENCES:
        const preferences = JSON.parse(textDecoder.decode(data));
        Object.keys(preferences).forEach(key => {
          console.log(`[ttyd] setting ${key}: ${preferences[key]}`);
          terminal.setOption(key, preferences[key]);
        });
        break;
      case Command.SET_RECONNECT:
        this.autoReconnect = Number(textDecoder.decode(data));
        console.log(`[ttyd] enabling reconnect: ${this.autoReconnect} seconds`);
        break;
      default:
        console.warn(`[ttyd] unknown command: ${cmd}`);
        break;
    }
  }

  @bind
  private onTerminalResize(size: { cols: number; rows: number }) {
    const { overlayAddon, socket, textEncoder } = this;
    if (socket.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ columns: size.cols, rows: size.rows });
      socket.send(textEncoder.encode(Command.RESIZE_TERMINAL + msg));
    }
    setTimeout(() => {
      overlayAddon.showOverlay(`${size.cols}x${size.rows}`);
    }, 500);
  }

  @bind
  private onTerminalData(data: string) {
    const { socket, textEncoder } = this;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(textEncoder.encode(Command.INPUT + data));
    }
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
