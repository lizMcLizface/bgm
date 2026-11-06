import {useEffect,useRef} from 'react';
import {evaluate} from './mod';

/**
 * Plays a modulation set (src/seq/mod.js) on top of a device's knobs: while `running`, every 20 ms the assigned parameters are evaluated at
 * the current beat and sent to the engine with setParams; when it stops (or an assignment goes) the knobs' own values are sent back.
 * The beat advances with the tempo from the audio clock, starting from 0 each time `running` turns on. `values()` are the knobs' own values.
 */
export default function useModulation({live,mod,params,values,tempo,running}){
 const ref=useRef({});ref.current={live,mod,params,values,tempo};
 useEffect(()=>{
  const sent=new Set(),state={beat:0,last:null};
  const restore=keys=>{
   const {live:l,params:p,values:v}=ref.current,eng=l();
   if(!eng||!keys.length)return;
   const base=v();
   eng.setParams(keys.filter(k=>p.BY_KEY[k]).map(k=>[p.BY_KEY[k].id,base[k]??p.BY_KEY[k].default]));
   keys.forEach(k=>sent.delete(k));
  };
  const tick=()=>{
   const {live:l,mod:m,params:p,values:v,tempo:t}=ref.current,eng=l();
   if(!eng)return;
   const now=eng.context.currentTime,dt=state.last===null?0:Math.min(0.2,now-state.last);state.last=now;
   state.beat+=dt*(t()||120)/60;
   const base=v(),out=evaluate(m,m.assigns,k=>base[k]??p.BY_KEY[k]?.default??0,k=>p.BY_KEY[k],state.beat);
   restore([...sent].filter(k=>!(k in out)));
   const pairs=Object.entries(out).map(([k,val])=>[p.BY_KEY[k].id,val]);
   Object.keys(out).forEach(k=>sent.add(k));
   if(pairs.length)eng.setParams(pairs);
  };
  if(!running){restore([...sent]);return undefined;}
  const id=setInterval(tick,20);
  return ()=>{clearInterval(id);restore([...sent]);};
 },[running,Object.keys(mod.assigns).join()]);// eslint-disable-line react-hooks/exhaustive-deps
}
