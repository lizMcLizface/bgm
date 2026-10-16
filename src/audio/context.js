// The single shared AudioContext, created once at import time. Every
// audio-producing module (PolySynth, the metronome, and future instrument
// channels) must use this instead of constructing its own - see
// ARCHITECTURE.md §2 for the two-AudioContext bug this replaces and why it
// mattered (independent, un-syncable clocks).
//
// Output buffer size: the lowest-latency default, or a larger buffer (in
// seconds) chosen in the page header. Larger buffers ride out load spikes
// on slow machines - the usual cause of crackling - at the cost of
// keyboard/MIDI latency. A context's buffer is fixed when it is created, so
// the choice is stored per browser and applies from the next page load.

import { isMobile } from './performance';

export const BUFFER_KEY = 'bgm-audio-buffer';

// On a phone a buffer of this many seconds until one is chosen (it rides out
// the load spikes that otherwise end in dropouts or the page being suspended).
export const MOBILE_BUFFER_SECONDS = 0.1;

/** The buffer size in seconds: the stored one, a phone's default, or null (lowest latency). */
export function storedBufferSeconds() {
    try {
        const stored = window.localStorage.getItem(BUFFER_KEY);
        if (stored === null) return isMobile() ? MOBILE_BUFFER_SECONDS : null;
        const seconds = Number(stored);
        return seconds > 0 && seconds <= 1 ? seconds : null;
    } catch (e) {
        return null;
    }
}

/** Stores a buffer size (null = lowest latency, kept as a choice); takes effect on reload. */
export function storeBufferSeconds(seconds) {
    try {
        window.localStorage.setItem(BUFFER_KEY, seconds ? String(seconds) : '0');
        return true;
    } catch (e) {
        return false;
    }
}

const bufferSeconds = storedBufferSeconds();
const Context = window.AudioContext || window.webkitAudioContext;
export const audioContext = bufferSeconds ? new Context({ latencyHint: bufferSeconds }) : new Context();
