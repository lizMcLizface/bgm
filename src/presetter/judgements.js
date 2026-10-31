// What the audio judges (tools/judgeLibrary.mjs: measurements, Essentia and CLAP over a render of each preset) said about each preset, shown
// in the presetter table. Generated into judgements.json, keyed by preset name; scores are for comparing presets, not absolute truths.
import data from './judgements.json';

export const JUDGEMENTS = data.presets ?? {};
const FEEL_ORDER = ['relaxed', 'sad', 'happy', 'aggressive', 'party', 'danceable'];

/** The Essentia mood heads that are clearly on (>= .5), strongest first: "relaxed · sad". */
export function feel(j, min = 0.5) {
    if (!j?.feel) return '';
    return FEEL_ORDER.filter((k) => j.feel[k] >= min).sort((a, b) => j.feel[b] - j.feel[a]).join(' · ');
}
/** "acoustic" / "electronic" / "mixed": what the sound is made of. */
export function texture(j) {
    if (!j?.feel) return '';
    return j.feel.acoustic >= 0.5 ? 'acoustic' : j.feel.electronic >= 0.7 ? 'electronic' : 'mixed';
}
const top = (list, n) => (list ?? []).slice(0, n).map(([name]) => name).join(', ');
export const styles = (j, n = 2) => top(j?.styles, n);
export const instruments = (j, n = 2) => top(j?.instruments, n);

export const median = (values) => {
    const v = values.filter(Number.isFinite).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
};
/** 'loud' / 'quiet' when `lufs` is more than `within` dB from the library median, '' otherwise. */
export const levelClass = (lufs, mid, within = 3) => (!Number.isFinite(lufs) || mid == null ? '' : lufs > mid + within ? 'loud' : lufs < mid - within ? 'quiet' : '');

const pct = (p) => `${Math.round(p * 100)}%`;
const listing = (list) => (list ?? []).map(([n, p]) => `${n} ${pct(p)}`).join(', ');
/** Everything known about a preset, for a tooltip. */
export function detail(j) {
    if (!j) return 'No audio judgement yet';
    const b = j.bands ?? [];
    return [
        `${j.lufs} LUFS (range ${j.range} dB, quietest 3 s ${j.quietest}), peak ${j.peak} dB, centroid ${j.centroid} Hz, ${j.onsets} onsets/s, silent ${pct(j.silent)}`,
        b.length ? `energy: sub ${pct(b[0])}, low ${pct(b[1])}, mid ${pct(b[2])}, high ${pct(b[3])}, air ${pct(b[4])}` : '',
        j.feel ? 'Essentia: ' + Object.entries(j.feel).map(([k, p]) => `${k} ${pct(p)}`).join(', ') : '',
        j.styles ? `styles: ${listing(j.styles)}` : '',
        j.moodThemes ? `mood / theme: ${listing(j.moodThemes)}` : '',
        j.instruments ? `instruments: ${listing(j.instruments)}` : '',
        j.genres ? `genres: ${listing(j.genres)}` : '',
        j.clap ? 'CLAP: ' + Object.entries(j.clap).map(([g, v]) => `${g} ${listing(v)}`).join(' | ') : '',
        j.variation != null ? `variation ${j.variation}` : '',
    ].filter(Boolean).join('\n');
}

/** The words the table's search also looks through for a preset. */
export const searchText = (j) => (j ? [feel(j, 0.3), texture(j), styles(j, 4), instruments(j, 4), top(j.moodThemes, 4), top(j.genres, 3), ...Object.values(j.clap ?? {}).map((v) => top(v, 3))].join(' ') : '');
