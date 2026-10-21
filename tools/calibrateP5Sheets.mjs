// Fits the Oracle 5 sheet readings (banks/prophet-5/patch-sheets.json) against the original programs
// in Sequential's factory file (banks/prophet-5/*.syx, bank F5, git-ignored) and writes the per-knob
// lines to tools/p5-patch-sheets/calibration.json for buildP5SheetPresets.mjs. Only the coefficients
// are kept. Run with npx vite-node tools/calibrateP5Sheets.mjs.
import fs from 'node:fs';
import {parseProphetSysex} from '../src/synths/prophet/sysex.js';
import {fitCalibration} from './sheetCalibration.mjs';

const file=fs.readdirSync('banks/prophet-5').find(f=>/factory.*\.syx$/i.test(f));
const programs=parseProphetSysex(new Uint8Array(fs.readFileSync('banks/prophet-5/'+file)));
// the sheets' 1-1 … 5-6 are the original programs, stored in bank F5 (the tenth bank) as groups 1–5
const memory=new Map(programs.filter(p=>p.bank===9).map(p=>[`${Math.floor(p.program/8)+1}${p.program%8+1}`,p.values]));
const sheets=JSON.parse(fs.readFileSync('banks/prophet-5/patch-sheets.json','utf8')).patches;
const KNOBS=Object.keys(sheets[0].values).filter(k=>typeof sheets[0].values[k]==='number'&&!/Freq|Cents|Raw|Hz/.test(k));
const pairs=Object.fromEntries(KNOBS.map(k=>[k,[]]));
for(const s of sheets){const m=memory.get(s.code);if(m)for(const k of KNOBS)if(typeof m[k]==='number')pairs[k].push([s.values[k],m[k]]);}
const {controls,skipped}=fitCalibration(Object.fromEntries(Object.entries(pairs).filter(([,l])=>l.length)),{minKept:25});
fs.writeFileSync('tools/p5-patch-sheets/calibration.json',JSON.stringify({
 note:'Per-knob lines, drawn reading → value, fitted on the factory file (tools/calibrateP5Sheets.mjs). Only the coefficients are kept.',
 programs:memory.size,controls,skipped},null,1)+'\n');
console.log('programs matched',sheets.filter(s=>memory.has(s.code)).length,'of',sheets.length);
for(const [k,c] of Object.entries(controls))console.log(k.padEnd(14),`${c.a}×+${c.b}`,`error ${c.before} → ${c.after} (${c.kept})`);
for(const [k,r] of Object.entries(skipped))console.log(k.padEnd(14),'kept as read:',r);
