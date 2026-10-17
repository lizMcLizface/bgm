import { defaultSettings } from '../settings';
import { GROUPS, cleanGroups, applyGroups, groupReason } from './groups';
import { applyBook, readBook, withBook, inheritBook, withoutSettings } from './session';
import { buildSetup, parseSetup, sceneSettings } from '../scenes';

const generator = settings => ({ settings: structuredClone(settings), setMany(patch) { Object.assign(this.settings, patch); }, replan() {} });

test('group choices are validated, clone values and leave unknown fields out', () => {
    const original=defaultSettings(), values={'pad-styles':{...original.padWeights,sustain:200,unknown:20},'bass-register':{octave:9,wander:'centered',chance:.3},'pad-size':0,unknown:{enabled:true}};
    const clean=cleanGroups(values);
    expect(clean['pad-styles'].sustain).toBe(100);expect(clean['pad-styles'].unknown).toBeUndefined();
    expect(clean['bass-register'].octave).toBe(1);expect(clean['pad-size']).toBeUndefined();
    expect(cleanGroups({'pad-styles':{sustain:NaN},'lead-register':{octave:0,wander:'no',chance:0}})).toEqual({});
    const applied=applyGroups(original,clean);applied.padWeights.sustain=0;
    expect(original.padWeights.sustain).toBe(55);expect(clean['pad-styles'].sustain).toBe(100);
    expect(new Set(GROUPS.map(g=>g.path)).size).toBe(GROUPS.length);
});

test('group baseline and custom choices roundtrip in links and reset to exact original values', () => {
    const settings=defaultSettings();settings.padWeights.sustain=43.25;
    const original=structuredClone(settings.padWeights);
    const book={rules:{},baseline:{},groups:{'pad-styles':{...original,sustain:0},'pad-size':5},groupBaseline:{'pad-styles':original,'pad-size':3}};
    const gen=generator(settings);applyBook(gen,book);expect(gen.settings.padWeights.sustain).toBe(0);expect(gen.settings.padNotes).toBe(5);
    const loaded=readBook(new URL(withBook('/?m=M',book),'http://localhost').search);
    expect(loaded).toEqual(book);
    applyBook(gen,{...loaded,groups:{'pad-size':5}});
    expect(gen.settings.padWeights).toEqual(original);expect(gen.settings.padNotes).toBe(5);
    expect(settings.padWeights).toEqual(original);
});

test('external changes clear only the changed group and keep sibling roles and other rule choices', () => {
    const settings=defaultSettings(),book={rules:{'human-timing':{enabled:false}},baseline:{},groups:{'pad-register':settings.voices.pad,'bass-register':settings.voices.bass,'pad-styles':settings.padWeights},groupBaseline:{'pad-register':settings.voices.pad,'bass-register':settings.voices.bass}};
    const next=withoutSettings(book,{voices:{...settings.voices,pad:{...settings.voices.pad,octave:1}}},settings);
    expect(next.groups['pad-register']).toBeUndefined();expect(next.groupBaseline['pad-register']).toBeUndefined();
    expect(next.groups['bass-register']).toEqual(settings.voices.bass);expect(next.groups['pad-styles']).toEqual(settings.padWeights);expect(next.rules).toEqual(book.rules);
});

test('saved setups make their current group values the new inherited defaults', () => {
    const settings=defaultSettings(),book={rules:{},baseline:{},groups:{'bass-styles':{whole:0,half:0,walking:100,drive:0}},groupBaseline:{'bass-styles':settings.bassWeights}};
    const gen=generator(settings);applyBook(gen,book);
    const setup=parseSetup(JSON.stringify(buildSetup({settings:gen.settings,voices:{},rulebook:book},{name:'Walking bass'})));
    expect(setup.rulebook.groups).toEqual(book.groups);
    const saved=generator(sceneSettings(setup,42));applyBook(saved,inheritBook(setup.rulebook));
    expect(saved.settings.bassWeights).toEqual(book.groups['bass-styles']);expect(inheritBook(setup.rulebook).groups).toBeUndefined();
});

test('pattern groups describe dormant styles and keep all-zero weights as equal shares', () => {
    const settings=defaultSettings(),group=GROUPS.find(g=>g.id==='pad-pulses');
    settings.padWeights={sustain:100,pulse:0,arpeggio:0,sequence:0,rolled:0,stacked:0};
    expect(groupReason(group,settings)).toContain('zero share');
    for(const key of Object.keys(settings.padWeights))settings.padWeights[key]=0;
    expect(groupReason(group,settings)).toBeNull();
    settings.muted.pad=true;expect(groupReason(group,settings)).toContain('muted');
});

test('section and ambient parameters preserve individual permissions and reset independently', () => {
    const settings=defaultSettings(),gen=generator(settings);
    const book={rules:{'ambient-bed-drift':{enabled:false},'section-tone':{enabled:true}},baseline:{},groups:{'ambient-drift-period':300,'ambient-drift-mode':'sine','section-reference':8},groupBaseline:{'ambient-drift-period':settings.ambienceWander.period,'ambient-drift-mode':settings.ambienceWander.mode,'section-reference':settings.sections.phrases}};
    applyBook(gen,book);expect(gen.settings.ambienceWander).toMatchObject({total:0,mode:'sine',period:300});expect(gen.settings.sectionTone).toBe(true);
    applyBook(gen,{...book,groups:{'section-reference':8}});
    expect(gen.settings.ambienceWander).toMatchObject({total:0,mode:settings.ambienceWander.mode,period:settings.ambienceWander.period});
    expect(gen.settings.sections.phrases).toBe(8);expect(gen.settings.sectionTone).toBe(true);
});
