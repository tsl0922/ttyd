import * as Zmodem from 'zmodem.js/src/zmodem_browser';

class Status {
    element: HTMLElement;
    filesRemaining: HTMLElement;
    bytesRemaining: HTMLElement;

    constructor() {
        this.element = document.getElementById('status');
        this.filesRemaining = document.getElementById('files-remaining');
        this.bytesRemaining = document.getElementById('bytes-remaining');
    }
}

class Choose {
    element: HTMLElement;
    files: HTMLInputElement;
    filesNames: HTMLElement;

    constructor() {
        this.element = document.getElementById('choose');
        this.files = <HTMLInputElement>document.getElementById('files');
        this.filesNames = document.getElementById('file-names');
    }
}

class Progress {
    element: HTMLElement;
    fileName: HTMLElement;
    progressBar: HTMLProgressElement;
    bytesReceived: HTMLElement;
    bytesFile: HTMLElement;
    percentReceived: HTMLElement;
    skip: HTMLLinkElement;

    constructor() {
        this.element = document.getElementById('progress');
        this.fileName = document.getElementById('file-name');
        this.progressBar = <HTMLProgressElement>document.getElementById('progress-bar');
        this.bytesReceived = document.getElementById('bytes-received');
        this.bytesFile = document.getElementById('bytes-file');
        this.percentReceived = document.getElementById('percent-received');
        this.skip = <HTMLLinkElement>document.getElementById('skip');

    }
}

function bytesHuman (bytes: any, precision: number): string {
    if (isNaN(parseFloat(bytes)) || !isFinite(bytes)) return '-';
    if (bytes === 0) return '0';
    if (typeof precision === 'undefined') precision = 1;
    let units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'],
        number = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, Math.floor(number))).toFixed(precision) +  ' ' + units[number];
}

export class Modal {
    element: HTMLElement;
    header: HTMLElement;
    status: Status;
    choose: Choose;
    progress: Progress;

    constructor() {
        this.element = document.getElementById('modal');
        this.header = document.getElementById('header');
        this.status = new Status();
        this.choose = new Choose();
        this.progress = new Progress();
    }

    public reset(title): void {
        this.header.textContent = title;
        this.status.element.style.display = 'none';
        this.choose.element.style.display = 'none';
        this.progress.element.style.display = 'none';
        this.progress.bytesReceived.textContent = '-';
        this.progress.percentReceived.textContent = '-%';
        this.progress.progressBar.textContent = '0%';
        this.progress.progressBar.value = 0;
        this.progress.skip.style.display = 'none';
    }

    public hide(): void {
        this.element.classList.remove('is-active');
    }

    public updateFileInfo(fileInfo): void {
        this.status.element.style.display = '';
        this.choose.element.style.display = 'none';
        this.progress.element.style.display = '';
        this.status.filesRemaining.textContent = fileInfo.files_remaining;
        this.status.bytesRemaining.textContent = bytesHuman(fileInfo.bytes_remaining, 2);
        this.progress.fileName.textContent = fileInfo.name;
    }

    public showReceive(xfer): void {
        this.reset('Receiving files');
        this.updateFileInfo(xfer.get_details());
        this.progress.skip.disabled = false;
        this.progress.skip.onclick = function () {
            (<HTMLLinkElement>this).disabled = true;
            xfer.skip();
        };
        this.progress.skip.style.display = '';
        this.element.classList.add('is-active');
    }

    public showSend(callback): void {
        this.reset('Sending files');
        this.choose.element.style.display = '';
        this.choose.files.disabled = false;
        this.choose.files.value = '';
        this.choose.filesNames.textContent = '';
        let self:Modal = this;
        this.choose.files.onchange = function () {
            (<HTMLInputElement>this).disabled = true;
            let files:FileList = (<HTMLInputElement>this).files;
            let fileNames:string = '';
            for (let i = 0; i < files.length; i++) {
                if (i === 0) {
                    fileNames = files[i].name;
                } else {
                    fileNames += ', ' + files[i].name;
                }
            }
            self.choose.filesNames.textContent = fileNames;
            callback(files);
        };
        this.element.classList.add('is-active');
    }

    public updateProgress(xfer): void {
        let size = xfer.get_details().size;
        let offset = xfer.get_offset();
        this.progress.bytesReceived.textContent = bytesHuman(offset, 2);
        this.progress.bytesFile.textContent = bytesHuman(size, 2);

        let percentReceived = (100 * offset / size).toFixed(2);
        this.progress.percentReceived.textContent = percentReceived + '%';

        this.progress.progressBar.textContent = percentReceived + '%';
        this.progress.progressBar.setAttribute('value', percentReceived);
    }

    public handleSend(zsession): Promise<any> {
        return new Promise((res) => {
            this.showSend((files) => {
                Zmodem.Browser.send_files(
                    zsession,
                    files,
                    {
                        on_progress: (obj, xfer) => {
                            this.updateFileInfo(xfer.get_details());
                            this.updateProgress(xfer);
                        },
                        on_file_complete: (obj) => {
                            // console.log(obj);
                        }
                    }
                ).then(
                    zsession.close.bind(zsession),
                    console.error.bind(console)
                ).then(() => res());
            });
        });
    }

    public handleReceive(zsession): Promise<any> {
        zsession.on('offer', (xfer) => {
            this.showReceive(xfer);
            let fileBuffer = [];
            xfer.on('input', (payload) => {
                this.updateProgress(xfer);
                fileBuffer.push(new Uint8Array(payload));
            });
            xfer.accept().then(() => {
                Zmodem.Browser.save_to_disk(
                    fileBuffer,
                    xfer.get_details().name
                );
            }, console.error.bind(console));
        });
        let promise = new Promise((res) => {
            zsession.on('session_end', () => res());
        });
        zsession.start();
        return promise;
    }
}