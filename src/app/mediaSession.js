// Lock-screen, notification and media-key controls (Media Session API).
//
// Browsers only give a page a media session while a media element is
// playing - Web Audio alone doesn't count. So a silent, looping <audio>
// plays alongside the music; on iPhones it also makes the page count as
// media playback, which keeps the sound going with the ringer switch on
// silent. The music itself still goes straight from the AudioContext to
// the speakers, so nothing gets added latency.

import {mediaHelperFromSearch} from '../audio/mediaHelperChoice';
const helperDefault = mediaHelperFromSearch(typeof location === 'undefined' ? '' : location.search) !== false;
let helperEnabled = helperDefault;
let playError = null;
let element = null;

// Read-only; does not create or start the silent media-session helper.
export function mediaSessionDiagnostics() {
    return { state: navigator.mediaSession?.playbackState, helperEnabled, playError,
        helper: element ? { paused: element.paused, time: element.currentTime, duration: element.duration,
            readyState: element.readyState, error: element.error?.code ?? null } : null };
}

// 10 s of silence: 8 kHz, 8-bit mono WAV (128 is the 8-bit zero line).
function silentWavUrl(seconds = 10, rate = 8000) {
    const frames = seconds * rate;
    const buffer = new ArrayBuffer(44 + frames);
    const view = new DataView(buffer);
    const text = (at, s) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
    text(0, 'RIFF');
    view.setUint32(4, 36 + frames, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    text(36, 'data');
    view.setUint32(40, frames, true);
    new Uint8Array(buffer, 44).fill(128);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

// The page icon as a 512 px PNG (notifications don't all take SVG).
let artwork = null;
function loadArtwork() {
    if (artwork) return artwork;
    artwork = new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 512;
                canvas.getContext('2d').drawImage(image, 0, 0, 512, 512);
                resolve([{ src: canvas.toDataURL('image/png'), sizes: '512x512', type: 'image/png' }]);
            } catch { resolve([]); } // Artwork must not break controls on a restricted origin.
        };
        image.onerror = () => resolve([]);
        image.src = `${import.meta.env.BASE_URL}favicon.svg`;
    });
    return artwork;
}

const supported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator;

/**
 * Hooks the media controls up. Call once.
 * @param {object} handlers - { play, stop, next, previous }
 */
export function setupMediaSession({ play, stop, next, previous }) {
    // Safari: play through the silent switch, like a music app
    try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* not supported */ }
    if (!supported()) return;
    const actions = { play, pause: stop, stop, nexttrack: next, previoustrack: previous };
    Object.entries(actions).forEach(([action, handler]) => {
        try {
            navigator.mediaSession.setActionHandler(action, handler || null);
        } catch (e) { /* action not supported here */ }
    });
}

/**
 * Shows the state and what is playing; starts / pauses the silent element.
 * Call from Play / Stop - starting media needs the click that started it.
 */
export function updateMediaSession({ playing, title, artist, helper = helperDefault }) {
    if (!supported()) return;
    helperEnabled = !!helper;
    if (playing && helperEnabled) {
        if (!element) {
            element = new Audio(silentWavUrl());
            element.loop = true;
        }
        if (element.paused) {
            playError = null;
            element.play().catch(error => { playError = { name: error.name, message: error.message }; });
        }
    } else if (element) {
        element.pause();
    }
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    loadArtwork().then((images) => {
        try {
            navigator.mediaSession.metadata = new window.MediaMetadata({ title, artist, album: 'calmbgm · calm procedural music', artwork: images });
        } catch (e) { /* MediaMetadata missing */ }
    });
}
