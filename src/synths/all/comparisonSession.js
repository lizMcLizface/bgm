// Comparison documents write conveniences into session storage. Musical edits in
// the real workbench and its localStorage remain untouched by trial/reload work.
export const COMPARISON_QUERY = 'allCompare';
export const COMPARISON_ORDER = ['current', 'rust', 'rust', 'current'];
const key = id => `synths:all:comparison:${id}`;
export function comparisonScope(location = globalThis.window?.location) {
    if (!/\/synths\/all\/?$/.test(location?.pathname ?? '')) return null;
    const id = new URLSearchParams(location.search).get(COMPARISON_QUERY);
    return /^[a-f0-9-]{36}$/.test(id ?? '') ? id : null;
}
export function scopedStorageKey(id, name) { return `${key(id)}:storage:${name}`; }
export function readComparison(storage = window.sessionStorage, id = comparisonScope()) {
    if (!id) return null;
    const data = JSON.parse(storage.getItem(key(id)) ?? 'null');
    if (!data || data.version !== 1 || data.id !== id || !data.recipe?.project || !Array.isArray(data.runs) || data.runs.length > 4) throw Error('Comparison snapshot is unavailable. Return to All and freeze a new comparison.');
    return data;
}
export function writeComparison(data, storage = window.sessionStorage) {
    storage.setItem(key(data.id), JSON.stringify(data));
}
export function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
    return value;
}
export async function fingerprint(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export function snapshotDifferences(expected, actual, path = '', out = []) {
    if(out.length>=32||Object.is(expected,actual))return out;
    if(expected&&actual&&typeof expected==='object'&&typeof actual==='object'){
        for(const name of new Set([...Object.keys(expected),...Object.keys(actual)]))snapshotDifferences(expected[name],actual[name],path?`${path}.${name}`:name,out);
    }else if(JSON.stringify(expected)!==JSON.stringify(actual))out.push({path,expected,actual});
    return out;
}
export async function createComparison({ recipe, conditions, returnUrl, conveniences = {}, seconds = 30 }, storage = window.sessionStorage) {
    if (![10, 30, 60].includes(seconds)) throw Error('Unsupported comparison duration');
    const copy = JSON.parse(JSON.stringify(recipe));
    const data = { version: 1, id: crypto.randomUUID(), createdUtc: new Date().toISOString(), returnUrl,
        recipe: copy, conditions, conveniences, recipeHash: await fingerprint(copy), runs: [],
        plan: { order: COMPARISON_ORDER, expressionSeed:(copy.project.seed??copy.settings?.seed??1)>>>0,idleSeconds: 3, warmupSeconds: 5, measureSeconds: seconds }, processReports: [] };
    writeComparison(data, storage); initializeComparisonStorage(data, storage); return data;
}
export function initializeComparisonStorage(data, storage = window.sessionStorage) {
    for (const [name, value] of Object.entries(data.conveniences)) storage.setItem(scopedStorageKey(data.id, name), value);
    storage.setItem(scopedStorageKey(data.id, 'synths:all:state'), JSON.stringify(data.recipe));
    storage.setItem(scopedStorageKey(data.id, 'synths:all:continuous-sounds'), 'null');
}
export function comparisonUrl(data, value = window.location.href) {
    const url = new URL(value); url.searchParams.delete('allAudio');
    url.searchParams.set(COMPARISON_QUERY, data.id); url.searchParams.set('allResume', '1');
    if (data.plan.order[data.runs.length] === 'rust') url.searchParams.set('allAudio', 'rust');
    return url;
}
export function saveComparisonRun(data, run, storage = window.sessionStorage) {
    const latest = readComparison(storage, data.id);
    if (latest.runs.length !== data.runs.length || run.backend !== data.plan.order[data.runs.length]) throw Error('This comparison trial has already changed in another document');
    const next = { ...latest, runs: [...latest.runs, run] }; writeComparison(next, storage); return next;
}
