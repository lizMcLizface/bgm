import React,{lazy,Suspense,useEffect,useState} from 'react';
import {FAMILIES} from './families';

const BenchPage=lazy(()=>import('./LabApp'));
const HomePage=lazy(()=>import('./LabsHome'));
const families=new Set([...FAMILIES.map(f=>f[0]),'all']);
export function labRoute(path){
 const parts=path.split('/').filter(Boolean);
 if(parts[0]!=='labs')return undefined;
 if(parts.length===1)return null;
 return parts.length===2&&families.has(parts[1])?parts[1]:undefined;
}

// Family pages share one live audio/MIDI session. Real anchors still support
// copied URLs, direct visits and opening a family in a separate tab.
export default function LabRouter({Bench=BenchPage,Home=HomePage}){
 const [route,setRoute]=useState(()=>labRoute(location.pathname)??null);
 const [family,setFamily]=useState(()=>labRoute(location.pathname)||null);
 useEffect(()=>{
  const read=()=>{const next=labRoute(location.pathname)??null;setRoute(next);if(next)setFamily(next);};
  const click=event=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const anchor=event.target.closest?.('a[href]');
   if(!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self'))return;
   const url=new URL(anchor.href,location.href);
   if(url.origin!==location.origin||labRoute(url.pathname)===undefined)return;
   if(url.pathname===location.pathname&&url.search===location.search&&url.hash)return;
   event.preventDefault();
   if(!url.search)url.search=location.search;
   if(url.href!==location.href)history.pushState(null,'',url.pathname+url.search+url.hash);
   read();
  };
  document.addEventListener('click',click);window.addEventListener('popstate',read);
  return ()=>{document.removeEventListener('click',click);window.removeEventListener('popstate',read);};
 },[]);
 return <Suspense fallback={<main className="labs-shell">Opening the sound workshop…</main>}>
  {route===null&&<Home/>}
  {family&&<div hidden={route===null}><Bench family={family}/></div>}
 </Suspense>;
}
