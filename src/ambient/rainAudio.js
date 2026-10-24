import { DEFAULT_WEATHER, WEATHER_LAYERS as LAYERS, sanitizeWeather, THUNDER_LAYERS, SURF_LAYERS } from './weatherModel.js';
import rainWorkletUrl from './rain.worklet.js?worker&url';

// Owns one context. Call start directly in a user gesture, then close on Stop.
export class RainAudio {
    constructor(onStats = () => {}, onError = () => {}) {
        this.environment = { ...DEFAULT_WEATHER };
        this.levels = Object.fromEntries(LAYERS.map(id => [id, 1])); this.solo = null; this.volume = .65;
        this.context = null; this.onStats = onStats; this.onError = onError;
    }
    async start(seed = 731) {
        if (this.context) return;
        const c = new AudioContext({ latencyHint: 'playback' }); this.context = c;
        try {
            const resumed = c.resume();
            await Promise.all([resumed, c.audioWorklet.addModule(rainWorkletUrl)]);
            if (this.context !== c) return;
            this.node = new AudioWorkletNode(c, 'procedural-rain', { numberOfInputs: 0, numberOfOutputs: LAYERS.length,
                outputChannelCount: LAYERS.map(() => 2), processorOptions: { environment: this.environment, seed } });
            this.node.port.onmessage = ({ data }) => this.onStats(data);
            this.node.onprocessorerror = () => { this.stop(); this.onError(Error('Weather processor stopped unexpectedly. Press Play to restart.')); };
            this.master = c.createGain(); this.master.gain.value = 0;
            this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048;
            this.limiter = c.createDynamicsCompressor(); this.limiter.threshold.value = -6;
            this.limiter.knee.value = 3; this.limiter.ratio.value = 16; this.limiter.attack.value = .003; this.limiter.release.value = .15;
            this.filters = [0, 1].map(() => { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = Math.SQRT1_2; return f; });
            this.filters[0].connect(this.filters[1]); this.filters[1].connect(this.master);
            this.master.connect(this.limiter); this.limiter.connect(this.analyser); this.analyser.connect(c.destination);
            this.gains = LAYERS.map((_, index) => { const g = c.createGain(); this.node.connect(g, index); g.connect(this.filters[0]); return g; });
            this.update();
        } catch (error) { if (this.context === c) this.stop(); throw error; }
    }
    update(patch = {}) {
        this.environment = sanitizeWeather({ ...this.environment, ...patch });
        if (!this.node || !this.context) return;
        this.node.port.postMessage({ type: 'environment', value: this.environment });
        const t = this.context.currentTime, indoor = this.environment.indoorFilter;
        // Exponential cutoff gives a useful perceptual range across the slider.
        const cutoff = Math.min(this.context.sampleRate * .45, 18000 * (300 / 18000) ** indoor);
        for (const f of this.filters) f.frequency.setTargetAtTime(cutoff, t, .045);
        this.gains.forEach((g, i) => {
            const id = LAYERS[i], attenuationDb = ['rumble', 'thunderRoll'].includes(id) ? -3
                : id === 'thunderEcho' ? -6 : id === 'thunderCrack' ? -15 : id === 'drops' ? -24 : -9;
            const group = this.solo === 'thunder' ? THUNDER_LAYERS : this.solo === 'surf' ? SURF_LAYERS : [];
            const level = this.solo && this.solo !== id && !group.includes(id) ? 0 : this.levels[id];
            g.gain.setTargetAtTime(level * 10 ** (attenuationDb * indoor / 20), t, .025);
        });
        this.master.gain.setTargetAtTime(this.volume, t, .03);
    }
    trigger(type) { this.node?.port.postMessage({ type: 'trigger', value: type }); }
    stop() {
        const c = this.context; this.context = null;
        this.node?.port.postMessage({ type: 'stop' }); this.node?.disconnect(); this.node?.port.close();
        this.node = null; this.analyser = null;
        if (c) void c.close().catch(() => {});
    }
}
