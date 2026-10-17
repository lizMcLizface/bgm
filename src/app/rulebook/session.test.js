import { describe, it, expect } from 'vitest';
import { defaultSettings } from '../settings';
import { RULES } from './model';
import { applyBook, baselineChoice, baseSettings, readBook, withoutSettings, inheritBook, withPresetBook, withBook } from './session';
import { compileRules, ruleState } from './model';

describe('embedded rulebook session', () => {
    it('editing a sibling parameter keeps the original permission and reset baseline', () => {
        const settings=defaultSettings();
        const book={rules:{'ambient-bed-drift':{enabled:false},sections:{enabled:false}},baseline:{'ambient-bed-drift':{enabled:true,value:.08},sections:{enabled:true,value:'gentle'}}};
        settings.ambienceWander.total=0;settings.sections.mode='off';
        const next=withoutSettings(book,{ambienceWander:{...settings.ambienceWander,period:240},sections:{...settings.sections,phrases:8}},settings);
        expect(next).toEqual(book);
        expect(withoutSettings(book,{sections:{...settings.sections,mode:'strong'}},settings).rules).toEqual({'ambient-bed-drift':{enabled:false}});
    });
    it('inherits a saved preset’s flags and restores them after an edit and URL reload', () => {
        const inherited = inheritBook({ version: 1, rules: { 'tension-curves': { enabled: false }, 'human-timing': { enabled: true, value: 20 } } });
        expect(inherited.rules).toEqual({});
        const settings = defaultSettings(); settings.humanize.timing = 20;
        let compiled = compileRules(settings, inherited.rules, inherited.inherited);
        const rule = RULES.find(r => r.id === 'tension-curves');
        expect(ruleState(rule, compiled)).toMatchObject({ enabled: false, source: 'Preset' });
        const edited = { ...inherited, rules: { 'tension-curves': { enabled: true } } };
        const path = withBook('/?m=M', edited);
        const loaded = readBook(new URL(path, 'http://localhost').search);
        compiled = compileRules(settings, loaded.rules, loaded.inherited);
        expect(compiled.flags.sectionCurves).toBe(true);
        expect(compileRules(settings, {}, loaded.inherited).flags.sectionCurves).toBe(false);
        expect(withBook('/?m=M', inherited)).toContain('book=');
    });
    it('restores the preset value after overriding, including across a reload', () => {
        const settings = defaultSettings(), rule = RULES.find(r => r.id === 'borrowed-chords');
        settings.chordBorrow = .15;
        const book = { rules: { [rule.id]: { enabled: true, value: 1 } }, baseline: { [rule.id]: baselineChoice(rule, settings) } };
        const gen = { settings, setMany(patch) { Object.assign(this.settings, patch); }, replan() {} };
        applyBook(gen, book);
        expect(gen.settings.chordBorrow).toBe(1);
        const restoredBook = readBook('?' + new URLSearchParams({ book: JSON.stringify({ version: 1, ...book }) }));
        expect(baseSettings(gen.settings, restoredBook).chordBorrow).toBe(.15);
        applyBook(gen, { ...restoredBook, rules: {} });
        expect(gen.settings.chordBorrow).toBe(.15);
    });
    it('lets direct controls replace related choices while retaining independent permissions', () => {
        const book = { rules: { 'human-timing': { enabled: false }, 'tension-curves': { enabled: false } }, baseline: { 'human-timing': { enabled: true, value: 12 } } };
        const next = withoutSettings(book, { humanize: { timing: 20, velocity: .1 } });
        expect(next.rules).toEqual({ 'tension-curves': { enabled: false } });
        expect(next.baseline).toEqual({});
        const gen = { settings: defaultSettings(), replan() {}, setMany() {} };
        applyBook(gen, next);
        expect(gen.sectionCurves).toBe(false);
        applyBook(gen, { rules: {}, baseline: {} });
        expect(gen.sectionCurves).toBeUndefined();
    });
    it('ignores unsupported versions and baseline entries without a setting permission', () => {
        expect(readBook('?book=' + encodeURIComponent(JSON.stringify({ version: 2, rules: { music: { enabled: false } } }))).rules).toEqual({});
        const book = readBook('?book=' + encodeURIComponent(JSON.stringify({ version: 1, rules: { music: { enabled: false } }, baseline: { 'tension-curves': { enabled: false }, ambience: { enabled: false }, music: { enabled: true } } })));
        expect(book.baseline).toEqual({ music: { enabled: true } });
    });
});


it('preset-link defaults agree with picker defaults while explicit URL choices take priority',()=>{
 const raw={version:1,rules:{'held-bass-glides':{enabled:true},'section-cadences':{enabled:false}}};
 const blank=readBook(''),preset=withPresetBook(raw,blank);
 expect(preset.inherited).toEqual(inheritBook(raw).inherited);expect(blank.inherited).toBeUndefined();
 const override=readBook('?book='+encodeURIComponent(JSON.stringify({version:1,rules:{'held-bass-glides':{enabled:false}},inherited:{'section-cadences':{enabled:true}}})));
 const combined=withPresetBook(raw,override),compiled=compileRules(defaultSettings(),combined.rules,combined.inherited);
 expect(compiled.flags.heldBassGlides).toBe(false);expect(compiled.flags.sectionCadences).toBe(true);
 expect(withPresetBook(undefined,override).rules).toEqual(override.rules);
});
