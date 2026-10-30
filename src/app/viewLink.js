import { PATTERN_DEFAULTS } from './patternDefaults';

// ?view=landscape (or ?view=fluid, or ?view=plain for no background) opens the page with that background and the interface
// half hidden: only the transport and the timeline show. The parameter stays in the address,
// so a bookmark or a screen-saver link keeps opening that way; it does not change saved preferences.
// &ui=full keeps the whole interface: a link made on the full page carries the background without hiding anything.
const VIEWS = { landscape: 'scenery', fluid: 'fluid', plain: 'off' };

export const viewFromSearch = (search = '') => {
    const params = new URLSearchParams(search), view = params.get('view');
    return VIEWS[view] ? { view, backdrop: VIEWS[view], ...(params.get('ui') === 'full' ? { full: true } : {}) } : null;
};

export const withView = (path, linked) => {
    if (!linked) return path;
    const [base, hash = ''] = path.split('#');
    return `${base}${base.includes('?') ? '&' : '?'}view=${linked.view}${linked.full ? '&ui=full' : ''}${hash ? `#${hash}` : ''}`;
};

// ?patterns=guitar.played.D,bass,piano.scale : which pattern blocks show under the timeline, each with
// its mode (scale | played) and, for the fretboards, the string the root is found on. Only what a link
// names changes; anything not named stays as the visitor has it, and nothing here is saved.
const PATTERN_IDS = ['piano', 'guitar', 'bass'];
const VOICE_LETTERS = { l: 'lead', c: 'counter', p: 'pad', b: 'bass' };
export const patternsFromSearch = (search = '') => {
    const raw = new URLSearchParams(search).get('patterns');
    if (!raw) return null;
    const show = Object.fromEntries(PATTERN_IDS.map((id) => [id, false])), options = {};
    for (const item of raw.split(',')) {
        const [id, mode, anchor, flags = ''] = item.split('.');
        if (!PATTERN_IDS.includes(id)) continue;
        show[id] = true;
        const voices = [...flags].map((letter) => VOICE_LETTERS[letter]).filter(Boolean);
        options[id] = {
            ...(mode === 'played' || mode === 'scale' ? { mode } : {}), ...(anchor ? { anchorLetter: anchor } : {}),
            ...(voices.length ? { voices } : {}), ...(flags.includes('a') ? { exact: false } : {}), ...(/[tf]/.test(flags) ? { track: true } : flags.includes('u') ? { track: false } : {}),
        };
    }
    return { raw, show, options };
};

// letterOf(id, anchor): the note name of the string a fretboard's pattern hangs off.
export const patternsParam = (show, options, letterOf) => PATTERN_IDS.filter((id) => show[id]).map((id) => {
    const defaults = PATTERN_DEFAULTS[id], o = { ...defaults, ...options[id] };
    // the voices, then what differs from the defaults: any octave (a), tracking on (t) or off (u)
    const flags = Object.entries(VOICE_LETTERS).filter(([, role]) => o.voices.includes(role)).map(([letter]) => letter).join('')
        + (o.exact === false ? 'a' : '') + (o.track ? 't' : defaults.track ? 'u' : '');
    const parts = [id, o.mode, id === 'piano' ? '' : letterOf(id, o.anchor ?? 0), o.mode === 'played' ? flags : ''];
    while (parts.length > 2 && !parts.at(-1)) parts.pop();
    return parts.join('.');
}).join(',');

export const withPatterns = (path, raw) => {
    if (!raw) return path;
    const [base, hash = ''] = path.split('#');
    return `${base}${base.includes('?') ? '&' : '?'}patterns=${raw}${hash ? `#${hash}` : ''}`;
};
