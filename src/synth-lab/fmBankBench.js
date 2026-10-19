// Exact per-output comparison and a repeatable isolated bank throughput fixture.
import {fmPacket} from './fmPatch';
export function bankFixture(modules,patches,{rate=48000,seconds=4,voices=1,block=128,mode='bank',capture=false}={}){
 const bank=mode.startsWith('bank'),exports=bank?[new WebAssembly.Instance(modules.bank,{}).exports]:patches.map(()=>new WebAssembly.Instance(modules[mode],{}).exports);
 const secondsFrames=Math.ceil(seconds*rate),e=exports[0];if(bank){e.bank_init();e.bank_vector_mode(mode==='bank'?1:0);}
 for(let s=0;s<patches.length;s++){
  const x=bank?e:exports[s],p=fmPacket(patches[s]);if(bank)x.bank_slot_init(s,rate,0);else x.fm_init(rate);
  for(const v of p.globals)bank?x.bank_param(s,...v):x.fm_param(...v);for(const v of p.operators)bank?x.bank_op(s,...v):x.fm_op(...v);for(const v of p.routes)bank?x.bank_route(s,...v):x.fm_route(...v);for(const v of p.carriers)bank?x.bank_carrier(s,...v):x.fm_carrier(...v);
  for(let j=0;j<voices;j++){const ev=[0,j+1,0,48+s*5+j*4,.55];bank?x.bank_event(s,...ev):x.fm_event(...ev);}
 }
 const pcm=capture?patches.map(()=>new Float32Array(secondsFrames*2)):null,started=performance.now();
 for(let at=0;at<secondsFrames;at+=block){const n=Math.min(block,secondsFrames-at);if(bank)e.bank_render(n);else exports.forEach(x=>x.fm_render(n));
  if(capture)for(let s=0;s<patches.length;s++)for(let c=0;c<2;c++){const x=bank?e:exports[s],v=new Float32Array(x.memory.buffer,bank?x.bank_output(s,c):x.fm_output(c),n);pcm[s].set(v,c*secondsFrames+at);}
 }
 return {ms:performance.now()-started,pcm,vectorFrames:bank?e.bank_stat(0,7):0,memory:exports.reduce((n,x)=>n+x.memory.buffer.byteLength,0)};
}
