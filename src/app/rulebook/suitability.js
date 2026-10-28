// Which music each optional composition rule suits, as data: the start of a rule-to-style map for choosing rules when
// presets are generated instead of hand-made. The reasoning, evidence and preset lists are in docs/COMPOSITION_PLAN.md
// ("Where each rule belongs"); this file is what code can read. A rule that is added to the plan adds an entry here, and
// suitability.test.js checks every entry against the rulebook and the preset library.
//
// styles     - genres and feels the rule suits (STYLES below)
// ensembles  - pad and bass combinations it suits (ENSEMBLES below)
// avoid      - the same two lists, where the rule should stay off
// amounts    - the suggested slider value per style; the first of a preset's styles with an entry wins
// choices    - the suggested option per style or ensemble, for rules that pick an option instead of an amount
// moods      - (progression-mode only) a named mood, from MOODS in composition/progressionGen.js, to start from for each style
// candidates - presets that are not using the rule yet but could, to try by ear
export const STYLES = ['electro', 'synthwave', 'twostep', 'breaks', 'bossa', 'lofi', 'jazz', 'saloon', 'waltz', 'folk', 'pastoral',
    'game-drive', 'game-folk', 'cinematic', 'cinematic-drive', 'ambient', 'drone', 'piano', 'sleep', 'podcast', 'sparse', 'chip-arp', 'modal', 'atonal'];
export const ENSEMBLES = ['piano', 'keys+bass', 'guitar+bass', 'pluck+bass', 'synth-pad+bass', 'strings+bass', 'organ+bass', 'drone-bass', 'solo-pad', 'arp-pad+bass'];

export const SUITABILITY = {
    'lead-syncopation': {
        styles: ['electro', 'synthwave', 'twostep', 'breaks', 'bossa', 'lofi', 'jazz', 'saloon', 'game-drive', 'cinematic-drive'],
        ensembles: [],
        avoid: { styles: ['sleep', 'podcast', 'ambient', 'drone', 'piano', 'sparse'], ensembles: ['solo-pad', 'drone-bass'] },
        amounts: { breaks: 0.5, twostep: 0.55, bossa: 0.4, electro: 0.3, synthwave: 0.3, saloon: 0.35, 'cinematic-drive': 0.3, 'game-drive': 0.25, lofi: 0.2, jazz: 0.3, 'game-folk': 0.15 },
        candidates: ['Bittersweet Sunday', 'Quiet-room waltz', 'Fireside folk', 'Clockwork', 'Glass garden', 'Sunrise in seven'],
    },
    'pad-root': {
        styles: ['electro', 'synthwave', 'game-drive', 'game-folk', 'folk', 'cinematic-drive', 'lofi'],
        ensembles: ['guitar+bass', 'pluck+bass', 'synth-pad+bass', 'strings+bass'],
        avoid: { styles: ['piano', 'drone', 'sleep'], ensembles: ['piano', 'keys+bass', 'organ+bass', 'drone-bass', 'solo-pad', 'arp-pad+bass'] },
        amounts: {},
        // arpeggio and sequence pad styles ignore the rule (the planner keeps the full chord there)
        choices: { 'guitar+bass': 'unlessBass', 'pluck+bass': 'unlessBass', 'synth-pad+bass': 'unlessBass', 'strings+bass': 'unlessBass' },
        candidates: [],
    },
    'chord-size-by-function': {
        styles: ['saloon', 'waltz', 'game-drive', 'cinematic-drive', 'cinematic', 'electro'],
        ensembles: ['keys+bass', 'synth-pad+bass', 'strings+bass', 'organ+bass'],
        avoid: { styles: ['jazz', 'bossa', 'lofi', 'drone', 'sleep', 'sparse'], ensembles: ['drone-bass'] },
        amounts: {},
        // needs padNotes of 4 or 5; a progression with no V or vii chord becomes all triads
        choices: { saloon: 'functional', waltz: 'functional', 'game-drive': 'functional', 'cinematic-drive': 'functional', cinematic: 'functional', electro: 'functional' },
        candidates: ['Chapel organ', 'Soft Landing'],
    },
    'lead-inertia': {
        styles: ['folk', 'pastoral', 'waltz', 'game-folk', 'cinematic', 'piano', 'sleep'],
        ensembles: [],
        avoid: { styles: ['chip-arp', 'ambient'], ensembles: ['arp-pad+bass'] },
        amounts: { folk: 0.4, pastoral: 0.4, waltz: 0.4, 'game-folk': 0.4, cinematic: 0.4, piano: 0.3, sleep: 0.3 },
        candidates: ['Fireside folk', 'Nervous Chicken Village', 'Slightly Lost Forest', 'Quiet-room waltz', 'Bittersweet Sunday', 'Mushroom Kingdom Commute', 'Heroic Field Trip', 'Tears in Weather', 'Sunday Reading'],
    },
    'pad-contour': {
        styles: ['cinematic', 'pastoral', 'ambient', 'synthwave', 'game-drive'],
        ensembles: ['strings+bass', 'organ+bass', 'synth-pad+bass', 'keys+bass'],
        avoid: { styles: ['drone', 'sleep', 'podcast', 'sparse'], ensembles: ['drone-bass', 'arp-pad+bass', 'solo-pad'] },
        amounts: { cinematic: 0.4, pastoral: 0.4, ambient: 0.3, synthwave: 0.4, 'game-drive': 0.3 },
        candidates: ['Wide Open Plains', 'Choir at sea', 'Seaside Hearth', 'Chapel organ', 'Piano and Pads', 'Real Hero Hours', 'Outrun Lullaby', 'Oxygene Sunrise', 'Boss Fight, Politely', 'Heroic Field Trip'],
    },
    'lead-tendency': {
        // acts only while note resolution is on; the closing note of a phrase is left alone
        styles: ['folk', 'pastoral', 'waltz', 'game-folk', 'cinematic', 'piano', 'saloon', 'jazz', 'sleep'],
        ensembles: [],
        avoid: { styles: ['modal', 'atonal', 'ambient', 'drone', 'chip-arp'], ensembles: ['arp-pad+bass'] },
        amounts: { folk: 0.5, pastoral: 0.5, waltz: 0.5, 'game-folk': 0.4, cinematic: 0.5, piano: 0.4, saloon: 0.5, jazz: 0.3, sleep: 0.3 },
        candidates: ['Fireside folk', 'Quiet-room waltz', 'Heroic Field Trip', 'Solo Grand', 'Pure Piano', 'Tears in Weather', 'Pint-Sized Saloon'],
    },
    'bass-euclid': {
        // acts on the grouped ("half") and driving bass styles; walking and whole-note basses are left alone
        styles: ['electro', 'synthwave', 'twostep', 'breaks', 'bossa', 'game-drive', 'cinematic-drive', 'lofi'],
        ensembles: ['synth-pad+bass', 'pluck+bass', 'guitar+bass'],
        avoid: { styles: ['jazz', 'saloon', 'drone', 'sleep', 'podcast', 'piano'], ensembles: ['drone-bass', 'solo-pad'] },
        amounts: { breaks: 0.4, twostep: 0.4, bossa: 0.3, electro: 0.3, synthwave: 0.3, 'game-drive': 0.25, 'cinematic-drive': 0.3, lofi: 0.2 },
        candidates: ['Demo: Bass figures', 'Pastel Coastline', 'Island Shop Hours', 'Turnip Town', 'Sunrise in seven'],
    },
    'borrow-style': {
        // only matters while borrowed chords are on (chordBorrow above 0); a progression with no IV, VI or VII slot has nothing to weight
        styles: ['folk', 'game-folk', 'game-drive', 'cinematic', 'cinematic-drive', 'synthwave', 'electro', 'lofi'],
        ensembles: [],
        avoid: { styles: ['jazz', 'modal', 'atonal', 'drone', 'sleep'], ensembles: [] },
        amounts: {},
        choices: { folk: 'corpus', 'game-folk': 'corpus', 'game-drive': 'corpus', cinematic: 'corpus', 'cinematic-drive': 'corpus', synthwave: 'corpus', electro: 'corpus', lofi: 'corpus' },
        candidates: ['Heroic Field Trip', 'Boss Fight, Politely', 'Outrun After Midnight', 'Neon Overpass'],
    },
    'pad-vibrato': {
        // only oscillator pads and second leads without vibrato of their own; FM, piano, plucked, Wasm, classic and DIY sounds are skipped
        styles: ['ambient', 'cinematic', 'pastoral', 'synthwave', 'drone', 'sleep'],
        ensembles: ['synth-pad+bass', 'strings+bass', 'solo-pad', 'drone-bass'],
        avoid: { styles: ['podcast', 'chip-arp', 'sparse'], ensembles: ['piano', 'arp-pad+bass', 'pluck+bass', 'guitar+bass'] },
        amounts: { ambient: 0.3, cinematic: 0.3, pastoral: 0.3, synthwave: 0.3, drone: 0.4, sleep: 0.2 },
        candidates: ['Deep night', 'Slow motion', 'Breathing room', 'Mild Vacuum', 'Dig Straight Down', 'Wide Open Plains', 'Seaside Hearth', 'Lamplight', 'Tears in Weather', 'Oxygene Sunrise', 'Real Hero Hours', 'Outrun Lullaby', 'Getaway Driver, Off Duty', 'Nightcall, Voicemail', 'Altman'],
    },
    'progression-mode': {
        // generated chords follow rock-corpus statistics, so they suit pop, rock, game and electronic loops; hand-picked library progressions
        // stay better for functional jazz and classical-leaning music, and for presets that rely on an unresolved bank entry.
        // `moods` names a starting point (MOODS in composition/progressionGen.js) for each style.
        styles: ['ambient', 'sleep', 'cinematic', 'cinematic-drive', 'synthwave', 'electro', 'lofi', 'game-drive', 'game-folk', 'folk', 'pastoral', 'twostep', 'breaks'],
        ensembles: [],
        avoid: { styles: ['jazz', 'saloon', 'waltz', 'bossa', 'atonal', 'modal'], ensembles: [] },
        amounts: {},
        choices: { ambient: 'generated', sleep: 'generated', cinematic: 'generated', 'cinematic-drive': 'generated', synthwave: 'generated', electro: 'generated', lofi: 'generated', 'game-drive': 'generated', 'game-folk': 'generated', folk: 'generated', pastoral: 'generated', twostep: 'generated', breaks: 'generated' },
        moods: { ambient: 'dreamy', sleep: 'warm', cinematic: 'bittersweet', 'cinematic-drive': 'dark', synthwave: 'wistful', electro: 'tense', lofi: 'bittersweet', 'game-drive': 'hopeful', 'game-folk': 'warm', folk: 'warm', pastoral: 'warm', twostep: 'wistful', breaks: 'tense' },
        candidates: ['Deep night', 'Slow motion', 'Getaway Driver, Off Duty', 'Outrun After Midnight', 'Neon Overpass', 'Morning coffee', 'Heroic Field Trip', 'Fireside folk', 'Wet Pavement Two-Step'],
    },
};

const matches = (list, wanted) => wanted.some((w) => list.includes(w));

/**
 * The rules that suit a preset described by its styles and ensemble, each with a suggested setting (null when the
 * registry has none for this profile). `profile` is { styles: [...], ensemble: 'guitar+bass' }. A rule is offered when
 * a style or the ensemble suits it and neither is on its avoid list.
 */
export function suggestRules({ styles = [], ensemble = null } = {}) {
    const out = [];
    for (const [id, rule] of Object.entries(SUITABILITY)) {
        const blocked = matches(rule.avoid.styles, styles) || (ensemble && rule.avoid.ensembles.includes(ensemble));
        const suited = matches(rule.styles, styles) || (ensemble && rule.ensembles.includes(ensemble));
        if (blocked || !suited) continue;
        const keys = ensemble ? [...styles, ensemble] : styles;
        const amountKey = keys.find((k) => rule.amounts[k] !== undefined), choiceKey = keys.find((k) => rule.choices?.[k] !== undefined);
        const moodKey = rule.moods ? styles.find((k) => rule.moods[k] !== undefined) : undefined;
        out.push({ rule: id, value: amountKey !== undefined ? rule.amounts[amountKey] : choiceKey !== undefined ? rule.choices[choiceKey] : null, ...(moodKey !== undefined ? { mood: rule.moods[moodKey] } : {}) });
    }
    return out;
}
