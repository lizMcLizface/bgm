import {RULES,CHAPTERS,compileRules,ruleState,cleanChoices,bookSearch,choicesFromSearch,muteFromSearch} from './model';
import {explainBar} from './explain';
import {defaultSettings} from '../settings';

test('opening pages has no musical input; inheriting retains the complete preset without mutation',()=>{
    const base=defaultSettings(),before=structuredClone(base),book=compileRules(base);
    expect(book.settings).toEqual(before);expect(book.flags).toEqual({});expect(base).toEqual(before);
    expect(new Set(RULES.map(r=>r.id)).size).toBe(RULES.length);
    expect(RULES.every(r=>CHAPTERS.some(c=>c.id===r.chapter))).toBe(true);
});
test('permissions are reversible, preserve parameter values while off and leave unrelated settings intact',()=>{
    const base=defaultSettings(),off=compileRules(base,{'human-timing':{enabled:false,value:23},'phrase-planning':{enabled:false}});
    expect(off.settings.humanize.timing).toBe(0);expect(off.choices['human-timing'].value).toBe(23);expect(off.settings.humanize.velocity).toBe(base.humanize.velocity);expect(off.flags.phraseSearch).toBe(false);
    expect(compileRules(base,{'human-timing':{enabled:true,value:23}}).settings.humanize.timing).toBe(23);
    expect(compileRules(base).settings).toEqual(base);
});
test('explicit counter and phrase overrides retain enabled dependent choices rather than switching them off',()=>{
    const base=defaultSettings(),rule=id=>RULES.find(r=>r.id===id),choices={'duet-dialogue':{enabled:true},'note-resolution':{enabled:true},'phrase-planning':{enabled:false}};
    let c=compileRules(base,choices);expect(ruleState(rule('duet-dialogue'),c).status).toBe('Overridden');expect(c.flags.duetInteraction).toBe(true);
    expect(ruleState(rule('note-resolution'),c).status).toBe('Overridden');
    c=compileRules(base,{...choices,'second-lead':{enabled:true,value:'line'}});expect(ruleState(rule('duet-dialogue'),c).status).toBe('Enabled');
    c=compileRules(base,{...choices,'second-lead':{enabled:true,value:'harmony'}});expect(ruleState(rule('duet-dialogue'),c).status).toBe('Overridden');
    c.settings.generation='legacy';expect(ruleState(rule('duet-dialogue'),c).status).toBe('Unavailable');
});
test('muted and unheard rules distinguish output overrides from disabling generation',()=>{
    const base=defaultSettings();base.muted.lead=true;
    const rule=RULES.find(r=>r.id==='motif-development'),c=compileRules(base);
    expect(ruleState(rule,c).status).toBe('Muted');expect(ruleState(rule,c).enabled).toBe(true);
    c.settings.playMusic=false;expect(ruleState(rule,c).status).toBe('Not heard');
});
test('URL round trips known rules and explicit mute overrides and rejects malformed or excessive choices',()=>{
    const choices={'human-timing':{enabled:true,value:14},'second-lead':{enabled:true,value:'line'},'tension-curves':{enabled:false}};
    const url=bookSearch({preset:'rainy-cafe',seed:42,choices,muted:{lead:true,pad:false}});
    expect(choicesFromSearch(url)).toEqual(choices);expect(muteFromSearch(url)).toEqual({lead:true,counter:false,pad:false,bass:false,perc:false});
    expect(choicesFromSearch('?book=nope')).toEqual({});expect(choicesFromSearch('?book='+JSON.stringify({version:2,rules:choices}))).toEqual({});expect(muteFromSearch('?mute=unknown')).toBeNull();
    expect(cleanChoices({'human-timing':{enabled:true,value:999},unknown:{enabled:true},'sections':{enabled:'yes'}})).toEqual({'human-timing':{enabled:true,value:40}});
});
test('chord explanations require recorded borrowing, accumulate decisions and expose precedence',()=>{
    const b={bar:7,chord:{name:'Fm',keyName:'C Ionian',provenance:{borrowed:true,sourceMode:'Major-6',baseMode:'Major-1',harmonicMode:'Major-1',colour:'add9'},cadence:{kind:'bridge',sharedBefore:[0],sharedAfter:[5],previous:'Dm'}},state:{phrase:{section:null}}};
    const reasons=explainBar(b);expect(reasons.map(r=>r.rule)).toEqual(['common-tone-bridges','borrowed-chords','chord-colour']);
    expect(explainBar({...b,chord:{...b.chord,provenance:undefined}}).some(r=>r.rule==='borrowed-chords')).toBe(false);
    expect(explainBar({...b,chord:{...b.chord,cadence:undefined}}).find(r=>r.rule==='progression').text).toContain('scale degree');
    expect(explainBar({...b,ending:true,events:[]})[0].kind).toBe('override');
    expect(explainBar(null)).toEqual([]);
});

test('percussion keeps its anchors at zero ornament activity and honours style, source and mute overrides',()=>{
    const base=defaultSettings(),rule=id=>RULES.find(r=>r.id===id);
    const compiled=compileRules(base,{'percussion-presence':{enabled:true,value:'brushes'},'percussion-activity':{enabled:false},'percussion-variation':{enabled:true,value:.5}});
    expect(compiled.settings.drums.style).toBe('brushes');expect(compiled.settings.drums.activity).toBe(0);
    expect(ruleState(rule('percussion-presence'),compiled).status).toBe('Enabled');
    expect(ruleState(rule('percussion-variation'),compiled).status).toBe('Enabled');
    compiled.settings.drums.style='off';expect(ruleState(rule('percussion-variation'),compiled).status).toBe('Overridden');
    compiled.settings.drums.style='brushes';compiled.settings.muted.perc=true;
    expect(ruleState(rule('percussion-presence'),compiled).status).toBe('Muted');
    for(const drum of Object.values(compiled.settings.drumKit))if(drum&&typeof drum==='object')drum.on=false;
    expect(ruleState(rule('percussion-presence'),compiled).status).toBe('Overridden');
});

test('performance flags require shared rhythm and nonzero expression, and numerical choices obey engine limits',()=>{
    const base=defaultSettings(),rule=RULES.find(r=>r.id==='phrase-expression');
    expect(ruleState(rule,compileRules(base,{'shared-rhythm':{enabled:false}})).status).toBe('Overridden');
    base.humanize.timing=0;base.humanize.velocity=0;
    expect(ruleState(rule,compileRules(base)).status).toBe('Overridden');
    expect(compileRules(base,{'human-timing':{enabled:true,value:100},'human-dynamics':{enabled:true,value:1}}).settings.humanize).toMatchObject({timing:40,velocity:.25});
});

test('moved harmonic and section rules retain intent when their prerequisite is off',()=>{
    const base=defaultSettings(),compiled=compileRules(base,{'bass-pedal-chance':{enabled:true,value:.8},'section-tone':{enabled:true}});
    compiled.settings.sections.mode='off';
    const state=id=>ruleState(RULES.find(r=>r.id===id),compiled);
    expect(state('bass-pedal-chance').status).toBe('Overridden');
    expect(state('section-tone').status).toBe('Overridden');
    expect(compiled.choices['section-tone'].enabled).toBe(true);
    expect(state('chord-colour-chance').status).toBe('Overridden');
});

test('ambient level drift follows ambient output even when music is off',()=>{
    const base=defaultSettings();base.playMusic=false;base.playAmbience=true;base.ambience.rain=.5;
    const compiled=compileRules(base,{'ambient-bed-drift':{enabled:true,value:.2}}),rule=RULES.find(r=>r.id==='ambient-bed-drift');
    expect(ruleState(rule,compiled).status).toBe('Enabled');
    compiled.settings.playAmbience=false;expect(ruleState(rule,compiled).status).toBe('Not heard');
});

test('beat-linked effects are opt-in and inherit or override reversibly',()=>{
 const rule=RULES.find(r=>r.id==='tempo-effects'),base=defaultSettings();
 expect(ruleState(rule,compileRules(base)).enabled).toBe(false);
 expect(ruleState(rule,compileRules(base,{'tempo-effects':{enabled:true}})).enabled).toBe(true);
 expect(ruleState(rule,compileRules(base,{}, {'tempo-effects':{enabled:true}})).enabled).toBe(true);
 expect(ruleState(rule,compileRules(base,{'tempo-effects':{enabled:false}},{'tempo-effects':{enabled:true}})).enabled).toBe(false);
});

test('envelope fitting starts off to retain fullness and can be explicitly inherited',()=>{
 const rule=RULES.find(r=>r.id==='gate-envelopes'),base=defaultSettings();
 expect(ruleState(rule,compileRules(base)).enabled).toBe(false);
 expect(ruleState(rule,compileRules(base,{'gate-envelopes':{enabled:true}})).enabled).toBe(true);
 expect(ruleState(rule,compileRules(base,{}, {'gate-envelopes':{enabled:true}})).enabled).toBe(true);
});

test('lead and single-tone chord slides are independently opt-in and retained by saved setups',()=>{
 const base=defaultSettings(),rule=id=>RULES.find(r=>r.id===id);
 for(const id of ['melodic-slides','chord-slides','pad-pitch-motion','bass-pitch-motion']) {expect(ruleState(rule(id),compileRules(base)).enabled).toBe(false);expect(ruleState(rule(id),compileRules(base,{}, {[id]:{enabled:true}})).enabled).toBe(true);}
 const c=compileRules(base,{'chord-slides':{enabled:true},'melodic-slides':{enabled:false}});expect(c.flags.chordSlides).toBe(true);expect(c.flags.noteSlides).toBe(false);
});

test('held pad and bass glides start off and persist independently through preset inheritance',()=>{
 const base=defaultSettings();for(const id of ['held-pad-glides','held-bass-glides']){
  const rule=RULES.find(r=>r.id===id);expect(ruleState(rule,compileRules(base)).enabled).toBe(false);
  expect(ruleState(rule,compileRules(base,{}, {[id]:{enabled:true}})).enabled).toBe(true);
 }
 const c=compileRules(base,{'held-pad-glides':{enabled:true},'held-bass-glides':{enabled:false}});expect(c.flags.heldPadGlides).toBe(true);expect(c.flags.heldBassGlides).toBe(false);
});
