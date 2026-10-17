import {SCENES,sceneSlug,sceneSettings} from '../src/app/scenes';
import {stringPatch} from '../src/app/engine/stringPatches';
import {findPreset} from '../src/app/editor/presetStore';
import {prepareSound} from '../src/app/engine/prepareSound';
import {soundContext} from '../src/app/soundGenV3';
import {prepareComparison} from './phase4Review';
import {renderEnsemble,matchAverageLevels,drawNotes} from './ensembleReview';
import {comparisonPlayheads} from './comparisonPlayhead';
import {auditCase} from './audioAudit';
import {renderAuditCase} from './phase4Audio';
export const STRING_PATCHES=['Nylon Guitar','Soft Harp','Harp Pluck','Kalimba Pluck','Upright Pluck'];
const labels={earlier:'Earlier single body resonance',current:'Instrument body modes'},written=plan=>plan.bars.map(b=>b.events.map(({expression,...e})=>e));
export async function stringOptions(options){
 const [base]=await prepareComparison({...options,part:options.role,fixture:'music',sound:'library',slides:false});
 const unit=base.plan.bars[0].seconds/base.plan.bars[0].units,seconds=base.plan.bars[0].seconds;
 let testNotes=base.options.testNotes;
 if(options.fixture!=='music'){
  testNotes=base.plan.bars.map(()=>({label:options.fixture,events:[]}));
  for(const n of auditCase(options.fixture,options.role).notes){const bar=Math.floor(n.time/seconds);if(testNotes[bar])testNotes[bar].events.push({role:options.role,midi:n.midi,beat:(n.time-bar*seconds)/unit,length:n.duration/unit,velocity:n.velocity,detune:0});}
 }
 let raw=stringPatch(options.patch,{...findPreset(options.patch)},'latest',{resonance:false}),current=stringPatch(options.patch,{...findPreset(options.patch)}),name=options.patch;
 if(options.source==='generated'){
  const scene=SCENES.find(s=>sceneSlug(s.name)===options.preset),settings=sceneSettings(scene,options.seed);
  const info={version:3,role:options.role,ensemble:options.soundSeed??42,...soundContext(settings,scene,options.role),profile:'folk',kind:options.role==='pad'?'keys':'pluck'};
  const [before,after]=await Promise.all([prepareSound(info,'latest',{stringResonance:false}),prepareSound(info)]);raw=before.preset;current={...after.preset,masterVolume:raw.masterVolume};name=after.name;
 }
 if(options.body&&options.body!=='preset')current={...current,stringBodyType:options.body};
 return ['earlier','current'].map(mode=>({mode,name,body:current.stringBodyType,options:{...base.options,testNotes,parts:[options.role],noteExpression:true,heldExpression:true,noteConnection:true,sounds:{...base.options.sounds,[options.role]:{name,preset:mode==='earlier'?raw:current}}}}));
}
export async function renderStrings(options,onProgress=()=>{}){
 const variants=await stringOptions(options),results=[];for(const v of variants)results.push({...await renderEnsemble(v.options,n=>onProgress(v.mode,n)),mode:v.mode,name:v.name,body:v.body});
 if(JSON.stringify(written(results[0]))!==JSON.stringify(written(results[1])))throw Error('Written notes differ.');return matchAverageLevels(results,options.match!==false);
}
export async function auditStrings(options,onProgress=()=>{}){
 const variants=await stringOptions(options),rows=[];for(const v of variants)for(const id of ['short','held','low','high','chord','dense','steal','cancel','resume']){
  onProgress(v.mode,id);const row=await renderAuditCase({sound:v.options.sounds[options.role],role:options.role,id,mode:'current',bpm:90,volume:.6});rows.push({...row,version:v.mode});
 }return {rows,findings:rows.filter(r=>r.warnings.length).length};
}
if(import.meta.env.DEV)window.__stringsReview={stringOptions,renderStrings,auditStrings};
const form=document.querySelector('#strings-review');if(form){
 const defaults={source:'library',patch:'Nylon Guitar',body:'preset',preset:'fireside-folk',role:'lead',fixture:'music',seed:'42',soundSeed:'42',bars:'8',match:'1'},query=new URLSearchParams(location.search);
 for(const name of STRING_PATCHES)form.elements.patch.add(new Option(name,name));for(const scene of SCENES.filter(s=>s.settings.playMusic!==false))form.elements.preset.add(new Option(scene.name,sceneSlug(scene.name)));
 for(const [key,value]of Object.entries(defaults)){const e=form.elements[key];if(e.type==='checkbox')e.checked=(query.get(key)??value)==='1';else e.value=query.get(key)||value;}
 const sync=()=>{const generated=form.elements.source.value==='generated';form.elements.patch.disabled=generated;form.elements.soundSeed.disabled=!generated;};form.elements.source.addEventListener('change',sync);sync();
 form.elements.patch.addEventListener('change',()=>{form.elements.role.value=form.elements.patch.value==='Upright Pluck'?'bass':'lead';});
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};let playback,urls=[];
 form.addEventListener('submit',async event=>{
  event.preventDefault();const options=Object.fromEntries(Object.keys(defaults).map(key=>{const e=form.elements[key];return [key,e.type==='checkbox'?e.checked:['seed','soundSeed','bars'].includes(key)?Math.max(0,Math.min(2147483647,Math.floor(Number(e.value)||0))):e.value];}));history.replaceState(null,'',location.pathname+'?'+new URLSearchParams({...options,match:options.match?'1':'0'}));
  const status=document.querySelector('#status'),buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);for(const audio of document.querySelectorAll('audio'))audio.pause();
  try{
   if(event.submitter.value==='audit'){
    const report=await auditStrings(options,(mode,id)=>status.textContent='Auditing '+mode+' / '+id);playback?.dispose();for(const url of urls)URL.revokeObjectURL(url);urls=[];const out=document.querySelector('#results');out.replaceChildren(el('h2','Raw audio audit'));
    for(const r of report.rows)out.append(el('p',r.version+' / '+r.id+' · peak '+r.peak.toFixed(4)+' · DC '+r.dc.toExponential(2)+' · '+(r.warnings.join('; ')||'No threshold findings')));
    const save=el('a','Save audit JSON');save.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));urls.push(save.href);save.download='string-body-audit.json';out.append(save);status.textContent=report.rows.length+' renders · '+report.findings+' findings.';
   }else{
    const results=await renderStrings(options,(mode,n)=>status.textContent='Rendering '+labels[mode]+' '+Math.round(n*100)+'%');playback?.dispose();for(const url of urls)URL.revokeObjectURL(url);urls=[];playback=comparisonPlayheads();const out=document.querySelector('#results');out.replaceChildren();
    for(const r of results){const section=el('section');section.append(el('h2',labels[r.mode]),el('p',r.name+' · '+(r.mode==='earlier'?'single 185 Hz body':r.body+' body modes')+' · level adjustment '+(20*Math.log10(r.gain||1)).toFixed(1)+' dB'));const audio=el('audio');audio.controls=true;audio.src=URL.createObjectURL(r.blob);urls.push(audio.src);const save=el('a','Save WAV');save.href=audio.src;save.download='strings-'+r.mode+'.wav';section.append(audio,save);const canvas=el('canvas');drawNotes(canvas,r,[options.role]);section.append(canvas);out.append(section);playback.add(audio,canvas,r);}
    status.textContent='Ready: identical written score, excitation and decay · synchronized bar markers. Try matching off to compare natural fullness.';
   }
  }catch(error){status.textContent=error.message;console.error(error);}finally{buttons.forEach(b=>b.disabled=false);}
 });
}
