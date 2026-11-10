// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {ReferenceGraph} from './runtime';
import {iowaFixture} from './iowaFixture';
const wasm=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const code=contracts.modules.find(n=>n.type==='legacy.iowa').code;
const start=()=>{const e=new WebAssembly.Instance(wasm,{}).exports,g=e.graph_new(48000,512);expect(e.graph_node(g,1,code,1)).toBe(0);return {e,g};};
const spec=(e,g,id=1)=>e.graph_iowa_spec(g,1,id,1,0,1,0,0,0,0,0);
const data=(e,g,field,a)=>{const b=e.graph_iowa_buffer_new(a.length);try{new Float64Array(e.memory.buffer,e.graph_iowa_buffer_ptr(b),a.length).set(a);return e.graph_iowa_data(g,1,1,field,b);}finally{e.graph_iowa_buffer_free(b);}};
it('bounds raw preparation scratch, spec IDs, partial vectors and finite values independently of JS validation',()=>{
 const {e,g}=start();try{expect(e.graph_iowa_buffer_new(262145)).toBe(0);expect(e.graph_iowa_config(g,1,33)).not.toBe(0);expect(e.graph_iowa_config(g,1,1)).toBe(0);expect(e.graph_iowa_config(g,1,1)).not.toBe(0);expect(spec(e,g,0)).not.toBe(0);expect(spec(e,g)).toBe(0);expect(spec(e,g)).not.toBe(0);expect(data(e,g,9,[])).not.toBe(0);expect(data(e,g,8,[0])).not.toBe(0);expect(data(e,g,8,[NaN,1,0,0,-1,-1])).not.toBe(0);expect(data(e,g,8,[440,.1,0,0,-1,-1])).toBe(0);expect(data(e,g,8,[])).not.toBe(0);for(let i=2;i<=96;i++)expect(spec(e,g,i)).toBe(0);expect(spec(e,g,97)).not.toBe(0);}finally{e.graph_free(g);}
});
it('rejects invalid partial bounds at Rust prepare and refuses edits after preparation',()=>{
 const p=iowaFixture(JSON.parse(fs.readFileSync('src/library/iowaTables/guitar.json')),'guitar').patch;
 const e=new WebAssembly.Instance(wasm,{}).exports,g=new ReferenceGraph(e,p,contracts,48000,512);try{expect(e.graph_iowa_config(g.handle,1,1)).not.toBe(0);expect(spec(e,g.handle,99)).not.toBe(0);expect(data(e,g.handle,7,[])).not.toBe(0);}finally{g.dispose();}
 for(const part of [[24000,.1,0,0,-1,-1],[440,65,0,0,-1,-1],[440,.1,0,1,-1,-1],[440,.1,0,0,1,-1]]){const {e,g}=start();try{expect(e.graph_iowa_config(g,1,1)).toBe(0);expect(spec(e,g)).toBe(0);expect(data(e,g,7,[])).toBe(0);expect(data(e,g,8,part)).toBe(0);const output=contracts.modules.find(n=>n.type==='ref.output');expect(e.graph_node(g,18,output.code,1)).toBe(0);expect(e.graph_audio_port(g,1,1,0,18,0)).toBe(0);expect(e.graph_prepare(g)).not.toBe(0);}finally{e.graph_free(g);}}
});
it('rejects cross-rate prepared banks and preserves host lifetime references',()=>{const p=iowaFixture(JSON.parse(fs.readFileSync('src/library/iowaTables/flute.json')),'flute').patch;expect(()=>new ReferenceGraph(new WebAssembly.Instance(wasm,{}).exports,p,contracts,44100,512)).toThrow('sample rate');});
