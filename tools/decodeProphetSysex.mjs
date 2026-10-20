// Decodes a Prophet-5/10 (Rev 4) .syx file and prints every program (or writes JSON).
// Usage: npx vite-node tools/decodeProphetSysex.mjs <bank.syx> [--json out.json] [--raw] [--bank F5]
import fs from 'node:fs';
import {parseProphetSysex} from '../src/synths/prophet/sysex.js';

const file=process.argv[2];
if(!file){console.error('Usage: vite-node tools/decodeProphetSysex.mjs <bank.syx> [--json out.json] [--raw] [--bank F5]');process.exit(1);}
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:null;};
const all=parseProphetSysex(fs.readFileSync(file)),bank=arg('--bank');
const programs=bank?all.filter(p=>p.code.startsWith(bank+'-')):all;
console.log(`${all.length} programs (${[...new Set(all.map(p=>p.device))].join(', ')}), showing ${programs.length}`);
const st=v=>`${v>=0?'+':''}${v}`,waves=(...w)=>w.filter(Boolean).join('+')||'off';
if(process.argv.includes('--raw'))for(const p of programs)console.log(p.code,p.name.padEnd(20),[...p.data.subarray(0,65)].map(b=>b.toString(16).padStart(2,'0')).join(' '));
else console.table(programs.map(({code,values:v})=>({code,name:v.name,
 oscA:`${st(v.oscAFreq)} ${waves(v.oscASaw&&'saw',v.oscAPulse&&'pulse')}`,
 oscB:v.oscBLowFreq?`LO ${v.oscBLowHz.toFixed(2)} Hz`:`${st(v.oscBFreq)} ${waves(v.oscBSaw&&'saw',v.oscBTri&&'tri',v.oscBPulse&&'pulse')}`,
 sync:v.sync,cutoff:+v.cutoff.toFixed(2),res:+v.resonance.toFixed(2),env:+v.filterEnv.toFixed(2),
 polyMod:v.polyModEnv||v.polyModOscB?`${v.polyModEnv.toFixed(2)}/${v.polyModOscB.toFixed(2)}→${[v.polyModFreqA&&'A',v.polyModPwA&&'PW',v.polyModFilter&&'F'].filter(Boolean).join(',')}`:'',
 voices:v.unison?(v.unisonChord?`chord ${v.chord.join(',')}`:`uni ${v.unisonVoices}`):'poly',
 filter:v.filterRev})));
if(arg('--json'))fs.writeFileSync(arg('--json'),JSON.stringify(programs.map(p=>({code:p.code,raw:[...p.data],...p.values})),null,1));
