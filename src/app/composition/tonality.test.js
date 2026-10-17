import {atonalRow,atonalChord,applyBitonality} from './tonality';
import {diatonicChord} from '../theory';
import {defaultSettings,encodeSettings,decodeSettings,sanitizeSettings} from '../settings';
import {randomField,randomProgression,randomLength} from '../randomize';
import PROGRESSIONS,{isUnsettlingProgression,isSpecialProgression} from '../progressions';
import {seeded} from '../random';
test('atonal rows cover all twelve pitch classes deterministically without a diatonic scale',()=>{
 for(const seed of [1,7,42,12345])for(let tonic=0;tonic<12;tonic++){
  const row=atonalRow(seed,tonic);expect(new Set(row).size).toBe(12);expect(row).toEqual(atonalRow(seed,tonic));
  const pcs=new Set();for(let slot=0;slot<4;slot++){const c=atonalChord({seed,tonic,slot,size:4});c.pitchClasses.forEach(p=>pcs.add(p));expect(c.scalePcs).toHaveLength(12);expect(c.tonality.mode).toBe('atonal');}
  expect(pcs.size).toBe(12);
 }
});
test('chromatic colours explicitly produce the requested semitone and major-seventh intervals',()=>{
 for(const colour of ['flat2','major7'])for(const size of [3,4,5]){
  const notes=diatonicChord([0,2,3,5,7,8,10],4,size,colour),interval=colour==='flat2'?1:11;
  expect(notes.some(n=>(n-notes[0])%12===interval)).toBe(true);expect(new Set(notes).size).toBe(notes.length);
  const set=atonalChord({seed:42,slot:1,size,colour});expect(set.pitchClasses).toContain((set.pitchClasses[0]+interval)%12);
 }
});
test('bitonal foreground transposition retains every rhythm, backing pitch and melodic interval',()=>{
 const events=[{role:'lead',midi:60,beat:0,length:2,velocity:.7},{role:'counter',midi:65,beat:1,length:1},{role:'pad',midi:55},{role:'bass',midi:36},{role:'perc',midi:1}],before=structuredClone(events);
 applyBitonality(events,{mode:'bitonal',separation:3});expect(events).toEqual(before.map(n=>({...n,midi:n.midi+(['lead','counter'].includes(n.role)?3:0)})));
 const plain=structuredClone(before);applyBitonality(plain,{mode:'tonal',separation:3});expect(plain).toEqual(before);
});
test('tonality, dissonant colours and appended progressions survive shared links without changing older fields',()=>{
 for(const mode of ['tonal','atonal','bitonal'])for(const colour of ['flat2','major7']){
  const settings={...defaultSettings(),seed:42,progression:30,tonality:{mode,separation:7},chordColour:{mode:colour,amount:1}};
  expect(sanitizeSettings(settings)).toEqual(settings);expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
 }
});
test('normal and wild progression dice exclude unresolved choices, including when leaving one',()=>{
 const rng=seeded(42);for(const level of ['within','wild'])for(let i=0;i<250;i++){
  const settings={...defaultSettings(),progression:[0,28,31][i%3]};
  for(const patch of [randomField('progression',settings,level,rng),randomProgression(settings,level,rng),randomLength(settings,level,rng)])expect(isSpecialProgression(patch.progression)).toBe(false);
 }
 for(const [i,p]of PROGRESSIONS.entries())if(isUnsettlingProgression(i))expect(p.every(n=>n.toUpperCase()!=='I')).toBe(true);
});
