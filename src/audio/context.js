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

export const BUFFER_KEY = 'bgm-audio-buffer';

/** The stored buffer size in seconds, or null for the default. */
export function storedBufferSeconds() {
    try {
        const seconds = Number(window.localStorage.getItem(BUFFER_KEY));
        return seconds > 0 && seconds <= 1 ? seconds : null;
    } catch (e) {
        return null;
    }
}

/** Stores a buffer size (null = default); takes effect on reload. */
export function storeBufferSeconds(seconds) {
    try {
        if (seconds) window.localStorage.setItem(BUFFER_KEY, String(seconds));
        else window.localStorage.removeItem(BUFFER_KEY);
        return true;
    } catch (e) {
        return false;
    }
}

const bufferSeconds = storedBufferSeconds();
const Context = window.AudioContext || window.webkitAudioContext;
export const audioContext = bufferSeconds ? new Context({ latencyHint: bufferSeconds }) : new Context();
