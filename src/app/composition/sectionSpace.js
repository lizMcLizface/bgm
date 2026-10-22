// Section space (settings.sectionSpace, 0..1): one extra wide room every voice sends to, more in
// intros and breakdowns, a little in builds and almost nothing in full sections, so the piece
// opens out and comes close again with its form. After each voice's own effects, so it works the
// same on every engine; built only while the setting is above 0. The send glides over two bars.
import { cleanRack } from '../../synths/effects/params';
import { effectTail } from '../../synth-lab/effectsConfig';
import { rackPackets } from '../../synths/effects/params';

export const SPACE_RACK = { ...cleanRack(), 'effects.dry': 0, 'effects.reverb': 0.7, 'effects.decay': 6, 'effects.size': 0.95,
    'effects.width': 1, 'effects.damping': 4500, 'effects.predelay': 40, 'effects.modulation': 0.4 };
const BY_SECTION = { intro: 0.6, breakdown: 1, build: 0.35, full: 0.08 };
// bass and drums blur first: they send less
export const SPACE_ROLE = { lead: 1, counter: 1, pad: 1, bass: 0.3, perc: 0.5 };

/** The send to the space for a bar's section (0 without sections or with the setting off). */
export const sectionSpaceLevel = (section, amount) => (amount > 0 && section ? (BY_SECTION[section.type] ?? 0.2) * amount * 0.5 : 0);
export const spaceTail = () => effectTail(rackPackets(SPACE_RACK).effects);
