import React,{createContext,useContext,useEffect,useRef} from 'react';
import {isVisibleDeskItem,RESET_EVENT} from './Desk';

const Context=createContext(null);
export const useDeskObjects=()=>useContext(Context);
export function DeskObjectsProvider({store,children}){
 useEffect(()=>{
  const flush=()=>store.flush(),reset=()=>store.clearPoses();
  const hidden=()=>{if(document.visibilityState==='hidden')flush();};
  window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hidden);window.addEventListener(RESET_EVENT,reset);
  return ()=>{flush();store.dispose();window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);window.removeEventListener(RESET_EVENT,reset);};
 },[store]);
 return <Context.Provider value={store}>{children}</Context.Provider>;
}
/** Register an existing floating shell without coupling its identity to its sound. */
export function useObjectAdapter(key,ref,apply){
 const store=useDeskObjects(),latest=useRef(apply);latest.current=apply;
 const object=store?.get(key);
 useEffect(()=>{
  const el=ref.current;if(!object||!el)return;
  const identify=o=>el.setAttribute('data-desk-object-id',o.id);
  identify(store.get(key));
  const measure=()=>({w:el.offsetWidth,h:el.offsetHeight,visible:isVisibleDeskItem(el)});
  const detach=store.attach(key,{measure,apply:o=>{identify(o);latest.current(o);}});
  const read=()=>store.measure(key),ro=typeof ResizeObserver==='function'?new ResizeObserver(read):null;
  ro?.observe(el);
  const mo=typeof MutationObserver==='function'?new MutationObserver(read):null;
  for(let parent=el;parent&&parent!==el.closest('.desk-home')?.parentElement;parent=parent.parentElement)mo?.observe(parent,{attributes:true,attributeFilter:['style','aria-hidden','hidden','class']});
  return ()=>{detach();ro?.disconnect();mo?.disconnect();};
 },[store,key,!!object]);// eslint-disable-line react-hooks/exhaustive-deps
 return store&&object?store:null;
}
