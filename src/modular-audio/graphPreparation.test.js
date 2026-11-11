// @vitest-environment node
// Raw ABI coverage: constructor validation must remain authoritative without JS.
import fs from 'node:fs';
import {it,expect} from 'vitest';
const module=new WebAssembly.Module(fs.readFileSync(process.env.GRAPH_PREPARATION_WASM??'public/modular-audio/graph.wasm'));
const exports=()=>new WebAssembly.Instance(module,{}).exports;
const prototype=exports(),descriptor=prototype.graph_contracts_new();
let contracts;try{contracts=JSON.parse(new TextDecoder().decode(new Uint8Array(prototype.memory.buffer,prototype.graph_contracts_ptr(descriptor),prototype.graph_contracts_len(descriptor))));}finally{prototype.graph_contracts_free(descriptor);}
const parameters=code=>contracts.modules.find(d=>d.code===code).parameters;
function raw(nodes){const e=exports(),g=e.graph_new(48000,128);expect(g).not.toBe(0);for(const [id,code]of nodes)expect(e.graph_node(g,id,code,1)).toBe(0);return {e,g,free:()=>e.graph_free(g)};}
const connect=(e,g,id,from,to,input=0)=>expect(e.graph_audio(g,id,from,to,input)).toBe(0);
const rack=(e,g,id,code,omit=-1)=>parameters(code).forEach(p=>{if(p.code!==omit)expect(e.graph_fx_initial(g,id,p.code,p.default)).toBe(0);});
function voice(e,g,id,omit=-1){expect(e.graph_voice_fx_config(g,id,109)).toBe(0);rack(e,g,id,23,omit);}
function strip(e,g,id){for(const [index,value]of [1,0,24000,0,0,0,0,1].entries())expect(e.graph_mixer_config(g,id,index,value,1)).toBe(0);}
function waves(e,g,id){const length=e.graph_classic_wave_len(g,id),pointer=e.graph_classic_wave_ptr(g,id);expect(length).toBe(16384);expect(pointer).not.toBe(0);new Float32Array(e.memory.buffer,pointer,length).fill(0);expect(e.graph_classic_wave_commit(g,id)).toBe(0);}
it.each([12,13])('requires complete initial parameters for effect kind%i, permits rewrites, and supports correction/retry',code=>{
 const {e,g,free}=raw([[1,7],[2,code],[18,4]]);try{connect(e,g,1,1,2);connect(e,g,2,2,18);expect(e.graph_fx_config(g,2,Number(code===12))).toBe(0);expect(e.graph_prepare(g)).toBe(3);
  const list=parameters(code);for(const p of list.slice(0,-1))expect(e.graph_base(g,2,p.code,p.default)).toBe(0);expect(e.graph_base(g,2,list[0].code,list[0].default)).toBe(0);expect(e.graph_prepare(g)).toBe(3);const last=list.at(-1);expect(e.graph_base(g,2,last.code,last.default)).toBe(0);expect(e.graph_prepare(g)).toBe(0);expect(e.graph_render(g,128)).toBe(0);
 }finally{free();}
});
it.each(['rack','voice','mixer','classic'])('preflights every %s resource before locking an earlier valid resource',family=>{
 const codes=family==='rack'?[20,21]:family==='voice'?[23,23]:family==='mixer'?[15,17]:[19,19],{e,g,free}=raw([[1,7],[2,codes[0]],[3,codes[1]],[18,4]]);try{
  if(family==='classic'){connect(e,g,1,2,18);expect(e.graph_classic_config(g,2,0,4)).toBe(0);expect(e.graph_classic_config(g,3,7,4)).toBe(0);}else{connect(e,g,1,1,2);connect(e,g,2,2,3);connect(e,g,3,3,18);if(family==='rack'){rack(e,g,2,20);rack(e,g,3,21,2);}else if(family==='voice'){voice(e,g,2);voice(e,g,3,4);}else strip(e,g,2);}
  expect(e.graph_prepare(g)).toBe(3);expect(e.graph_render(g,1)).not.toBe(0);
  if(family==='classic'){expect(e.graph_classic_param(g,2,0,parameters(19)[0].default)).toBe(0);waves(e,g,3);}else if(family==='rack')expect(e.graph_fx_initial(g,3,2,.5)).toBe(0);else if(family==='voice')expect(e.graph_fx_initial(g,3,4,7000)).toBe(0);else expect(e.graph_mixer_config(g,3,0,1,1)).toBe(0);
  expect(e.graph_prepare(g)).toBe(0);expect(e.graph_render(g,128)).toBe(0);
 }finally{free();}
});
it('preflights complete ZPlane built-in/custom rows before locking any rack kernel',()=>{
 const {e,g,free}=raw([[1,7],[2,20],[3,22],[18,4]]);try{connect(e,g,1,1,2);connect(e,g,2,2,3);connect(e,g,3,3,18);rack(e,g,2,20);rack(e,g,3,22);expect(e.graph_rack_shape_count(g,3,1)).toBe(0);for(const shape of [0,64,65])for(let section=0;section<12;section++)if(shape!==65||section!==11)expect(e.graph_rack_shape_row(g,3,shape,section,1000,100,0)).toBe(0);expect(e.graph_prepare(g)).toBe(3);expect(e.graph_rack_shape_row(g,3,65,11,1000,100,0)).toBe(0);expect(e.graph_prepare(g)).toBe(0);expect(e.graph_render(g,128)).toBe(0);}finally{free();}
});
it('rejects fractional PDC differences before locking piano/Iowa/FX resources and allows host metadata correction',()=>{
 const {e,g,free}=raw([[1,7],[2,10],[3,11],[4,7],[5,12],[7,3],[18,4]]);try{
  expect(e.graph_latency_compensation(g,1)).toBe(0);expect(e.graph_piano_config(g,2,1,2000,.7,0,.2)).toBe(0);expect(e.graph_iowa_config(g,3,1)).toBe(0);expect(e.graph_fx_config(g,5,1)).toBe(0);for(const p of parameters(12))expect(e.graph_base(g,5,p.code,p.default)).toBe(0);
  connect(e,g,1,1,5);connect(e,g,2,5,7,0);connect(e,g,3,4,7,1);connect(e,g,4,7,18);expect(e.graph_input_latency(g,4,.5)).toBe(0);expect(e.graph_prepare(g)).toBe(9);
  // These preparation writes would fail if the earlier prepare had committed.
  expect(e.graph_piano_bank(g,2,220,0,.3,.5,.5,0,.5,109,0,.5,0,0)).toBe(0);expect(e.graph_iowa_spec(g,3,1,1,0,.3,0,0,0,0,0)).toBe(0);
  const scratch=e.graph_iowa_buffer_new(0);expect(scratch).not.toBe(0);try{expect(e.graph_iowa_data(g,3,1,7,scratch)).toBe(0);expect(e.graph_iowa_data(g,3,1,8,scratch)).toBe(0);}finally{e.graph_iowa_buffer_free(scratch);}
  expect(e.graph_base(g,5,0,0)).toBe(0);expect(e.graph_input_latency(g,4,0)).toBe(0);expect(e.graph_prepare(g)).toBe(0);expect(e.graph_edge_latency(g,3)).toBe(128);expect(e.graph_render(g,128)).toBe(0);
 }finally{free();}
});
it.runIf(typeof prototype.graph_alloc_watch==='function')('keeps corrected preparation render/reset/enqueue free of allocation, reclamation and memory growth',()=>{
 const {e,g,free}=raw([[1,7],[2,20],[3,23],[4,15],[18,4]]);try{connect(e,g,1,1,2);connect(e,g,2,2,3);connect(e,g,3,3,4);connect(e,g,4,4,18);rack(e,g,2,20);voice(e,g,3);expect(e.graph_prepare(g)).toBe(3);strip(e,g,4);expect(e.graph_prepare(g)).toBe(0);const memory=e.memory.buffer.byteLength;e.graph_alloc_watch(1);try{expect(e.graph_fx_param(g,128,2,1,0,10)).toBe(0);expect(e.graph_mixer_param(g,37,4,1,7,.30000000000000004)).toBe(0);for(let i=0;i<16;i++)expect(e.graph_render(g,128)).toBe(0);e.graph_cancel(g,1);e.graph_reset(g);expect(e.graph_render(g,128)).toBe(0);expect(e.graph_alloc_count()).toBe(0);expect(e.memory.buffer.byteLength).toBe(memory);}finally{e.graph_alloc_watch(0);}}finally{free();}
});
