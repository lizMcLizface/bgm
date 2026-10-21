import {createInstrumentInserts} from '../../synth-lab/inserts';
import {createEffectsBus} from '../../synth-lab/effects';
import Compressor from '../../nodes/compressor';
import {rackPackets} from './params';

// One rack per running instrument. Its controller may be in another tab;
// the audio graph always stays alongside its source and AudioContext.
export async function createRack(context,values,{onError=()=>{}}={}){
 let inserts,effects,metering=false;
 const nodes=[],gain=()=>{const n=context.createGain();nodes.push(n);return n;};
 const input=gain(),trim=gain(),clean=gain(),compressed=gain(),processed=gain(),bypass=gain(),output=gain();
 const compressor=new Compressor(context);nodes.push(compressor.getNode());
 const dispose=()=>{inserts?.dispose();effects?.dispose();nodes.forEach(n=>n.disconnect());};
 const patch=(raw,initial=false)=>{
  const {inserts:i,effects:e,compressor:c,master:m}=rackPackets(raw);
  metering=!!(m.enabled&&c.enabled);
  inserts.patch(i);effects.patch(e);
  const set=(param,v)=>initial?param.setValueAtTime(v,context.currentTime):param.setTargetAtTime(v,context.currentTime,.012);
  set(trim.gain,10**(m.input/20));set(processed.gain,m.enabled?10**(m.output/20):0);set(bypass.gain,m.enabled?0:1);
  set(clean.gain,c.enabled?0:1);set(compressed.gain,c.enabled?10**(c.makeup/20):0);
  for(const key of ['threshold','ratio','knee','attack','release'])set(compressor.getNode()[key],c[key]);
 };
 try{
  const p=rackPackets(values);
  inserts=await createInstrumentInserts(context,p.inserts,{onError});effects=await createEffectsBus(context,p.effects,{onError});
  input.connect(trim);trim.connect(inserts.input);inserts.connect(clean);inserts.connect(compressor.getNode());compressor.connect(compressed);
  clean.connect(effects.input);compressed.connect(effects.input);effects.connect(processed);processed.connect(output);input.connect(bypass);bypass.connect(output);
  patch(values,true);
  return {input,node:output,patch,connect:destination=>output.connect(destination),clear(){inserts.clear();effects.clear();},get reduction(){return metering?compressor.getNode().reduction:0;},dispose};
 }catch(error){dispose();throw error;}
}
