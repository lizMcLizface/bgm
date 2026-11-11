// The actual streaming rain/thunder/surf source, before Ambience's separate
// native level/pan/width/distance/shelter chains. Three stereo stems stay separate.
import {weatherEnvironment} from '../app/engine/weatherBedModel.js';
import {defaultShape} from '../app/engine/ambienceSynth.js';
export const WEATHER_ENV_KEYS=Object.freeze(['rainIntensity','windChaos','indoorFilter','correlation','impactTexture','thunderActivity','thunderDistance','thunderPower','thunderDecay','surfLevel','waveSize','wavePace','waveFoam']);
export const WEATHER_SURFACES=Object.freeze(['mixed','leaves','concrete','glass','tin','puddle']);
export const WEATHER_STEMS=Object.freeze(['rain','thunder','waves']);
const range=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const uint=v=>Number.isInteger(v)&&v>=1&&v<=0xffffffff;
const frame=v=>Number.isSafeInteger(v)&&v>=0;
const att=(db,s)=>10**(-db*s/20);
export function weatherBedState(shape={},levels={}){
 const p=Object.fromEntries(WEATHER_STEMS.map(id=>[id,{...defaultShape(id),...shape[id]}]));
 for(const id of WEATHER_STEMS){for(const [key,v]of Object.entries(p[id]))if(key==='surface'?!WEATHER_SURFACES.includes(v):!range(v,key==='pan'?-1:0,1))throw Error('Invalid weather shape');if(levels[id]!==undefined&&!range(levels[id],0,1))throw Error('Invalid weather level');}
 const {rain:r,thunder:t,waves:w}=p,environment=weatherEnvironment(p,levels),targets=[att(3,r.shelter),...[0,1,2,3].map(()=>att(9,r.shelter)),Math.min(2.5,r.drops/.4)*att(24,r.shelter),t.crack*att(15,t.shelter),t.roll*att(3,t.shelter),t.echo*att(6,t.shelter),w.surge*att(9,w.shelter),w.break*att(9,w.shelter),w.wash*att(9,w.shelter)];
 // indoorFilter exists in the original rain contract but is not used by its DSP.
 environment.indoorFilter=0;return {environment,targets};
}
export function weatherStateEvents(frame,state,owner=1){const values=[...WEATHER_ENV_KEYS.map(k=>state.environment[k]),WEATHER_SURFACES.indexOf(state.environment.surfaceType),...state.targets];return values.map((value,id)=>({frame,owner,kind:'parameter',id,value}));}
export function weatherBedSpec(sampleRate,shape={},levels={},seed=1,events=[]){if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Weather requires an explicit uint32 seed');return validateWeatherBedSpec({version:1,sampleRate,seed,...weatherBedState(shape,levels),events:structuredClone(events)});}
export function validateWeatherEvent(e){if(!e||!frame(e.frame)||!uint(e.owner)||!['parameter','thunder','surf'].includes(e.kind))throw Error('Invalid weather event');if(e.kind==='parameter'){if(!Number.isInteger(e.id)||e.id<0||e.id>25||!range(e.value,0,e.id<=12?1:e.id===13?5:2.5)||(e.id===13&&!Number.isInteger(e.value)))throw Error('Invalid weather parameter');}else if((e.id??0)!==0||(e.value??0)!==0)throw Error('Invalid weather trigger');return e;}
export function validateWeatherBedSpec(p){if(p?.version!==1||!range(p.sampleRate,8000,192000)||!Number.isInteger(p.seed)||p.seed<0||p.seed>0xffffffff||!p.environment||!WEATHER_ENV_KEYS.every(k=>range(p.environment[k],0,1))||!WEATHER_SURFACES.includes(p.environment.surfaceType)||!Array.isArray(p.targets)||p.targets.length!==12||!p.targets.every(v=>range(v,0,2.5))||!Array.isArray(p.events)||p.events.length>4000)throw Error('Invalid owned weather configuration');p.events.forEach(validateWeatherEvent);return p;}
export const saveWeatherBedSpec=p=>JSON.stringify(validateWeatherBedSpec(p),null,2)+'\n';
export const loadWeatherBedSpec=s=>validateWeatherBedSpec(JSON.parse(s));
const kind=e=>e.kind==='parameter'?0:e.kind==='thunder'?1:2;
export class OwnedWeatherBed{
 constructor(engine,spec){this.engine=engine;this.spec=loadWeatherBedSpec(saveWeatherBedSpec(spec));if(engine.weather_owned_api()!==1)throw Error('Owned weather ABI mismatch');const p=this.spec;this.handle=engine.weather_owned_new(p.sampleRate,p.seed);if(!this.handle)throw Error('Weather creation failed');try{const values=[...WEATHER_ENV_KEYS.map(k=>p.environment[k]),WEATHER_SURFACES.indexOf(p.environment.surfaceType),...p.targets];values.forEach((v,i)=>{if(!engine.weather_owned_initial(this.handle,i,v))throw Error('Weather configuration failed');});if(!engine.weather_owned_prepare(this.handle))throw Error('Weather preparation failed');this.bookInitial();this.refresh();}catch(error){this.dispose();throw error;}}
 alive(){if(!this.handle)throw Error('Disposed weather source');}
 refresh(){this.alive();this.memory=this.engine.memory.buffer;this.layers=Array.from({length:12},(_,l)=>[0,1].map(c=>new Float32Array(this.memory,this.engine.weather_owned_output(this.handle,l*2+c),2048)));this.stems=Array.from({length:3},(_,l)=>[0,1].map(c=>new Float32Array(this.memory,this.engine.weather_owned_output(this.handle,24+l*2+c),2048)));}
 bookInitial(){for(const e of this.spec.events)if(!this.engine.weather_owned_enqueue(this.handle,e.frame,e.owner,kind(e),e.id??0,e.value??0))throw Error('Weather event preparation failed');}
 render(n){this.alive();if(!Number.isInteger(n)||n<0||n>2048)throw Error('Invalid weather render bounds');if(this.memory!==this.engine.memory.buffer)throw Error('Weather memory grew; refresh outside render');if(!this.engine.weather_owned_render(this.handle,n))throw Error('Weather render failed');}
 enqueue(e){this.alive();validateWeatherEvent(e);if(!this.engine.weather_owned_enqueue(this.handle,e.frame,e.owner,kind(e),e.id??0,e.value??0))throw Error('Weather event rejected');}
 setState(at,shape,levels,owner=1){this.alive();const events=weatherStateEvents(at,weatherBedState(shape,levels),owner);events.forEach(validateWeatherEvent);if(at<this.frame||this.engine.weather_owned_stat(this.handle,13)+events.length>4000)throw Error('Weather state batch rejected');for(const e of events)this.enqueue(e);}
 cancel(owner){this.alive();if(!uint(owner))throw Error('Invalid weather owner');this.engine.weather_owned_cancel(this.handle,owner);}
 reset(){this.alive();if(!this.engine.weather_owned_reset(this.handle))throw Error('Weather reset failed');this.bookInitial();}
 get frame(){this.alive();return this.engine.weather_owned_stat(this.handle,0);}
 stats(){this.alive();const s=i=>this.engine.weather_owned_stat(this.handle,i);return {frame:s(0),rain:{events:s(1),active:s(2),dropped:s(3),rate:s(14),heave:s(15)},thunder:{events:s(4),active:s(5),skipped:s(6)},surf:{events:s(7),active:s(8),skipped:s(9)},applied:s(10),late:s(11),overflow:s(12),queued:s(13)};}
 dispose(){if(this.handle){this.engine.weather_owned_free(this.handle);this.handle=0;this.layers=this.stems=this.memory=null;}}
}
let code;
export async function loadOwnedWeatherBed(){code??=(async()=>{const base=`${import.meta.env.BASE_URL}weather/`,get=async file=>{const r=await fetch(base+file);if(!r.ok)throw Error('Missing weather asset');return r;},manifest=await(await get('build.json')).json(),bytes=await(await get(`weather.wasm?v=${manifest.version}`)).arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==manifest.wasm)throw Error('Stale weather Wasm');return {module:await WebAssembly.compile(bytes),version:manifest.version};})().catch(e=>{code=null;throw e;});const{module,version}=await code,engine=new WebAssembly.Instance(module,{}).exports;return{engine,version,prepare:spec=>new OwnedWeatherBed(engine,spec)};}
