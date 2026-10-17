import { gainEnvelopePoints } from '../engine/envelope';
import { createVoiceMotion, voicePath } from './voicePaths';
import { noteColour } from './musicColour';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ROLE_PHASE = { bass: 0.4, pad: 0, lead: 2.1, counter: 4.2, perc: 5.3 };

// One motion budget, shared between travelling source and injected jet.
// Drift is smooth, per voice, and vanishes at the two explicit endpoints.
export function motionSplit(speed, balance = 0.5, drift = 0, clock = 0, role = 'pad', seed = 1) {
    const base = clamp(balance, 0, 1);
    const wander = (voicePath('balance/' + role, clock * 0.3, seed).x - 0.5) * 2;
    const share = clamp(base + drift * 4 * base * (1 - base) * wander, 0, 1);
    return { source: speed * 2 * share, jet: speed * 2 * (1 - share), share };
}

// Gate duration, not the release tail: short notes are narrow, fast jets.
// Logarithmic mapping distinguishes rapid notes while bounding very long holds.
export function noteDynamics(seconds) {
    const held = clamp(Math.log2(Math.max(0.06, seconds) / 0.12) / Math.log2(8 / 0.12), 0, 1);
    return {
        radius: 0.0035 + 0.039 * held ** 1.6,
        force: 0.35 + 5.5 * (1 - held) ** 2,
        rate: 0.35 + 1.8 * (1 - held),
        dyeGain: 1 + 2 * (1 - held),
    };
}

export function envelopeAt(points, age) {
    if (age < 0 || !points.length) return 0;
    for (let i = 1; i < points.length; i++) {
        if (age <= points[i][0]) {
            const [t, value] = points[i - 1], [end, next] = points[i];
            return value + (next - value) * clamp((age - t) / Math.max(1e-6, end - t), 0, 1);
        }
    }
    return points[points.length - 1][1];
}

// Every voice has one continuous wandering source. Notes fan out locally
// around that shared path, retaining their own envelope, size and jet strength.
export function createMusicForces(generator) {
    let notes = [];
    let pathSeed = generator.settings?.seed ?? 1, motions = new Map();
    const add = (event) => {
        if (event.type === 'clear') { notes = []; return; }
        if (event.type === 'off') {
            const note = notes.find((n) => n.liveId === event.liveId && n.role === event.role);
            if (note) { note.end = event.time; note.releaseLevel = envelopeAt(note.points, event.time - note.time); }
            return;
        }
        const p = event.preset || {};
        const env = event.env || { attack: 0.005, decay: 0.15, sustain: 0, release: 0.3 };
        const duration = event.length ?? 3600;
        const plan = gainEnvelopePoints(env, event.velocity, duration);
        notes.push({ ...event, points: plan.points, end: event.time + duration,
            release: Math.max(0.08, env.release || 0), releaseLevel: null,
            bright: clamp(Math.log2(Math.max(80, Math.min(p.filterFreq || 11000, p.masterFilterFreq || 11000)) / 80) / 7, 0, 1),
            rough: clamp((p.noiseMix || 0) + (p.distortionAmount || 0) + (['sawtooth', 'square'].includes(p.vcoType) ? 0.4 : 0), 0, 1),
        });
        if (notes.length > 1024) notes.splice(0, notes.length - 1024);
    };
    const unsubscribe = generator.onVisualNote(add);
    // Enabling the background mid-chord should show notes already sounding.
    if (generator.isRunning) (generator.noteLog || []).forEach((note) => {
        const instrument = generator.roles[note.role]?.instrument;
        add({ type: 'on', ...note, preset: { ...instrument?.preset }, env: instrument?.gainEnv && { ...instrument.gainEnv } });
    });
    return {
        clear() { notes = []; },
        get count() { return notes.length; },
        sample(clock, { hue, colour, size, speed, intensity, reduced, trails, spread = 40, mood = {}, jetDirection = 'exhaust', motionBalance = 0.5, balanceDrift = 0 }) {
            const seed = generator.settings?.seed ?? 1;
            if (seed !== pathSeed) { pathSeed = seed; motions.clear(); }
            const paths = new Map();
            for (const role of Object.keys(generator.roles)) {
                if (!motions.has(role)) motions.set(role, { motion: createVoiceMotion(seed), orbit: 0, clock });
                const state = motions.get(role);
                const split = motionSplit(speed, motionBalance, balanceDrift, clock, role, seed);
                const sourceRate = trails ? split.source : 0;
                state.motion.advance(clock, sourceRate, reduced);
                state.orbit += clamp(clock - state.clock, 0, 0.25) * sourceRate * (reduced ? 0.2 : 1);
                state.clock = clock;
                paths.set(role, { ...state.motion.at(role), orbit: state.orbit, ...split });
            }
            notes = notes.filter((n) => clock <= n.end + n.release + 0.1);
            const anySolo = Object.values(generator.roles).some((r) => r.solo);
            const emitters = [];
            notes.forEach((n) => {
                const r = generator.roles[n.role];
                if (!r || (anySolo ? !r.solo : r.mute) || r.volume <= 0 || clock < n.time) return;
                const age = clock - n.time;
                let level = envelopeAt(n.points, age);
                if (n.releaseLevel !== null && clock >= n.end) level = n.releaseLevel * clamp(1 - (clock - n.end) / n.release, 0, 1);
                if (level < 0.002) return;
                const held = n.liveId !== undefined && r.instrument?.held?.get(n.liveId);
                if (n.liveId !== undefined && n.releaseLevel === null && r.instrument?.held && (!held || r.instrument.voices[held.index].voiceId !== held.voiceId)) return;
                const midi = n.role === 'perc' ? 42 + n.midi * 3 : n.midi;
                const pitch = clamp((midi - 36) / 60, 0, 1);
                const path = paths.get(n.role);
                const phase = (n.midi % 12) * Math.PI / 6 + (ROLE_PHASE[n.role] || 0);
                // A live hold has no known end: grow and slow it as the key stays down.
                const duration = n.length ?? Math.max(0.08, Math.min(age, n.end - n.time));
                const dynamics = noteDynamics(duration);
                const rate = dynamics.rate * (0.75 + n.bright * 0.35);
                const angle = phase + path.orbit * rate;
                const orbit = (n.role === 'pad' ? 0.022 : 0.012) + pitch * 0.004;
                const localAngle = trails ? angle : phase;
                const pitchOffset = clamp((midi - 60) / 48, -1, 1) * 0.018;
                const x = clamp(path.x + orbit * Math.cos(localAngle) - Math.sin(path.heading) * pitchOffset, 0.04, 0.96);
                const y = clamp(path.y + orbit * Math.sin(localAngle) + Math.cos(path.heading) * pitchOffset, 0.04, 0.96);
                const heading = path.heading + (jetDirection === 'exhaust' ? Math.PI : 0) + 0.22 * Math.sin(localAngle) + n.rough * 0.2 * Math.sin(age * 3);
                const paint = noteColour({ ...n, midi }, { hue, mood, spread, age });
                const force = path.jet * dynamics.force * (n.role === 'bass' ? 1.15 : 1) * (0.65 + intensity * 0.65) * (reduced ? 0.3 : 1);
                emitters.push({ role: n.role, midi, sourceX: path.x, sourceY: path.y, sourceBlend: path.share, x, y, vx: Math.cos(heading) * force, vy: Math.sin(heading) * force,
                    radius: size * dynamics.radius * (n.role === 'bass' ? 1.25 : 1) * (0.85 + (1 - n.bright) * 0.3),
                    dyeGain: dynamics.dyeGain,
                    strength: level * Math.sqrt(r.volume) * (n.role === 'pad' ? 0.65 : 1),
                    rgb: colour(paint.h, paint.s, paint.l),
                });
            });
            return emitters.sort((a, b) => b.strength - a.strength).slice(0, 32);
        },
        dispose: unsubscribe,
    };
}
