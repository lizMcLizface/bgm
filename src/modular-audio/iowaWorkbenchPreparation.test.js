// @vitest-environment node
import fs from 'node:fs';import {it,expect,vi}from 'vitest';
import {compileWithRustIowa}from './iowaWorkbenchPreparation';import {createRustIowaPreparation}from './iowaPreparation';import {compileIowaNotes}from './iowaCompiler';import {iowaFixture}from './iowaFixture';
const module=new WebAssembly.Module(fs.readFileSync('public/iowa-preparation/iowa.wasm'));
it.each(['flute','guitar','marimba-roll'])('compiles %s using owned Rust preparation and releases all preparation handles',async id=>{
 const f=iowaFixture(JSON.parse(fs.readFileSync(`src/library/iowaTables/${id==='marimba-roll'?'marimba':id}.json`)),id),renderer=createRustIowaPreparation(module),expected=compileIowaNotes(f.source,f.notes),before=JSON.stringify(f.source),actual=await compileWithRustIowa([{source:f.source}],([s])=>({result:compileIowaNotes(s.source,f.notes),preparation:s.source.preparation}),async()=>({renderer,version:'test'}));
 expect(actual.preparation).toEqual({backend:'rust',engineVersion:'test'});expect(actual.result.events).toEqual(expected.events);expect(actual.result.config.notes).toEqual(expected.config.notes);for(let i=0;i<actual.result.config.banks.length;i++){const a=actual.result.config.banks[i],b=expected.config.banks[i];for(const key of Object.keys(a))if(typeof a[key]==='number')expect(a[key]).toBeCloseTo(b[key],12);}expect(renderer.activeTables).toBe(0);expect(renderer.activeNotes).toBe(0);expect(()=>renderer.createTable(f.source.patch.table)).toThrow('disposed');expect(JSON.stringify(f.source)).toBe(before);
});
it('does not load an unused backend and always disposes preparation after compilation errors',async()=>{
 const load=vi.fn();expect(await compileWithRustIowa([{source:{kind:'fm'}}],()=>42,load)).toBe(42);expect(load).not.toHaveBeenCalled();const f=iowaFixture(JSON.parse(fs.readFileSync('src/library/iowaTables/flute.json')),'flute'),renderer=createRustIowaPreparation(module);await expect(compileWithRustIowa([{source:f.source}],()=>{throw Error('compile failed');},async()=>({renderer,version:'test'}))).rejects.toThrow('compile failed');expect(renderer.activeTables).toBe(0);expect(renderer.activeNotes).toBe(0);
});
