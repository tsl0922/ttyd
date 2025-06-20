import { bind } from 'decko';
import { IDisposable, ITerminalAddon, Terminal } from '@xterm/xterm';

export interface SpeechOptions {
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    language?: string;
    model?: string;
    maxRecordingTime?: number;
    onStart?: () => void;
    onEnd?: () => void;
    onResult?: (text: string) => void;
    onError?: (error: string) => void;
}

export class SpeechRecognitionAddon implements ITerminalAddon {
    private mediaRecorder?: MediaRecorder;
    private audioStream?: MediaStream;
    private terminal?: Terminal;
    private isRecording = false;
    private disposables: IDisposable[] = [];
    private options: SpeechOptions;
    private audioChunks: Blob[] = [];
    private buttonElement?: HTMLElement;
    private statusUpdateInterval?: NodeJS.Timeout;

    constructor(options: SpeechOptions = {}) {
        this.options = {
            language: 'en',
            model: 'whisper-1',
            maxRecordingTime: 60000, // 60 seconds
            openaiBaseUrl: 'https://api.openai.com/v1',
            ...options,
        };
    }

    public activate(terminal: Terminal): void {
        this.terminal = terminal;
        this.createButton();
        this.startStatusUpdates();
    }

    public dispose(): void {
        this.stop();
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
        this.cleanupAudioStream();
        this.removeButton();
        this.stopStatusUpdates();
        this.terminal = undefined;
    }

    public isSupported(): boolean {
        return !!(
            navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === 'function' &&
            window.MediaRecorder
        );
    }

    @bind
    public async start(): Promise<void> {
        if (this.isRecording) {
            return;
        }

        if (!this.options.openaiApiKey) {
            const error = 'OpenAI API key is required for speech transcription';
            console.error('[ttyd] ' + error);
            this.options.onError?.(error);
            return;
        }

        try {
            await this.startRecording();
        } catch (error) {
            console.error('[ttyd] Audio recording start error:', error);
            this.options.onError?.(error instanceof Error ? error.message : 'Failed to start audio recording');
        }
    }

    @bind
    public stop(): void {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
        }
    }

    @bind
    public async toggle(): Promise<void> {
        if (this.isRecording) {
            this.stop();
        } else {
            await this.start();
        }
    }

    public isActive(): boolean {
        return this.isRecording;
    }

    public updateOptions(options: Partial<SpeechOptions>): void {
        this.options = { ...this.options, ...options };
    }

    private async startRecording(): Promise<void> {
        if (!this.isSupported()) {
            throw new Error('Audio recording is not supported in this browser');
        }

        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: this.getSupportedMimeType(),
            });

            this.mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstart = () => {
                this.isRecording = true;
                console.log('[ttyd] Audio recording started');
                this.options.onStart?.();
            };

            this.mediaRecorder.onstop = async () => {
                this.isRecording = false;
                console.log('[ttyd] Audio recording stopped');

                try {
                    await this.processRecording();
                } catch (error) {
                    console.error('[ttyd] Error processing recording:', error);
                    this.options.onError?.(error instanceof Error ? error.message : 'Failed to process recording');
                } finally {
                    this.options.onEnd?.();
                    this.cleanupAudioStream();
                }
            };

            this.mediaRecorder.onerror = event => {
                console.error('[ttyd] MediaRecorder error:', event.error);
                this.isRecording = false;
                this.options.onError?.('Recording error occurred');
                this.cleanupAudioStream();
            };

            // Start recording
            this.mediaRecorder.start();

            // Auto-stop after max recording time
            if (this.options.maxRecordingTime) {
                setTimeout(() => {
                    if (this.isRecording) {
                        this.stop();
                    }
                }, this.options.maxRecordingTime);
            }
        } catch (error) {
            this.cleanupAudioStream();
            throw error;
        }
    }

    private async processRecording(): Promise<void> {
        if (this.audioChunks.length === 0) {
            throw new Error('No audio data recorded');
        }

        const audioBlob = new Blob(this.audioChunks, {
            type: this.getSupportedMimeType(),
        });

        // Convert to proper format for Whisper if needed
        const audioFile = await this.convertToWhisperFormat(audioBlob);

        // Send to OpenAI Whisper API
        const transcript = await this.transcribeAudio(audioFile);

        if (transcript.trim()) {
            // Clean up the transcript: lowercase, trim whitespace, remove trailing punctuation
            const cleanTranscript = transcript
                .toLowerCase()
                .trim()
                .replace(/[.!?,:;]+$/, '');
            this.options.onResult?.(cleanTranscript);
        }
    }

    private async convertToWhisperFormat(audioBlob: Blob): Promise<File> {
        // Whisper supports various formats, but we'll use the recorded format directly
        // In a production app, you might want to convert to a specific format like MP3 or WAV
        const extension = this.getFileExtension();
        return new File([audioBlob], `recording.${extension}`, {
            type: audioBlob.type,
        });
    }

    private async transcribeAudio(audioFile: File): Promise<string> {
        const formData = new FormData();
        formData.append('file', audioFile);
        formData.append('model', this.options.model || 'whisper-1');

        if (this.options.language) {
            formData.append('language', this.options.language);
        }

        const response = await fetch(`${this.options.openaiBaseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.options.openaiApiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Transcription failed: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result.text || '';
    }

    private getSupportedMimeType(): string {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return 'audio/webm'; // fallback
    }

    private getFileExtension(): string {
        const mimeType = this.getSupportedMimeType();
        if (mimeType.includes('webm')) return 'webm';
        if (mimeType.includes('mp4')) return 'm4a';
        if (mimeType.includes('mpeg')) return 'mp3';
        return 'webm';
    }

    private cleanupAudioStream(): void {
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = undefined;
        }
        this.mediaRecorder = undefined;
        this.audioChunks = [];
    }

    @bind
    private createButton(): void {
        if (!this.terminal?.element || !this.isSupported()) {
            return;
        }

        this.buttonElement = document.createElement('button');
        this.buttonElement.innerHTML = '🎤';
        this.buttonElement.title = 'Start recording (Ctrl+M)';
        this.buttonElement.className = 'speech-toggle';

        this.buttonElement.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: #333;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            color: white;
            cursor: pointer;
            font-size: 16px;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        this.buttonElement.addEventListener('click', this.toggle);

        // Make sure the terminal element has relative positioning
        if (this.terminal.element.style.position !== 'relative') {
            this.terminal.element.style.position = 'relative';
        }

        this.terminal.element.appendChild(this.buttonElement);
    }

    @bind
    private removeButton(): void {
        if (this.buttonElement && this.buttonElement.parentNode) {
            this.buttonElement.removeEventListener('click', this.toggle);
            this.buttonElement.parentNode.removeChild(this.buttonElement);
            this.buttonElement = undefined;
        }
    }

    @bind
    private updateButtonState(): void {
        if (!this.buttonElement) {
            return;
        }

        if (this.isRecording) {
            this.buttonElement.style.background = '#ff4444';
            this.buttonElement.title = 'Stop recording (Ctrl+M)';
            this.buttonElement.classList.add('active');
        } else {
            this.buttonElement.style.background = '#333';
            this.buttonElement.title = 'Start recording (Ctrl+M)';
            this.buttonElement.classList.remove('active');
        }
    }

    @bind
    private startStatusUpdates(): void {
        this.statusUpdateInterval = setInterval(() => {
            this.updateButtonState();
        }, 500);
    }

    @bind
    private stopStatusUpdates(): void {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = undefined;
        }
    }
}
