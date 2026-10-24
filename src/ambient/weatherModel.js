import { RainModel, LAYERS, sanitizeEnvironment } from './rainModel.js';
import { ThunderEvents, SurfEvents } from './weatherEvents.js';

export const THUNDER_LAYERS = ['thunderCrack', 'thunderRoll', 'thunderEcho'];
export const SURF_LAYERS = ['waveSurge', 'waveBreak', 'waveWash'];
export const WEATHER_LAYERS = [...LAYERS, ...THUNDER_LAYERS, ...SURF_LAYERS];
const EVENT_DEFAULTS = { thunderActivity: 0, thunderDistance: .6, thunderPower: .55, thunderDecay: .65,
    surfLevel: 0, waveSize: .55, wavePace: .45, waveFoam: .55 };
export function sanitizeWeather(value = {}) {
    const e = { ...sanitizeEnvironment(value), ...EVENT_DEFAULTS };
    for (const key of Object.keys(EVENT_DEFAULTS)) if (Number.isFinite(value[key])) e[key] = Math.max(0, Math.min(1, value[key]));
    return e;
}
export const DEFAULT_WEATHER = sanitizeWeather();
export class WeatherModel {
    constructor(rate = 48000, environment = {}, seed = 731) {
        this.environment = sanitizeWeather(environment);
        this.rain = new RainModel(rate, this.environment, seed);
        this.thunder = new ThunderEvents(rate, this.environment, seed ^ 0x7158);
        this.surf = new SurfEvents(rate, this.environment, seed ^ 0x8913);
    }
    setEnvironment(patch) {
        this.environment = sanitizeWeather({ ...this.environment, ...patch });
        this.rain.setEnvironment(this.environment); this.thunder.setEnvironment(this.environment); this.surf.setEnvironment(this.environment);
    }
    trigger(type) {
        if (type === 'thunder') return this.thunder.trigger();
        if (type === 'surf') return this.surf.trigger(true);
        return false;
    }
    process(outputs) { this.rain.process(outputs); this.thunder.process(outputs); this.surf.process(outputs); }
    stats() {
        return { events: this.rain.events, active: this.rain.voices.filter(v => v.remaining > 0).length,
            dropped: this.rain.stolen, rate: this.rain.rateNow, heave: this.rain.heave,
            thunder: this.thunder.stats(), surf: this.surf.stats() };
    }
}
