const ROLES=Object.freeze(['lead','counter','pad','bass','rhythm','perc']),TONE_ROLES=Object.freeze(['pad','lead','counter','rhythm']);
const finite=value=>typeof value==='number'&&Number.isFinite(value),refuse=message=>Object.assign(Error(message),{code:'GENERATOR_MAIN_CONTROL_REFUSED'}),freezeRows=rows=>Object.freeze(rows.map(row=>Object.freeze({...row,commands:Object.freeze(row.commands.map(Object.freeze))})));
/** Pure authoring plans for a future explicitly bound Main group. These never
 * read an AudioParam getter or mutate Generator/settings before admission. */
export function planGeneratorMainMix(generator,{roleOverrides={}}={}){
 const current=generator?.roles,order=current&&Object.keys(current);if(!order||order.length!==6||ROLES.some(role=>!Object.hasOwn(current,role))||!roleOverrides||Object.keys(roleOverrides).some(role=>!ROLES.includes(role)))throw refuse('Six current role states and exact overrides required');
 const views=order.map(role=>{const r=current[role],patch=roleOverrides[role]??{};if(!r||!patch||Object.keys(patch).some(key=>!['volume','mute','solo','playedLive'].includes(key)))throw refuse('Unsupported role mix state');const next={volume:r.volume,mute:r.mute,solo:r.solo,playedLive:r.playedLive,...patch};if(!finite(next.volume)||next.volume<0||next.volume>4||typeof next.mute!=='boolean'||typeof next.solo!=='boolean'||next.playedLive!==undefined&&typeof next.playedLive!=='boolean')throw refuse('Bounded typed mix state required');return{role,...next};}),anySolo=views.some(r=>r.solo),states=views.map(r=>{const audible=anySolo?r.solo:!r.mute,playedLive=audible?false:r.playedLive;return Object.freeze({...r,audible,playedLive,clearPlayedLive:audible,target:audible||playedLive?r.volume:0});});
 return Object.freeze({kind:'generator-main-mix-plan-v1',rows:freezeRows(states.map(r=>({role:r.role,commands:[{lane:1,op:'target',seconds:'now',value:r.target,tau:.02}]}))),states:Object.freeze(states),anySolo});
}
export function planGeneratorMainTone(generator,tone,seconds,barSeconds,{profile='nominal'}={}){
 if(!['nominal','main-six-role-raw-frequency-constructor-group-v1'].includes(profile))throw refuse('Explicit Main tone profile required');
 if(!generator||typeof generator!=='object')throw refuse('Current Generator tone state required');
 if(tone===generator?.toneNow)return Object.freeze({kind:'generator-main-tone-plan-v1',noop:true,rows:Object.freeze([]),nextTone:tone});
 const rate=generator?.AC?.sampleRate;if(!Number.isInteger(rate)||rate<8000||rate>192000||!finite(tone)||tone<0||tone>20000||profile==='nominal'&&tone>rate/2||!finite(seconds)||seconds<0||!finite(barSeconds)||barSeconds<=0||barSeconds/3>3600||TONE_ROLES.some(role=>!generator.roles?.[role]))throw refuse('Tone request is outside the explicit in-range authoring profile');
 const glide=generator.toneNow!==null,tau=glide?barSeconds/3:0;
 return Object.freeze({kind:'generator-main-tone-plan-v1',noop:false,nextTone:tone,glide,rows:freezeRows(TONE_ROLES.map(role=>({role,commands:[{lane:0,op:'cancel',seconds,value:0,tau:0},{lane:0,op:glide?'target':'set',seconds,value:tone,tau}]})))});
}