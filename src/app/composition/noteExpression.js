import { grooveProfile } from './instrumentGroove';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** No random stream and no rewriting of pitches, timing, dynamics or written gates. */
export function expressNotes(events, { voices, secondsPerBeat, units }) {
    for (const event of events) {
        if (event.role === 'perc') continue;
        const profile = grooveProfile(voices[event.role]);
        if (profile === 'tight') continue;
        const seconds = event.length * secondsPerBeat, held = event.length >= units * .75;
        const short = seconds < .3 && !held, melodic = event.role === 'lead' || event.role === 'counter';
        const dynamic = clamp((event.velocity - .6) * 500, -150, 150);
        const brightness = clamp(dynamic + (short ? 55 : held ? -40 : 0), -200, 200);
        const expressive = profile === 'breath' || profile === 'neutral';
        event.expression = {
            profile,
            attackScale: expressive ? short ? .72 : held ? 1.2 : 1 : 1,
            releaseScale: short ? .78 : 1,
            gateScale: melodic && expressive && short ? .94 : 1,
            brightnessCents: brightness,
        };
    }
    return events;
}

/** Held wind phrases breathe without changing the written composition. */
export function expressHeldNotes(events, { voices, secondsPerBeat }) {
    for (const event of events) {
        if (!['lead', 'counter'].includes(event.role)) continue;
        const voice = voices[event.role], profile = grooveProfile(voice);
        const wind = profile === 'breath' || (profile === 'neutral' && /clarinet|oboe|bassoon/i.test(voice?.name ?? ''));
        const seconds = event.length * secondsPerBeat;
        if (!wind || seconds < .85) continue;
        event.expression = { ...event.expression, profile: 'breath', breathDepth: .18,
            vibratoDepth: voice?.preset?.vibratoDepth > 0 ? 0 : 8,
            vibratoDelay: Math.min(.45, seconds * .3), vibratoRate: 5 };
    }
    return events;
}

/** Note-local joining: never extend a gate or rewrite an already planned bar. */
export function connectWindNotes(events, { voices, secondsPerBeat, previous = [], units = 4 }) {
    for (const role of ['lead', 'counter']) {
        const voice = voices[role], profile = grooveProfile(voice);
        if (!(profile === 'breath' || (profile === 'neutral' && /clarinet|oboe|bassoon/i.test(voice?.name ?? '')))) continue;
        const line = [...previous.filter(e => e.role === role).map(e => ({ ...e, beat: e.beat - units, previous: true })),
            ...events.filter(e => e.role === role)].sort((a,b) => a.beat-b.beat);
        for (let i = 1; i < line.length; i++) {
            const note = line[i], before = line[i-1];
            if (note.previous || line.some(other => other !== note && Math.abs(other.beat-note.beat) < 1e-5)) continue;
            if (line.some(other => other !== before && Math.abs(other.beat-before.beat) < 1e-5)) continue;
            const gap = (note.beat-before.beat-before.length)*secondsPerBeat;
            const interval = Math.abs(note.midi-before.midi);
            if (gap < -.025 || gap > .09 || interval < 1 || interval > 5 || note.length*secondsPerBeat < .12) continue;
            note.expression = { ...note.expression, profile: 'breath', connected: true,
                connectionFrom: before.midi, gateScale: 1,
                brightnessCents: clamp((note.expression?.brightnessCents ?? 0)-(note.expression?.connected ? 0 : 45),-240,240) };
        }
    }
    return events;
}

/** Timing choices are metadata, independent of pitch/rhythm and other expression rules. */
export function timeSoundNotes(events, { voices, bpm, gateEnvelopes = false, tempoEffects = false }) {
    for (const event of events) {
        if (event.role === 'perc') continue;
        const profile = grooveProfile(voices[event.role]);
        const gateAware = gateEnvelopes && !['tight','keys','plucked'].includes(profile);
        if (!gateAware && !tempoEffects) continue;
        event.expression = { ...event.expression, ...(gateAware ? { gateAware:true } : {}),
            ...(tempoEffects ? { tempoBeat:60/bpm } : {}) };
    }
    return events;
}
