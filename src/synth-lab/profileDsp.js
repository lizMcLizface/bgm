// Direct-kernel attribution harness. No AudioContext, graph, UI or audio output.
import {stressPlan} from './stressPlan';
import {parameterTriples,RECIPES,clonePatch} from './patch';
import {fmPacket,FM_RECIPES,cloneFM} from './fmPatch';
import {effectTriples,defaultEffects} from './effectsConfig';
import {insertsPacket,defaultInserts,sanitizeInserts} from './insertsConfig';

const colour=(p,mode)=>Object.assign(p,{breath:mode==='air'||mode==='all'?.15:0,bow:mode==='air'||mode==='all'?.2:0,formant:mode==='vowel'||mode==='all'?.4:0,body:mode==='body'||mode==='all'?.35:0,bodyType:1,bodyDecay:.3,noisePressure:.5});
const item=(id,kernel,changes={},description=id)=>({id,kernel,changes,description});
export const DSP_CASES=[
 item('fm-base','fm'),item('fm-idle','fm',{voices:0}),item('fm-8','fm',{voices:8}),item('fm-32','fm',{voices:32}),
 item('fm-1','fm',{voices:1}),item('fm-2','fm',{voices:2}),item('fm-3','fm',{voices:3}),
 item('fm-tines-solo','fm',{recipe:0,voices:1}),item('fm-tines-duet','fm',{recipe:0,voices:2}),item('fm-choir-solo','fm',{recipe:9,voices:1}),
 item('fm-4op','fm',{operators:4}),item('fm-1x','fm',{quality:0}),item('fm-4x','fm',{quality:2}),
 item('fm-air','fm',{colour:'air'}),item('fm-vowel','fm',{colour:'vowel'}),item('fm-body','fm',{colour:'body'}),item('fm-colour','fm',{colour:'all'}),
 item('fm-expression','fm',{expression:true}),item('fm-long-linear','fm',{curves:1}),item('fm-long-curved','fm',{curves:2}),item('fm-block2048','fm',{block:2048}),
 item('fm-long-fractional','fm',{curves:1.3}),
 item('core-base','core'),item('core-idle','core',{voices:0}),item('core-8','core',{voices:8}),item('core-32','core',{voices:32}),
 item('core-unison2','core',{unison:2}),item('core-unison4','core',{unison:4}),item('core-layer2','core',{layers:2}),item('core-lanes8','core',{layers:2,unison:4}),
 item('core-ladder','core',{ladder:true}),item('core-dco','core',{dco:true}),
 item('core-air','core',{colour:'air'}),item('core-vowel','core',{colour:'vowel'}),item('core-body','core',{colour:'body'}),item('core-colour','core',{colour:'all'}),
 item('core-expression','core',{expression:true}),item('core-block2048','core',{block:2048}),
 item('core-organ-wave','core',{wave:5}),item('core-hollow-wave','core',{wave:6}),item('core-reed-wave','core',{wave:9}),
 ...[['fm-tines','fm',0],['fm-glass','fm',4],['fm-drawbars','fm',5],['fm-choir','fm',9],['core-brass','core',0],['core-silk','core',1],['core-noir','core',2],['core-chorus','core',3],['core-sync','core',6],['core-poly','core',7],['core-living','core',8],['core-rosin','core',9]].map(([id,kernel,recipe])=>item(id,kernel,{recipe,voices:8})),
 item('fm-choir-dry-colour','fm',{recipe:9,voices:8,colourOff:true}),item('core-rosin-dry-colour','core',{recipe:9,voices:8,colourOff:true}),
 item('fm-tines-release','fm',{recipe:0,voices:8,releaseAt:.4}),item('fm-choir-release','fm',{recipe:9,voices:8,releaseAt:.4}),
 item('room16','effects'),item('room8','effects',{quality:0}),item('room20','effects',{decay:20}),item('room-bypass','effects',{bypass:1}),
 item('insert-bypass','inserts',{bypass:1}),item('insert-saturation','inserts',{saturation:.15,drive:7}),
 item('insert-eq','inserts',{lowGain:1,midGain:-1,highGain:-1}),item('insert-phaser','inserts',{phaser:.25}),
 item('insert-flanger','inserts',{flanger:.2}),item('insert-chorus','inserts',{chorus:.25}),
 item('insert-all','inserts',{saturation:.15,drive:7,lowGain:1,midGain:-1,highGain:-1,phaser:.25,flanger:.2,chorus:.25,gain:-2}),
];
export function dspFixture(spec,{rate=48000,seconds=6}={}){
 const c=spec.changes,block=c.block??128,voices=c.voices??16;
 if(spec.kernel==='fm'||spec.kernel==='core'){
  const family=spec.kernel==='fm'?'fm':'subtractive',part=stressPlan({family,instruments:1,voices:voices||16,inserts:'off',routing:'dry',operators:c.operators??6,quality:c.quality??1,expression:c.expression??false}).parts[0],p=part.patch;
  p.global.polyphony=Math.max(1,voices);if(spec.kernel==='fm'){
   if(c.colour)colour(p.global,c.colour);
   if(c.curves)for(const o of p.operators)Object.assign(o,{attack:4,decay1:8,decay2:8,attackCurve:c.curves,decayCurve:c.curves});
  }else{
   p.global.chorus=0;p.global.unison=c.unison??1;p.global.model=c.layers===2?2:c.ladder?0:c.dco?3:1;
   p.layers[1]=structuredClone(p.layers[0]);
   for(const l of p.layers){if(c.colour)colour(l,c.colour);if(c.ladder){l.filterFamily=1;l.filter=1;}if(c.wave!==undefined){l.waveA=c.wave;l.waveB=c.wave;}}
  }
  const patch=c.recipe===undefined?p:spec.kernel==='fm'?cloneFM(FM_RECIPES[c.recipe]):clonePatch(RECIPES[c.recipe]);patch.global.polyphony=Math.max(1,voices);
  if(c.colourOff)for(const layer of spec.kernel==='fm'?[patch.global]:patch.layers)for(const key of ['breath','bow','formant','body'])layer[key]=0;
  return {id:spec.id,kernel:spec.kernel,rate,seconds,block,voices,patch,notes:Array.from({length:voices},(_,i)=>({id:i+1,midi:[48,55,60,64,67,72,76,79][i%8]+(Math.floor(i/8)%2)*12,velocity:.58,...(c.releaseAt===undefined?{}:{duration:c.releaseAt})})),expectedActive:c.releaseAt===undefined?voices:null,description:spec.description};
 }
 return {id:spec.id,kernel:spec.kernel,rate,seconds,block,voices:0,settings:spec.kernel==='effects'?{...defaultEffects(),dry:0,reverb:.25,delay:0,quality:1,decay:8,...c}:sanitizeInserts({...defaultInserts(),...c}),description:spec.description};
}
export function prepareDsp(module,fixture){
 const f=fixture,e=new WebAssembly.Instance(module,{}).exports,k=f.kernel,core=k==='core',fm=k==='fm',source=core||fm;
 let render,stat,left,right,inputs=[];
 if(core){e.engine_init(f.rate);for(const p of parameterTriples(f.patch))e.engine_param(...p);for(const n of f.notes){e.engine_event(0,n.id,0,n.midi,n.velocity);if(n.duration!==undefined)e.engine_event(1,n.id,Math.round(n.duration*f.rate),0,0);}render=e.engine_render;stat=()=>[e.engine_stat(0),e.engine_stat(1),e.engine_stat(2),e.engine_stat(3)];left=e.engine_left();right=e.engine_right();}
 else if(fm){e.fm_init(f.rate);const p=fmPacket(f.patch);for(const v of p.globals)e.fm_param(...v);for(const v of p.operators)e.fm_op(...v);for(const v of p.routes)e.fm_route(...v);for(const v of p.carriers)e.fm_carrier(...v);for(const n of f.notes){e.fm_event(0,n.id,0,n.midi,n.velocity);if(n.duration!==undefined)e.fm_event(1,n.id,Math.round(n.duration*f.rate),0,0);}render=e.fm_render;stat=()=>[e.fm_stat(0),e.fm_stat(1),e.fm_stat(2),e.fm_stat(3)];left=e.fm_output(0);right=e.fm_output(1);}
 else{
  const insert=k==='inserts',prefix=insert?'inserts':'fx';e[prefix+'_init'](f.rate);for(const p of insert?insertsPacket(f.settings):effectTriples(f.settings))e[prefix+'_param'](...p);if(insert)e.inserts_settle();render=e[prefix+'_render'];left=e[prefix+'_output'](0);right=e[prefix+'_output'](1);
  // Same continuous deterministic input at either block size. Input copies are
  // included in effect timings and the bypass reference, unlike source timings.
  inputs=Array.from({length:insert?2:6},(_,ch)=>({target:new Float32Array(e.memory.buffer,e[prefix+'_input'](ch),2048),data:Float32Array.from({length:Math.ceil(f.rate*f.seconds)},(_,i)=>.05*Math.sin(2*Math.PI*(ch%2?331:223)*i/f.rate)+.01*Math.sin(2*Math.PI*977*i/f.rate))}));
 }
 const output=[new Float32Array(e.memory.buffer,left,2048),new Float32Array(e.memory.buffer,right,2048)],frames=Math.ceil(f.rate*f.seconds);
 return {fixture:f,render,output,memory:e.memory.buffer.byteLength,stat,simdFrames:()=>e.engine_simd_frames?.()??e.fm_simd_frames?.()??0,run({capture=false}={}){
  const pcm=capture?[new Float32Array(frames),new Float32Array(frames)]:null,start=performance.now();
  for(let at=0;at<frames;at+=f.block){const count=Math.min(f.block,frames-at);if(!source)for(const input of inputs)input.target.set(input.data.subarray(at,at+count));render(count);if(pcm)for(let ch=0;ch<2;ch++)pcm[ch].set(output[ch].subarray(0,count),at);}
  const ms=performance.now()-start;return {ms,seconds:f.seconds,checksum:output[0][0]+output[1][0],stats:stat?.()??null,memoryBytes:e.memory.buffer.byteLength,pcm};
 }};
}
export function compareDsp(a,b){let difference=0,nonFinite=0,peak=0,energy=0;for(let ch=0;ch<2;ch++)for(let i=0;i<a[ch].length;i++){const x=a[ch][i],y=b[ch][i];if(!Number.isFinite(x)||!Number.isFinite(y))nonFinite++;else{difference=Math.max(difference,Math.abs(x-y));peak=Math.max(peak,Math.abs(x));energy+=x*x;}}return {maxDifference:difference,nonFinite,peak,rms:Math.sqrt(energy/(a[0].length*2))};}
