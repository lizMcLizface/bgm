// Fits the Pluto 8 sheet readings (banks/jupiter-8/patch-sheets.json) against the decoded factory
// tape of the same programs (banks/jupiter-8/jp8-factory-tape.wav, git-ignored) and writes the
// per-slider lines to tools/jp8-patch-sheets/calibration.json, which buildJp8SheetPresets.mjs
// applies. Run with npx vite-node tools/calibrateJp8Sheets.mjs.
import fs from 'node:fs';
import {decodeTape} from '../src/synths/jupiter/tape.js';
import {decodePatch} from '../src/synths/jupiter/patch.js';
import {fitCalibration} from './sheetCalibration.mjs';

const tape=decodeTape(new Uint8Array(fs.readFileSync('banks/jupiter-8/jp8-factory-tape.wav')));
const bytes=p=>p.data instanceof Uint8Array?p.data:Uint8Array.from(p.data.match(/../g),h=>parseInt(h,16));
const memory=new Map(tape.patches.filter(p=>!p.damaged).map(p=>[p.number,decodePatch(bytes(p))]));
const sheets=JSON.parse(fs.readFileSync('banks/jupiter-8/patch-sheets.json','utf8')).patches;
// sliders and continuous knobs; VCO-2 range is read to the semitone from the dial and the VCA LFO switch
// to its step, and both stay as read
const CONTROLS=Object.keys(sheets[0].values).filter(k=>typeof sheets[0].values[k]==='number'&&k!=='vco2Semitones'&&k!=='vcaLfo');
const pairs=Object.fromEntries(CONTROLS.map(k=>[k,[]]));
for(const s of sheets){const m=memory.get((+s.code[0]-1)*8+(+s.code[1]-1));if(m)for(const k of CONTROLS)pairs[k].push([s.values[k],m[k]]);}
const {controls,skipped}=fitCalibration(pairs,{flat:['vco2Fine']});
fs.writeFileSync('tools/jp8-patch-sheets/calibration.json',JSON.stringify({
 note:'Per-slider lines, drawn reading → value, fitted on the factory tape (tools/calibrateJp8Sheets.mjs). Only the coefficients are kept.',
 programs:memory.size,controls,skipped},null,1)+'\n');
for(const [k,c] of Object.entries(controls))console.log(k.padEnd(12),`${c.a}×+${c.b}`,`error ${c.before} → ${c.after} (${c.kept})`);
for(const [k,r] of Object.entries(skipped))console.log(k.padEnd(12),'kept as read:',r);
