// Deterministic, smoothly joined random waypoints. This RNG is independent of
// the composer's RNG, so visuals can never change which notes get generated.
function random(seed, role, knot, axis) {
    const text = `${seed}/${role}/${knot}/${axis}`;
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const catmull = (a, b, c, d, t) => 0.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t);
const derivative = (a, b, c, d, t) => 0.5 * ((-a+c) + 2*(2*a-5*b+4*c-d)*t + 3*(-a+3*b-3*c+d)*t*t);

export function voicePath(role, travel, seed = 1) {
    const period = 13 + random(seed, role, 0, 'period') * 12;
    const position = travel / period + random(seed, role, 0, 'phase') * 8;
    const knot = Math.floor(position), t = position - knot;
    const axis = (name) => {
        const p = [-1, 0, 1, 2].map((offset) => 0.16 + 0.68 * random(seed, role, knot + offset, name));
        return [clamp(catmull(...p, t), 0.08, 0.92), derivative(...p, t) / period];
    };
    const [x, dx] = axis('x'), [y, dy] = axis('y');
    return { x, y, heading: Math.atan2(dy, dx) };
}

export function createVoiceMotion(seed = 1) {
    let lastClock = null, travel = 0;
    return {
        advance(clock, speed = 1, reduced = false) {
            if (lastClock !== null) travel += clamp(clock - lastClock, 0, 0.25) * speed * (reduced ? 0.2 : 1);
            lastClock = clock;
        },
        at(role, moving = true) { return voicePath(role, moving ? travel : 0, seed); },
    };
}
