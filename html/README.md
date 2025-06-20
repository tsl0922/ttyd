## Prerequisites

> **NOTE:** yarn v2 is required.

Install [Yarn](https://yarnpkg.com/getting-started/install), and run: `yarn install`.

## Development

1. (Optional) Set OpenAI API key for speech recognition and TTS summarization: `export OPENAI_API_KEY=your_key_here`
2. Start ttyd: `ttyd bash`
3. Start the dev server: `yarn run start`

## Speech Recognition

The terminal includes speech-to-text functionality using OpenAI's Whisper API. To enable:

1. Set the `OPENAI_API_KEY` environment variable
2. Click the microphone button or press `Ctrl+M` to start/stop recording
3. Speak clearly into your microphone
4. The transcribed text will be sent to the terminal when recording stops

### Voice Commands

The following voice commands are recognized and converted to key presses:

- **"enter"** or **"return"** → Enter key
- **"tab"** → Tab key
- **"escape"** → Escape key
- **"backspace"** → Backspace key
- **"delete"** → Delete key
- **"control c"** or **"ctrl c"** → Ctrl+C
- **"control d"** or **"ctrl d"** → Ctrl+D
- **"control z"** or **"ctrl z"** → Ctrl+Z
- **"control [a-z]"** → Ctrl+[letter] combinations

Any other speech will be typed as regular text.

## Text-to-Speech

The terminal includes intelligent text-to-speech functionality that summarizes and reads terminal output aloud. Features:

1. **Toggle TTS**: Click the speaker button (🔊) or press `Ctrl+T` to enable/disable
2. **Pause/Resume**: Press `Ctrl+P` to pause/resume speech when active
3. **Smart Summarization**: Uses OpenAI's API to intelligently summarize terminal output
4. **Voice Control**: Configurable voice, rate, volume, and pitch settings

### TTS Features

- **AI Summarization**: Uses OpenAI GPT-4o-mini to summarize long terminal output into concise, spoken-friendly summaries
- **ANSI Filtering**: Removes terminal control sequences for clean speech
- **Text Buffering**: Intelligently buffers text before speaking to avoid choppy audio
- **Queue Management**: Handles multiple text chunks with proper timing
- **Browser Compatibility**: Uses standard Web Speech API (Speech Synthesis)
- **Fallback Support**: Works even without API key (reads raw text when summarization unavailable)

### Visual Indicators

- **Gray Button**: TTS disabled
- **Green Button**: TTS enabled
- **Overlay Messages**: Shows "🔊 TTS Speaking" when active

## Publish

Run `yarn run build`, this will compile the inlined html to `../src/html.h`.
