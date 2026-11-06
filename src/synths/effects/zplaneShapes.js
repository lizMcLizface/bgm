// Shapes for the rack's z-plane filter (extras.js, and the 'rack-zplane' worklet in public/rack-fx-processor.js).
//
// A shape is up to twelve sections (a built-in one uses six at most; the rest are left neutral); each section is one pole pair with one zero pair at the same angle on the z-plane, written in Hz so it
// does not depend on the sample rate: [centre Hz, pole bandwidth Hz, boost dB]. The zeros sit wider than the poles for a boost (a
// peak) and narrower for a cut (a notch), so a section with 0 dB does nothing. The filter morphs by sliding every section's
// frequency, bandwidth and boost from one shape to another.
//
// The five vowels come from the tenor formant table in the Csound manual ("Formant Values" appendix: centre frequency, level in dB
// below the first formant, and bandwidth), also found in Perry Cook's STK Phonemes and the Faust physical-modelling formant tables.
// Those levels are for formants added side by side; here the formants are cascaded boosts, so a level is turned into a boost with
// BOOST (the first formant 18 dB, a formant 30 dB down 4.5 dB).

const BOOST = (level) => Math.max(2, Math.min(18, 18 + level * 0.45));
const NEUTRAL = [5500, 1000, 0];
const SECTIONS = 12;
const fill = (rows) => [...rows, ...Array(SECTIONS - rows.length).fill(NEUTRAL)];
// a vowel from Csound-style rows: [frequency, level in dB, bandwidth]
const vowel = (rows) => fill(rows.map(([f, level, bw]) => [f, bw, BOOST(level)]));

export const ZPLANE_SHAPES = [
    { name: 'Ah', sections: vowel([[650, 0, 80], [1080, -6, 90], [2650, -7, 120], [2900, -8, 130], [3250, -22, 140]]) },
    { name: 'Eh', sections: vowel([[400, 0, 70], [1700, -14, 80], [2600, -12, 100], [3200, -14, 120], [3580, -20, 120]]) },
    { name: 'Ee', sections: vowel([[290, 0, 40], [1870, -15, 90], [2800, -18, 100], [3250, -20, 120], [3540, -30, 120]]) },
    { name: 'Oh', sections: vowel([[400, 0, 40], [800, -10, 80], [2600, -12, 100], [2800, -12, 120], [3000, -26, 120]]) },
    { name: 'Oo', sections: vowel([[350, 0, 40], [600, -20, 60], [2700, -17, 100], [2900, -14, 120], [3300, -26, 120]]) },
    { name: 'Nasal', sections: fill([[270, 80, 10], [1000, 300, -14], [2200, 200, 10], [3000, 300, 8], [4500, 500, -8]]) },
    { name: 'Hollow', sections: fill([[450, 140, -16], [1100, 250, -18], [1800, 300, -14], [2800, 400, -12], [3900, 500, -10], [5200, 600, -8]]) },
    { name: 'Dark', sections: fill([[150, 150, 6], [3000, 3000, -10], [6000, 4000, -16], [1500, 1500, -3]]) },
    { name: 'Bright', sections: fill([[200, 200, -8], [500, 500, -4], [5000, 4000, 10], [9000, 6000, 8]]) },
    { name: 'Telephone', sections: fill([[150, 200, -18], [400, 300, -8], [1800, 900, 8], [3400, 1000, 2], [6000, 3000, -18], [9000, 4000, -20]]) },
    { name: 'Wah low', sections: fill([[450, 130, 18], [1200, 500, 6], [2800, 1800, -4], [6000, 4000, -8]]) },
    { name: 'Wah high', sections: fill([[1800, 300, 18], [3200, 800, 8], [600, 500, -6], [7000, 4000, -6]]) },
];
export const ZPLANE_SHAPE_NAMES = ZPLANE_SHAPES.map((s) => s.name);

// The two custom shapes (one for each side, A and B): up to twelve nodes each, kept as rack parameters so that an edited shape travels with the
// rack settings: 'zplane.ca0f' is the frequency of A's first node, 'ca0w' its bandwidth, 'ca0d' its boost, 'cb3d' the fourth node of B's boost,
// and 'can' how many nodes A has. The nodes are the first rows, in order of frequency; the rows after them are neutral. A shape index past
// the built-in ones means "use this side's custom nodes".
export const ZPLANE_CUSTOM = ZPLANE_SHAPES.length;
ZPLANE_SHAPE_NAMES.push('Custom');
export const ZPLANE_MAX_NODES = SECTIONS;
export const ZPLANE_PARTS = ['f', 'w', 'd'];
export const customKey = (side, section, part) => `c${side}${section}${part}`;
export const countKey = (side) => `c${side}n`;
/** Where the rows of a custom shape wait before they are used: spread over the range, no boost. */
export const FLAT_ROWS = Array.from({ length: SECTIONS }, (_, i) => { const f = Math.round(110 * (9000 / 110) ** (i / (SECTIONS - 1))); return [f, Math.round(f * 0.4), 0]; });
export const DEFAULT_NODES = 6;
const clampTo = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const widthFor = (f) => Math.round(clampTo(f * 0.3, 40, 2500));
/** The rows of a custom side from a lookup of short keys ('ca0f'). */
export const customRows = (get, side) => FLAT_ROWS.map((_, i) => ZPLANE_PARTS.map((part) => get(customKey(side, i, part))));
export const customCount = (get, side) => clampTo(Math.round(get(countKey(side))) || DEFAULT_NODES, 1, SECTIONS);
/** The rows of the shape an index names on a side: a built-in shape's, or the custom numbers. */
export const shapeRows = (index, side, get) => {
    const i = Math.round(index);
    return i >= ZPLANE_CUSTOM ? customRows(get, side) : ZPLANE_SHAPES[Math.max(0, i)].sections;
};
export const sortRows = (rows) => [...rows].sort((x, y) => x[0] - y[0]);
export const isFlat = (rows) => rows.every((r) => Math.abs(r[2]) < 0.01);
/** Nodes (a few rows) laid into the twelve rows of a shape: the nodes first, in order of frequency, then neutral rows. */
export function padNodes(nodes) {
    const sorted = sortRows(nodes).slice(0, SECTIONS).map((r) => [...r]);
    return { rows: [...sorted, ...FLAT_ROWS.slice(sorted.length).map((r) => [...r])], count: Math.max(1, sorted.length) };
}
/** The nodes of the shape an index names: a custom shape's own, or the sections a built-in shape actually uses (those with a boost or cut). */
export function nodesOf(index, side, get) {
    if (Math.round(index) >= ZPLANE_CUSTOM) return { rows: customRows(get, side), count: customCount(get, side) };
    const used = shapeRows(index, side, get).filter((r) => Math.abs(r[2]) >= 0.25);
    return padNodes(used.length ? used : [FLAT_ROWS[2]]);
}
/** One more node at [frequency, bandwidth, boost] among `count` nodes; null when there is no room. */
export function insertNode(rows, count, node) {
    if (count >= SECTIONS) return null;
    return padNodes([...rows.slice(0, count), node]);
}
/** The nodes without node `i`; null when it is the only one. */
export function dropNode(rows, count, i) {
    if (count <= 1) return null;
    return padNodes(rows.slice(0, count).filter((_, k) => k !== i));
}
/** The frequency in the middle (on the log axis) of the widest gap between nodes, where a new node does the most good. */
export function gapFrequency(rows, count) {
    const edges = [40, ...rows.slice(0, count).map((r) => r[0]), 12000].sort((x, y) => x - y);
    let best = [0, 0];
    for (let i = 0; i < edges.length - 1; i++) { const gap = Math.log(edges[i + 1] / edges[i]); if (gap > best[0]) best = [gap, i]; }
    return Math.sqrt(edges[best[1]] * edges[best[1] + 1]);
}
/** The node that does the least (the smallest boost or cut, the highest on a tie). */
export function weakestNode(rows, count) {
    let at = 0;
    for (let i = 1; i < count; i++) if (Math.abs(rows[i][2]) <= Math.abs(rows[at][2])) at = i;
    return at;
}
/** The same nodes with `n` of them: new ones go into the widest gaps with no boost, the weakest ones are taken out. */
export function resizeNodes(rows, count, n) {
    let now = { rows, count };
    while (now.count < n) { const f = gapFrequency(now.rows, now.count), next = insertNode(now.rows, now.count, [f, widthFor(f), 0]); if (!next) break; now = next; }
    while (now.count > n) { const next = dropNode(now.rows, now.count, weakestNode(now.rows, now.count)); if (!next) break; now = next; }
    return now;
}
/** Nodes from saved or stored data (up to twelve of [frequency, bandwidth, boost]), cleaned up and laid into rows, or null. */
export function cleanNodes(raw) {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > SECTIONS) return null;
    const nodes = raw.map((r) => Array.isArray(r) && r.length === 3 && r.every(Number.isFinite) ? [clampTo(r[0], 20, 12000), clampTo(r[1], 8, 8000), clampTo(r[2], -30, 30)] : null);
    return nodes.every(Boolean) ? padNodes(nodes) : null;
}
