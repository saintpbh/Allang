export class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
    }

    async init() {
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    _playOscillator(type, freqStart, freqEnd, duration, volStart = 0.5) {
        if (!this.enabled || this.ctx.state !== 'running') return;

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
        if (freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);
        }

        gainNode.gain.setValueAtTime(volStart, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playBoop() {
        // High pitched short cute sound
        this._playOscillator('sine', 800, 1200, 0.1, 0.1);
    }

    playPurr() {
        // Low bubbling/purring sound
        if (!this.enabled || this.ctx.state !== 'running') return;

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(60, this.ctx.currentTime);

        // Tremolo effect for purr
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 25; // Speed of purr

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.5;

        lfo.connect(lfoGain);
        lfoGain.connect(gainNode.gain);

        gainNode.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.0);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        lfo.start();
        osc.stop(this.ctx.currentTime + 1.0);
        lfo.stop(this.ctx.currentTime + 1.0);
    }

    playJump() {
        // Sliding up sound
        this._playOscillator('sine', 300, 800, 0.3, 0.15);
    }

    playBounce() {
        // Quick bink
        this._playOscillator('sine', 400, 200, 0.2, 0.1);
    }
}
