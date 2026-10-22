// Ducking (settings.ducking, 0..1): the backing dips while a melody plays and comes back in its
// rests - the pad under either lead (up to 6 dB), the second lead under the lead (up to 3 dB).
// A role's duck is a gain of its own after its volume, so the mixer and mutes are untouched.
// Playback books it note by note (Ducker); a render automates it from all its notes (automateDuck).
export const DUCKED_BY = { pad: { lead: 6, counter: 4 }, counter: { lead: 3 } };
const ATTACK = 0.04, ATTACK_TC = 0.03, HOLD = 0.06, RELEASE_TC = 0.12;

export const duckFloor = (role, by, amount) => 10 ** (-(DUCKED_BY[role]?.[by] ?? 0) * amount / 20);

export class Ducker {
    constructor(param) {
        this.param = param;
        this.releaseAt = -Infinity;
    }

    /** A melody note from `start` to `end` (audio seconds), dipping to `floor`. */
    note(start, end, floor) {
        if (!(floor < 1)) return;
        const at = Math.max(0, start - ATTACK);
        // (a release booked for after this note's start is replaced; one already running is overtaken)
        this.param.cancelScheduledValues(at);
        this.param.setTargetAtTime(floor, at, ATTACK_TC);
        this.releaseAt = Math.max(this.releaseAt > at ? this.releaseAt : 0, end + HOLD);
        this.param.setTargetAtTime(1, this.releaseAt, RELEASE_TC);
    }

    reset(time = 0) {
        this.param.cancelScheduledValues(time);
        this.param.setValueAtTime(1, time);
        this.releaseAt = -Infinity;
    }
}

/** A render chunk's duck for `role` from the piece's notes (times from the piece's start). */
export function automateDuck(param, role, notes, amount, from) {
    const ducker = new Ducker(param);
    param.setValueAtTime(1, 0);
    for (const n of notes) {
        const floor = DUCKED_BY[role]?.[n.role] ? duckFloor(role, n.role, amount) : 1;
        if (floor < 1 && n.time + n.duration + 1 > from) ducker.note(n.time - from, n.time - from + n.duration, floor);
    }
}
