import { INSTRUMENTS, anchorStrings, stringLetter } from './MiniFretboard';

// How each pattern block starts, until the visitor changes it: what the first panel shows (mode), which voices
// it follows (lead, counter = second lead, pad = rhythm, bass) and whether notes are tracked (only for one voice).
export const PATTERN_DEFAULTS = {
    piano: { mode: 'played', voices: ['lead', 'counter', 'pad', 'bass'], track: false },
    guitar: { mode: 'played', voices: ['pad'], track: true },
    bass: { mode: 'played', voices: ['bass'], track: true },
};

/** The options of every block with the defaults filled in. */
export const resolvePatternOptions = (options = {}) => Object.fromEntries(Object.entries(PATTERN_DEFAULTS).map(([id, defaults]) => [id, { ...defaults, ...options[id] }]));

/** What a link's `patterns=` says per block ({ mode, anchorLetter, voices, exact, track }), as the options a block keeps ({ ..., anchor }). */
export const linkedBlockOptions = (options) => Object.fromEntries(Object.entries(options).map(([id, { mode, anchorLetter, voices, exact, track }]) => {
    const strings = INSTRUMENTS[id]?.strings, anchor = strings && anchorStrings(strings).find((index) => stringLetter(strings, index) === anchorLetter);
    return [id, { ...(mode ? { mode } : {}), ...(anchor !== undefined ? { anchor } : {}), ...(voices ? { voices } : {}), ...(exact === false ? { exact } : {}), ...(track !== undefined ? { track } : {}) }];
}));
