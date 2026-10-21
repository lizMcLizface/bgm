// Builds src/synths/obxa/bookPresets.js from the measured patch book
// (banks/oberheim-ob-xa/patch-book.json, made by tools/obxa-patch-book). Each drawing becomes an
// Oberon Xa sound of our own: knob readings rounded to half a division, a new name, a place in the
// synth's categories and a matched level. Run with npx vite-node tools/buildObxaBookPresets.mjs.
import fs from 'node:fs';
import {toPairs,sanitize} from '../src/synths/obxa/params.js';
import {engineValues} from '../src/synths/obxa/book.js';
import {MODELS} from '../src/synths/engine/offline.js';
import {levelVolume} from './levelMatch.mjs';

// book code → [our name, category, styles]
const SOUNDS={
 A1:['Stack Brass','brass',['fat','swell']],A2:['Pick Clav','keys',['percussive']],A3:['Cellar Strings','strings',['low']],A4:['Bell Tines','keys',['tine']],
 A5:['Spin Organ','organ',['rotary']],A6:['Wood Flutes','voices',['breathy']],A7:['Quill Court','keys',['plucked','bright']],A8:['Arena Unison','lead',['unison','fat']],
 B1:['Soft Horns','brass',['mellow']],B2:['Music Box','bells',['chime']],B3:['Upper Strings','strings',['bright']],B4:['Electro Keys','keys',['vintage']],
 B5:['Stone Pipes','organ',['pipes']],B6:['Shimmer Pad','strings',['chorus','wide']],B7:['Lyre','bells',['plucked']],B8:['Fairground','organ',['wobble']],
 AB1:['Fanfare','brass',['bright']],AB2:['Blues Reed','voices',['reedy']],AB3:['Ensemble One','strings',['ensemble']],AB4:['Musette','voices',['reedy','detuned']],
 AB5:['Low Drone','fx',['drone']],AB6:['Highland Drone','voices',['drone','reedy']],AB7:['Twang','bells',['plucked']],AB8:['Resonant Rush','fx',['resonant','sweep']],
 AC1:['Tight Horns','brass',['punchy']],AC2:['Round Bass','bass',['round']],AC3:['Dark Strings','strings',['24 dB','dark']],AC4:['Reed Keys','keys',['reedy']],
 AC5:['Click Organ','organ',['percussive']],AC6:['Alto Reed','voices',['reedy','expressive']],AC7:['Glass Lyre','bells',['plucked','glassy']],AC8:['Silk Road Lead','lead',['unison']],
 BC1:['Island Horns','brass',['bright']],BC2:['Bouncy Clav','keys',['funky']],BC3:['Ensemble Two','strings',['ensemble']],BC4:['Hard Keys','keys',['bright']],
 BC5:['Chapel Organ','organ',['soft']],BC6:['Wood Pipe','voices',['breathy']],BC7:['Wind Chimes','bells',['chime','long']],BC8:['Dread','fx',['unison','dark']],
 ABC1:['Stab Horns','brass',['stab']],ABC2:['Bright Bells','bells',['bell']],ABC3:['Ensemble Three','strings',['ensemble']],ABC4:['Felt Keys','keys',['soft']],
 ABC5:['Harmonium','organ',['reedy']],ABC6:['Talk Box','voices',['vowel','wah']],ABC7:['Wood Mallets','bells',['mallet','woody']],ABC8:['Nightmare','fx',['dark']],
 D1:['Swell Horns','brass',['swell']],D2:['Random Fifths','motion',['random','fifths']],D3:['Gliding Chords','motion',['glide']],D4:['Pan Drums','bells',['metallic']],
 D5:['Square Wobble','motion',['wobble']],D6:['Synth Stab','brass',['stab']],D7:['Glide Unison','lead',['unison','glide']],D8:['Late Vibrato','lead',['vibrato']],
 AD1:['Tenths Pluck','bells',['plucked','interval']],AD2:['Buzz Strings','bells',['buzzy']],AD3:['Folk Bow','strings',['bowed']],AD4:['Pulse Keys','keys',['pulse']],
 AD5:['Width Sweep','motion',['pwm','resonant']],AD6:['Cartoon Stab','fx',['comic']],AD7:['Smoky Solo','lead',['soft']],AD8:['Rumble','fx',['low','noise']],
 BD1:['Random Glide','motion',['random','glide']],BD2:['Hand Drum','fx',['percussive']],BD3:['Ensemble Four','strings',['ensemble']],BD4:['Groove Keys','keys',['funky']],
 BD5:['Plain Organ','organ',['simple']],BD6:['Throb','motion',['tremolo','resonant']],BD7:['Squeaky Toys','fx',['comic']],BD8:['Alien Skip','fx',['random']],
 ABD1:['Clapper','fx',['percussive','noise']],ABD2:['Tower Bells','bells',['bell','long']],ABD3:['Lone Bow','strings',['bowed','solo']],ABD4:['Buzzing Swarm','fx',['buzzy']],
 ABD5:['Resonant Reeds','voices',['resonant','reedy']],ABD6:['Three Layers','motion',['layered']],ABD7:['Wood Hits','fx',['percussive']],ABD8:['Rotor','fx',['rhythmic']],
 CD1:['Jovian Moon','fx',['cosmic']],CD2:['Random Width','motion',['random','pwm']],CD3:['Ensemble Five','strings',['ensemble']],CD4:['Low Reed','voices',['reedy']],
 CD5:['Shining Drone','fx',['drone','bright']],CD6:['Stage Solo','lead',['bright']],CD7:['Wood Clicks','fx',['percussive']],CD8:['Flyover','fx',['noise','sweep']],
 ACD1:['Ripples','fx',['wobble']],ACD2:['Liquid Keys','keys',['wobble']],ACD3:['Slow Bloom Strings','strings',['slow']],ACD4:['Swirl Keys','keys',['swirl']],
 ACD5:['Orbit Bugs','fx',['random','cosmic']],ACD6:['Tape Choir','voices',['choir']],ACD7:['Storm','fx',['noise','low']],ACD8:['Arcade Blip','fx',['short']],
};
const COLOURS={lead:'#d9534f',bells:'#8f7fd1',keys:'#e0a526',strings:'#5b8fd9',brass:'#c8792b',organ:'#7fb36a',bass:'#2f7a6d',fx:'#8a8f96',voices:'#c25b8f',motion:'#4fb3c2'};
const SECTIONS=['pitch','oscillators','mixer','filter','filter_envelope','amp_envelope','lfo','control','performance'];

// Knob readings (0–10) to half a division: what a drawing supports, and no more.
const half=x=>typeof x==='number'?Math.round(x*2)/2:x;
const rounded=section=>Object.fromEntries(Object.entries(section).map(([k,v])=>[k,half(v)]));
const voiced=(panel,volume)=>sanitize({...engineValues(panel),reverbMix:.15,volume});

const book=JSON.parse(fs.readFileSync('banks/oberheim-ob-xa/patch-book.json','utf8'));
if(book.patches.length!==Object.keys(SOUNDS).length)throw Error('Expected one drawing per sound.');
const rows=book.patches.map(p=>{
 const [name,category,styles]=SOUNDS[p.code]??(()=>{throw Error('No name for '+p.code);})();
 const panel=Object.fromEntries(SECTIONS.map(s=>[s,s==='pitch'?p.pitch:rounded(p[s])]));
 // A drawing with every source off rings the resonant filter on its own; this engine's filter needs
 // a little input for that, so the noise source feeds it.
 const silent=!panel.mixer.osc1&&panel.mixer.osc2==='off'&&!panel.mixer.noise;
 if(silent)panel.mixer={...panel.mixer,noise:true};
 const volume=levelVolume(MODELS.obxa,v=>toPairs(voiced(panel,v)),voiced(panel,undefined).volume);
 return ` {name:${JSON.stringify(name)},category:'${category}',styles:${JSON.stringify(styles)},colour:'${COLOURS[category]}',${silent?"note:'A ringing resonant filter, fed with a little noise.',":''}volume:${volume},panel:${JSON.stringify(panel)}},`;
});
const names=rows.map(r=>JSON.parse(r.match(/name:("[^"]*")/)[1]));
if(new Set(names).size!==names.length)throw Error('Duplicate names.');
fs.writeFileSync('src/synths/obxa/bookPresets.js',`// Generated by tools/buildObxaBookPresets.mjs; do not edit by hand.
// Sounds of our own, approximated from the panel drawings of the factory patch book (measured by
// tools/obxa-patch-book, knobs rounded to half a division), renamed and sorted into this synth's
// categories. Panel values use the book JSON's shape (see book.js engineValues).
export const BOOK_SOUNDS=[
${rows.join('\n')}
];
`);
console.log(`Wrote ${rows.length} book sounds.`);
