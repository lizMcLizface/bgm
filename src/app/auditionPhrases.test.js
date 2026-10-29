import {AUDITION_PHRASES,phraseEvents,phraseSeconds} from './auditionPhrases';
import {createPhraseRunner,phraseForCode,PHRASE_IDS} from '../synths/ui/phraseRunner';
import {soundFamily,FAMILIES} from './editor/soundFamilies';
import voices from '../library/voices.json';

test('there are five phrases, in the registers of bass, slow bass, chord, arpeggio and lead',()=>{
 expect(AUDITION_PHRASES.map(p=>p.id)).toEqual(PHRASE_IDS);
 const range=id=>{const m=phraseEvents(id).map(e=>e.midi);return [Math.min(...m),Math.max(...m)];};
 expect(range('bass-short')[1]).toBeLessThan(58);
 expect(range('bass-slow')[1]).toBeLessThan(40);
 expect(range('pad')[0]).toBeLessThan(50);
 expect(range('arp')[0]).toBeGreaterThanOrEqual(53);
 expect(range('lead')[0]).toBeGreaterThanOrEqual(70);
});

test('phrases are short, and their velocities vary',()=>{
 for(const {id} of AUDITION_PHRASES){
  expect(phraseSeconds(id),id).toBeGreaterThan(3);expect(phraseSeconds(id),id).toBeLessThan(16);
 }
 expect(new Set(phraseEvents('bass-short').map(e=>e.velocity)).size).toBeGreaterThan(3);
 expect(new Set(phraseEvents('arp').map(e=>e.velocity)).size).toBeGreaterThan(2);
});

test('keys 1-5 pick the phrases',()=>{
 expect(['Digit1','Digit5','Numpad3','KeyA'].map(phraseForCode)).toEqual(['bass-short','lead','pad',null]);
});

test('the runner plays every note on its timer and releases it, and a new phrase replaces the old one',()=>{
 const log=[],timers=[];
 const performer={down:(k,m)=>log.push(['down',k,m]),up:k=>log.push(['up',k])};
 const run=createPhraseRunner(performer,{setTimer:(fn,ms)=>{timers.push({fn,ms,live:true});return timers.length-1;},clearTimer:i=>{if(timers[i])timers[i].live=false;}});
 run.play('bass-slow');
 expect(timers).toHaveLength(9); // a down and an up per note, and the end of the phrase
 timers.filter(t=>t.live).sort((a,b)=>a.ms-b.ms).slice(0,2).forEach(t=>t.fn());
 expect(log.map(l=>l[0])).toEqual(['down','up']);
 run.play('lead');
 expect(timers.slice(0,9).every(t=>!t.live)).toBe(true);
 expect(timers.slice(9).every(t=>t.live)).toBe(true);
});

test('every sound in the library gets a known family, and the main kinds are told apart',()=>{
 for(const [group,presets] of Object.entries(voices))for(const name of Object.keys(presets))expect(FAMILIES[soundFamily(name,group)],name).toBeTruthy();
 expect(soundFamily('CS-80 Brass','Pads')).toBe('brass');
 expect(soundFamily('Warm Strings','Pads')).toBe('strings');
 expect(soundFamily('Soft Flute','Leads')).toBe('wind');
 expect(soundFamily('Neon Saw Pad','Leads')).toBe('pad');
 expect(soundFamily('Round Pluck Bass','Bass')).toBe('bass');
 expect(soundFamily('Concert Grand','Pianos')).toBe('piano');
});

import {contextFromPlan} from './auditionContext';
import {DEFAULT_CONTEXT} from './auditionPhrases';

const dMajor={key:'D Ionian',scalePcs:[2,4,6,7,9,11,1],chords:[
 {name:'D',numeral:'I',pitchClasses:[2,6,9]},{name:'Bm',numeral:'vi',pitchClasses:[11,2,6]},{name:'G',numeral:'IV',pitchClasses:[7,11,2]},{name:'A',numeral:'V',pitchClasses:[9,1,4]}]};

test('phrases follow the key and chords they are given',()=>{
 const mod=m=>m%12;
 // bass: each chord's first note is its root
 expect(phraseEvents('bass-slow',dMajor).map(e=>mod(e.midi))).toEqual([2,11,7,9]);
 // melody stays in the scale
 for(const e of phraseEvents('lead',dMajor))expect(dMajor.scalePcs).toContain(mod(e.midi));
 // arpeggio plays only chord tones, chord by chord (8 notes each)
 const arp=phraseEvents('arp',dMajor);
 dMajor.chords.forEach((c,i)=>arp.slice(i*8,i*8+8).forEach(e=>expect(c.pitchClasses).toContain(mod(e.midi))));
 // the held chord is the first chord's tones
 const pad=phraseEvents('pad',dMajor).filter(e=>e.time<1);
 expect(new Set(pad.map(e=>mod(e.midi)))).toEqual(new Set([2,6,9]));
});

test('the default context is A minor and plays through every phrase',()=>{
 for(const {id} of AUDITION_PHRASES)expect(phraseEvents(id,DEFAULT_CONTEXT).length,id).toBeGreaterThan(3);
});

test('a plan gives the key and the chord under the playhead with the next ones, repeats folded',()=>{
 const chord=(name,pcs)=>({name,numeral:name,pitchClasses:pcs,scalePcs:[0,2,4,5,7,9,11],keyName:'C Ionian'});
 const names=['C','C','F','G','C'],plan=names.map((name,bar)=>({bar,chord:chord(name,[0,4,7]),chordStart:bar===0||names[bar-1]!==name}));
 const context=contextFromPlan(plan,4,4*2.5);
 expect(context.key).toBe('C Ionian');
 expect(context.chords.map(c=>c.name)).toEqual(['F','G','C']);
 expect(contextFromPlan([],4,0)).toBeNull();
});
