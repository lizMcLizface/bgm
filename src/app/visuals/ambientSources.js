import { voicePath } from './voicePaths';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const fract = (v) => v - Math.floor(v);
const HUES = { rain: 210, thunder: 250, wind: 165, waves: 190, fire: 25, vinyl: 40 };
const random = (slot) => fract(Math.sin(slot * 127.1 + 311.7) * 43758.5453);

// Layer-specific fluid sources, driven by measured layer envelopes and the
// actual ambience controls. No music seed or reload-time random background.
export function ambientEmitters(settings, levels, time, { colour, palette = {}, hueShift = 0, reduced = false } = {}) {
    const result = [];
    for (const [id, measured] of Object.entries(levels)) {
        if (!(settings.ambience?.[id] > 0) || measured < 0.002 || !HUES.hasOwnProperty(id)) continue;
        const p = settings.ambienceShape?.[id] || {}, level = clamp(measured);
        const pan = clamp(p.pan ?? 0, -1, 1), width = p.width ?? 1;
        const value = (key, fallback = 0.5) => p[key] ?? fallback;
        const push = (x, y, radius, vx, vy, strength = 1) => {
            result.push({ role: `ambient-${id}`, x: clamp(0.5 + pan * 0.3 + (x - 0.5) * (0.2 + width * 0.8), 0.03, 0.97),
                y: clamp(y, 0.03, 0.97), radius,
                vx: vx * (reduced ? 0.2 : 1), vy: vy * (reduced ? 0.2 : 1),
                strength: level * 0.45 * strength, dyeGain: 0.9,
                rgb: colour((palette.hue ?? HUES[id]) + hueShift + (palette.hue === undefined ? 0 : (HUES[id] - 180) * 0.045),
                    palette.sat ?? 0.65, 0.4 + level * 0.08),
            });
        };
        if (id === 'rain') {
            const rate = 0.18 + value('intensity') * 0.5;
            for (let i = 0; i < 4; i++) {
                const phase = time * rate + i * 0.25, age = fract(phase);
                push(0.06 + random(Math.floor(phase) * 13 + i * 37) * 0.88, 0.95 - age * 0.9,
                    0.012 + value('drops') * 0.025, 0.015 * pan, -0.12 - value('intensity') * 0.18, Math.sin(age * Math.PI));
            }
        } else if (id === 'wind') {
            const gust = 0.65 + value('gusts') * 0.35 * Math.sin(time * (0.2 + value('speed') * 0.6));
            for (let i = 0; i < 2; i++) push(0.35 + 0.12 * Math.sin(time * 0.04 + i * 2), 0.3 + i * 0.4,
                0.08 + value('gusts') * 0.06, (pan < 0 ? -1 : 1) * (0.04 + value('speed') * 0.18) * gust, 0.025 * Math.sin(time * 0.2 + i));
        } else if (id === 'waves') {
            const phase = time * (0.25 + (1 - value('period')) * 0.65), swell = 0.55 + 0.45 * Math.sin(phase);
            for (let i = 0; i < 2; i++) push(0.25 + i * 0.5, 0.18 + 0.18 * swell,
                0.06 + value('size') * 0.08, 0.025 * Math.sin(phase + i), (0.04 + value('size') * 0.12) * Math.cos(phase), 0.5 + swell * 0.5);
        } else if (id === 'fire') {
            push(0.48 + 0.08 * Math.sin(time * 0.15), 0.13, 0.04 + value('roar') * 0.06,
                0.025 * Math.sin(time * 0.8), 0.06 + value('roar') * 0.18);
            push(0.55 + 0.08 * Math.sin(time * 0.7), 0.21, 0.012 + value('crackle') * 0.02,
                0.035 * Math.cos(time * 1.3), 0.12 + value('crackle') * 0.18, 0.3 + value('crackle') * 0.4);
        } else if (id === 'vinyl') {
            const path = voicePath('vinyl', time * 0.35, 0);
            push(path.x, path.y, 0.015 + value('hiss') * 0.035, 0.015 * Math.cos(path.heading), 0.015 * Math.sin(path.heading), 0.5 + value('crackle') * 0.5);
        } else if (id === 'thunder') {
            push(0.5, 0.8, 0.07 + value('intensity') * 0.12, 0.06 * pan, -0.06 - level * value('intensity') * 0.25);
        }
    }
    return result;
}

export function createAmbientSources(generator) {
    const taps = new Map();
    const remove = (id) => {
        const tap = taps.get(id);
        if (tap) { try { tap.node.disconnect(tap.analyser); } catch { /* chain already replaced */ } taps.delete(id); }
    };
    return {
        sample(clock, options) {
            const ambience = generator.ambience, settings = generator.settings;
            const levels = {};
            for (const id of Object.keys(HUES)) {
                const node = generator.ambienceRunning && settings.ambience?.[id] > 0 ? ambience.chains[id]?.drift : null;
                if (taps.get(id)?.node !== node) remove(id);
                if (!node) continue;
                if (!taps.has(id)) {
                    const analyser = generator.AC.createAnalyser(); analyser.fftSize = 256;
                    node.connect(analyser); taps.set(id, { node, analyser, data: new Float32Array(256), level: 0 });
                }
                const tap = taps.get(id); tap.analyser.getFloatTimeDomainData(tap.data);
                const rms = Math.sqrt(tap.data.reduce((sum, v) => sum + v*v, 0) / tap.data.length);
                // Layer level/distance/pan/wander are already in the tapped audio.
                const totalGain = (generator.ambienceOut?.gain.value ?? 1) * (ambience.output.gain.value ?? 1);
                const target = clamp(rms * totalGain * 16);
                tap.level += (target - tap.level) * (target > tap.level ? 0.65 : 0.15);
                levels[id] = settings.ambienceVolume === 0 ? 0 : tap.level;
            }
            const time = generator.ambienceRunning ? Math.max(0, ambience.pieceTime(clock)) : 0;
            return ambientEmitters(settings, levels, time, options);
        },
        dispose() { [...taps.keys()].forEach(remove); },
    };
}
