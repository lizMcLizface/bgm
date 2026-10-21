// Explicit publication list. Never scan banks/ or patches/: they also contain
// unrelated recordings and private experiments. Run with npm run synths:presets.
import fs from 'node:fs';
import path from 'node:path';
import {parse,stringify} from 'yaml';
import {SYNTHS} from '../src/synths/models.js';
import {parseDx7Sysex} from '../src/synths/dx7/sysex.js';
import {engineValues as dx7Values} from '../src/synths/dx7/voice.js';
import {parseVsSysex} from '../src/synths/vs/sysex.js';
import {engineValues as vsValues} from '../src/synths/vs/params.js';
import {composeWaves} from '../src/synths/vs/waves.js';
import {exportPatchYaml} from './exportPatchesYaml.mjs';

const read=file=>new Uint8Array(fs.readFileSync(path.join('banks',file)));
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
function source(id,synth,name,file,decode,extra={}){
 const bytes=read(file),panel=parse(exportPatchYaml(bytes,path.basename(file)).text);
 const programs=decode(bytes);
 if(programs.length!==panel.length)throw Error(`Panel/engine count mismatch: ${id}`);
 write(id,synth,name,'factory',programs.map((p,i)=>({...p,panel:panel[i]})),{source:path.basename(file),...extra});
}
// No Juno-106 bank is published: Analog 106's sounds come from the Juno-60 patch book
// (src/synths/juno/bookPresets.js); any .syx bank still loads locally on the page.
// Sequential's .syx is not published: the original programs ship as Oracle 5's patch-sheet sounds
// (src/synths/prophet/sheetPresets.js); any .syx still loads locally on the page.
// The Jupiter-8 factory tape is not published: its sounds ship as Pluto 8's patch-sheet sounds
// (src/synths/jupiter/sheetPresets.js), and the tape stays a local import on the page.
// The OB-Xa patch book is not published either: its drawings ship as Oberon Xa's book sounds
// (src/synths/obxa/bookPresets.js); the measured book loads locally on the page.
for(const cart of ['rom1a','rom1b','rom2a','rom2b','rom3a','rom3b','rom4a','rom4b']){
 source('dx7-'+cart,'dx7',cart.toUpperCase(),`dx7/${cart}.syx`,bytes=>parseDx7Sysex(bytes).map((p,i)=>{
  if(!p.checksumOk)throw Error(`Bad DX7 checksum: ${cart}`);
  return {id:String(p.number??i+1),name:`${p.number??i+1} ${p.name}`,values:{...dx7Values(p.raw),reverbMix:0,chorusMix:0}};
 }));
}
const wavs=[{bytes:read('prophet-vs/waves-000-063.wav'),first:0},{bytes:read('prophet-vs/waves-064-127.wav'),first:64}];
for(const set of ['factory','rom-cart'])source('vs-'+set,'vs',set==='factory'?'Factory programs':'ROM cartridge',`prophet-vs/${set}-programs.syx`,bytes=>parseVsSysex(bytes).map(p=>({id:String(p.number),name:`${p.number} ${p.name}`,values:vsValues(p.raw)})),{
 waves:Array.from(composeWaves({wavs,userDump:read(`prophet-vs/${set}-user-waves.syx`)})),
});
for(const [id,synth] of Object.entries(SYNTHS))write(id+'-originals',id,'bgm sounds','original',synth.presets.map((p,i)=>({id:String(i+1),name:p.name,values:p.values})),id==='vs'?{waves:Array.from(composeWaves())}:{});
fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index,null,2)+'\n');
