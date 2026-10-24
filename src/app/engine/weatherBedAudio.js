import workletUrl from './weatherBed.worklet.js?worker&url';
import { WEATHER_SOURCES, WeatherSegmentRenderer } from './weatherBedModel.js';

const modules = new WeakMap();
export class WeatherBedRoute {
    constructor(context, inputs, seed = 1) { this.context = context; this.inputs = inputs; this.seed = seed; this.revision = 0; }
    prepare() {
        if (!modules.has(this.context)) {
            const load = this.context.audioWorklet?.addModule(workletUrl) ?? Promise.reject(Error('Procedural weather requires AudioWorklet support.'));
            modules.set(this.context, load.catch(error => { modules.delete(this.context); throw error; }));
        }
        return modules.get(this.context);
    }
    setState(shape, levels) { this.shape = shape; this.levels = levels; this.node?.port.postMessage({ type: 'state', shape, levels }); }
    async start(time) {
        const own = ++this.revision;
        try {
            await this.prepare(); if (own !== this.revision) return;
            const node = new AudioWorkletNode(this.context, 'main-weather-bed', { numberOfInputs: 0, numberOfOutputs: 3,
                outputChannelCount: [2, 2, 2], processorOptions: { shape: this.shape, levels: this.levels, seed: this.seed, startTime: Math.max(time, this.context.currentTime) } });
            this.node = node;
            node.onprocessorerror = () => { this.error = Error('The procedural weather processor stopped.'); console.error(this.error); };
            WEATHER_SOURCES.forEach((id, i) => node.connect(this.inputs(id), i));
        } catch (error) { if (own === this.revision) { this.error = error; console.error(error); } }
    }
    stop(time) {
        ++this.revision; const node = this.node; this.node = null;
        if (!node) return;
        setTimeout(() => { node.port.postMessage({ type: 'stop' }); node.disconnect(); node.port.close(); }, Math.max(0, time - this.context.currentTime) * 1000 + 30);
    }
}

export class WeatherBedOffline {
    constructor(rate, shape, levels, seed = 1) {
        this.config = { rate, shape, levels, seed }; this.pending = new Map(); this.request = 0;
        if (typeof Worker === 'undefined') this.renderer = new WeatherSegmentRenderer(rate, shape, levels, seed);
        else {
            this.worker = new Worker(new URL('./weatherBed.worker.js', import.meta.url), { type: 'module' });
            this.worker.onmessage = ({ data }) => { const pending = this.pending.get(data.request); if (!pending) return;
                this.pending.delete(data.request); if (data.error) pending.reject(Error(data.error)); else pending.resolve(data.samples); };
            this.worker.onerror = error => { for (const p of this.pending.values()) p.reject(Error(error.message)); this.pending.clear(); };
        }
    }
    render(secondsFrom, frames) {
        const from = Math.round(secondsFrom * this.config.rate);
        if (this.renderer) return Promise.resolve(this.renderer.render(from, frames));
        const request = ++this.request;
        return new Promise((resolve, reject) => { this.pending.set(request, { resolve, reject }); this.worker.postMessage({ ...this.config, request, from, frames }); });
    }
    dispose() {
        this.worker?.terminate(); for (const p of this.pending.values()) p.reject(new DOMException('Weather rendering cancelled', 'AbortError'));
        this.pending.clear();
    }
}
