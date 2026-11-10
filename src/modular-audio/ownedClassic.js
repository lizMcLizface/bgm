// Instance-owned classic DSP. Wave-table backends remain explicit exclusions.
export const OWNED_CLASSIC_MODELS=Object.freeze([0,1,2,3,4,5,6,8,9,10,11,13]);
const uint=n=>Number.isInteger(n)&&n>0&&n<=0xffffffff;
const check=n=>{if(n)throw Error(`Owned classic rejected operation (${n})`);};
export function validateClassicConfig(raw){
 const c=JSON.parse(JSON.stringify(raw));if(c?.version!==1||!OWNED_CLASSIC_MODELS.includes(c.model)||!Array.isArray(c.parameters)||c.parameters.length>256||c.parameters.some(p=>!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||p[0]<0||p[0]>215||!Number.isFinite(p[1])))throw Error('Invalid owned classic configuration');
 if(new Set(c.parameters.map(p=>p[0])).size!==c.parameters.length)throw Error('Duplicate owned classic parameter');return c;
}
export const saveClassicConfig=config=>JSON.stringify(validateClassicConfig(config),null,2)+'\n';
export const loadClassicConfig=text=>validateClassicConfig(JSON.parse(text));
export class OwnedClassic {
 constructor(engine,raw,sampleRate=48000){this.engine=engine;this.config=validateClassicConfig(raw);if(engine.classic_owned_api()!==1)throw Error('Owned classic ABI mismatch');this.handle=engine.classic_owned_new(sampleRate,this.config.model);if(!this.handle)throw Error('Unsupported owned classic model or sample rate');try{this.apply();this.refresh();}catch(e){this.dispose();throw e;}}
 alive(){if(!this.handle)throw Error('Disposed owned classic');}
 apply(){for(const [id,value]of this.config.parameters)check(this.engine.classic_owned_param(this.handle,id,value));}
 refresh(){this.alive();this.left=new Float32Array(this.engine.memory.buffer,this.engine.classic_owned_left(this.handle),2048);this.right=new Float32Array(this.engine.memory.buffer,this.engine.classic_owned_right(this.handle),2048);}
 render(frames){this.alive();if(!Number.isInteger(frames)||frames<0||frames>2048)throw Error('Invalid owned classic block');if(this.left.buffer!==this.engine.memory.buffer)throw Error('Refresh owned classic views after preparing another handle');check(this.engine.classic_owned_render(this.handle,frames));return frames;}
 param(id,value){this.alive();if(!Number.isInteger(id)||id<0||id>215||!Number.isFinite(value))throw Error('Invalid owned classic parameter');check(this.engine.classic_owned_param(this.handle,id,value));const saved=this.config.parameters.find(p=>p[0]===id);if(saved)saved[1]=value;else this.config.parameters.push([id,value]);}
 note(kind,key,a=0,b=0){this.alive();if(!Number.isInteger(kind)||kind<0||kind>4||!Number.isInteger(key)||key<0||key>0xffffffff||![a,b].every(Number.isFinite)||[0,1,3].includes(kind)&&!uint(key))throw Error('Invalid owned classic event');check(this.engine.classic_owned_note(this.handle,kind,key,a,b));}
 seq(cmd,a=0,b=0){this.alive();if(!Number.isInteger(cmd)||cmd<0||cmd>7||!Number.isInteger(a)||a<0||a>0xffffffff||!Number.isFinite(b))throw Error('Invalid owned classic sequence command');check(this.engine.classic_owned_seq(this.handle,cmd,a,b));}
 reset(){this.alive();this.engine.classic_owned_reset(this.handle);this.apply();}
 panic(){this.note(4,0);}
 stats(){this.alive();return Object.fromEntries(['active','steals','peak','seconds','frame'].map((k,i)=>[k,this.engine.classic_owned_stat(this.handle,i)]));}
 dispose(){if(this.handle){this.engine.classic_owned_free(this.handle);this.handle=0;this.left=this.right=null;}}
}
