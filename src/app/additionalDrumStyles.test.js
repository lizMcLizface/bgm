import {ADDITIONAL_DRUM_STYLES,additionalDrumBar} from './additionalDrumStyles';
import {DRUMS,DRUM_STYLES,drumBar} from './percussion';
import {drumBarLatest} from './composition/percussionLatest';
import {METERS} from './meter';
import {defaultSettings,encodeSettings,decodeSettings,decodeShare} from './settings';
const args=(patch={})=>({bar:0,meter:METERS['4/4'],drums:{style:'bossa',activity:.65,variation:.5,sprinkle:.35,kit:'felt'},section:null,sectionsMode:'off',seed:42,grooveIndex:0,embellish:false,...patch});
const grid=events=>events.map(({midi,beat})=>[midi,+beat.toFixed(5)]);

test('released style indices stay in place and the appended style enum round-trips with other settings',()=>{
 expect(Object.keys(DRUM_STYLES).slice(0,8)).toEqual(['off','heartbeat','brushes','lofi','shaker','downtempo','electro','drive']);
 for(const style of Object.keys(DRUM_STYLES))for(const kit of ['felt','crisp','tr808','hand']){
  const settings=defaultSettings();settings.seed=17;settings.drums={...settings.drums,style,kit};settings.bpm=117;settings.harmonyScale='minor';settings.tonality={mode:'bitonal',separation:7};
  expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
 }
 // Released phone link before either style extension or the Hand palette.
 const before=decodeShare('m=PaFyUVqgg0iugMOeLZF7HHmogmkjirigkwUmLVBBNcwQ&v=gUg29VaS1nttoteUkKaUpMKYUgCUqUm');
 expect(Object.keys(DRUM_STYLES).slice(0,8)).toContain(before.settings.drums.style);expect(before.settings.drums.kit).toBe('crisp');
 expect(decodeSettings(encodeSettings(before.settings))).toEqual(before.settings);
});

test('new styles are deterministic, bounded and distinct in every supported meter and all three variants',()=>{
 for(const meter of Object.values(METERS)){
  const firsts=[];
  for(const style of Object.keys(ADDITIONAL_DRUM_STYLES)){
   const variants=[];
   for(let grooveIndex=0;grooveIndex<3;grooveIndex++){
    const sequence=[];
    for(let bar=0;bar<16;bar++){
     const setup=args({bar,meter,grooveIndex,embellish:true,phraseStart:bar-bar%4,drums:{style,activity:1,variation:1,sprinkle:1}});
     const a=drumBarLatest(setup),reference=drumBarLatest({...setup,embellish:false});
     expect(a).toEqual(drumBarLatest(setup));expect(new Set(a.map(e=>e.midi+'/'+e.beat)).size).toBe(a.length);
     for(const e of a){expect([e.beat,e.length,e.velocity,e.detune,e.midi].every(Number.isFinite)).toBe(true);expect(e.beat).toBeGreaterThanOrEqual(0);expect(e.beat).toBeLessThan(meter.units);expect(e.velocity).toBeGreaterThan(0);expect(e.velocity).toBeLessThanOrEqual(1);expect(e.length).toBeGreaterThan(0);}
     for(const e of reference.filter(e=>e.anchor))expect(a.some(x=>x.anchor&&x.midi===e.midi&&x.beat===e.beat)).toBe(true);
     sequence.push(grid(reference));
    }
    variants.push(JSON.stringify(sequence));
   }
   expect(new Set(variants).size).toBe(3);firsts.push(variants[0]);
  }
  expect(new Set(firsts).size).toBe(Object.keys(ADDITIONAL_DRUM_STYLES).length);
 }
});

test('bossa keeps its two-bar clave and jazz carries its own triplet ride skip',()=>{
 const b=bar=>drumBarLatest(args({bar})).filter(e=>DRUMS[e.midi]==='rim').map(e=>e.beat);
 expect(b(0)).toEqual([0,1.5,3]);expect(b(1)).toEqual([1,2]);
 const jazz=drumBarLatest(args({drums:{style:'jazz',activity:0,variation:0}}));
 expect(jazz.some(e=>e.midi===DRUMS.indexOf('ride')&&Math.abs(e.beat-5/3)<1e-6)).toBe(true);
});

test('ambient has no backbeat clock or generic kick ending, and remains sparse under maximum variation',()=>{
 for(let bar=0;bar<32;bar++){
  const a=drumBarLatest(args({bar,embellish:true,drums:{style:'ambient',activity:1,variation:1,sprinkle:1}}));
  expect(a.length).toBeLessThanOrEqual(2);expect(a.some(e=>['kick','brush','hat','snare','punch','sizzle'].includes(DRUMS[e.midi]))).toBe(false);
 }
});

test('Original supports new styles and strong sections and releases still thin them',()=>{
 for(const style of Object.keys(ADDITIONAL_DRUM_STYLES)){
  expect(Array.from({length:4},(_,bar)=>drumBar(args({bar,drums:{style,activity:.6,variation:.5}}))).flat().length).toBeGreaterThan(0);
  const setup=args({drums:{style,activity:1,variation:1},section:{type:'intro',start:0},sectionsMode:'strong'});expect(drumBarLatest(setup)).toEqual([]);expect(drumBar(setup)).toEqual([]);
  const released=drumBarLatest(args({bar:3,embellish:true,section:{type:'breakdown',start:0,bars:4,form:true,energy:.6,transition:'release'},drums:{style,activity:1,variation:1,sprinkle:1}}));
  expect(released.filter(e=>!e.anchor).every(e=>e.beat<3)).toBe(true);
 }
 expect(additionalDrumBar(args({drums:{style:'lofi'}}),DRUMS)).toBeNull();
});
