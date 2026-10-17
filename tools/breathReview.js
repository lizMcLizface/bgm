import {soundContext} from '../src/app/soundGenV3';
import {prepareSound} from '../src/app/engine/prepareSound';
import {sceneSettings} from '../src/app/scenes';
import {SCENES,sceneSlug} from '../src/app/scenes';
import {breathPatch} from '../src/app/engine/breathPatches';
import {findPreset} from '../src/app/editor/presetStore';
import {prepareComparison} from './phase4Review';
import {renderEnsemble,matchAverageLevels,drawNotes} from './ensembleReview';
import {comparisonPlayheads} from './comparisonPlayhead';
import {auditCase,db} from './audioAudit';
import {renderAuditCase} from './phase4Audio';
export const PATCHES=['Soft Flute','Pan Flute','Ocarina','Reed Lead','Clarinet Lead','Breathy Choir','Choir Ah'];
const MODES=['earlier','air','colour'],labels={earlier:'Earlier source · same expression',air:'Shaped breath · earlier tone',colour:'Shaped breath + formants'};
const written=plan=>plan.bars.map(b=>b.events.map(({expression,...e})=>e));
export async function breathOptions(options){
 const [base]=await prepareComparison({...options,part:options.role,fixture:'music',sound:'library',slides:false});
 const unit=base.plan.bars[0].seconds/base.plan.bars[0].units,barSeconds=base.plan.bars[0].seconds;
 let testNotes=base.options.testNotes;
 if(options.fixture!=='music'){
  testNotes=base.plan.bars.map(()=>({label:options.fixture,events:[]}));
  for(const n of auditCase(options.fixture,options.role).notes){const bar=Math.floor(n.time/barSeconds);if(testNotes[bar])testNotes[bar].events.push({role:options.role,midi:n.midi,beat:(n.time-bar*barSeconds)/unit,length:n.duration/unit,velocity:n.velocity,detune:0,...(n.pitchTargets?{pitchTargets:n.pitchTargets}:{})});}
 }
 let raw={...findPreset(options.patch),breathAmount:0,formantAmount:0},enhanced=breathPatch(options.patch,raw),voiceName=options.patch,family='Named library counterpart';
 if(options.source==='generated'){
  const scene=SCENES.find(s=>sceneSlug(s.name)===options.preset),settings=sceneSettings(scene,options.seed);
  const context=soundContext(settings,scene,options.role);if(options.profile&&options.profile!=='auto')context.profile=options.profile;
  const info={version:3,role:options.role,ensemble:options.soundSeed??42,...context};
  const [before,after]=await Promise.all([prepareSound(info,'latest',{voiceColour:false,stringResonance:false,pianoResonance:false}),prepareSound(info,'latest',{stringResonance:false,pianoResonance:false})]);
  raw={...before.preset,breathAmount:0,formantAmount:0};enhanced={...after.preset,masterVolume:raw.masterVolume};voiceName=after.name;family=after.sourceFamily??'This recipe keeps its earlier source colour';
 }

 return MODES.map(mode=>({mode,voiceName,family,options:{...base.options,testNotes,parts:[options.role],noteExpression:true,heldExpression:true,noteConnection:true,heldGlide:options.fixture==='held-glide',sounds:{...base.options.sounds,[options.role]:{name:voiceName,preset:mode==='earlier'?raw:mode==='air'?{...enhanced,formantAmount:0}:enhanced}}}}));
}
export async function renderBreath(options,onProgress=()=>{}){
 const prepared=await breathOptions(options),results=[];
 for(const item of prepared)results.push({...await renderEnsemble(item.options,n=>onProgress(item.mode,n)),mode:item.mode,voiceName:item.voiceName,family:item.family});
 if(results.some(r=>JSON.stringify(written(r))!==JSON.stringify(written(results[0]))))throw Error('Written notes differ.');
 return matchAverageLevels(results,options.match!==false);
}
export async function auditBreath(options,onProgress=()=>{}){
 const variants=await breathOptions(options),rows=[];
 for(const {mode,options:opts}of variants.filter(v=>v.mode!=='air'))for(const id of ['short','held','high','low','chord','dense','steal','cancel','resume','held-glide']){
  onProgress(mode,id);const row=await renderAuditCase({sound:opts.sounds[options.role],role:options.role,id,mode:id==='held-glide'?'slides':'current',bpm:90,volume:.6});rows.push({...row,version:mode});
 }
 return {rows,findings:rows.filter(r=>r.warnings.length).length};
}
if(import.meta.env.DEV)window.__breathReview={breathOptions,renderBreath,auditBreath};
const form=document.querySelector('#breath-review');
if(form){
 const defaults={source:'library',soundSeed:'1',profile:'auto',patch:'Pan Flute',preset:'fireside-folk',role:'lead',fixture:'music',seed:'42',bars:'8',match:'1'},query=new URLSearchParams(location.search);
 for(const name of PATCHES)form.elements.patch.add(new Option(name,name));for(const scene of SCENES.filter(s=>s.settings.playMusic!==false))form.elements.preset.add(new Option(scene.name,sceneSlug(scene.name)));
 for(const [key,value]of Object.entries(defaults)){const e=form.elements[key];if(e.type==='checkbox')e.checked=(query.get(key)??value)==='1';else e.value=query.get(key)||value;}
 const syncSource=()=>{const generated=form.elements.source.value==='generated';form.elements.patch.disabled=generated;form.elements.soundSeed.disabled=!generated;form.elements.profile.disabled=!generated;};form.elements.source.addEventListener('change',syncSource);syncSource();
 form.elements.patch.addEventListener('change',()=>{form.elements.role.value=/Choir/.test(form.elements.patch.value)?'pad':'lead';});
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};let playback,urls=[];
 form.addEventListener('submit',async event=>{
  event.preventDefault();const options=Object.fromEntries(Object.keys(defaults).map(key=>{const e=form.elements[key];return [key,e.type==='checkbox'?e.checked:['seed','soundSeed','bars'].includes(key)?Math.max(0,Math.floor(Number(e.value)||0)):e.value];}));
  history.replaceState(null,'',location.pathname+'?'+new URLSearchParams({...options,match:options.match?'1':'0'}));const status=document.querySelector('#status'),buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);for(const audio of document.querySelectorAll('audio'))audio.pause();
  try{
   if(event.submitter.value==='audit'){
    playback?.dispose();playback=null;for(const url of urls)URL.revokeObjectURL(url);urls=[];
    const report=await auditBreath(options,(mode,id)=>{status.textContent='Auditing '+mode+' / '+id;});
    const out=document.querySelector('#results');out.replaceChildren(el('h2','Raw audio audit'));
    for(const row of report.rows)out.append(el('p',row.version+' / '+row.id+' · peak '+row.peak.toFixed(4)+' · DC '+row.dc.toExponential(2)+' · '+(row.warnings.join('; ')||'No threshold findings')));
    const link=el('a','Save audit JSON');link.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));urls.push(link.href);link.download='breath-audit.json';out.append(link);status.textContent=report.rows.length+' renders · '+report.findings+' findings.';
   }else{
    const results=await renderBreath(options,(mode,n)=>{status.textContent='Rendering '+labels[mode]+' '+Math.round(n*100)+'%';});playback?.dispose();for(const url of urls)URL.revokeObjectURL(url);urls=[];
    const out=document.querySelector('#results');out.replaceChildren();playback=comparisonPlayheads();
    for(const r of results){const section=el('section');section.append(el('h2',labels[r.mode]),el('p',r.voiceName+' · '+r.family+' · '+options.role+' · level adjustment '+(20*Math.log10(r.gain||1)).toFixed(1)+' dB'));const audio=el('audio');audio.controls=true;audio.src=URL.createObjectURL(r.blob);urls.push(audio.src);section.append(audio);const save=el('a','Save WAV');save.href=audio.src;save.download='breath-'+r.mode+'.wav';section.append(save);const canvas=el('canvas');drawNotes(canvas,r,[options.role]);section.append(canvas);out.append(section);playback.add(audio,canvas,r);}
    status.textContent='Ready: identical written score and envelopes · synchronized bar markers. Compare with matching off to judge natural level too.';
   }
  }catch(error){status.textContent=error.message;console.error(error);}finally{buttons.forEach(b=>b.disabled=false);}
 });
}
