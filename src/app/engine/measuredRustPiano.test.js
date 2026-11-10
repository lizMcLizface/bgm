// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {renderPiano} from './piano';
import {createRustPiano} from './rustPiano';
import {MEASURED_TYPES,checkPianoTables} from '../../../tools/buildPianoTables.mjs';
const module=new WebAssembly.Module(fs.readFileSync('public/piano-preparation/piano.wasm'));
it('binds immutable portable tables to the actual eight source files',()=>{expect(()=>checkPianoTables()).not.toThrow();});
it.each(MEASURED_TYPES)('owns %s interpolation, hammer, treble tidy, beating and seeded noise',type=>{
 const a=createRustPiano(module),b=createRustPiano(module);try{let max=0;for(const sr of [8000,48000])for(const frequency of [55,261.63,1760])for(const options of [{type,decay:.7,velocity:4/7,unison:.65,seed:4294967295},{type,decay:3,velocity:0,unison:0,seed:0}]){const expected=renderPiano(sr,frequency,options),actual=a.renderNote(sr,frequency,options);expect(actual.length).toBe(expected.length);for(let i=0;i<actual.length;i++){if(!Number.isFinite(actual[i]))throw Error('Non-finite measured piano');max=Math.max(max,Math.abs(actual[i]-expected[i]));}}expect(max).toBeLessThan(1e-6);const options={type,seed:109,decay:.7},note=a.createNote(48000,220,options),pcm=note.samples();a.renderNote(96000,55,{type,seed:12});expect(note.samples()).toEqual(pcm);expect(b.renderNote(48000,220,JSON.parse(JSON.stringify(options)))).toEqual(pcm);a.dispose();expect(()=>note.samples()).toThrow('disposed');expect(b.renderNote(48000,220,options)).toEqual(pcm);expect(b.activeHandles).toBe(0);expect(()=>b.renderBody(48000,220,{type})).toThrow('original renderer');}finally{a.dispose();b.dispose();}
},60000);
