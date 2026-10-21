// @vitest-environment node
import fs from 'node:fs';
import {parse} from 'yaml';
import {SYNTHS} from './models';
import {validateComparisonBank,comparisonUrl} from './comparisonBanks';
import {parseProphetSysex,pack,NAME_AT} from './prophet/sysex';
import {composeWaves} from './vs/waves';
import {exportPatchYaml} from '../../tools/exportPatchesYaml.mjs';

const read=file=>new Uint8Array(fs.readFileSync(file));
const index=JSON.parse(fs.readFileSync('public/synth-presets/index.json','utf8'));
const bank=id=>parse(fs.readFileSync('public/synth-presets/'+id+'.yaml','utf8'));

test('every published YAML bank has valid, complete engine values and stable program IDs',()=>{
 expect(index.banks).toHaveLength(24);
 expect(new Set(index.banks.map(b=>b.synth))).toEqual(new Set(Object.keys(SYNTHS)));
 let count=0;
 for(const entry of index.banks){
  const b=bank(entry.id),synth=SYNTHS[b.synth];
  expect(validateComparisonBank(b,synth)).toBe(b);
  expect(b.programs.length).toBe(entry.count);count+=b.programs.length;
  for(const p of b.programs)expect(p.values).toEqual(synth.params.sanitize(p.values));
 }
 expect(count).toBe(896);
});

test('drum banks keep their six existing program IDs and append the original Deep kick recipe',()=>{
 for(const model of ['tr808','tr909','tr606']){
  const b=bank(model+'-originals');
  expect(b.programs.slice(0,6).map(p=>p.id)).toEqual(['1','2','3','4','5','6']);
  expect(b.programs.slice(0,6).map(p=>p.name)).toEqual(['Classic','Tight','Boom','Crisp','Room','Pitched Down']);
  expect(b.programs[0].values.kickBody).toBe(0);expect(b.programs[0].values.reverbMix).toBe(0);
  expect(b.programs[6].name).toBe('Deep');expect(b.programs[6].values.kickBody).toBe(1);
 }
});


test('VS public banks carry the original bank-specific waves',()=>{
 const one='banks/prophet-vs/waves-000-063.wav';if(!fs.existsSync(one))return;
 const wavs=[{bytes:read(one),first:0},{bytes:read('banks/prophet-vs/waves-064-127.wav'),first:64}];
 for(const set of ['factory','rom-cart'])expect(bank('vs-'+set).waves).toEqual(Array.from(composeWaves({wavs,userDump:read(`banks/prophet-vs/${set}-user-waves.syx`)})));
});

test('Prophet panel YAML uses the 127-step knob scale',()=>{
 const data=new Uint8Array(133);data[17]=120;data[18]=127;data.set(new TextEncoder().encode('Scale test'),NAME_AT);
 const syx=Uint8Array.from([0xf0,1,0x32,3,...pack(data),0xf7]);
 const panel=parse(exportPatchYaml(syx,'scale.syx').text)[0];
 expect(panel.filter.cutoff).toBe(9.4);expect(panel.filter.resonance).toBe(10);
});

test('comparison links preserve the base path, select an exact bank/program and reject invalid parameters',()=>{
 const url=new URL(comparisonUrl('https://example.test/bgm/synths/prophet5/?x=1#old','prophet5-factory','F5-11'));
 expect(url.pathname).toBe('/bgm/synths/prophet5/');expect(url.searchParams.get('program')).toBe('F5-11');expect(url.hash).toBe('');
 const broken={schema:1,synth:'juno',programs:[{id:'A11',name:'Bad',values:{cutoff:NaN}}]};
 expect(()=>validateComparisonBank(broken,SYNTHS.juno)).toThrow(/Invalid preset parameter/);
});
