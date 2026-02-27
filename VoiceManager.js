export class VoiceManager {
    constructor(onResult, onStatusChange) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.supported = false;
            console.warn("Speech Recognition API not supported in this browser.");
            return;
        }

        this.supported = true;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'ko-KR';

        this.recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            if (onResult) onResult(text);
        };

        this.recognition.onstart = () => onStatusChange?.(true);
        this.recognition.onend = () => onStatusChange?.(false);
        this.recognition.onerror = (e) => {
            if (e.error !== 'no-speech') {
                console.error('Speech recognition error:', e.error);
            }
            onStatusChange?.(false);
        };
    }

    start() {
        if (!this.supported) return;
        try {
            this.recognition.start();
        } catch (e) {
            // Already started
        }
    }

    stop() {
        if (!this.supported) return;
        this.recognition.stop();
    }
}
