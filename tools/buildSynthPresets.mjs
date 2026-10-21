// Explicit publication list. Never scan banks/ or patches/: they also contain
// unrelated recordings and private experiments. Run with npm run synths:presets.
import fs from 'node:fs';
import path from 'node:path';
import {stringify} from 'yaml';
import {SYNTHS} from '../src/synths/models.js';
import {composeWaves} from '../src/synths/vs/waves.js';

const out='public/synth-presets';fs.mkdirSync(out,{recursive:true});
const index={schema:1,banks:[]};
const write=(id,synth,name,kind,programs,extra={})=>{
 const model=SYNTHS[synth];
 const bank={schema:1,id,synth,name,kind,
  note:kind==='original'?'Original bgm recipes; not original hardware factory programs.':'Decoded programs for hardware comparison. Engine calibration remains approximate; panel values are the reference for setting hardware.',
  ...extra,programs:programs.map((p,i)=>({id:String(p.id??p.code??i+1),name:p.name||`Program ${p.code??i+1}`,
   ...(p.panel?{panel:p.panel}:{}),values:model.params.sanitize(p.values)}))};
 if(!bank.programs.length||new Set(bank.programs.map(p=>p.id)).size!==bank.programs.length)throw Error(`Invalid program IDs: ${id}`);
 const text='# Synth comparison bank. Panel values and resolved engine parameters.\n'+stringify(bank,{lineWidth:100,aliasDuplicateObjects:false});
 fs.writeFileSync(path.join(out,id+'.yaml'),text);
 index.banks.push({id,synth,name,kind,count:programs.length,url:`synth-presets/${id}.yaml`});
 console.log(`${id}: ${programs.length} programs`);
};
// Only each synth's own sounds are published. No factory data is: the patch books and sheets ship
// as derived sounds (Pluto 8, Oberon Xa, Oracle 5, Analog 106), FM7 and VectorVS as generated suites
// (tools/fm7-suite, tools/vs-suite); the original files still load locally on their pages.
for(const [id,synth] of Object.entries(SYNTHS))write(id+'-originals',id,'bgm sounds','original',synth.presets.map((p,i)=>({id:String(i+1),name:p.name,values:p.values})),id==='vs'?{waves:Array.from(composeWaves())}:{});
fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index,null,2)+'\n');
