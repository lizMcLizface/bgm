import React,{useEffect,useRef,useState} from 'react';
import RackPanel from './RackPanel';
import {cleanRack} from './params';
import {RACK_CHANNEL} from './connection';
import {SYNTHS} from '../models';

export default function EffectsPage(){
 const [peers,setPeers]=useState({}),[target,setTarget]=useState(()=>new URLSearchParams(location.search).get('target')??''),channel=useRef(null);
 const requested=useRef(target);
 const [unavailable,setUnavailable]=useState(false);
 useEffect(()=>{
  if(!globalThis.BroadcastChannel){setUnavailable(true);return;}
  let c;try{c=new BroadcastChannel(RACK_CHANNEL);}catch{setUnavailable(true);return;}channel.current=c;
  c.onmessage=({data})=>{
   if(data?.type==='state'&&typeof data.id==='string'&&data.values&&data.name){
    setPeers(p=>({...p,[data.id]:{...data,seen:Date.now()}}));
    setTarget(t=>t||(requested.current===data.id?data.id:requested.current?'':data.id));
   }else if(data?.type==='gone')setPeers(p=>{const next={...p};delete next[data.id];return next;});
  };
  c.postMessage({type:'discover'});
  const poll=setInterval(()=>{c.postMessage({type:'discover'});setPeers(p=>Object.fromEntries(Object.entries(p).filter(([,v])=>Date.now()-v.seen<15000)));},4000);
  return()=>{clearInterval(poll);c.close();channel.current=null;};
 },[]);
 const peer=peers[target],send=(type,values)=>{if(peer)channel.current?.postMessage({type,target,values});};
 const connect=id=>{requested.current=id;setTarget(id);const url=new URL(location.href);url.searchParams.set('target',id);history.replaceState(null,'',url.href);};
 return <div className="synth effects-page">
  <header className="effects-page-head"><a href={import.meta.env.BASE_URL+'synths/'}>‹ Synths</a><h1>Outboard for everyone</h1>
   <div className="effects-connection"><label>Connected synth<select aria-label="Connected synth" value={peer?target:''} onChange={e=>connect(e.target.value)}><option value="" disabled>{Object.keys(peers).length?'Choose a synth':'Waiting for a synth…'}</option>{Object.values(peers).map(p=><option key={p.id} value={p.id}>{p.name} · {p.audio==='on'?'audio on':'audio off'}</option>)}</select></label><span className="effects-status" role="status">{peer?(peer.audio==='on'?'Connected · play in your synth tab':'Connected · start audio in your synth tab'):'Open a synth to connect'}</span></div>
  </header>
  <fieldset className="rack-fieldset" disabled={!peer}>
   <RackPanel connected={!!peer} emptyMessage={unavailable?'Separate-tab controls are unavailable in this browser. Open a synth and use its Effects button to play through the rack.':undefined} values={peer?.values??cleanRack()} instrumentSpecs={peer?.instrumentSpecs??[]} peak={peer?.peak??0} reduction={peer?.reduction??0} onChange={values=>send('edit',values)} tools={<button type="button" onClick={()=>send('clear')}>Clear rack tails</button>}/>
  </fieldset>
  <section className="effects-launch"><h2>Open a synth beside the rack</h2><div>{Object.values(SYNTHS).map(s=><a key={s.id} href={`${import.meta.env.BASE_URL}synths/${s.id}/`} target="_blank" rel="noopener noreferrer">{s.name} ↗</a>)}</div></section>
 </div>;
}
