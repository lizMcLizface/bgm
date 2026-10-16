// Starter synth presets for the generator, by category. The sounds
// themselves are data: src/library/voices.json ({ category: { name:
// preset } }), in the same flat format as src/util/presetData.js (missing
// keys take PolySynth's defaults - see engine/presetDefaults.js), so they
// load in unCAGED's synth tab too. Tuned for calm background use;
// masterVolume is set per preset so all of them sit at a similar loudness
// (measured, see docs/DESIGN.md). Listing and lookup: editor/presetStore.js;
// whole setups made from them: library/scenes.json (scenes.js).
//
// Units, for editing: times in seconds; filter cutoffs in Hz (max 11000);
// filterEnvAmount in cents (1200 = one octave of sweep); detune/spread in
// cents; vibratoDepth in cents, vibratoRate in Hz; *Amount = dry/wet 0..1.

import voices from '../library/voices.json';

export const PRESET_CATEGORIES = voices;

/** All generator presets by name (names are unique across categories). */
export const GENERATIVE_PRESETS = Object.assign({}, ...Object.values(PRESET_CATEGORIES));

/** Each role's preset on a fresh page (and when a link names none). */
export const ROLE_PRESETS = { lead: 'Glass Lead', pad: 'Soft Pad', bass: 'Warm Bass', counter: 'Soft Flute' };

/** Each role's default mix volume (settings.volumes). */
export const ROLE_VOLUMES = { lead: 0.7, counter: 0.6, pad: 0.8, bass: 0.8, perc: 0.7 };

/** The category listed first in each role's preset picker. */
export const ROLE_CATEGORY = { pad: 'Pads', bass: 'Bass', lead: 'Leads', counter: 'Leads' };
