import React,{useMemo,useState} from 'react';
import {NOTES,pick} from './measure';

const W=640,H=380,L=46,R=10,T=10,B=30,LOW_HZ=27.5,HIGH_HZ=4186;
const STYLES={attack:undefined,hold:'7 4',average:'2 3'};
const hz=midi=>440*2**((midi-69)/12);
const X=f=>L+(Math.log(f/LOW_HZ)/Math.log(HIGH_HZ/LOW_HZ))*(W-L-R);
const TICKS=[[55,'A1'],[110,'A2'],[220,'A3'],[440,'A4'],[880,'A5'],[1760,'A6'],[3520,'A7']];
export const lineColour=i=>`hsl(${Math.round((i*137.5)%360)} 68% 58%)`;

// Level (y) against pitch (x, log frequency): one line per instrument, optionally one per measurement in three dash styles.
export default function LevelChart({voices,results,chord,metric,allMetrics,weighted,hover,setHover}){
 const [hidden,setHidden]=useState(()=>new Set()),key=chord?'chord':'single';
 const shown=voices.map((v,i)=>({v,colour:lineColour(i),data:results[v.id]?.[key]})).filter(s=>pick(s.data,'attack',weighted)&&!hidden.has(s.v.id));
 const metrics=allMetrics?['attack','hold','average']:[metric];
 const [lo,hi]=useMemo(()=>{
  const values=shown.flatMap(s=>metrics.flatMap(m=>pick(s.data,m,weighted))).filter(x=>x>-100);
  return values.length?[Math.floor(Math.min(...values)/6)*6,Math.ceil(Math.max(...values)/6)*6]:[-60,0];
 },[shown.length,metrics.join(),key,results,weighted]);
 const Y=db=>T+(1-(db-lo)/(hi-lo||1))*(H-T-B),grid=[];for(let d=lo;d<=hi;d+=6)grid.push(d);
 const move=e=>{
  const box=e.currentTarget.getBoundingClientRect(),px=(e.clientX-box.left)/box.width*W,py=(e.clientY-box.top)/box.height*H;
  let note=0,best=Infinity;NOTES.forEach((n,i)=>{const d=Math.abs(X(hz(n))-px);if(d<best){best=d;note=i;}});
  let closest=null,gap=Infinity;for(const s of shown)for(const m of metrics){const d=Math.abs(Y(pick(s.data,m,weighted)[note])-py);if(d<gap){gap=d;closest=s.v;}}
  if(closest)setHover({voice:closest,note:NOTES[note]});
 };
 const toggle=id=>setHidden(h=>{const n=new Set(h);n.has(id)?n.delete(id):n.add(id);return n;});
 const focus=hover&&voices.some(v=>v.id===hover.voice.id)?hover.voice.id:null;
 return <div className="lv-chart">
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Level against frequency" onMouseMove={move} onMouseLeave={()=>setHover(null)}>
   {grid.map(d=><g key={d}><line x1={L} x2={W-R} y1={Y(d)} y2={Y(d)} className="grid"/><text x={L-6} y={Y(d)+3} textAnchor="end">{d}</text></g>)}
   {TICKS.map(([f,name])=><g key={f}><line x1={X(f)} x2={X(f)} y1={T} y2={H-B} className="grid"/><text x={X(f)} y={H-B+14} textAnchor="middle">{name}</text><text x={X(f)} y={H-B+25} textAnchor="middle" className="hz">{f<1000?f:(f/1000)+'k'} Hz</text></g>)}
   <text x={12} y={H/2} transform={`rotate(-90 12 ${H/2})`} textAnchor="middle">{weighted?'dBA':'dBFS'}</text>
   {hover&&<line x1={X(hz(hover.note))} x2={X(hz(hover.note))} y1={T} y2={H-B} className="cursor"/>}
   {shown.flatMap(s=>metrics.map(m=><polyline key={s.v.id+m} fill="none" stroke={s.colour} strokeWidth={focus===s.v.id?2.6:1.4} strokeDasharray={allMetrics?STYLES[m]:undefined} opacity={focus&&focus!==s.v.id?.18:.95}
    points={NOTES.map((n,i)=>`${X(hz(n)).toFixed(1)},${Y(Math.max(lo,pick(s.data,m,weighted)[i])).toFixed(1)}`).join(' ')}/>))}
  </svg>
  {allMetrics&&<p className="lv-styles"><svg width="150" height="10"><line x1="0" x2="34" y1="5" y2="5"/><line x1="52" x2="86" y1="5" y2="5" strokeDasharray="7 4"/><line x1="104" x2="138" y1="5" y2="5" strokeDasharray="2 3"/></svg> press · after 1 s · average</p>}
  <ul className="lv-keys">{voices.map((v,i)=><li key={v.id} className={(hidden.has(v.id)?'off ':'')+(focus===v.id?'on':'')} onMouseEnter={()=>setHover({voice:v,note:hover?.note??NOTES[12]})} onMouseLeave={()=>setHover(null)}>
   <button onClick={()=>toggle(v.id)} aria-pressed={!hidden.has(v.id)} title={results[v.id]?'Click to hide or show':'Not measured yet'}><i style={{background:lineColour(i)}}/>{v.name}</button></li>)}</ul>
 </div>;
}
