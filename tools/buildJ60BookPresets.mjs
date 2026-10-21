// Builds src/synths/juno/bookPresets.js from the measured Juno-60 patch book
// (banks/juno-60/book-raw.json, made by tools/j60-patch-book). Every drawing (the 56 factory
// programs and the owner's-manual examples) becomes an Analog 106 sound of our own: sliders rounded to
// 0.05, a new name, a place in the synth's categories and a matched level.
// Run with npx vite-node tools/buildJ60BookPresets.mjs.
import fs from 'node:fs';
import {toPairs,sanitize} from '../src/synths/juno/params.js';
import {bookEngineValues} from '../src/synths/juno/book.js';
import {MODELS} from '../src/synths/engine/offline.js';
import {levelVolume} from './levelMatch.mjs';

// In book order: [our name, category, styles]
const SOUNDS=[
 ['Warm Ensemble','pads',['warm']],['Silk Ensemble','pads',['soft']],['Bright Ensemble','pads',['bright']],['Parlour Organ','organ',['pulse']],
 ['Bright Drawbars','organ',['bright']],['Mellow Drawbars','organ',['mellow']],['Saw Horns','brass',['saw']],['Swirling Brass','brass',['chorus']],
 ['Bright Keys','keys',['bright']],['Round Keys','keys',['round']],['Little Bells','bells',['chime']],['Soft Keys','keys',['mellow']],
 ['Quill','keys',['plucked']],['Quill Two','keys',['plucked','bright']],['Plucked Strings','bells',['plucked']],['Glass Harp','bells',['plucked','glassy']],
 ['Pulse Bass','bass',['pulse']],['Sub Bass','bass',['sub','round']],['Tangent Keys','keys',['percussive']],['Tangent Keys Two','keys',['percussive','bright']],
 ['Plucked Section','bells',['plucked','ensemble']],['Short Plucks','bells',['short']],['Wood Bars','bells',['mallet','woody']],['Toy Bells','bells',['bright']],
 ['Solo Bow','lead',['bowed']],['Bright Horn','brass',['bright']],['Round Horn','brass',['mellow']],['Low Horn','brass',['low']],
 ['Breath Flute','voices',['breathy']],['Wood Reed','voices',['reedy']],['Double Reed','voices',['reedy','nasal']],['Alto Reed','voices',['reedy','warm']],
 ['Meow','fx',['comic']],['Wah Horns','brass',['wah']],['Phasing Pad','pads',['chorus','moving']],['Reed Lead','lead',['reedy']],
 ['Popping Pluck','bells',['short','resonant']],['Nasal Reed','voices',['nasal']],['Thin Reed','voices',['thin']],['Wide Pulse Pad','pads',['pwm','wide']],
 ['Pulse Organ','organ',['pulse']],['Zapper','fx',['zap']],['Sweeper','fx',['sweep']],['Cosmic Harp','bells',['cosmic']],
 ['Funk Pluck','keys',['funky']],['Orbit','fx',['cosmic']],['Strange Machine','fx',['random']],['Nebula','fx',['cosmic','noise']],
 ['Knock','fx',['percussive']],['Tock','fx',['percussive']],['Whistler','lead',['whistle']],['Laser','fx',['zap']],
 ['Saucer','fx',['cosmic']],['Deep Space','fx',['low','noise']],['Waves','fx',['noise','sweep']],['Synth Tom','fx',['percussive','drum']],
 // the owner's-manual examples
 ['Starting Point','init',['neutral']],['Section Strings','pads',['ensemble']],['Section Strings Two','pads',['ensemble','bright']],['Concert Strings','pads',['slow']],
 ['Club Organ','organ',['percussive']],['Nave Organ','organ',['pipes']],['Living Room Organ','organ',['soft']],['Pure Organ','organ',['sine']],
 ['Square Lead','lead',['square']],['Carousel','organ',['wobble']],['Tine Keys','keys',['tine']],['Tine Keys Two','keys',['tine','bright']],
 ['Jack Keys','keys',['plucked']],['Clav Pluck','keys',['funky']],['Nylon','bells',['plucked']],['Harp Sweep','bells',['plucked','sweep']],
 ['Wah Section','brass',['wah']],['Phased Horns','brass',['chorus']],['Kitten','fx',['comic']],['Pulsar','fx',['rhythmic']],
 ['Phase Layers','pads',['chorus','moving']],['Synth Tone','lead',['bright']],['Synth Tone Two','lead',['soft']],['Gadget','fx',['random']],
 ['Fiddle Lead','lead',['bowed','vibrato']],['Muted Horn','brass',['mellow']],['French Tone','brass',['round']],['Bass Horn','brass',['low']],
 ['Air Flute','voices',['breathy']],['Low Reed','voices',['reedy','low']],['Reed Pipe','voices',['reedy']],['Smoky Reed','voices',['reedy','warm']],
 ['Deep Reed','voices',['reedy','low']],['Mallets','bells',['mallet']],['Chime Bars','bells',['chime']],['Woodblock','fx',['percussive']],
 ['Rimshot','fx',['percussive']],['Drum Pluck','fx',['drum']],['Tin Whistle','lead',['whistle']],['Birdsong','fx',['birds']],
 ['Woof','fx',['comic']],['Starfield','fx',['cosmic']],['Gale','fx',['noise','airy']],
];
const COLOURS={lead:'#d9534f',bells:'#8f7fd1',keys:'#e0a526',pads:'#5b8fd9',brass:'#c8792b',organ:'#7fb36a',bass:'#2f7a6d',fx:'#8a8f96',voices:'#c25b8f',init:'#c9c3b4'};

// Lever dot heights below the header: top ≈ 130 (PWM: LFO), middle/top ≈ 150, bottom ≈ 170.
const lever=(y,top)=>y==null?0:y<(top?140:160)?0:y<160?1:2;
function panel(raw){
 const s={...raw.sliders};
 for(const [k,v] of Object.entries({lfoDelay:0,attack:0,decay:0,sustain:1,release:0}))if(s[k]==null)s[k]=v; // undrawn caps
 for(const k of Object.keys(s))if(s[k]==null)s[k]=0;
 const pwm=['lfo','manual','env'][lever(raw.levers.pwmSource,true)];
 const gate=lever(raw.levers.vcaMode)===2;
 // a few drawings set the VCA to ENV with an envelope that does nothing (no attack, decay or
 // sustain): that only clicks, so these play in GATE mode, as an organ would
 const flat=!gate&&s.attack===0&&s.decay===0&&s.sustain===0;
 return {sliders:s,pulse:raw.leds.pulse,saw:raw.leds.saw,sub:raw.leds.sub,chorus:raw.leds.chorus1?1:raw.leds.chorus2?2:0,
  pwm,inverted:lever(raw.levers.envPolarity)===2,gate:gate||flat,...(flat?{gated:true}:{})};
}
const voiced=(p,volume)=>sanitize({...bookEngineValues(p),reverbMix:.15,volume});

const book=JSON.parse(fs.readFileSync('banks/juno-60/book-raw.json','utf8')).panels;
if(book.length!==SOUNDS.length)throw Error(`Expected ${SOUNDS.length} drawings, found ${book.length}.`);
const rows=book.map((raw,i)=>{
 const [name,category,styles]=SOUNDS[i],p=panel(raw);
 const volume=levelVolume(MODELS.juno,v=>toPairs(voiced(p,v)),voiced(p,undefined).volume);
 const note=p.gated?"note:'An organ drawn with a silent envelope; played in gate mode.',":'';delete p.gated;
 return ` {name:${JSON.stringify(name)},category:'${category}',styles:${JSON.stringify(styles)},colour:'${COLOURS[category]}',${note}volume:${volume},panel:${JSON.stringify(p)}},`;
});
const names=SOUNDS.map(s=>s[0]);
if(new Set(names).size!==names.length)throw Error('Duplicate names.');
fs.writeFileSync('src/synths/juno/bookPresets.js',`// Generated by tools/buildJ60BookPresets.mjs; do not edit by hand.
// Sounds of our own, approximated from the panel drawings of a Juno-60 patch book (its factory
// programs and the owner's-manual examples; measured by tools/j60-patch-book, sliders to ±0.05),
// renamed and sorted into this synth's categories. Panel values are book.js's shape.
export const BOOK_SOUNDS=[
${rows.join('\n')}
];
`);
console.log(`Wrote ${rows.length} book sounds.`);
