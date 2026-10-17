// A musical engine choice, independent of the compact settings payload format.
export const generationFromSearch = (search = '') => new URLSearchParams(search).get('generation') === 'legacy' ? 'legacy' : 'latest';

export function withGeneration(path, mode) {
    const url = new URL(path, 'https://calmbgm.com');
    if (mode === 'legacy') url.searchParams.set('generation', 'legacy');
    else url.searchParams.delete('generation');
    return /^https?:\/\//.test(path) ? url.href : url.pathname + url.search + url.hash;
}
