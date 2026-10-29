import React,{useEffect,useMemo,useRef,useState} from 'react';
import {LAB_VOICES} from '../catalog';
import {noteName} from '../Piano';
import {NOTES,METRICS,VELOCITIES,pick,summarise} from './measure';
import {measureAll,signature} from './render';
import full from './suite.json';
import mid from './suite.mid.json';
import low from './suite.low.json';
import {GROUPS,groupOf} from './groups';
import LevelChart from './LevelChart';
import {categoryExport,categoryCsv} from './exportData';

const SUITES={full,mid,low},CW=14,CH=24,CAP=20,STORE='bgm-levels-v3:',DROP_NONE=3,DROP_WEAK=6;
const STOPS=[[0,[18,10,48]],[.25,[72,24,110]],[.5,[170,52,96]],[.75,[236,120,50]],[1,[252,240,150]]];
const colour=(db,low,high)=>{
 const t=Math.max(0,Math.min(1,(db-low)/(high-low)));let i=1;while(i<STOPS.length-1&&STOPS[i][0]<t)i++;
 const [t0,a]=STOPS[i-1],[t1,b]=STOPS[i],f=(t-t0)/(t1-t0);return `rgb(${a.map((v,k)=>Math.round(v+(b[k]-v)*f)).join(',')})`;
};
// The shipped suite is the baseline; anything measured in this browser is kept beside it and wins while it matches the voice.
const load=vel=>{try{return JSON.parse(localStorage.getItem(STORE+vel))||{};}catch{return {};}};
const save=(vel,data)=>{try{localStorage.setItem(STORE+vel,JSON.stringify(data));}catch{/* a full or blocked store only costs the cache */}};
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const ROWS=[...NOTES].reverse();

function Heat({voices,results,stale,chord,metric,weighted,range,hover,setHover,title,caption}){
 const canvas=useRef(null);
 useEffect(()=>{
  const c=canvas.current,g=c.getContext('2d');c.width=voices.length*CW;c.height=ROWS.length*CH;
  voices.forEach((v,x)=>{
   const levels=pick(results[v.id]?.[chord?'chord':'single'],metric,weighted);
   ROWS.forEach((_,y)=>{const i=NOTES.length-1-y;g.fillStyle=levels?colour(levels[i],range[0],range[1]):(x+y)%2?'#3a3d42':'#33363b';g.fillRect(x*CW,y*CH,CW,CH);});
  });
 },[voices,results,chord,metric,weighted,range]);
 const over=e=>{const r=e.currentTarget.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/CW),y=Math.floor((e.clientY-r.top)/CH);if(voices[x]&&ROWS[y]!==undefined)setHover({voice:voices[x],note:ROWS[y],metric});};
 return <div><div className="lv-cap">{caption}</div><div className="lv-x">{voices.map(v=><span key={v.id} style={{width:CW}} className={(hover?.voice.id===v.id?'on ':'')+(stale.has(v.id)?'stale':'')} title={stale.has(v.id)?'Changed since it was measured':undefined}>{v.name}{stale.has(v.id)?' *':''}</span>)}</div>
  <canvas ref={canvas} onMouseMove={over} onMouseLeave={()=>setHover(null)} aria-label={title+' levels, '+caption}/></div>;
}

// One number per instrument: dBA, power-averaged over the keyboard, for each portion, and "peak" (each note at its loudest portion).
function Summary({groups,results,chord}){
 const key=chord?'chord':'single',rows=groups.map(g=>({...g,rows:g.voices.map(v=>({v,s:summarise(results[v.id]?.[key],true)})).filter(r=>r.s).sort((a,b)=>b.s.peak-a.s.peak)})).filter(g=>g.rows.length);
 const peaks=rows.flatMap(g=>g.rows.map(r=>r.s.peak)).sort((a,b)=>a-b),median=peaks.length?peaks[Math.floor(peaks.length/2)]:0,fmt=x=>x.toFixed(1);
 return <details className="lv-summary" open><summary>Level summary · dBA, averaged over the keyboard ({chord?'chords':'single notes'}) · median peak {fmt(median)} dBA</summary>
  <div className="lv-summary-grid">{rows.map(g=><table key={g.id}><caption>{g.name}</caption><thead><tr><th>Instrument</th><th>Peak</th><th>vs median</th><th>Press</th><th>After 1 s</th><th>Average</th></tr></thead>
   <tbody>{g.rows.map(({v,s})=><tr key={v.id}><td>{v.name}</td><td><i style={{width:Math.max(2,Math.min(100,(s.peak+60)*1.6))}}/>{fmt(s.peak)}</td><td className={Math.abs(s.peak-median)>3?'off':''}>{(s.peak-median>0?'+':'')+fmt(s.peak-median)}</td><td>{fmt(s.attack)}</td><td>{fmt(s.hold)}</td><td>{fmt(s.average)}</td></tr>)}</tbody></table>)}</div></details>;
}

// Does each instrument respond to velocity? Level at low and half velocity against full, single notes, in dBA: the peak and the
// average while held. A drop of only a few dB from full to low means the instrument hardly changes with how hard the key is hit.
function VelocityResponse({groups,byVel}){
 const sums=Object.fromEntries(Object.entries(byVel).map(([vel,{results}])=>[vel,results]));
 const rows=groups.map(g=>({...g,rows:g.voices.map(v=>{
  const s=Object.fromEntries(['full','mid','low'].map(vel=>[vel,summarise(sums[vel]?.[v.id]?.single,true)]));
  return s.full&&s.low?{v,s,dLow:{peak:s.full.peak-s.low.peak,average:s.full.average-s.low.average},dMid:s.mid?{peak:s.full.peak-s.mid.peak,average:s.full.average-s.mid.average}:null}:null;
 }).filter(Boolean).sort((a,b)=>Math.min(a.dLow.peak,a.dLow.average)-Math.min(b.dLow.peak,b.dLow.average))})).filter(g=>g.rows.length);
 const all=rows.flatMap(g=>g.rows),worst=r=>Math.min(r.dLow.peak,r.dLow.average),none=all.filter(r=>worst(r)<DROP_NONE),weak=all.filter(r=>worst(r)>=DROP_NONE&&worst(r)<DROP_WEAK);
 const fmt=x=>x.toFixed(1),cls=r=>worst(r)<DROP_NONE?'none':worst(r)<DROP_WEAK?'weak':'';
 return <details className="lv-summary lv-resp" open><summary>Velocity response · level drop from full to low (0.25) and half (0.5) velocity, dBA · {all.length?`${none.length} barely respond (under ${DROP_NONE} dB), ${weak.length} respond weakly (under ${DROP_WEAK} dB), of ${all.length}`:'measure low and half velocity first (npm run levels:measure -- --velocity=low)'}</summary>
  <div className="lv-summary-grid">{rows.map(g=><table key={g.id}><caption>{g.name}</caption><thead><tr><th>Instrument</th><th>Peak drop to low</th><th>to half</th><th>Average drop to low</th><th>to half</th><th>Peak at full</th></tr></thead>
   <tbody>{g.rows.map(r=><tr key={r.v.id} className={cls(r)}><td>{r.v.name}</td><td className={r.dLow.peak<DROP_WEAK?'off':''}>{fmt(r.dLow.peak)}</td><td>{r.dMid?fmt(r.dMid.peak):'–'}</td><td className={r.dLow.average<DROP_WEAK?'off':''}>{fmt(r.dLow.average)}</td><td>{r.dMid?fmt(r.dMid.average):'–'}</td><td>{fmt(r.s.full.peak)}</td></tr>)}</tbody></table>)}</div></details>;
}

// The heatmap (or three, side by side) on the left; the level-against-pitch chart in a column on the right so the charts of
// consecutive groups sit directly under each other.
const download=(name,type,text)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
function Group({id,title,voices,all,results,stale,chord,metric,metrics,allMetrics,weighted,range,hover,setHover}){
 const exportAs=csv=>{const data=categoryExport(title,voices,all);download(`levels-${id}.${csv?'csv':'json'}`,csv?'text/csv':'application/json',csv?categoryCsv(data):JSON.stringify(data,null,1));};
 const any=voices.some(v=>Object.values(all).some(r=>r[v.id]));
 return <section className="lv-group"><h2>{title} <small>{voices.length}</small><span className="lv-export"><button disabled={!any} onClick={()=>exportAs(false)} title="Every measured instrument in this category">Export JSON</button><button disabled={!any} onClick={()=>exportAs(true)} title="One row per note, for a spreadsheet">Export CSV</button></span></h2>
  <div className="lv-pair">
   <div className="lv-plot"><div className="lv-y" style={{paddingTop:CAP+130}}>{ROWS.map(n=><span key={n} style={{height:CH}}>{noteName(n)}</span>)}</div>
    {metrics.map(m=><Heat key={m} voices={voices} results={results} stale={stale} chord={chord} metric={m} weighted={weighted} range={range} hover={hover} setHover={setHover} title={title} caption={metrics.length>1?METRICS.find(x=>x[0]===m)[1]:''}/>)}</div>
   <LevelChart voices={voices} results={results} chord={chord} metric={metric} allMetrics={allMetrics} weighted={weighted} hover={hover} setHover={setHover}/>
  </div></section>;
}

export default function LevelsPage(){
 const [vel,setVel]=useState('full'),[chord,setChord]=useState(false),[metric,setMetric]=useState('attack'),[family,setFamily]=useState('all'),[sort,setSort]=useState(false),[allMetrics,setAllMetrics]=useState(false),[triple,setTriple]=useState(false),[weighted,setWeighted]=useState(false);
 const [localAll,setLocalAll]=useState(()=>Object.fromEntries(VELOCITIES.map(([id])=>[id,load(id)]))),sigs=useMemo(()=>Object.fromEntries(LAB_VOICES.map(v=>[v.id,signature(v)])),[]);
 const [custom,setCustom]=useState(null),[progress,setProgress]=useState(null),[hover,setHover]=useState(null),stop=useRef(false),latest=useRef(localAll);latest.current=localAll;
 // A voice is stale when its definition no longer matches what was measured; it keeps its old numbers, marked, until it is measured again.
 const byVel=useMemo(()=>Object.fromEntries(VELOCITIES.map(([id])=>{
  const results={},stale=new Set(),local=localAll[id];
  for(const v of LAB_VOICES){const l=local[v.id],b=SUITES[id].voices[v.id],entry=l&&l.sig===sigs[v.id]?l:b??l;if(!entry)continue;results[v.id]=entry;if(entry.sig!==sigs[v.id])stale.add(v.id);}
  return [id,{results,stale}];
 })),[localAll,sigs]);
 const {results,stale}=byVel[vel],suite=SUITES[vel],level=VELOCITIES.find(v=>v[0]===vel)[2];
 const all=Object.fromEntries(Object.entries(byVel).map(([id,r])=>[id,r.results]));
 const shown=GROUPS.filter(([id])=>family==='all'||family===id);
 const groups=useMemo(()=>shown.map(([id,name])=>{
  const voices=LAB_VOICES.filter(v=>groupOf(v.family,v.name)===id),key=chord?'chord':'single';
  if(sort)voices.sort((a,b)=>(pick(results[b.id]?.[key],metric,weighted)?mean(pick(results[b.id][key],metric,weighted)):-999)-(pick(results[a.id]?.[key],metric,weighted)?mean(pick(results[a.id][key],metric,weighted)):-999));
  return {id,name,voices};
 }),[family,sort,results,chord,metric,weighted]);
 const run=async force=>{
  const queue=groups.flatMap(g=>g.voices).filter(v=>force||!results[v.id]||stale.has(v.id));stop.current=false;setProgress({done:0,total:queue.length});
  await measureAll(queue,{velocity:level,shouldStop:()=>stop.current,
   onResult:(v,entry,done,total)=>{setLocalAll(a=>({...a,[vel]:{...a[vel],[v.id]:entry}}));setProgress({done,total});},
   onFail:(v,e)=>console.warn('Level measurement failed for',v.name,e)});
  save(vel,latest.current[vel]);setProgress(null);
 };
 const clear=()=>{if(!confirm('Forget the measurements made in this browser at '+vel+' velocity? The shipped suite stays.'))return;save(vel,{});setLocalAll(a=>({...a,[vel]:{}}));};
 // Colours span the measured values (2nd to 99th percentile) unless a range is typed in.
 const metrics=triple?METRICS.map(m=>m[0]):[metric];
 const range=useMemo(()=>{
  const values=Object.values(results).flatMap(r=>metrics.flatMap(m=>pick(r[chord?'chord':'single'],m,weighted)??[])).filter(x=>x>-100).sort((a,b)=>a-b);
  return custom??(values.length?[Math.floor(values[Math.floor(values.length*.02)]),Math.ceil(values[Math.floor(values.length*.99)])]:[-60,-10]);
 },[results,chord,metrics.join(),weighted,custom]);
 const measured=LAB_VOICES.filter(v=>results[v.id]).length,pending=LAB_VOICES.filter(v=>!results[v.id]||stale.has(v.id)).length;
 const key=chord?'chord':'single',shownMetric=hover?.metric??metric,read=hover&&pick(results[hover.voice.id]?.[key],shownMetric,weighted)?.[NOTES.indexOf(hover.note)];
 const seg=(items,value,set,label)=><div className="lv-seg" role="group" aria-label={label}>{items.map(([id,text])=><button key={id} aria-pressed={value===id} onClick={()=>set(id)}>{text}</button>)}</div>;
 return <main className="labs-shell lv">
  <header><nav><a href="/labs/">← Instrument labs</a></nav><span className="lab-eyebrow">Analysis</span><h1>Instrument levels</h1>
   <p>Every instrument plays a held note at {VELOCITIES.find(v=>v[0]===vel)[1].toLowerCase()} velocity ({level}) across the keyboard, A0 to C8, rendered offline on the engine the app uses. Colour is level in dBFS: brighter is louder. Sixteen notes are spread evenly from A0 to C8; chords are major triads built on them. {suite.generated?`The measurements ship with the site (generated ${suite.generated.slice(0,10)}).`:'No measurements ship with the site yet.'} An asterisk marks an instrument that changed since it was measured.</p></header>
  <div className="lv-controls">
   <label>Velocity{seg(VELOCITIES.map(([id,t])=>[id,t]),vel,setVel,'Velocity')}</label>
   <label>Notes{seg([['one','Single notes'],['chord','Chords']],chord?'chord':'one',v=>setChord(v==='chord'),'Notes')}</label>
   <label>Measurement{seg(METRICS,metric,setMetric,'Measurement')}</label>
   <label>Weighting{seg([['z','dBFS (unweighted)'],['a','dBA']],weighted?'a':'z',v=>setWeighted(v==='a'),'Weighting')}</label>
   <label>Category<select value={family} onChange={e=>setFamily(e.target.value)}><option value="all">All categories</option>{GROUPS.map(([id,n])=><option key={id} value={id}>{n}</option>)}</select></label>
   <label className="lab-check"><input type="checkbox" checked={sort} onChange={e=>setSort(e.target.checked)}/>Quietest to loudest within a category</label>
   <label className="lab-check"><input type="checkbox" checked={allMetrics} onChange={e=>setAllMetrics(e.target.checked)}/>Plot all three measurements (solid, dashed, dotted)</label>
   <label className="lab-check"><input type="checkbox" checked={triple} onChange={e=>setTriple(e.target.checked)}/>Heatmaps for all three measurements side by side</label>
  </div>
  <div className="lv-actions">
   {progress?<><button onClick={()=>{stop.current=true;}}>Stop</button><span>Measuring {progress.done} / {progress.total}…</span></>
    :<><button className="lab-primary" disabled={!pending} onClick={()=>run(false)} title={'Measure here in the browser; to update the shipped suite run npm run levels:measure -- --velocity='+vel}>Measure {family==='all'?'what is missing or changed':'missing or changed in this category'}</button><button onClick={()=>run(true)}>Re-measure all shown</button><button onClick={clear}>Forget local</button></>}
   <span>{measured} of {LAB_VOICES.length} instruments measured at {vel} velocity · {stale.size} changed since · {LAB_VOICES.length-measured} not measured</span>
  </div>
  <div className="lv-legend"><input type="number" aria-label="Darkest level in dBFS" value={range[0]} onChange={e=>setCustom([Number(e.target.value),range[1]])}/><i style={{background:`linear-gradient(90deg,${[0,.25,.5,.75,1].map(t=>colour(range[0]+t*(range[1]-range[0]),range[0],range[1])).join(',')})`}}/><input type="number" aria-label="Brightest level in dBFS" value={range[1]} onChange={e=>setCustom([range[0],Number(e.target.value)])}/><span>{weighted?'dBA':'dBFS'}</span>{custom&&<button onClick={()=>setCustom(null)}>Auto range</button>}<em>Grey = not measured yet</em></div>
  <p className="lv-read" aria-live="polite">{hover?`${hover.voice.name} · ${noteName(hover.note)}${chord?' chord':''} · ${read===undefined?'not measured':read+(weighted?' dBA':' dBFS')} · '+METRICS.find(m=>m[0]===shownMetric)[1].toLowerCase()}${results[hover.voice.id]?' · '+results[hover.voice.id].engine+' engine':''}`:'Hover a cell or a line for the exact level.'}</p>
  <VelocityResponse groups={groups} byVel={byVel}/>
  <Summary groups={groups} results={results} chord={chord}/>
  {groups.map(g=><Group key={g.id} id={g.id} title={g.name} voices={g.voices} all={all} results={results} stale={stale} chord={chord} metric={metric} metrics={metrics} allMetrics={allMetrics} weighted={weighted} range={range} hover={hover} setHover={setHover}/>)}
 </main>;
}
