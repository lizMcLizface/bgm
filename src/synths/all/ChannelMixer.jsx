import React,{forwardRef,useEffect,useImperativeHandle,useState} from 'react';
import Encoder from '../seq/Encoder';
import {LOG,hz,dbText,panText,gainText,Pot,Fader,Meter} from './deskParts';
import {RACK_PARAMS,cleanRack} from '../effects/params';
import {BLOCKS,CHOICES,syncedDelayMs} from '../effects/rackParts';
import {toPosition,fromPosition,formatValue} from '../params';
import './generatorBox.css';
import './mixerDesk.css';

// The channel effects and output gain drive the audio; the remaining desk controls are still a visual mock-up.
const NEW=()=>({gain:.33,hpOn:false,hp:.2,lpOn:false,lp:.9,hi:.5,mid:.5,lo:.5,pan:.5,vol:.75,mute:false,solo:false,rev:.2,revSize:.5,dly:0,dlyTime:.4,dlyFb:.3});
const PROPERTIES=[
 ...BLOCKS.filter(b=>b.id==='reverb'||b.id==='delay').flatMap(b=>b.keys.map(([key,label])=>({key,label:`${b.name} · ${label}`}))),
 {key:'effects.bypass',label:'Space bypass'},{key:'switch.delay',label:'Delay enabled'},{key:'switch.reverb',label:'Reverb enabled'},
 {key:'master.reverbFirst',label:'Reverb before delay'},
];
export const MIXER_PROPERTY_COUNT=PROPERTIES.length;
const valueText=(key,value)=>CHOICES[key]?.[value]??(key.startsWith('switch.')||key==='master.reverbFirst'?(value?'On':'Off'):formatValue(RACK_PARAMS.BY_KEY[key],value)+(RACK_PARAMS.BY_KEY[key].unit==='%'?'%':''));

const ChannelMixer=forwardRef(function ChannelMixer({channels,colours,host,onEdit,tempo=0},ref){
 const strips=[...channels.map(c=>({id:c.role,label:c.label.replace('Second lead','2nd lead'),short:c.short,colour:colours[c.role]})),
  {id:'ambience',label:'Ambience',short:'AM',colour:'#58b9ad'},{id:'headroom',label:'Headroom',short:'HR',colour:'#9a9fa6'}];
 const [st,setSt]=useState(()=>Object.fromEntries(strips.map(s=>[s.id,NEW()])));
 const [sel,setSel]=useState(strips[0].id);
 const [property,setProperty]=useState(0);
 const [master,setMaster]=useState({vol:.75,width:.5,bal:.5,limit:true,ceil:.85,mono:false,dim:false});
 const [levels,setLevels]=useState({});
 useImperativeHandle(ref,()=>({snapshot:()=>({strips:st,selected:sel,property,master}),restore:state=>{setSt(state.strips);setSel(state.selected);setProperty(state.property);setMaster(state.master);}}),[st,sel,property,master]);
 useEffect(()=>{
  if(!host?.openMeters){setLevels({});return undefined;}
  const meters=host.openMeters();let frame,last=0,display={};
  const sample=time=>{if(time-last>=50){
   const elapsed=last?Math.min(time-last,1000):50,values=meters.read();
   display=Object.fromEntries(Object.entries(values).map(([key,target])=>{const previous=display[key]??0,rate=target>previous?150:300;return [key,previous+(target-previous)*(1-Math.exp(-elapsed/rate))];}));
   setLevels(display);last=time;
  }frame=requestAnimationFrame(sample);};
  frame=requestAnimationFrame(sample);
  return ()=>{cancelAnimationFrame(frame);meters.dispose();};
 },[host]);
 const set=(id,p)=>setSt(s=>({...s,[id]:{...s[id],...p}}));
 const anySolo=Object.values(st).some(s=>s.solo);
 const cur=strips.find(s=>s.id===sel);
 const idx=strips.findIndex(s=>s.id===sel);
 const live=!!host&&channels.some(s=>s.role===sel),raw=live?(host.rackValues(sel)??cleanRack()):cleanRack();
 const synced=syncedDelayMs(raw['master.sync'],tempo),rack=synced?{...raw,'effects.delayMs':synced}:raw;
 const prop=PROPERTIES[property],spec=RACK_PARAMS.BY_KEY[prop.key],v=rack[prop.key];
 const edit=(key,value)=>onEdit?.(sel,{[key]:RACK_PARAMS.clampValue(key,value)});
 const encoder=(key,label)=>{const p=RACK_PARAMS.BY_KEY[key],value=rack[key];return <Encoder label={label} display={valueText(key,value)} position={toPosition(p,value)} disabled={!live||(key==='effects.delayMs'&&!!synced)} step={p.curve==='step'?1/(p.max-p.min):.02} onPosition={x=>edit(key,fromPosition(p,x))} onReset={()=>edit(key,p.default)}/>;};
 return <section className="gbox mixdesk" aria-label="Mixing desk">
  <header className="gb-head"><h2>Mixer</h2><span className="gb-hint">Voice gain, delay and reverb are live · other controls are visual only</span></header>
  <div className="dk-sends" style={{'--ch':cur.colour}}>
   <div className="dk-lcd" role="status"><small>Sends · channel {idx+1}</small><b>{cur.label}</b>
    <span>{live?`${prop.label}: ${valueText(prop.key,v)}`:'Effects unavailable on this channel'}</span><span>REV {valueText('effects.reverb',rack['effects.reverb'])} · SIZE {valueText('effects.size',rack['effects.size'])}</span><span>DLY {valueText('effects.delay',rack['effects.delay'])} · {valueText('effects.delayMs',rack['effects.delayMs'])} · FB {valueText('effects.feedback',rack['effects.feedback'])}</span></div>
   <div className="dk-send-knobs">
    <Encoder label="Channel" display={cur.label} position={idx/(strips.length-1)} step={1/(strips.length-1)} onPosition={p=>setSel(strips[Math.round(p*(strips.length-1))].id)} onReset={()=>setSel(strips[0].id)}/>
    {encoder('effects.reverb','Reverb')}{encoder('effects.size','Rev size')}{encoder('effects.delay','Delay')}{encoder('effects.delayMs','Dly time')}{encoder('effects.feedback','Feedback')}
    <Encoder label="Effect property" display={prop.label} position={property/(PROPERTIES.length-1)} step={1/(PROPERTIES.length-1)} disabled={!live} onPosition={p=>setProperty(Math.round(p*(PROPERTIES.length-1)))} onReset={()=>setProperty(0)}/>
    <Encoder label="Property value" display={valueText(prop.key,v)} position={toPosition(spec,v)} disabled={!live||(prop.key==='effects.delayMs'&&!!synced)} step={spec.curve==='step'?1/(spec.max-spec.min):.02} onPosition={p=>edit(prop.key,fromPosition(spec,p))} onReset={()=>edit(prop.key,spec.default)}/>
   </div>
  </div>
  <div className="dk-body">
   <div className="dk-strips">
    {strips.map((s,i)=>{const x=st[s.id];const silent=x.mute||(anySolo&&!x.solo);
     return <div key={s.id} className={'dk-strip'+(s.id===sel?' sel':'')+(silent?' silent':'')} style={{'--ch':s.colour}}>
      <button type="button" className="dk-lcd mini" onClick={()=>setSel(s.id)} title={`${s.label}: show its sends`}><small>{i+1} · {panText(x.pan)}</small><b>{s.label}</b></button>
      {host&&channels.some(ch=>ch.role===s.id)?(()=>{const p=RACK_PARAMS.BY_KEY['master.output'],value=host.rackValues(s.id)?.['master.output']??0;return <Pot side size={44} label={`${s.label} gain`} v={toPosition(p,value)} def={toPosition(p,0)} onChange={v=>onEdit(s.id,{'master.output':fromPosition(p,v)})} tip={`Gain ${formatValue(p,value)}`}/>;})():<Pot side size={44} label="Gain" v={x.gain} def={.33} onChange={v=>set(s.id,{gain:v})} tip={`Gain ${gainText(x.gain)} (visual only)`}/>}
      <div className="dk-filt"><button type="button" className={x.hpOn?'on':''} aria-pressed={x.hpOn} onClick={()=>set(s.id,{hpOn:!x.hpOn})}>HP</button><Pot label="Hz" v={x.hp} def={.2} onChange={v=>set(s.id,{hp:v,hpOn:true})} size={38} side tip={`High-pass ${hz(LOG(x.hp,20,600))} Hz`}/></div>
      <div className="dk-filt"><button type="button" className={x.lpOn?'on':''} aria-pressed={x.lpOn} onClick={()=>set(s.id,{lpOn:!x.lpOn})}>LP</button><Pot label="Hz" v={x.lp} def={.9} onChange={v=>set(s.id,{lp:v,lpOn:true})} size={38} side tip={`Low-pass ${hz(LOG(x.lp,1000,20000))} Hz`}/></div>
      <div className="dk-eq"><Pot side label="Hi" v={x.hi} onChange={v=>set(s.id,{hi:v})} size={36} centre tip={`High ${((x.hi-.5)*24).toFixed(1)} dB`}/><Pot side label="Mid" v={x.mid} onChange={v=>set(s.id,{mid:v})} size={36} centre tip={`Mid ${((x.mid-.5)*24).toFixed(1)} dB`}/><Pot side label="Lo" v={x.lo} onChange={v=>set(s.id,{lo:v})} size={36} centre tip={`Low ${((x.lo-.5)*24).toFixed(1)} dB`}/></div>
      <Pot side size={44} label="Pan" v={x.pan} def={.5} centre onChange={v=>set(s.id,{pan:v})} tip={`Pan ${panText(x.pan)}`}/>
      <div className="dk-btns">
       <button type="button" className={'sel'+(s.id===sel?' on':'')} onClick={()=>setSel(s.id)}>SEL</button>
       <button type="button" className={'solo'+(x.solo?' on':'')} aria-pressed={x.solo} onClick={()=>set(s.id,{solo:!x.solo})}>SOLO</button>
       <button type="button" className={'mute'+(x.mute?' on':'')} aria-pressed={x.mute} onClick={()=>set(s.id,{mute:!x.mute})}>MUTE</button>
      </div>
      <div className="dk-fader-row"><Meter level={levels[s.id]??0}/><Fader v={x.vol} onChange={v=>set(s.id,{vol:v})} label={`${s.label} level`} colour={s.colour}/></div>
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
    <div className="dk-fader-row master"><Meter level={levels.left??0}/><Meter level={levels.right??0}/><Fader v={master.vol} onChange={v=>setMaster(m=>({...m,vol:v}))} label="Master level" colour="#e3a52a"/></div>
    <output className="dk-db">{dbText(master.vol)} dB</output>
    <i className="dk-bar master"/>
   </div>
  </div>
 </section>;
});
export default ChannelMixer;
