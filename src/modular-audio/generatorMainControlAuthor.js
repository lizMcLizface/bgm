import {planGeneratorMainMix,planGeneratorMainTone} from './generatorMainControlPlan.js';
import {MAIN_ROLE_IDS,planMainRoleDuck,planMainRoleDuckReset} from './mainRoleControlRecipes.js';
const PROFILE='main-six-role-raw-frequency-constructor-group-v1';
const refusal=message=>Object.assign(Error(message),{code:'GENERATOR_MAIN_CONTROL_REFUSED'});
/** One explicit author for a from-birth Rust Main root. Reservations precede
 * every parent mutation. Partial publication is terminal; it never restores
 * old parent state or writes a Native AudioParam as fallback. */
export function createGeneratorMainControlAuthor(generator,group,{onError=()=>{}}={}){
 if(!generator||group?.context!==generator.AC||group?.profile!==PROFILE||typeof onError!=='function'||['reserve','commit','cancel','status'].some(key=>typeof group[key]!=='function'))throw refusal('Explicit same-context raw-frequency Main group required');
 const roles=generator.roles,settings=generator.settings,ducks=new Map(MAIN_ROLE_IDS.map(role=>[role,-Infinity]));let error=null,busy=false;
 const fail=issue=>{error??=issue instanceof Error?issue:Error(String(issue));try{onError(error);}catch(callbackError){error.callbackError=callbackError;}return error;};
 function check(){if(error)throw error;if(busy)throw refusal('Main author is already publishing');if(generator.roles!==roles||generator.settings!==settings)throw refusal('Main parent identity changed');const state=group.status();if(state.state!=='active'||state.error||state.quarantined||state.quotaReleased)throw refusal('Main group is not active');for(const role of MAIN_ROLE_IDS){const r=roles[role];if(!r||r.roomRoute||r.instrument?.reverb?.setLevel)throw refusal('Separate room-return controls need explicit ownership');}return state;}
 function publish(rows,commitParent,options){check();const token=group.reserve(rows);busy=true;try{const receipt=group.commit(token,options);commitParent();return receipt;}catch(issue){throw fail(issue);}finally{busy=false;}}
 function mix(overrides={},commitSettings=()=>{}){check();const plan=planGeneratorMainMix(generator,{roleOverrides:overrides});return publish(plan.rows,()=>{commitSettings();for(const state of plan.states){const r=roles[state.role];r.volume=state.volume;r.mute=state.mute;r.solo=state.solo;if(state.clearPlayedLive)r.playedLive=false;else if(Object.hasOwn(overrides[state.role]??{},'playedLive'))r.playedLive=state.playedLive;}});}
 function duckPlan(entries){if(!Array.isArray(entries)||entries.length>32)throw refusal('Bounded duck requests required');const next=new Map(ducks),byRole=new Map();for(const entry of entries){if(!entry||!MAIN_ROLE_IDS.includes(entry.role)||entry.role==='perc'||Object.keys(entry).some(key=>!['role','start','end','floor','reset'].includes(key)))throw refusal('Exact pitched-role duck request required');const planned=entry.reset===true?planMainRoleDuckReset(entry.start):planMainRoleDuck(next.get(entry.role),{start:entry.start,end:entry.end,floor:entry.floor});next.set(entry.role,planned.releaseAt);if(planned.commands.length){const commands=byRole.get(entry.role)??[];commands.push(...planned.commands);byRole.set(entry.role,commands);}}return{next,rows:[...byRole].map(([role,commands])=>({role,commands}))};}
 return Object.freeze({profile:PROFILE,group,
  check,
  applyMix(){return mix();},
  setRoleVolume(role,volume){if(!MAIN_ROLE_IDS.includes(role))throw refusal('Unknown role');return mix({[role]:{volume}},()=>{settings.volumes={...settings.volumes,[role]:volume};});},
  setRoleMix(role,{mute,solo}={}){if(!MAIN_ROLE_IDS.includes(role))throw refusal('Unknown role');const patch={...(mute===undefined?{}:{mute}),...(solo===undefined?{}:{solo})};return mix({[role]:patch},()=>{if(mute!==undefined)settings.muted={...settings.muted,[role]:mute};});},
  applySettingsMix(patch,defaults){check();if(!patch||Object.keys(patch).some(k=>!['volumes','muted'].includes(k))||!Object.keys(patch).length)throw refusal('Explicit mix-only settings patch required');const waves=[];let view=generator;
   for(const key of ['volumes','muted'])if(Object.hasOwn(patch,key)){if(!patch[key]||typeof patch[key]!=='object'||Array.isArray(patch[key]))throw refusal('Typed role settings required');const overrides=Object.fromEntries(MAIN_ROLE_IDS.map(role=>[role,key==='volumes'?{volume:patch.volumes[role]??defaults?.[role]}:{mute:Boolean(patch.muted[role])}])),plan=planGeneratorMainMix(view,{roleOverrides:overrides});waves.push(plan);view={roles:Object.fromEntries(plan.states.map(state=>[state.role,state]))};}
   const commands=new Map(),order=[];for(const wave of waves)for(const row of wave.rows){const list=commands.get(row.role)??[];for(const command of row.commands){order.push({role:row.role,index:list.length});list.push(command);}commands.set(row.role,list);}const rows=[...commands].map(([role,commands])=>({role,commands})),final=waves.at(-1);
   return publish(rows,()=>{Object.assign(settings,patch);for(const state of final.states){const r=roles[state.role];r.volume=state.volume;r.mute=state.mute;r.solo=state.solo;if(Object.hasOwn(r,'playedLive')||state.playedLive!==undefined)r.playedLive=state.playedLive;}},{order});
  },
  applyVolumes(defaults){const patch=Object.fromEntries(MAIN_ROLE_IDS.map(role=>[role,{volume:settings.volumes?.[role]??defaults?.[role]}]));return mix(patch);},
  applyMutes(){return mix(Object.fromEntries(MAIN_ROLE_IDS.map(role=>[role,{mute:Boolean(settings.muted?.[role])}])));},
  applyTone(tone,seconds,barSeconds){const plan=planGeneratorMainTone(generator,tone,seconds,barSeconds,{profile:PROFILE});if(plan.noop)return{noop:true};return publish(plan.rows,()=>{generator.toneNow=plan.nextTone;});},
  /** The caller supplies its already computed duck events and only mutates
   * booking/visual/source state after the complete batch was admitted. */
  bookDucks(entries,commitBooking){check();if(typeof commitBooking!=='function')throw refusal('Explicit booking continuation required');const plan=duckPlan(entries);if(!plan.rows.length){commitBooking();return{commands:0};}return publish(plan.rows,()=>{for(const[role,value]of plan.next)ducks.set(role,value);commitBooking();});},
  status(){return{profile:PROFILE,error:error?String(error):null,busy,releaseAt:Object.fromEntries(ducks)};}
 });
}
