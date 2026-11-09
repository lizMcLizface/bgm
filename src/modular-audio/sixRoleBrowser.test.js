// @vitest-environment node
import fs from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
const {node}=vi.hoisted(()=>({node:()=>({connect:vi.fn(),disconnect:vi.fn(),gain:{value:1},dispose:vi.fn(),port:{postMessage:vi.fn(),close:vi.fn()}})}));
vi.mock('../synth-lab/inserts',()=>({createInstrumentInserts:async()=>({input:node(),node:node(),dispose:vi.fn()})}));
vi.mock('../synth-lab/effects',()=>({createEffectsBus:async()=>({...node(),input:node()})}));
vi.mock('../synths/all/mixerAudio',()=>({createDeskLimiter:async()=>node(),createMixerAudio:(_c,roles)=>({...node(),input:node(),output:node(),patch:vi.fn(),channels:Object.fromEntries(roles.map(role=>[role,{input:node(),output:node()}]))})}));
import {createSixRoute} from './sixRoleBrowser';
const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json'));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('six-role browser source routing',()=>{
 it.each(['current','owned-all','dag'])('constructs and connects the selected %s sources',async variant=>{
  vi.useFakeTimers();const created=[];
  vi.stubGlobal('AudioWorkletNode',class{constructor(_c,name,options){Object.assign(this,node(),{name,options});created.push(this);queueMicrotask(()=>this.port.onmessage({data:{type:'ready'}}));}});
  const context={sampleRate:48000,destination:node(),audioWorklet:{addModule:vi.fn()},createGain:node},assets={modules:{},contracts:{},manifest:{version:'test'}},route=await createSixRoute(context,assets,fixture,variant);
  try{const sources=created.filter(n=>n.name!=='calmbgm-ensemble-bridge');
   if(variant==='dag'){
    expect(sources.map(n=>n.name)).toEqual(['calmbgm-dag-sources']);const source=sources[0],compressor=created.find(n=>n.options.processorOptions.mode==='compressor');
    expect(source.options.numberOfOutputs).toBe(8);expect(source.options.processorOptions.patch.modules).toHaveLength(13);expect(route.rustOutput).toEqual({node:source,port:7});
    for(let port=0;port<6;port++)expect(source.connect.mock.calls.some(([,from])=>from===port)).toBe(true);
    expect(source.connect).toHaveBeenCalledWith(compressor,6,1);
   }else if(variant==='owned-all'){expect(sources.map(n=>n.name)).toEqual(['calmbgm-owned-fm-pair','calmbgm-owned-core-trio']);expect(route.rustOutput).toBeNull();}
   else{expect(sources).toHaveLength(6);expect(created).toHaveLength(6);expect(route.rustOutput).toBeNull();}
  }finally{route.dispose();vi.clearAllTimers();}
 });
});
