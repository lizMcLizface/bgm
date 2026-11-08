import React,{useState} from 'react';
import LocalEffectsDesk from './LocalEffectsDesk';
import RemoteEffectsPage from './RemoteEffectsPage';

export default function EffectsPage(){
 const [remote,setRemote]=useState(()=>{const q=new URLSearchParams(location.search);return q.has('target')||q.get('source')==='remote';});
 const changeSource=next=>{
  const url=new URL(location.href);
  if(next)url.searchParams.set('source','remote');else{url.searchParams.delete('source');url.searchParams.delete('target');}
  history.replaceState(null,'',url.href);setRemote(next);
 };
 return remote?<RemoteEffectsPage onLocal={()=>changeSource(false)}/>:<LocalEffectsDesk onRemote={()=>changeSource(true)}/>;
}
