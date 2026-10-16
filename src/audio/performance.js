// Choices for slower computers (the Audio menu's Performance section; all on
// by default on a phone, see isMobile). Each trades
// some of the sound's richness for CPU and memory, none changes what the music
// is. Stored per browser; the audio graph is built once at page load, so a
// change applies after a reload.
//
//   reverb        'full' (stereo, up to 3 s) or 'light' (mono, 2 s) - nodes/reverb.js
//   sharedReverb  one convolver per impulse type for every voice, instead of
//                 one per voice - nodes/sharedReverb.js
//   maxUnison     the most unison oscillators a voice uses (the preset keeps
//                 its own value; heavy pads have 4-5) - engine/Instrument.js

export const PERFORMANCE_KEY = 'bgm-performance';
export const UNISON_LIMIT = 2;

/** Whether this looks like a phone or tablet (where all the savings start on). */
export function isMobile() {
    try {
        const nav = window.navigator;
        if (nav.userAgentData && typeof nav.userAgentData.mobile === 'boolean' && nav.userAgentData.mobile) return true;
        if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '')) return true;
        // an iPad asking for the desktop site
        return /Macintosh/.test(nav.userAgent || '') && nav.maxTouchPoints > 1;
    } catch (e) {
        return false;
    }
}

// What each choice is before anyone has chosen: everything saved on a phone.
const defaults = () => (isMobile()
    ? { reverb: 'light', sharedReverb: true, maxUnison: UNISON_LIMIT }
    : { reverb: 'full', sharedReverb: false, maxUnison: Infinity });

/**
 * The choices: what is stored, else the device's default (everything on for a
 * phone). A choice made on the page is stored in full, so a phone user who
 * turns one off keeps it off.
 */
export function readPerformance() {
    const base = defaults();
    try {
        const raw = JSON.parse(window.localStorage.getItem(PERFORMANCE_KEY) || '{}');
        return {
            reverb: raw.reverb === 'light' || raw.reverb === 'full' ? raw.reverb : base.reverb,
            sharedReverb: typeof raw.sharedReverb === 'boolean' ? raw.sharedReverb : base.sharedReverb,
            maxUnison: raw.maxUnison === null ? Infinity
                : Number.isInteger(raw.maxUnison) && raw.maxUnison >= 1 && raw.maxUnison <= 8 ? raw.maxUnison : base.maxUnison,
        };
    } catch (e) {
        return base;
    }
}

/**
 * Stores a change ({ reverb?, sharedReverb?, maxUnison? }, Infinity for no limit).
 * @returns {boolean} whether it was stored
 */
export function writePerformance(patch) {
    try {
        const next = { ...readPerformance(), ...patch };
        window.localStorage.setItem(PERFORMANCE_KEY, JSON.stringify({
            reverb: next.reverb,
            sharedReverb: next.sharedReverb,
            maxUnison: Number.isFinite(next.maxUnison) ? next.maxUnison : null,
        }));
        return true;
    } catch (e) {
        return false;
    }
}

/** What this page load runs with. */
export const PERFORMANCE = readPerformance();
