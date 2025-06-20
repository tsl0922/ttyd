import { bind } from 'decko';
import { IDisposable, ITerminalAddon, Terminal } from '@xterm/xterm';

export interface TTSOptions {
    enabled?: boolean;
    voice?: string;
    rate?: number;
    volume?: number;
    pitch?: number;
    bufferDelay?: number;
    maxBufferLength?: number;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    enableSummary?: boolean;
    summaryModel?: string;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
}

export class TextToSpeechAddon implements ITerminalAddon {
    private terminal?: Terminal;
    private disposables: IDisposable[] = [];
    private options: Required<TTSOptions>;
    private isEnabled = false;
    private isSpeaking = false;
    private textBuffer = '';
    private bufferTimer?: number;
    private speechSynthesis: SpeechSynthesis;
    private currentUtterance?: SpeechSynthesisUtterance;
    private speechQueue: string[] = [];
    private isProcessingQueue = false;
    private buttonElement?: HTMLElement;
    private statusUpdateInterval?: NodeJS.Timeout;

    constructor(options: TTSOptions = {}) {
        this.options = {
            enabled: false,
            voice: '',
            rate: 1.0,
            volume: 1.0,
            pitch: 1.0,
            bufferDelay: 1000, // ms to wait before speaking buffered text
            maxBufferLength: 10000, // max characters to buffer
            openaiApiKey: '',
            openaiBaseUrl: 'https://api.openai.com/v1',
            enableSummary: true,
            summaryModel: 'gpt-4o-mini',
            onStart: () => {},
            onEnd: () => {},
            onError: () => {},
            ...options,
        };

        this.speechSynthesis = window.speechSynthesis;
        this.isEnabled = this.options.enabled && this.isSupported();
    }

    public activate(terminal: Terminal): void {
        this.terminal = terminal;

        // Listen for speech synthesis events
        if (this.isSupported()) {
            this.setupSpeechSynthesis();
            this.createButton();
            this.startStatusUpdates();
        }
    }

    public dispose(): void {
        this.stop();
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
        this.clearBuffer();
        this.removeButton();
        this.stopStatusUpdates();
        this.terminal = undefined;
    }

    public isSupported(): boolean {
        return !!(window.speechSynthesis && typeof window.speechSynthesis.speak === 'function');
    }

    public isActive(): boolean {
        return this.isEnabled;
    }

    public enable(): void {
        if (!this.isSupported()) {
            this.options.onError?.('Text-to-speech is not supported in this browser');
            return;
        }
        this.isEnabled = true;
        console.log('[ttyd] TTS enabled');
    }

    public disable(): void {
        this.isEnabled = false;
        this.stop();
        console.log('[ttyd] TTS disabled');
    }

    @bind
    public toggle(): void {
        if (this.isEnabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    public stop(): void {
        if (this.currentUtterance) {
            this.speechSynthesis.cancel();
            this.currentUtterance = undefined;
        }
        this.clearBuffer();
        this.speechQueue = [];
        this.isProcessingQueue = false;
        this.isSpeaking = false;
    }

    public pause(): void {
        if (this.isSpeaking) {
            this.speechSynthesis.pause();
        }
    }

    public resume(): void {
        if (this.speechSynthesis.paused) {
            this.speechSynthesis.resume();
        }
    }

    public updateOptions(options: Partial<TTSOptions>): void {
        this.options = { ...this.options, ...options };
        if (options.enabled !== undefined) {
            if (options.enabled) {
                this.enable();
            } else {
                this.disable();
            }
        }
    }

    public getVoices(): SpeechSynthesisVoice[] {
        return this.speechSynthesis.getVoices();
    }

    public processOutput(data: string | Uint8Array): void {
        if (!this.isEnabled) {
            return;
        }

        try {
            // Convert Uint8Array to string if needed
            const textData = typeof data === 'string' ? data : new TextDecoder().decode(data);

            // Parse ANSI sequences and extract plain text
            const plainText = this.parseAnsiText(textData);
            if (plainText.trim()) {
                this.addToBuffer(plainText);
            }
        } catch (error) {
            console.error('[ttyd] TTS processing error:', error);
            this.options.onError?.(error instanceof Error ? error.message : 'TTS processing failed');
        }
    }

    private setupSpeechSynthesis(): void {
        // Wait for voices to be loaded
        if (this.speechSynthesis.getVoices().length === 0) {
            this.speechSynthesis.addEventListener('voiceschanged', () => {
                console.log('[ttyd] TTS voices loaded:', this.speechSynthesis.getVoices().length);
            });
        }
    }

    private parseAnsiText(text: string): string {
        // Remove ANSI escape sequences
        // This regex matches most common ANSI escape sequences:
        // - CSI sequences: \x1b[...m (colors, formatting)
        // - OSC sequences: \x1b]...(\x07|\x1b\\) (title changes, etc.)
        // - Simple escapes: \x1b[A-Z] (cursor movement, etc.)
        /* eslint-disable no-control-regex */
        let cleanText = text
            .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // CSI sequences
            .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '') // OSC sequences
            .replace(/\x1b[A-Z]/g, '') // Simple escape sequences
            .replace(/\x1b\([AB01]\)/g, '') // Character set selection
            .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '') // Control characters except \t and \n
            .replace(/\r\n/g, '\n') // Normalize line endings
            .replace(/\r/g, '\n'); // Convert remaining \r to \n
        /* eslint-enable no-control-regex */

        // Clean up multiple consecutive whitespace/newlines
        cleanText = cleanText
            .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
            .replace(/[ \t]{2,}/g, ' '); // Multiple spaces/tabs to single space

        return cleanText;
    }

    private addToBuffer(text: string): void {
        this.textBuffer += text;

        // Clear existing timer
        if (this.bufferTimer) {
            clearTimeout(this.bufferTimer);
        }

        // If buffer is getting too long, speak immediately
        if (this.textBuffer.length > this.options.maxBufferLength) {
            this.flushBuffer();
            return;
        }

        // Set timer to flush buffer after delay
        this.bufferTimer = window.setTimeout(() => {
            this.flushBuffer();
        }, this.options.bufferDelay);
    }

    private flushBuffer(): void {
        if (this.bufferTimer) {
            clearTimeout(this.bufferTimer);
            this.bufferTimer = undefined;
        }

        if (this.textBuffer.trim()) {
            this.addToSpeechQueue(this.textBuffer.trim());
            this.textBuffer = '';
        }
    }

    private clearBuffer(): void {
        if (this.bufferTimer) {
            clearTimeout(this.bufferTimer);
            this.bufferTimer = undefined;
        }
        this.textBuffer = '';
    }

    private addToSpeechQueue(text: string): void {
        // Split long text into smaller chunks to avoid browser limits
        // const maxChunkLength = 200;
        // const sentences = this.splitIntoSentences(text);
        this.speechQueue.push(text.trim());

        // debugger;
        // let currentChunk = '';
        // for (const sentence of sentences) {
        //     if (currentChunk.length + sentence.length > maxChunkLength && currentChunk) {
        //         this.speechQueue.push(currentChunk.trim());
        //         currentChunk = sentence;
        //     } else {
        //         currentChunk += (currentChunk ? ' ' : '') + sentence;
        //     }
        // }

        // if (currentChunk.trim()) {
        //     this.speechQueue.push(currentChunk.trim());
        // }

        this.processNextInQueue();
    }

    private splitIntoSentences(text: string): string[] {
        // Split text into sentences while preserving structure
        return text.split(/(?<=[.!?])\s+/).filter(sentence => sentence.trim().length > 0);
    }

    private processNextInQueue(): void {
        if (this.isProcessingQueue || this.speechQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;
        const textToSpeak = this.speechQueue.shift()!;
        console.log('[ttyd] TTS speaking:', textToSpeak);
        this.speak(textToSpeak).finally(() => {
            this.isProcessingQueue = false;
            // Process next item in queue after a short delay
            setTimeout(() => this.processNextInQueue(), 1000);
        });
    }

    private async summarizeText(text: string): Promise<string> {
        if (!this.options.enableSummary || !this.options.openaiApiKey || text.trim().length < 100) {
            return text; // Return original text if summary disabled, no API key, or text too short
        }

        try {
            const response = await fetch(`${this.options.openaiBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.options.openaiApiKey}`,
                },
                body: JSON.stringify({
                    model: this.options.summaryModel,
                    messages: [
                        {
                            role: 'system',
                            content:
                                "You are a terminal output summarizer. Summarize the given terminal output in a concise, spoken-friendly way. Focus on key information, errors, completions, and important results. Keep it brief but informative. If it's just simple output like file listings or status messages, provide a very short summary. For errors or important information, be more descriptive.",
                        },
                        {
                            role: 'user',
                            content: `Please summarize this terminal output for text-to-speech:\n\n${text}`,
                        },
                    ],
                    max_tokens: 150,
                    temperature: 0.3,
                }),
            });

            if (!response.ok) {
                console.warn('[ttyd] TTS summarization failed, using original text');
                return text;
            }

            const result = await response.json();
            const summary = result.choices?.[0]?.message?.content?.trim();

            if (summary && summary.length > 0) {
                console.log('[ttyd] TTS summarized:', text.length, 'chars →', summary.length, 'chars');
                return summary;
            } else {
                return text;
            }
        } catch (error) {
            console.warn('[ttyd] TTS summarization error:', error);
            return text; // Fallback to original text
        }
    }

    private async speak(text: string): Promise<void> {
        try {
            // Summarize text first if enabled
            const textToSpeak = await this.summarizeText(text);
            return new Promise((resolve, reject) => {
                const utterance = new SpeechSynthesisUtterance(textToSpeak);

                // Set voice options
                utterance.rate = this.options.rate;
                utterance.volume = this.options.volume;
                utterance.pitch = this.options.pitch;

                // Set voice if specified
                if (this.options.voice) {
                    const voices = this.speechSynthesis.getVoices();
                    const selectedVoice = voices.find(
                        voice => voice.name === this.options.voice || voice.lang === this.options.voice
                    );
                    if (selectedVoice) {
                        utterance.voice = selectedVoice;
                    }
                }

                utterance.onstart = () => {
                    this.isSpeaking = true;
                    this.options.onStart?.();
                };

                utterance.onend = () => {
                    this.isSpeaking = false;
                    this.currentUtterance = undefined;
                    this.options.onEnd?.();
                    resolve();
                };

                utterance.onerror = event => {
                    this.isSpeaking = false;
                    this.currentUtterance = undefined;
                    const error = `Speech synthesis error: ${event.error}`;
                    console.error('[ttyd]', error);
                    this.options.onError?.(error);
                    reject(new Error(error));
                };

                this.currentUtterance = utterance;
                this.speechSynthesis.speak(utterance);
            });
        } catch (error) {
            this.isSpeaking = false;
            this.currentUtterance = undefined;
            const errorMsg = error instanceof Error ? error.message : 'Unknown speech synthesis error';
            console.error('[ttyd] TTS speak error:', errorMsg);
            this.options.onError?.(errorMsg);
            throw error;
        }
    }

    @bind
    private createButton(): void {
        if (!this.terminal?.element || !this.isSupported()) {
            return;
        }

        this.buttonElement = document.createElement('button');
        this.buttonElement.innerHTML = '🔊';
        this.buttonElement.title = 'Toggle text-to-speech (Ctrl+T)';
        this.buttonElement.className = 'tts-toggle';

        this.buttonElement.style.cssText = `
            position: absolute;
            top: 10px;
            right: 60px;
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

        if (this.isEnabled) {
            this.buttonElement.style.background = '#00aa00';
            this.buttonElement.title = 'Disable text-to-speech (Ctrl+T)';
            this.buttonElement.classList.add('active');
        } else {
            this.buttonElement.style.background = '#333';
            this.buttonElement.title = 'Enable text-to-speech (Ctrl+T)';
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
