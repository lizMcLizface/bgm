import React,{useEffect,useRef,useState} from 'react';

// The ⚙ in a device's top row: settings that are set once and left alone. `children` are the settings.
export default function SettingsPop({label='Sequencer settings',children}){
 const [open,setOpen]=useState(false),root=useRef(null);
 useEffect(()=>{
  if(!open)return undefined;
  const away=e=>{if(!root.current?.contains(e.target))setOpen(false);},key=e=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('pointerdown',away);window.addEventListener('keydown',key);
  return ()=>{document.removeEventListener('pointerdown',away);window.removeEventListener('keydown',key);};
 },[open]);
 return <span className="settings-wrap" ref={root}>
  <button type="button" className="settings-cog" aria-pressed={open} aria-expanded={open} aria-label={label} title={label} onClick={()=>setOpen(v=>!v)}>⚙</button>
  {open&&<div className="settings-pop" role="dialog" aria-label={label}>{children}</div>}
 </span>;
}
