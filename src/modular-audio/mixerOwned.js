import {MIXER_KINDS,validateMixerConfig} from './mixerConfig.js';
const check=code=>{if(code)throw Error(`Owned mixer rejected operation (${code})`);};
export class OwnedMixerUnit {
 constructor(engine,raw,maxBlock=2048){
  this.engine=engine;this.config=validateMixerConfig(raw);this.maxBlock=maxBlock;
  if(engine.mixer_api()!==1||!Number.isInteger(maxBlock)||maxBlock<1||maxBlock>2048)throw Error('Owned mixer ABI/block mismatch');
  this.handle=engine.mixer_new(MIXER_KINDS.indexOf(this.config.kind),this.config.sampleRate,maxBlock);if(!this.handle)throw Error('Owned mixer preparation failed');
  try{this.prepare();this.refresh();}catch(e){this.dispose();throw e;}
 }
 alive(){if(!this.handle)throw Error('Disposed owned mixer');}
 prepare(){this.config.parameters.forEach((v,i)=>check(this.engine.mixer_param(this.handle,i,v,Number(this.config.settled))));for(const e of this.config.events)this.enqueue(e);}
 refresh(){this.alive();this.input=[0,1].map(c=>new Float32Array(this.engine.memory.buffer,this.engine.mixer_input(this.handle,c),this.maxBlock));this.output=[0,1].map(c=>new Float32Array(this.engine.memory.buffer,this.engine.mixer_output(this.handle,c),this.maxBlock));}
 enqueue(e){this.alive();check(this.engine.mixer_event(this.handle,e.frame,e.owner,e.parameter,e.value));}
 set(parameter,value,{settle=false}={}){this.alive();check(this.engine.mixer_param(this.handle,parameter,value,Number(settle)));}
 render(frames){this.alive();if(!Number.isInteger(frames)||frames<0||frames>this.maxBlock)throw Error('Invalid owned mixer block');check(this.engine.mixer_render(this.handle,frames));}
 pause(on){this.alive();if(typeof on!=='boolean')throw Error('Invalid pause');check(this.engine.mixer_pause(this.handle,Number(on)));}
 cancel(owner){this.alive();if(!Number.isInteger(owner)||owner<0||owner>0xffffffff)throw Error('Invalid mixer owner');this.engine.mixer_cancel(this.handle,owner);}
 reset(){this.alive();this.engine.mixer_reset(this.handle);this.prepare();}
 stats(){this.alive();return Object.fromEntries(['frame','applied','late','overflow','queued','peak','latencyFrames','reductionGain'].map((k,i)=>[k,this.engine.mixer_stat(this.handle,i)]));}
 dispose(){if(!this.handle)return;this.engine.mixer_free(this.handle);this.handle=0;}
}
