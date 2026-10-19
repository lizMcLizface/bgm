// A temporary audition choice, deliberately independent of saved compositions
// and the melodic engine switch. Native remains the default. The old 808
// value is accepted only for migration to the saved tr808 voice + Wasm backend.
export function percussionFromSearch(search = '') {
    const value = new URLSearchParams(search).get('perc');
    return ['native', 'wasm', '808'].includes(value) ? value : 'native';
}
export function withPercussion(path, value) {
    if (!['native', 'wasm', '808'].includes(value)) return path;
    const at = path.indexOf('#'), hash = at < 0 ? '' : path.slice(at), base = at < 0 ? path : path.slice(0, at), q = base.indexOf('?');
    const params = new URLSearchParams(q < 0 ? '' : base.slice(q + 1));
    if (value === 'native') params.delete('perc'); else params.set('perc', value);
    return (q < 0 ? base : base.slice(0, q)) + (params.size ? '?' + params : '') + hash;
}
