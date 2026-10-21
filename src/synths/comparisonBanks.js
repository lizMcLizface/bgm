import {parse} from 'yaml';

const base=import.meta.env.BASE_URL;
let index;
const banks=new Map();
export function comparisonBankIndex(){
 return index??=fetch(`${base}synth-presets/index.json`).then(r=>{
  if(!r.ok)throw Error('Comparison presets are unavailable.');return r.json();
 }).then(data=>{if(data.schema!==1||!Array.isArray(data.banks))throw Error('Invalid comparison index.');return data.banks;}).catch(e=>{index=null;throw e;});
}
export function validateComparisonBank(bank,synth){
 if(bank?.schema!==1||bank.synth!==synth.id||!Array.isArray(bank.programs)||!bank.programs.length)throw Error('Invalid comparison bank.');
 const ids=new Set();
 for(const p of bank.programs){
  if(typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||!p.values||Array.isArray(p.values))throw Error('Invalid comparison program.');
  ids.add(p.id);
  for(const [key,value] of Object.entries(p.values))if(!synth.params.BY_KEY[key]||typeof value!=='number'||!Number.isFinite(value)||synth.params.clampValue(key,value)!==value)throw Error(`Invalid preset parameter: ${key}`);
 }
 if(synth.id==='vs'&&(!Array.isArray(bank.waves)||bank.waves.length!==16384||bank.waves.some(v=>!Number.isFinite(v)||Math.abs(v)>1)))throw Error('VS comparison waves are missing or invalid.');
 return bank;
}
export function loadComparisonBank(entry,synth){
 if(!banks.has(entry.url))banks.set(entry.url,fetch(base+entry.url).then(r=>{
  if(!r.ok)throw Error(`Could not load ${entry.name}.`);return r.text();
 }).then(text=>validateComparisonBank(parse(text,{maxAliasCount:0}),synth)).catch(e=>{banks.delete(entry.url);throw e;}));
 return banks.get(entry.url);
}
export function comparisonUrl(location,bank,program){
 const url=new URL(location);url.searchParams.set('bank',bank);url.searchParams.set('program',program);url.hash='';return url.href;
}
