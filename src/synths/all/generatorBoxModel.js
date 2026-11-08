// Section metadata and the generator's bound song-control recipes. Every page
// shares one fixed display and four encoders. GeneratorControls assigns the
// live Control, Evolution, Wander and Rules banks; seqValues / seqPatch bind
// Scale, Progression and Tempo to the captured song.
//
import { SCALE_FAMILIES, TONIC_NAMES } from '../../app/theory';
import BANK from '../../app/progressions';
import { METERS as METER_TABLE } from '../../app/meter';
import { BPM_LIMITS } from '../../app/conductor';

// Knob kinds: 'choice' (turns through a list), 'value' (turns through a range), 'toggle' (press only).
// `press`: what pressing the knob does ('toggle' flips the thing on or off, 'pick' opens a picker on the display, null nothing).

export const KEYS = TONIC_NAMES;
export const FAMILIES = SCALE_FAMILIES.map(f => f.family);
export const MODES = Object.fromEntries(SCALE_FAMILIES.map(f => [f.family, f.modes.map(m => m.name)]));
export const PROGRESSIONS = BANK.map(chords => ({ name: chords.join('–'), chords }));
export const METER_IDS = Object.keys(METER_TABLE);
export const METERS = METER_IDS;
export const BARS_PER_CHORD = [1, 2, 4];
export const EVOLUTION_KINDS = ['Key', 'Mode', 'Key change', 'Progression', 'Tempo'];
export const WANDER_KINDS = ['Pan', 'Volume', 'Filter', 'Pitch'];
export const WANDER_VOICES = ['Lead', '2nd lead', 'Rhythm', 'Pad', 'Bass', 'Drums'];
export const RULE_CATEGORIES = ['Lead', '2nd lead', 'Rhythm', 'Pad', 'Bass', 'Drums', 'Harmony'];
export const RULE_OPTIONS = {
 Lead: ['Activity', 'Density', 'Leaps', 'Syncopation', 'Ornaments'],
 '2nd lead': ['Mode', 'Activity', 'Octave'],
 Rhythm: ['Style', 'Pulse rate', 'Direction'],
 Pad: ['Notes per chord', 'Spread', 'Contour', 'Motion'],
 Bass: ['Style', 'Euclid', 'Pedal'],
 Drums: ['Style', 'Activity', 'Variation'],
 Harmony: ['Colour', 'Borrow', 'Mood'],
};

/** The sections, in the order of the buttons. `knobs`: four per section (null: an empty slot, dark). */
export const SECTIONS = [
 { id: 'scale', label: 'Scale', blurb: 'The key and the scale the song lives in',
  knobs: [{ id: 'key', label: 'Key', kind: 'choice', options: KEYS, path: 'tonic' },
   { id: 'family', label: 'Scale', kind: 'choice', options: FAMILIES, path: 'mode' },
   { id: 'mode', label: 'Mode', kind: 'choice', options: null, path: 'mode' }, // options follow the family
   null] },
 { id: 'progression', label: 'Progression', blurb: 'Four chords and how long each one lasts',
  knobs: [{ id: 'progression', label: 'Progression', kind: 'choice', options: PROGRESSIONS.map(p => p.name), path: 'progression' },
   { id: 'chordLength', label: 'Bars / chord', kind: 'choice', options: BARS_PER_CHORD, path: 'barsPerChord' },
   { id: 'generated', label: 'Generate', kind: 'toggle', path: 'progressionMode', press: 'toggle' },
   { id: 'mood', label: 'Mood', kind: 'value', min: 0, max: 1, path: 'mood' }] },
 { id: 'tempo', label: 'Tempo', blurb: 'How fast, and how the bars are counted',
  knobs: [{ id: 'bpm', label: 'BPM', kind: 'value', min: BPM_LIMITS[0], max: BPM_LIMITS[1], step: 1, path: 'bpm' },
   { id: 'meter', label: 'Meter', kind: 'choice', options: METERS, path: 'meter' },
   { id: 'tempoBars', label: 'Bars / chord', kind: 'choice', options: BARS_PER_CHORD, path: 'barsPerChord' },
   { id: 'swing', label: 'Swing', kind: 'value', min: 0, max: 0.6, path: 'swing' }] },
 { id: 'evolution', label: 'Evolution', blurb: 'Let the song change key, mode or tempo over time', onOff: true,
  knobs: [{ id: 'evoOn', label: 'Evolve', kind: 'toggle', path: 'drift.mode', press: 'toggle' },
   { id: 'evoKind', label: 'What', kind: 'choice', options: EVOLUTION_KINDS, press: 'toggle' },
   { id: 'evoAmount', label: 'Chance', kind: 'value', min: 0, max: 1, path: 'drift.*Chance' },
   null] },
 { id: 'wander', label: 'Wander', blurb: 'Slow drift of pan, volume, filter and pitch', onOff: true,
  knobs: [{ id: 'wanOn', label: 'Wander', kind: 'toggle', path: 'wander', press: 'toggle' },
   { id: 'wanKind', label: 'What', kind: 'choice', options: WANDER_KINDS },
   { id: 'wanAmount', label: 'Amount', kind: 'value', min: 0, max: 1, path: 'wander.<voice>.<kind>' },
   { id: 'wanVoice', label: 'Voices', kind: 'choice', options: WANDER_VOICES, press: 'pick' }] },
 { id: 'rules', label: 'Rules', blurb: 'The rulebook, one voice at a time',
  knobs: [{ id: 'ruleCat', label: 'Voice', kind: 'choice', options: RULE_CATEGORIES },
   { id: 'ruleOpt', label: 'Rule', kind: 'choice', options: null }, // follows the voice
   { id: 'ruleVal', label: 'Value', kind: 'value', min: 0, max: 1, press: 'toggle' },
   null] },
 { id: 'control', label: 'Control', blurb: 'The front page\'s control panel, on the display', embeds: 'QuickPanel',
  knobs: [null, null, null, null] },
];

/** The options a knob turns through now (a few follow another knob's choice). */
export function optionsOf(knob, values) {
 if (knob.id === 'mode') return MODES[FAMILIES[values.family ?? 0]];
 if (knob.id === 'ruleOpt') return RULE_OPTIONS[RULE_CATEGORIES[values.ruleCat ?? 0]];
 return knob.options;
}

/** The knob's text, from its value (a choice index, a 0..1 position of a range, or on/off). */
export function knobText(knob, values, pressed) {
 const v = values[knob.id] ?? 0;
 if (knob.kind === 'toggle') return pressed[knob.id] ? 'ON' : 'OFF';
 if (knob.kind === 'choice') { const o = optionsOf(knob, values); return String(o[Math.min(o.length - 1, Math.round(v))] ?? '—'); }
 const x = knob.min + (knob.max - knob.min) * v;
 return knob.step === 1 ? String(Math.round(x)) : `${Math.round(x * 100)}%`;
}

/** A knob's 0..1 position from its value: choices spread evenly over the list. */
export function knobPosition(knob, values) {
 if (knob.kind === 'toggle') return 0;
 if (knob.kind === 'choice') { const n = optionsOf(knob, values).length; return n > 1 ? (values[knob.id] ?? 0) / (n - 1) : 0; }
 return values[knob.id] ?? 0;
}

/** The value a 0..1 position of a knob means. */
export function knobValue(knob, values, position) {
 if (knob.kind === 'choice') return Math.round(position * (optionsOf(knob, values).length - 1));
 return position;
}

const indexOf = (list, x) => Math.max(0, list.indexOf(x));
const clamp01 = x => Math.min(1, Math.max(0, x));

/** The knob values the sequencers' song stands for. seq: { tonic, mode (scale id), progression, barsPerChord, bpm, meter, generated }. */
export function seqValues(seq) {
 const family = Math.max(0, SCALE_FAMILIES.findIndex(f => f.modes.some(m => m.id === seq.mode)));
 const mode = Math.max(0, SCALE_FAMILIES[family].modes.findIndex(m => m.id === seq.mode));
 const bars = indexOf(BARS_PER_CHORD, seq.barsPerChord);
 return { key: seq.tonic, family, mode, progression: seq.progression, chordLength: bars, tempoBars: bars,
  bpm: clamp01((seq.bpm - BPM_LIMITS[0]) / (BPM_LIMITS[1] - BPM_LIMITS[0])), meter: indexOf(METER_IDS, seq.meter) };
}

/** What turning a bound knob changes in the generator's settings (null for a knob the sequencers do not own). Values are the box's, with the turn applied. */
export function seqPatch(id, v) {
 switch (id) {
  case 'key': return { tonic: v.key };
  case 'family': case 'mode': { const f = SCALE_FAMILIES[v.family]; return { mode: f.modes[Math.min(v.mode, f.modes.length - 1)].id }; }
  case 'progression': return { progression: v.progression };
  case 'chordLength': case 'tempoBars': return { barsPerChord: BARS_PER_CHORD[v[id]] };
  case 'meter': return { meter: METER_IDS[v.meter] };
  case 'bpm': return { bpm: Math.round(BPM_LIMITS[0] + v.bpm * (BPM_LIMITS[1] - BPM_LIMITS[0])) };
  default: return null;
 }
}

export const INITIAL_VALUES = { mood: .5, swing: 0,
 evoKind: 0, evoAmount: .25, wanKind: 0, wanAmount: .4, wanVoice: 0, ruleCat: 0, ruleOpt: 0, ruleVal: .6 };
