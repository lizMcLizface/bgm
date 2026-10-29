// The notes still to come, from the generator's plan, with when each one starts and how long it is held,
// in seconds from now. The plan keeps a few bars behind the playhead and plans several ahead; the tempo of
// each bar turns its units into seconds (a rubato bar is taken as even).

import { unitsPerMinute } from './meter';

/**
 * @returns {{ notes: Array<{bar:number, beat:number, role:string, midi:number, t:number, dur:number}>,
 *             bars: Array<{t:number, sec:number, beatSec:number}> }}
 *   `t`: seconds until the note starts (negative once it has), `dur`: seconds it is held.
 */
export function upcomingNotes(generator, roles, lookahead, behind = 0.25) {
    const plan = generator.getPlan(), perBar = generator.beatsPerBar, position = generator.position();
    const byBar = new Map(plan.map((p) => [p.bar, p]));
    const current = Math.floor(position / perBar), now = byBar.get(current);
    if (!now) return { notes: [], bars: [] };
    const meterOf = (p) => p.meter ?? generator.meter;
    const barSeconds = (p) => (meterOf(p).units * 60) / unitsPerMinute(meterOf(p), p.bpm);
    // seconds from now to the start of every planned bar
    const starts = new Map([[current, -(position / perBar - current) * barSeconds(now)]]);
    for (let bar = current; byBar.has(bar) && starts.get(bar) <= lookahead + 1; bar++) starts.set(bar + 1, starts.get(bar) + barSeconds(byBar.get(bar)));
    for (let bar = current - 1; byBar.has(bar); bar--) starts.set(bar, starts.get(bar + 1) - barSeconds(byBar.get(bar)));
    const notes = [], bars = [];
    for (const [bar, p] of byBar) {
        const start = starts.get(bar);
        if (start === undefined || start > lookahead) continue;
        const meter = meterOf(p), sec = barSeconds(p), units = meter.units;
        if (start + sec > 0) bars.push({ t: start, sec, beatSec: (sec * meter.unitsPerBeat * (meter.pace ?? 1)) / units });
        for (const e of p.events) {
            if (!roles.includes(e.role)) continue;
            const t = start + (e.beat / units) * sec, dur = Math.max(0.05, (e.length / units) * sec);
            if (t <= lookahead && t + dur > -behind) notes.push({ bar, beat: e.beat, role: e.role, midi: e.midi, t, dur });
        }
    }
    return { notes: notes.sort((a, b) => a.t - b.t || a.midi - b.midi), bars: bars.sort((a, b) => a.t - b.t) };
}
