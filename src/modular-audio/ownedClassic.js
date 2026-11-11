// Instance-owned classic DSP, including private VS/WT upload and mip resources.
export const OWNED_CLASSIC_MODELS=Object.freeze([0,1,2,3,4,5,6,7,8,9,10,11,12,13]);
const waveLength=model=>model===7?16384:model===12?8192:0;
const uint=n=>Number.isInteger(n)&&n>0&&n<=0xffffffff;
const check=n=>{if(n)throw Error(`Owned classic rejected operation (${n})`);};
export function validateClassicConfig(raw){
 const c=JSON.parse(JSON.stringify(raw));if(c?.version!==1||!OWNED_CLASSIC_MODELS.includes(c.model)||!Array.isArray(c.parameters)||c.parameters.length>256||c.parameters.some(p=>!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||p[0]<0||p[0]>215||!Number.isFinite(p[1])))throw Error('Invalid owned classic configuration');
 if(new Set(c.parameters.map(p=>p[0])).size!==c.parameters.length)throw Error('Duplicate owned classic parameter');
 if(c.waves!==undefined&&(!waveLength(c.model)||!Array.isArray(c.waves)||c.waves.length!==waveLength(c.model)||c.waves.some(v=>!Number.isFinite(v)||Math.abs(v)>64)))throw Error('Invalid owned classic wave resource');return c;
}
export const saveClassicConfig=config=>JSON.stringify(validateClassicConfig(config),null,2)+'\n';
export const loadClassicConfig=text=>validateClassicConfig(JSON.parse(text));
export class OwnedClassic {
 constructor(engine,raw,sampleRate=48000){this.engine=engine;this.config=validateClassicConfig(raw);if(engine.classic_owned_api()!==1)throw Error('Owned classic ABI mismatch');this.handle=engine.classic_owned_new(sampleRate,this.config.model);if(!this.handle)throw Error('Unsupported owned classic model or sample rate');try{this.apply();this.refresh();}catch(e){this.dispose();throw e;}}
 alive(){if(!this.handle)throw Error('Disposed owned classic');}
 apply(){for(const [id,value]of this.config.parameters)check(this.engine.classic_owned_param(this.handle,id,value));if(this.config.waves)this.uploadWaves(this.config.waves);}
 refresh(){this.alive();this.left=new Float32Array(this.engine.memory.buffer,this.engine.classic_owned_left(this.handle),2048);this.right=new Float32Array(this.engine.memory.buffer,this.engine.classic_owned_right(this.handle),2048);}
 render(frames){this.alive();if(!Number.isInteger(frames)||frames<0||frames>2048)throw Error('Invalid owned classic block');if(this.left.buffer!==this.engine.memory.buffer)throw Error('Refresh owned classic views after preparing another handle');check(this.engine.classic_owned_render(this.handle,frames));return frames;}
 param(id,value){this.alive();if(!Number.isInteger(id)||id<0||id>215||!Number.isFinite(value))throw Error('Invalid owned classic parameter');check(this.engine.classic_owned_param(this.handle,id,value));const saved=this.config.parameters.find(p=>p[0]===id);if(saved)saved[1]=value;else this.config.parameters.push([id,value]);}
 note(kind,key,a=0,b=0){this.alive();if(!Number.isInteger(kind)||kind<0||kind>4||!Number.isInteger(key)||key<0||key>0xffffffff||![a,b].every(Number.isFinite)||[0,1,3].includes(kind)&&!uint(key))throw Error('Invalid owned classic event');check(this.engine.classic_owned_note(this.handle,kind,key,a,b));}
 seq(cmd,a=0,b=0){this.alive();if(!Number.isInteger(cmd)||cmd<0||cmd>8||!Number.isInteger(a)||a<0||a>0xffffffff||!Number.isFinite(b))throw Error('Invalid owned classic sequence command');check(this.engine.classic_owned_seq(this.handle,cmd,a,b));}
 reset(){this.alive();this.engine.classic_owned_reset(this.handle);this.apply();}
 panic(){this.note(4,0);}
 uploadWaves(samples){this.alive();const len=this.engine.classic_owned_wave_len(this.handle);if(!len||!(Array.isArray(samples)||samples instanceof Float32Array)||samples.length!==len||Array.from(samples).some(v=>!Number.isFinite(v)||Math.abs(v)>64))throw Error('Invalid owned classic wave resource');new Float32Array(this.engine.memory.buffer,this.engine.classic_owned_wave_ptr(this.handle),len).set(samples);check(this.engine.classic_owned_wave_commit(this.handle));this.config.waves=Array.from(samples);}
 waveData(){this.alive();const len=this.engine.classic_owned_wave_len(this.handle);if(!len)throw Error('Classic model has no wave resource');return new Float32Array(this.engine.memory.buffer,this.engine.classic_owned_wave_ptr(this.handle),len).slice();}
 joyTrace(){this.alive();const voices=this.engine.classic_owned_joy_info(this.handle,0),width=this.engine.classic_owned_joy_info(this.handle,1);if(!voices||!width)throw Error('Classic model has no joystick trace');return {voices,width,samples:new Float32Array(this.engine.memory.buffer,this.engine.classic_owned_joy_ptr(this.handle),voices*width).slice()};}
 stats(){this.alive();return Object.fromEntries(['active','steals','peak','seconds','frame'].map((k,i)=>[k,this.engine.classic_owned_stat(this.handle,i)]));}
 dispose(){if(this.handle){this.engine.classic_owned_free(this.handle);this.handle=0;this.left=this.right=null;}}
}
