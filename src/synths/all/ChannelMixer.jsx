import React,{useState} from 'react';
import Encoder from '../seq/Encoder';
import {LOG,hz,dbText,panText,gainText,Pot,Fader,Meter} from './deskParts';
import './generatorBox.css';
import './mixerDesk.css';

// Proof of concept of the mixing desk box (docs/GENERATOR_BOX_PLAN.md), laid out after an X32: eight channel strips (the six voices,
// the ambience box and a headroom channel), a master section, and above them a small display with a channel knob that sets the
// reverb and delay of the channel it shows. Nothing here is wired to the audio yet.
const NEW=()=>({gain:.33,hpOn:false,hp:.2,lpOn:false,lp:.9,hi:.5,mid:.5,lo:.5,pan:.5,vol:.75,mute:false,solo:false,rev:.2,revSize:.5,dly:0,dlyTime:.4,dlyFb:.3});

export default function ChannelMixer({channels,colours}){
 const strips=[...channels.map(c=>({id:c.role,label:c.label.replace('Second lead','2nd lead'),short:c.short,colour:colours[c.role]})),
  {id:'ambience',label:'Ambience',short:'AM',colour:'#58b9ad'},{id:'headroom',label:'Headroom',short:'HR',colour:'#9a9fa6'}];
 const [st,setSt]=useState(()=>Object.fromEntries(strips.map(s=>[s.id,NEW()])));
 const [sel,setSel]=useState(strips[0].id);
 const [master,setMaster]=useState({vol:.75,width:.5,bal:.5,limit:true,ceil:.85,mono:false,dim:false});
 const set=(id,p)=>setSt(s=>({...s,[id]:{...s[id],...p}}));
 const anySolo=Object.values(st).some(s=>s.solo);
 const cur=strips.find(s=>s.id===sel),c=st[sel];
 const idx=strips.findIndex(s=>s.id===sel);
 return <section className="gbox mixdesk" aria-label="Mixing desk">
  <header className="gb-head"><h2>Mixer</h2><span className="gb-hint">8 channels · six voices, ambience, headroom</span></header>
  <div className="dk-sends" style={{'--ch':cur.colour}}>
   <div className="dk-lcd" role="status"><small>Sends · channel {idx+1}</small><b>{cur.label}</b>
    <span>REV {Math.round(c.rev*100)}% · size {Math.round(c.revSize*100)}%</span><span>DLY {Math.round(c.dly*100)}% · {Math.round(60+c.dlyTime*940)} ms · fb {Math.round(c.dlyFb*100)}%</span></div>
   <div className="dk-send-knobs">
    <Encoder label="Channel" display={cur.label} position={idx/(strips.length-1)} step={1/(strips.length-1)} onPosition={p=>setSel(strips[Math.round(p*(strips.length-1))].id)} onReset={()=>setSel(strips[0].id)}/>
    <Encoder label="Reverb" display={`${Math.round(c.rev*100)}%`} position={c.rev} onPosition={v=>set(sel,{rev:v})} onReset={()=>set(sel,{rev:.2})}/>
    <Encoder label="Rev size" display={`${Math.round(c.revSize*100)}%`} position={c.revSize} onPosition={v=>set(sel,{revSize:v})} onReset={()=>set(sel,{revSize:.5})}/>
    <Encoder label="Delay" display={`${Math.round(c.dly*100)}%`} position={c.dly} onPosition={v=>set(sel,{dly:v})} onReset={()=>set(sel,{dly:0})}/>
    <Encoder label="Dly time" display={`${Math.round(60+c.dlyTime*940)} ms`} position={c.dlyTime} onPosition={v=>set(sel,{dlyTime:v})} onReset={()=>set(sel,{dlyTime:.4})}/>
    <Encoder label="Feedback" display={`${Math.round(c.dlyFb*100)}%`} position={c.dlyFb} onPosition={v=>set(sel,{dlyFb:v})} onReset={()=>set(sel,{dlyFb:.3})}/>
   </div>
  </div>
  <div className="dk-body">
   <div className="dk-strips">
    {strips.map((s,i)=>{const x=st[s.id];const silent=x.mute||(anySolo&&!x.solo);
     return <div key={s.id} className={'dk-strip'+(s.id===sel?' sel':'')+(silent?' silent':'')} style={{'--ch':s.colour}}>
      <button type="button" className="dk-lcd mini" onClick={()=>setSel(s.id)} title={`${s.label}: show its sends`}><small>{i+1} · {panText(x.pan)}</small><b>{s.label}</b></button>
      <Pot side size={44} label="Gain" v={x.gain} def={.33} onChange={v=>set(s.id,{gain:v})} tip={`Gain ${gainText(x.gain)}`}/>
      <div className="dk-filt"><button type="button" className={x.hpOn?'on':''} aria-pressed={x.hpOn} onClick={()=>set(s.id,{hpOn:!x.hpOn})}>HP</button><Pot label="Hz" v={x.hp} def={.2} onChange={v=>set(s.id,{hp:v,hpOn:true})} size={38} side tip={`High-pass ${hz(LOG(x.hp,20,600))} Hz`}/></div>
      <div className="dk-filt"><button type="button" className={x.lpOn?'on':''} aria-pressed={x.lpOn} onClick={()=>set(s.id,{lpOn:!x.lpOn})}>LP</button><Pot label="Hz" v={x.lp} def={.9} onChange={v=>set(s.id,{lp:v,lpOn:true})} size={38} side tip={`Low-pass ${hz(LOG(x.lp,1000,20000))} Hz`}/></div>
      <div className="dk-eq"><Pot side label="Hi" v={x.hi} onChange={v=>set(s.id,{hi:v})} size={36} centre tip={`High ${((x.hi-.5)*24).toFixed(1)} dB`}/><Pot side label="Mid" v={x.mid} onChange={v=>set(s.id,{mid:v})} size={36} centre tip={`Mid ${((x.mid-.5)*24).toFixed(1)} dB`}/><Pot side label="Lo" v={x.lo} onChange={v=>set(s.id,{lo:v})} size={36} centre tip={`Low ${((x.lo-.5)*24).toFixed(1)} dB`}/></div>
      <Pot side size={44} label="Pan" v={x.pan} def={.5} centre onChange={v=>set(s.id,{pan:v})} tip={`Pan ${panText(x.pan)}`}/>
      <div className="dk-btns">
       <button type="button" className={'sel'+(s.id===sel?' on':'')} onClick={()=>setSel(s.id)}>SEL</button>
       <button type="button" className={'solo'+(x.solo?' on':'')} aria-pressed={x.solo} onClick={()=>set(s.id,{solo:!x.solo})}>SOLO</button>
       <button type="button" className={'mute'+(x.mute?' on':'')} aria-pressed={x.mute} onClick={()=>set(s.id,{mute:!x.mute})}>MUTE</button>
      </div>
      <div className="dk-fader-row"><Meter level={x.vol*(.5+x.gain*.6)} silent={silent}/><Fader v={x.vol} onChange={v=>set(s.id,{vol:v})} label={`${s.label} level`} colour={s.colour}/></div>
      <output className="dk-db">{dbText(x.vol)} dB</output>
      <i className="dk-bar"/>
     </div>;})}
   </div>
   <div className="dk-master" aria-label="Master section">
    <div className="dk-lcd mini master"><small>Main · L R</small><b>Master</b></div>
    <Pot side size={44} label="Width" v={master.width} def={.5} onChange={v=>setMaster(m=>({...m,width:v}))} tip="Stereo width"/>
    <Pot side size={44} label="Balance" v={master.bal} def={.5} centre onChange={v=>setMaster(m=>({...m,bal:v}))} tip={`Balance ${panText(master.bal)}`}/>
    <Pot side size={44} label="Ceiling" v={master.ceil} def={.85} onChange={v=>setMaster(m=>({...m,ceil:v}))} tip="Limiter ceiling"/>
    <div className="dk-btns">
     <button type="button" className={master.limit?'on lim':''} aria-pressed={master.limit} onClick={()=>setMaster(m=>({...m,limit:!m.limit}))}>LIMIT</button>
     <button type="button" className={master.mono?'on sel':''} aria-pressed={master.mono} onClick={()=>setMaster(m=>({...m,mono:!m.mono}))}>MONO</button>
     <button type="button" className={master.dim?'on solo':''} aria-pressed={master.dim} onClick={()=>setMaster(m=>({...m,dim:!m.dim}))}>DIM</button>
    </div>
    <div className="dk-fader-row master"><Meter level={master.vol*.8} silent={false}/><Meter level={master.vol*.75} silent={false}/><Fader v={master.vol} onChange={v=>setMaster(m=>({...m,vol:v}))} label="Master level" colour="#e3a52a"/></div>
    <output className="dk-db">{dbText(master.vol)} dB</output>
    <i className="dk-bar master"/>
   </div>
  </div>
 </section>;
}
