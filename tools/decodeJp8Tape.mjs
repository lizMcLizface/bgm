// Decodes a Jupiter-8 data-cassette WAV and prints every patch (or writes JSON).
// Usage: npx vite-node tools/decodeJp8Tape.mjs <tape.wav> [--json out.json] [--raw]
import fs from 'node:fs';
import {decodeTape} from '../src/synths/jupiter/tape.js';
import {decodePatch} from '../src/synths/jupiter/patch.js';
import {JP8_NAMES} from '../src/synths/jupiter/names.js';

const file=process.argv[2];
if(!file){console.error('Usage: vite-node tools/decodeJp8Tape.mjs <tape.wav> [--json out.json] [--raw]');process.exit(1);}
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:null;};
const tape=decodeTape(fs.readFileSync(file));
const code=n=>`${Math.floor(n/8)+1}${n%8+1}`;
console.log(`file ${tape.file} · speed ${(tape.speed*100).toFixed(1)} % · ${tape.bytes.length} bytes · framing errors ${tape.errors} · ${tape.patches.length} patches${tape.copies>1?` (merged from ${tape.copies} copies)`:''}`);
if(tape.damaged.length)console.log(`damaged (checksum or framing): ${tape.damaged.map(code).join(' ')}`);
if(tape.missing.length)console.log(`missing: ${tape.missing.map(code).join(' ')}`);
if(tape.files.length>1)console.log('other files on the recording:',tape.files.filter(f=>f.file!==tape.file));
const patches=tape.patches.map(p=>({number:p.number,code:code(p.number),damaged:p.damaged,name:JP8_NAMES[p.number],raw:[...p.data],...decodePatch(p.data)}));
if(process.argv.includes('--raw'))for(const p of patches)console.log(p.code,p.name.padEnd(22),p.raw.map(b=>b.toString(16).padStart(2,'0')).join(' '));
else console.table(patches.map(p=>({code:p.code,name:p.name,cutoff:+p.cutoff.toFixed(2),res:+p.resonance.toFixed(2),vco1:`${p.vco1Range} ${p.vco1Wave}`,vco2:`${p.vco2Semitones>=0?'+':''}${p.vco2Semitones.toFixed(1)} ${p.vco2Wave}${p.vco2Low?' LOW':''}`,sync:p.sync,env1:p.env1Inverted?'inv':'',lfo:p.lfoWave})));
if(arg('--json'))fs.writeFileSync(arg('--json'),JSON.stringify(patches,null,1));
