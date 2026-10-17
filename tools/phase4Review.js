import {SCENES,sceneSlug} from '../src/app/scenes';
import {previewEnsemble,renderEnsemble,matchAverageLevels,drawNotes} from './ensembleReview';
import {developmentOptions} from './developmentReview';
import {comparisonPlayheads} from './comparisonPlayhead';
import {reviewSounds,runSoundAudit,MODES} from './phase4Audio';
import {auditCase,measureAudio,db} from './audioAudit';
const roles=['lead','counter','pad','bass','perc'];
const written=plan=>plan.bars.map(b=>b.events.map(({expression,...e})=>e));
export async function prepareComparison(options) {
 const current=await reviewSounds(options,'current');
 const base={...developmentOptions({...options,mode:'gentle',phrases:2,scope:'all',strategy:'auto'},true),sections:false,activeLead:true,counterActive:true,
  parts:options.part==='all'?roles:[options.part],noteExpression:false,heldExpression:false,noteConnection:false,gateEnvelopes:false,tempoEffects:false,noteSlides:false,chordSlides:false};
 const score=previewEnsemble({...base,sounds:current.sounds});
 let testNotes=score.bars.map(b=>({label:b.chord,events:b.events.map(({expression,...e})=>e)}));
 if(options.fixture!=='music') {
  const role=options.fixture==='chord-slide'?'pad':options.fixture==='lead-slide'?options.auditRole??'lead':options.part==='all'?(options.auditRole??'lead'):options.part,fixture=auditCase(options.fixture,role),unit=score.bars[0].seconds/score.bars[0].units,barSeconds=score.bars[0].seconds;
  testNotes=score.bars.map(()=>({label:options.fixture+' / tail',events:[]}));
  for(const n of fixture.notes){const bar=Math.floor(n.time/barSeconds);if(testNotes[bar])testNotes[bar].events.push({role,midi:n.midi,beat:(n.time-bar*barSeconds)/unit,length:n.duration/unit,velocity:n.velocity,detune:0,...(n.pitchTargets?{pitchTargets:n.pitchTargets}:{})});}
 }
 const modes=['reference','current',...(options.tight?['tight']:[]),...(options.slides?['slides']:[]),...(options.connections?['connections']:[])],variants=[];
 for(const mode of modes){const {sounds}=mode==='reference'?await reviewSounds(options,mode):current;
  const opts={...base,sounds,testNotes,heldPadGlides:mode==='connections',heldBassGlides:mode==='connections',heldGlide:mode==='slides'&&options.fixture==='held-glide',noteExpression:mode!=='reference',heldExpression:mode!=='reference',noteConnection:mode!=='reference',tempoEffects:mode==='tight',gateEnvelopes:mode==='tight',noteSlides:mode==='slides'&&!['chord-slide','held-glide'].includes(options.fixture),padPitchMotion:mode==='slides'&&!['chord-slide','held-glide'].includes(options.fixture),bassPitchMotion:mode==='slides'&&!['chord-slide','held-glide'].includes(options.fixture),chordSlides:mode==='slides'&&options.fixture==='chord-slide'};
  variants.push({mode,options:opts,plan:previewEnsemble(opts)});
 }
 const reference=JSON.stringify(written(variants[0].plan));if(variants.some(v=>JSON.stringify(written(v.plan))!==reference))throw Error('Written comparison notes differ.');
 return variants;
}
export async function waveMetrics(blob) {
 const buffer=await blob.arrayBuffer(),view=new DataView(buffer),length=(buffer.byteLength-44)/4,left=new Float32Array(length),right=new Float32Array(length);
 for(let i=0;i<length;i++){left[i]=view.getInt16(44+i*4,true)/32768;right[i]=view.getInt16(46+i*4,true)/32768;}
 return measureAudio([left,right],view.getUint32(24,true));
}
export async function renderComparison(options,onProgress=()=>{}) {
 const variants=await prepareComparison(options),results=[];
 for(const v of variants){const result=await renderEnsemble(v.options,n=>onProgress(v.mode,n));results.push({...result,mode:v.mode,metrics:await waveMetrics(result.blob)});}
 const reference=JSON.stringify(written(results[0]));if(results.some(r=>JSON.stringify(written(r))!==reference))throw Error('Rendered comparison notes differ.');
 return matchAverageLevels(results,options.match!==false);
}
if(import.meta.env.DEV)window.__phase4Review={prepareComparison,renderComparison,runSoundAudit};
const form=document.querySelector('#phase4-review');
if(form){
 const defaults={preset:'rainy-cafe',seed:'42',soundSeed:'12345',bars:'8',part:'all',sound:'library',fixture:'music',auditRole:'lead',tight:'0',slides:'0',connections:'0',match:'1'},query=new URLSearchParams(location.search);
 for(const scene of SCENES.filter(s=>s.settings.playMusic!==false))form.elements.preset.add(new Option(scene.name,sceneSlug(scene.name)));
 for(const [key,value]of Object.entries(defaults)){const e=form.elements[key];if(e.type==='checkbox')e.checked=(query.get(key)??value)==='1';else {e.value=query.get(key)||value;if(!e.value)e.value=value;}}
 const syncFixture=()=>{const id=form.elements.fixture.value;if(['chord-slide','lead-slide','held-glide'].includes(id)){const role=id==='chord-slide'?'pad':form.elements.auditRole.value;form.elements.part.value=role;form.elements.auditRole.value=role;}};
 form.elements.fixture.addEventListener('change',syncFixture);form.elements.auditRole.addEventListener('change',()=>{if(['lead-slide','arpeggio-motion','held-glide'].includes(form.elements.fixture.value))form.elements.part.value=form.elements.auditRole.value;});form.elements.part.addEventListener('change',()=>{if(form.elements.fixture.value==='held-glide'&&form.elements.part.value!=='all')form.elements.auditRole.value=form.elements.part.value;});syncFixture();
 let playback,urls=[],reportUrl;
 const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const table=(headers,rows)=>{const t=el('table'),head=el('tr');for(const h of headers)head.append(el('th',h));t.append(head);for(const values of rows){const row=el('tr');for(const v of values)row.append(el('td',String(v)));t.append(row);}const scroll=el('div');scroll.className='table-scroll';scroll.append(t);return scroll;};
 form.addEventListener('submit',async event=>{
  event.preventDefault();const options=Object.fromEntries(Object.keys(defaults).map(key=>{const e=form.elements[key];return [key,e.type==='checkbox'?e.checked:['seed','soundSeed','bars'].includes(key)?Math.max(0,Math.min(2147483647,Math.floor(Number(e.value)||0))):e.value];}));
  history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(Object.fromEntries(Object.entries(options).map(([k,v])=>[k,typeof v==='boolean'?(v?'1':'0'):v]))));
  const status=document.querySelector('#status'),buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);document.querySelectorAll('audio').forEach(a=>a.pause());
  try {
   if(event.submitter?.value==='audit') {
    const report=await runSoundAudit({...options,modes:['reference','current',...(options.tight?['tight']:[]),...(options.slides?['slides']:[])]},p=>{status.textContent='Audit '+(p.done+1)+'/'+p.total+' · '+p.mode+' · '+p.id;});
    const output=document.querySelector('#audit-results');output.replaceChildren(el('h2','Raw audio audit · '+options.auditRole),el('p',report.rows[0].sound+' · source models recorded in JSON · 48 kHz · role gain, actual polyphony and original effects · no export soft limiting, fade or RMS matching. Compressor readings are samples every 250 ms, not guaranteed maxima.'));
    output.append(table(['Version / case','RMS dBFS','Peak','DC','Tail RMS (last 0.5s)','Mix / limiter min dB','Steals / slides / moving notes','Findings'],report.rows.map(r=>[r.mode+' / '+r.id,db(r.rms).toFixed(1),r.peak.toFixed(4),r.dc.toExponential(1),r.lateTailRms.toExponential(1),r.mixMin.toFixed(1)+' / '+r.limiterMin.toFixed(1),r.steals+' / '+r.slidingNotes+' / '+r.movingNotes,r.warnings.join('; ')||'No threshold findings'])));
    if(reportUrl)URL.revokeObjectURL(reportUrl);reportUrl=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=el('a','Save audit JSON');a.href=reportUrl;a.download='phase4-audit-'+options.preset+'-'+options.auditRole+'.json';output.append(a);
    status.textContent='Audit complete: '+report.rows.length+' cases; '+report.warningCount+' with threshold findings. Tail fullness and musical balance still need listening.';
   } else {
    status.textContent='Preparing common score and sounds…';const results=await renderComparison(options,(mode,n)=>{status.textContent='Rendering '+mode+' '+Math.round(n*100)+'%';});
    playback?.dispose();playback=comparisonPlayheads();urls.forEach(URL.revokeObjectURL);urls=[];const output=document.querySelector('#comparison');output.replaceChildren();
    for(const r of results){const root=el('section');root.append(el('h2',options.fixture==='held-glide'&&r.mode==='slides'?'One attack · held pitch glides':MODES[r.mode]),el('p',(options.sound==='generated'?'Generated recipes: earlier version vs scene-aware v3. ':'Same named library patches; current uses acoustic counterparts where available. ')+(r.mode==='connections'?'Held pad and bass rules are ON for this generated score. Long notes on sustaining sounds connect without new attacks; rests and short patterns retain their attacks. Connections renew within four bars or 24 seconds and stop at section boundaries. ':r.mode==='current'?'Beat linking and envelope fitting are OFF; long preset tails remain. ':r.mode==='tight'?'Both optional timing rules are ON for this comparison only. ':r.mode==='slides'&&options.fixture==='held-glide'?(options.part==='pad'?'Three chord voices attack once':'One '+(options.part==='all'?options.auditRole:options.part)+' voice attacks once')+' and sustains for 12 seconds, changing pitch smoothly around seconds 3, 6 and 9 without a new attack. Other versions hold the initial pitches for the same span. Try Deep night’s pad or Seaside Hearth’s Dark Drone bass for sustained sounds. ':r.mode==='slides'?'Current expression plus slow, continuous pitch motion across notes, arpeggios and tails. Haunted single-tone slides apply only to the chord-slide example. ':'Expression layers are off. ')+'Level adjustment '+(20*Math.log10(r.gain||1)).toFixed(1)+' dB.'));
     const audio=el('audio');audio.controls=true;audio.src=URL.createObjectURL(r.blob);urls.push(audio.src);const save=el('a','Save WAV');save.href=audio.src;save.download='phase4-'+options.preset+'-'+r.mode+'.wav';root.append(audio,save);
     const canvas=el('canvas');drawNotes(canvas,r,options.part==='all'?roles:[options.part]);root.append(canvas);output.append(root);playback.add(audio,canvas,r);
     if(r.mode==='connections')root.append(el('p',r.heldConnections.length+' held connections · '+r.heldConnections.reduce((total,n)=>total+n.notes-1,0)+' repeated attacks replaced by held pitch paths.'));
     const moving=r.bars.flatMap(b=>b.events.filter(e=>e.expression?.pitchMotion));
     if(moving.length)root.append(el('p',moving.length+' notes follow continuous voice contours (up to ±35 cents). Chord tones share a contour; note changes do not reset its direction.'));
     const sliding=r.bars.flatMap(b=>b.events.filter(e=>e.expression?.slideFromMidi!==undefined).map(e=>[b.bar+1,e.role,e.expression.slideFromMidi+' → '+e.midi,e.expression.slideSeconds.toFixed(3)+' s']));
     if(sliding.length){const details=el('details'),summary=el('summary','Which notes slide?');details.append(summary,table(['Bar','Voice','MIDI source → destination','Glide time'],sliding));root.append(details);}
     root.append(table(['WAV RMS before matching','WAV peak before matching','DC'],[[db(r.metrics.rms).toFixed(1)+' dBFS',r.metrics.peak.toFixed(4),r.metrics.dc.toExponential(1)]]));
    }
    status.textContent='Ready: '+results.length+' versions · identical written score · synchronized bar markers. Use the raw audit to check beyond WAV export processing.';
   }
  }catch(error){status.textContent=error.message;console.error(error);}finally{buttons.forEach(b=>b.disabled=false);}
 });
}
