import React,{useEffect,useRef,useState} from 'react';
import Piano from '../../labs/Piano';
import {ModWheel} from './controls';
import {load,save} from '../storage';
import {KEY_SIZES} from './setup';

const VIEW_KEY='synths:keys-view';
const VIEW={scale:true,chord:true,intervals:true,names:true};

// The on-screen keyboard at the foot of a /synths page, in a box of its own: as many octaves as fit (up to the 61 keys of a
// standard keybed, C to C), the ribbon attached to its left end and the touch pad to its right, `head` along the top of the box.
// The key's scale is marked along the foot of each key and, when a chord is picked, its tones in their interval colours.
const WHITE=30,ARROW=40,GAP=6,SIDE_L=88,SIDE_R=130,SIDE_R_MIN=56,PAD=24,MIN_WHITES=8,MAX_WHITES=36,MAX_BOX=1400,WHITE_PCS=[0,2,4,5,7,9,11];
const isWhite=n=>WHITE_PCS.includes(((n%12)+12)%12);
// the top key for `whites` white keys counted from `low`
const highFor=(low,whites)=>{let n=low,seen=isWhite(low)?1:0;while(seen<whites&&n<108){n++;if(isWhite(n))seen++;}return n;};

// `size` is a whole keybed (49, 61, 76 or 88 keys) or "fit" for as many keys as the box holds; `controls` shows the mod wheel, ribbon and touch pad.
// the box is never narrower than its header row (the phrases, chords and the cog), or the cog drops to a row of its own
const MIN_HEAD_BOX=1240;
const FIXED={49:[36,84],61:[36,96],76:[28,103],88:[21,108]};
const whitesBetween=(a,b)=>{let n=0;for(let k=a;k<=b;k++)if(isWhite(k))n++;return n;};
export default function StageKeys({drag,low,onLow,notes,context,chord,onDown,onUp,onMod,head,left,right,size='fit',controls=true,onLayout}){
 // an instrument with no wheel, ribbon or pad of its own (the piano) has no strip to reserve room for, whatever the setting
 const hasControls=!!(onMod||left||right),shown=controls&&hasControls;
 const SL=shown?SIDE_L:0,SR=shown?SIDE_R:0,fixed=FIXED[size];
 const box=useRef(null),[width,setWidth]=useState(1000);
 const [view,setView]=useState(()=>({...VIEW,...(load(VIEW_KEY,{})||{})}));
 const [cog,setCog]=useState(false),cogRef=useRef(null);
 const toggle=k=>setView(v=>{const n={...v,[k]:!v[k]};save(VIEW_KEY,n);return n;});
 useEffect(()=>{
  if(!cog)return;
  const away=e=>{if(!cogRef.current?.contains(e.target))setCog(false);},key=e=>{if(e.key==='Escape'){e.stopPropagation();setCog(false);}};
  document.addEventListener('pointerdown',away);window.addEventListener('keydown',key,true);
  return ()=>{document.removeEventListener('pointerdown',away);window.removeEventListener('keydown',key,true);};
 },[cog]);
 useEffect(()=>{
  const el=box.current;if(!el)return;
  const ro=new ResizeObserver(()=>setWidth(el.clientWidth));ro.observe(el);setWidth(el.clientWidth);return ()=>ro.disconnect();
 },[]);
 // the octave buttons only appear when the keys do not all fit (the full 61 take the whole bed, and need no shifting)
 // As the box narrows keys go first (the octave buttons then shuffle what is left), down to one octave plus the top C; after
 // that the touch pad gives up width, and only then do the keys themselves get narrower.
 // the box is never wider than about three octaves of keys and its sides, so it is a box of its own that can be moved about
 const room=Math.min(width,MAX_BOX)-SL-SR-PAD,full=!!fixed||Math.floor(room/WHITE)>=MAX_WHITES;
 const fit=Math.floor((room-2*(ARROW+GAP))/WHITE);
 const whites=fixed?whitesBetween(...fixed):full?MAX_WHITES:Math.max(MIN_WHITES,Math.min(MAX_WHITES,fit));
 const sideR=fit>=MIN_WHITES||full?SR:Math.max(shown?SIDE_R_MIN:0,SR-(MIN_WHITES-fit)*WHITE);
 // keep the whole range on a real keyboard (21..108) wherever the octave buttons have put it
 let start=fixed?fixed[0]:low;if(!fixed)while(start>24&&highFor(start,whites)>=108)start-=12;
 const high=fixed?fixed[1]:highFor(start,whites);
 const scale=context.scalePcs,tonic=scale[0],picked=chord?context.chords[chord-1]:null;
 const rowWidth=SL+sideR+whites*WHITE+(full?0:2*(ARROW+GAP));
 return <div className="stage" ref={box}>
  <div className="keybox" ref={drag?.ref} style={{width:Math.min(width,Math.max(rowWidth+PAD,head?MIN_HEAD_BOX:0)),...drag?.style}}>
   {drag&&<div className="grip keys-grip" {...drag.handle} role="presentation"><i/></div>}
   <div className="keybox-head">{head}
    <span className="keybox-cog" ref={cogRef}>
     <button type="button" aria-label="Keyboard display options" aria-expanded={cog} title="What the keys show" onClick={()=>setCog(o=>!o)}>⚙</button>
     {cog&&<div className="scale-pop" role="dialog" aria-label="Keyboard display">
      {onLayout&&<>
       <label>Keybed<select value={size} onChange={e=>onLayout('keysSize',e.target.value==='fit'?'fit':Number(e.target.value))}>{KEY_SIZES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
       {hasControls&&<label className="check"><input type="checkbox" checked={controls} onChange={e=>onLayout('keysControls',e.target.checked)}/> Wheel, ribbon and pad</label>}
      </>}
      {[['scale','Scale marks along the keys'],['chord','Chord colours (pick a chord)'],['intervals','Interval names'],['names','Note names']].map(([k,l])=><label key={k} className="check"><input type="checkbox" checked={view[k]} onChange={()=>toggle(k)}/> {l}</label>)}
     </div>}
    </span>
   </div>
   <div className={'stage-row'+(view.intervals?'':' no-intervals')+(view.names?'':' no-names')} style={{'--keys-w':whites*WHITE+'px'}}>
    {shown&&onMod&&<ModWheel onChange={onMod}/>}
    {shown&&left}
    {!full&&<button type="button" className="octave" aria-label="Keys down an octave" disabled={low<=24} onClick={()=>onLow(Math.max(24,low-12))}>−</button>}
    <Piano slide low={start} high={high} scale={view.scale?scale:[]} chord={view.chord?(picked?.pitchClasses??[]):[]} root={picked?picked.pitchClasses[0]:tonic} active={notes} onDown={onDown} onUp={onUp} label="On-screen keyboard"/>
    {!full&&<button type="button" className="octave" aria-label="Keys up an octave" disabled={highFor(start+12,whites)>=108} onClick={()=>onLow(Math.min(84,start+12))}>+</button>}
    {shown&&right&&<div className="stage-right" style={{width:sideR}}>{right}</div>}
   </div>
  </div>
 </div>;
}
