import React,{lazy,memo,Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {EnsemblePanelContext} from './EmbeddedShell';

// Each synth's own panel, embedded in a host page (the ensemble, the main page's sound window)
// that owns the values: EmbeddedShell reads them and writes edits back through the context.
export const PANELS={cs80:lazy(()=>import('../cs80/Cs80Page')),juno:lazy(()=>import('../juno/JunoPage')),prophet5:lazy(()=>import('../prophet/ProphetPage')),jupiter8:lazy(()=>import('../jupiter/JupiterPage')),minimoog:lazy(()=>import('../minimoog/MinimoogPage')),dx7:lazy(()=>import('../dx7/Dx7Page')),obxa:lazy(()=>import('../obxa/ObxaPage')),vs:lazy(()=>import('../vs/VsPage')),poly:lazy(()=>import('../diy/DiyPage').then(m=>({default:m.PolyPage}))),fm:lazy(()=>import('../diy/DiyPage').then(m=>({default:m.FMPage})))};
// The classics' panels are laid out for 1150 px; narrower hosts zoom them down unless shown full
// size. The DIY panels reflow to any width (touch first), so they are never zoomed.
const FLUID=new Set(['poly','fm']);
export function ScaledPanel({children,full}){
 const ref=useRef(null),[width,setWidth]=useState(1000);
 useEffect(()=>{const el=ref.current,observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(el);return()=>observer.disconnect();},[]);
 return <div ref={ref} className="ensemble-panel-viewport"><div style={{zoom:full?1:Math.min(1,width/1150),minWidth:full?undefined:1150}}>{children}</div></div>;
}
export const VoicePanel=memo(function VoicePanel({id,role,values,onChange,choose,current,full}){
 const Panel=PANELS[id],context=useMemo(()=>({values,onChange,choose,current}),[values,onChange,choose,current]);
 return <ScaledPanel full={full||FLUID.has(id)}><EnsemblePanelContext.Provider value={context}><Suspense fallback={<p>Loading panel…</p>}><Panel key={role+id}/></Suspense></EnsemblePanelContext.Provider></ScaledPanel>;
});
