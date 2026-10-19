// Temporary output-path diagnostic; never stored as a device preference.
export function mediaHelperFromSearch(search = '') {
    const value = new URLSearchParams(search).get('mediaHelper');
    return value === '0' ? false : value === '1' ? true : null;
}
export function withMediaHelper(path, value) {
    if (value !== true && value !== false) return path;
    const at = path.indexOf('#'), hash = at < 0 ? '' : path.slice(at), base = at < 0 ? path : path.slice(0, at), q = base.indexOf('?');
    const params = new URLSearchParams(q < 0 ? '' : base.slice(q + 1));
    params.set('mediaHelper', value ? '1' : '0');
    return (q < 0 ? base : base.slice(0, q)) + '?' + params + hash;
}
