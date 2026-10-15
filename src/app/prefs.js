// Per-browser preferences that aren't part of the music (and so not of
// share links): master volume, quick stop. localStorage may be unavailable;
// then defaults apply and changes last for the visit.

export function readPref(key, fallback) {
    try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

export function writePref(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        // not stored; still applied for this visit
    }
}
