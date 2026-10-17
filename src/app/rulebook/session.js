import {encodeBook,decodeBook} from './bookCodec';
import { RULES, cleanChoices, compileRules } from './model';
import { GROUPS, cleanGroups, applyGroups, groupValue } from './groups';

const get = (settings, path) => path.split('.').reduce((v, k) => v?.[k], settings);
export const flagKeys = [...new Set(RULES.flatMap(r => r.flags ?? []))];
export function cleanBook(book) {
    if (!book || book.version !== 1) return { rules: {}, baseline: {} };
    const rules = cleanChoices(book.rules);
    const baseline = Object.fromEntries(Object.entries(cleanChoices(book.baseline)).filter(([id]) => rules[id] && RULES.find(r => r.id === id)?.path));
    const inherited = Object.fromEntries(Object.entries(cleanChoices(book.inherited)).filter(([id]) => RULES.find(r => r.id === id)?.flags));
    const groups = cleanGroups(book.groups);
    const groupBaseline = Object.fromEntries(Object.entries(cleanGroups(book.groupBaseline)).filter(([id]) => Object.hasOwn(groups, id)));
    return { rules, baseline, ...(Object.keys(inherited).length ? { inherited } : {}), ...(Object.keys(groups).length ? { groups, groupBaseline } : {}) };
}
// A saved setup becomes a new preset: its actual settings and flag choices
// are the defaults to which Follow preset returns, rather than new edits.
export function inheritBook(raw) {
    const book = cleanBook(raw);
    const inherited = Object.fromEntries(Object.entries({ ...book.inherited, ...book.rules }).filter(([id]) => RULES.find(r => r.id === id)?.flags));
    return { rules: {}, baseline: {}, ...(Object.keys(inherited).length ? { inherited } : {}) };
}
// Preset permissions are inherited defaults; explicit link choices remain overrides.
export function withPresetBook(raw, book) {
    const preset=inheritBook(raw);
    return {...book,inherited:{...preset.inherited,...book.inherited}};
}
export function readBook(search) {
    try {
        const text = new URLSearchParams(search).get('book');
        if (!text || text.length > 12000) return { rules: {}, baseline: {} };
        return cleanBook(text.startsWith('b1.')?decodeBook(text):JSON.parse(text));
    } catch { return { rules: {}, baseline: {} }; }
}
export function withBook(path, book, preset) {
    const url = new URL(path, window.location.href);
    url.searchParams.delete('book');
    const saved=cleanBook({version:1,...book}),defaults=inheritBook(preset).inherited??{};
    if(preset)saved.inherited=Object.fromEntries(Object.entries(saved.inherited??{}).filter(([id,choice])=>JSON.stringify(choice)!==JSON.stringify(defaults[id])));
    if (Object.keys(saved.rules).length || Object.keys(saved.inherited ?? {}).length || Object.keys(saved.groups ?? {}).length) url.searchParams.set('book', encodeBook(saved));
    return /^https?:/.test(path) ? url.href : url.pathname + url.search + url.hash;
}
export function baselineChoice(rule, settings) {
    const value = get(settings, rule.path);
    return { enabled: value !== rule.off, ...(rule.parameter || rule.options ? { value } : {}) };
}
export function baseSettings(settings, book) { return applyGroups(compileRules(settings, book.baseline).settings, book.groupBaseline); }
export function applyBook(generator, book) {
    const compiled = compileRules(baseSettings(generator.settings, book), book.rules, book.inherited);
    compiled.settings = applyGroups(compiled.settings, book.groups);
    let flagsChanged = false;
    for (const key of flagKeys) {
        flagsChanged ||= generator[key] !== compiled.flags[key];
        generator[key] = compiled.flags[key];
    }
    const patch = Object.fromEntries(Object.entries(compiled.settings).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(generator.settings[k])));
    if (Object.keys(patch).length) generator.setMany(patch);
    else if (flagsChanged) generator.replan([]);
    return compiled;
}
// A direct control replaces the permission for that setting; unrelated rules survive.
export function withoutSettings(book, patch, currentSettings) {
    const rules = { ...book.rules }, baseline = { ...book.baseline };
    for (const rule of RULES) if (rule.path && rule.path.split('.')[0] in patch
        && (!currentSettings || JSON.stringify(get(patch, rule.path)) !== JSON.stringify(get(currentSettings, rule.path)))) {
        delete rules[rule.id]; delete baseline[rule.id];
    }
    const groups = { ...book.groups }, groupBaseline = { ...book.groupBaseline };
    for (const group of GROUPS) if (group.path.split('.')[0] in patch
        && (!currentSettings || JSON.stringify(groupValue(patch, group.path)) !== JSON.stringify(groupValue(currentSettings, group.path)))) {
        delete groups[group.id]; delete groupBaseline[group.id];
    }
    return { ...book, rules, baseline, ...(book.groups ? { groups, groupBaseline } : {}) };
}
