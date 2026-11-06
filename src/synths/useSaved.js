import {useEffect,useRef} from 'react';
import {save} from './storage';

/**
 * Keeps `value` in local storage under `key`: written a moment after it stops changing (faders change values many times a second),
 * and written at once when the page is hidden or closed, so the last change is not lost to the delay. `skip()` can say not to
 * store it right now (a rack that belongs to a sound, a page that has not started).
 */
export function useSaved(key,value,{skip,delay=300}={}){
 const latest=useRef(value),skipRef=useRef(skip);
 latest.current=value;skipRef.current=skip;
 useEffect(()=>{
  const t=setTimeout(()=>{if(!skipRef.current?.())save(key,latest.current);},delay);
  return ()=>clearTimeout(t);
 },[key,value,delay]);
 useEffect(()=>{
  const flush=()=>{if(!skipRef.current?.())save(key,latest.current);};
  const hidden=()=>{if(document.visibilityState==='hidden')flush();};
  window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hidden);
  return ()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);};
 },[key]);
}
