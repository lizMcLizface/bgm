// Fingering for the hero view: the generator thinks in pitches, a fretboard needs a string and a fret for
// each. Notes are first folded by octaves into what the instrument can sound, then each moment (a note, or a
// chord) is given a shape, and the shapes of a run of moments are chosen together (Viterbi) so the fretting
// hand moves as little as possible, stays within a four-fret reach and does not reuse a string that is still ringing.

export const NECKS = {
    guitar: { strings: [40, 45, 50, 55, 59, 64], frets: 22 },
    bass: { strings: [28, 33, 38, 43], frets: 20 },
};

const REACH = 4;
const SHAPES_KEPT = 8;

/** The pitch moved by octaves to the nearest one the neck can sound. */
export function foldIntoNeck(midi, neck) {
    const low = neck.strings[0], high = neck.strings.at(-1) + neck.frets;
    let folded = midi;
    while (folded < low) folded += 12;
    while (folded > high) folded -= 12;
    return folded;
}

const positionsOf = (midi, neck) => neck.strings.flatMap((open, string) => (midi >= open && midi - open <= neck.frets ? [{ midi, string, fret: midi - open }] : []));

const centre = (shape) => {
    const fretted = shape.filter((p) => p.fret > 0);
    return fretted.length ? fretted.reduce((sum, p) => sum + p.fret, 0) / fretted.length : null;
};
const meanString = (shape) => shape.reduce((sum, p) => sum + p.string, 0) / shape.length;

// How awkward a shape is on its own: a stretch beyond the reach, and a little for sitting high up the neck.
const shapeCost = (shape) => {
    const fretted = shape.filter((p) => p.fret > 0).map((p) => p.fret);
    const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    return Math.max(0, span - REACH + 1) * 20 + fretted.reduce((sum, f) => sum + f, 0) * 0.02 / Math.max(1, fretted.length);
};

/** Every way to put the (folded, distinct) pitches of one moment on distinct strings, the least awkward first. */
export function shapesFor(pitches, neck) {
    const shapes = [];
    const place = (index, taken, shape) => {
        if (index === pitches.length) { shapes.push(shape); return; }
        for (const position of positionsOf(pitches[index], neck)) {
            if (!taken.has(position.string)) place(index + 1, new Set([...taken, position.string]), [...shape, position]);
        }
    };
    place(0, new Set(), []);
    // a chord that cannot be fingered at once drops its lowest note, so the moment still has some shape
    if (!shapes.length && pitches.length > 1) return shapesFor(pitches.slice(1), neck);
    return shapes.map((shape) => ({ shape, cost: shapeCost(shape) })).sort((a, b) => a.cost - b.cost).slice(0, SHAPES_KEPT);
}

// What the hand has to do to get from one shape to the next.
const move = (from, to, gap, busy) => {
    const [a, b] = [centre(from.shape), centre(to.shape)];
    const rush = gap > 0.8 ? 0.5 : 1; // there is time to reposition between distant moments
    let cost = a !== null && b !== null ? Math.abs(a - b) * rush : 0;
    cost += Math.abs(meanString(from.shape) - meanString(to.shape)) * 0.15;
    if (busy) for (const p of to.shape) if (from.shape.some((q) => q.string === p.string && q.midi !== p.midi)) cost += 12;
    return cost;
};

/**
 * Chooses a shape for each moment. `moments`: [{ time, end, pitches }] in order, the pitches already folded and
 * distinct; `before`: the shape the hand is in and when it stops ringing, { shape, time, end }, or null.
 * Returns, per moment, a list of { midi, string, fret }.
 */
export function fingerMoments(moments, neck, before = null) {
    if (!moments.length) return [];
    const options = moments.map((m) => shapesFor(m.pitches, neck));
    const start = before ? { shape: before.shape, cost: shapeCost(before.shape) } : null;
    let previous = options[0].map((o) => ({ ...o, total: o.cost + (start ? move(start, o, moments[0].time - before.time, before.end > moments[0].time) : 0), from: -1 }));
    const history = [previous];
    for (let i = 1; i < moments.length; i++) {
        const gap = moments[i].time - moments[i - 1].time, busy = moments[i - 1].end > moments[i].time;
        previous = options[i].map((o) => {
            let best = { total: Infinity, from: -1 };
            previous.forEach((p, index) => {
                const total = p.total + move(p, o, gap, busy);
                if (total < best.total) best = { total, from: index };
            });
            return { ...o, total: best.total + o.cost, from: best.from };
        });
        history.push(previous);
    }
    let index = previous.reduce((best, o, i) => (o.total < previous[best].total ? i : best), 0);
    const chosen = new Array(moments.length);
    for (let i = moments.length - 1; i >= 0; i--) { chosen[i] = history[i][index].shape; index = history[i][index].from; }
    return chosen;
}
