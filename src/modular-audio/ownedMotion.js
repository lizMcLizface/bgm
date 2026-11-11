// Owned port of src/nodes/motion.js. Native comparison uses explicit numeric
// tolerances because browser OscillatorNode implementations need not match sin.
export const MOTION_PROFILE='native-motion-v1';
export const MOTION_PARAMETERS=Object.freeze([['tremoloDepth',0,1,0],['tremoloRate',.01,20,4],['autoPanDepth',0,1,0],['autoPanRate',.01,20,.2]]);
export function validateOwnedMotionSpec(raw){
 const c=JSON.parse(JSON.stringify(raw));if(c?.version!==1||c.profile!==MOTION_PROFILE||c.phaseOrigin!=='instance-start'||!Array.isArray(c.parameters)||c.parameters.length!==4)throw Error('Invalid owned Motion configuration');
 const ids=new Set();for(const p of c.parameters){if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||ids.has(p[0]))throw Error('Invalid Motion parameter identity');const d=MOTION_PARAMETERS[p[0]],v=p[1];if(!d||typeof v!=='number'||!Number.isFinite(v)||v<d[1]||v>d[2])throw Error('Invalid Motion parameter value');ids.add(p[0]);}return c;
}
export function ownedMotionSpec(settings={}){return validateOwnedMotionSpec({version:1,profile:MOTION_PROFILE,phaseOrigin:'instance-start',parameters:MOTION_PARAMETERS.map(([name,,,value],index)=>[index,settings[name]??value])});}
export const saveOwnedMotionSpec=c=>JSON.stringify(validateOwnedMotionSpec(c),null,2)+'\n';
export const loadOwnedMotionSpec=text=>validateOwnedMotionSpec(JSON.parse(text));
export class OwnedMotion{
 constructor(engine,spec,rate){if(!Number.isInteger(rate)||rate<8000||rate>192000||engine.motion_owned_api()!==1)throw Error('Owned Motion ABI/rate');this.e=engine;this.rate=rate;this.spec=validateOwnedMotionSpec(spec);this.handle=engine.motion_owned_new(rate);if(!this.handle)throw Error('Motion preparation failed');try{for(const p of this.spec.parameters)this.accept(engine.motion_owned_param(this.handle,...p));this.refresh();}catch(e){this.dispose();throw e;}}
 accept(ok){if(!ok)throw Error('Owned Motion operation rejected');}
 alive(){if(!this.handle)throw Error('Disposed Motion');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=[0,1].map(ch=>new Float32Array(this.memory,this.e.motion_owned_input(this.handle,ch),2048));this.output=[0,1].map(ch=>new Float32Array(this.memory,this.e.motion_owned_output(this.handle,ch),2048));[this.left,this.right]=this.output;}
 render(frames,channels=2){this.alive();if(!Number.isInteger(frames)||frames<0||frames>2048||![1,2].includes(channels))throw Error('Motion block/channel bounds');if(this.memory!==this.e.memory.buffer)throw Error('Motion memory grew; refresh outside render');this.accept(this.e.motion_owned_render(this.handle,frames,channels));}
 patch(parameters){this.alive();if(!Array.isArray(parameters))throw Error('Invalid Motion edit');const merged=new Map(this.spec.parameters),ids=new Set();for(const p of parameters){if(!Array.isArray(p)||p.length!==2||ids.has(p[0]))throw Error('Invalid Motion edit');ids.add(p[0]);merged.set(p[0],p[1]);}const next=validateOwnedMotionSpec({...this.spec,parameters:[...merged]});for(const p of next.parameters)this.accept(this.e.motion_owned_param(this.handle,...p));this.spec=next;}
 value(index){this.alive();if(!Number.isInteger(index)||!MOTION_PARAMETERS[index])throw Error('Invalid Motion parameter');return this.e.motion_owned_value(this.handle,index);}
 reset(){this.alive();this.e.motion_owned_reset(this.handle);}
 stats(){this.alive();return Object.fromEntries(['peak','frame','tremoloPhase','panPhase','latencyFrames'].map((key,index)=>[key,this.e.motion_owned_stat(this.handle,index)]));}
 dispose(){if(this.handle){this.e.motion_owned_free(this.handle);this.handle=0;this.input=this.output=this.left=this.right=this.memory=null;}}
}
