// How busy a preset sounds, 0 (a bare pad) to 1 (a fast driving sequence),
// for the preset browser's colour. A rough guess from the settings, not a
// measurement: tempo, drums, how fast chords and notes move, the bass style
// and how much the leads play.

const clamp = (x) => Math.max(0, Math.min(1, x));
const DRUM_WEIGHT = { off: 0, heartbeat: 0.3, brushes: 0.5, shaker: 0.5, lofi: 0.6, downtempo: 0.6, electro: 0.9, drive: 1 };
const PAD_WEIGHT = { sustain: 0, pulse: 0.5, arpeggio: 0.7, sequence: 1, rolled: 0.1, stacked: 0.15 };
const BASS_WEIGHT = { whole: 0, half: 0.4, walking: 0.7, drive: 1 };

// The weighted average of a { style: share } map against per-style weights.
function mix(shares, weights, fallback) {
    const total = Object.values(shares || {}).reduce((a, b) => a + b, 0);
    if (!total) return fallback;
    return Object.entries(shares).reduce((sum, [key, share]) => sum + share * (weights[key] ?? 0), 0) / total;
}

export function intensity(s) {
    if (s.playMusic === false) return 0;
    const tempo = clamp((s.bpm - 55) / 105);
    const drums = s.drums && s.drums.style !== 'off' ? (DRUM_WEIGHT[s.drums.style] ?? 0.5) * (0.4 + 0.6 * (s.drums.activity ?? 0.5)) : 0;
    const chords = clamp(1 - ((s.barsPerChord ?? 1) - 1) / 4);
    const pad = mix(s.padWeights, PAD_WEIGHT, 0.2);
    const bass = mix(s.bassWeights, BASS_WEIGHT, 0.2);
    const lead = clamp((s.leadActivity ?? 0.5) * (0.5 + 0.5 * (s.leadDensity ?? 0.5)) + (s.counter && s.counter.mode !== 'off' ? 0.25 * (s.counter.activity ?? 0.5) : 0));
    return clamp(0.2 * tempo + 0.25 * drums + 0.1 * chords + 0.15 * pad + 0.1 * bass + 0.2 * lead);
}

export const INTENSITY_LABELS = ['Very calm', 'Calm', 'Moderate', 'Lively', 'Intense'];
export const intensityLabel = (x) => INTENSITY_LABELS[Math.min(INTENSITY_LABELS.length - 1, Math.floor(x * INTENSITY_LABELS.length))];

// Viridis, sampled at nine points and blended between them.
const VIRIDIS = [[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142], [31, 158, 137], [53, 183, 121], [110, 206, 88], [181, 222, 43], [253, 231, 37]];
export function viridis(x) {
    const at = clamp(x) * (VIRIDIS.length - 1);
    const i = Math.min(VIRIDIS.length - 2, Math.floor(at));
    const f = at - i;
    const [r, g, b] = VIRIDIS[i].map((c, k) => Math.round(c + (VIRIDIS[i + 1][k] - c) * f));
    return `rgb(${r}, ${g}, ${b})`;
}
