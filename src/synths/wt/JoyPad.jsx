import React,{useRef,useEffect} from 'react';

// The joystick as a diamond: wave A at the left, B at the top, C at the right, D at the bottom (the Prophet VS's diamond, with a continuous
// position). The diamond is drawn smaller than the field, which reaches half as far again past its edges: the vector envelope, the LFOs and the
// routes can push the position beyond the joystick's range, and the engine reports it (held to that outer limit) so it is seen wandering outside
// before it is clamped for the sound. Dragging sets the resting position, kept inside the diamond. Every sounding voice draws the path it has just
// taken, in its own colour, ending in a dot.
const REACH=1.5,K=50/REACH; // the field's half-width in joystick units, and the pad units per joystick unit
const toPad=(x,y)=>[50+x*K,50-y*K];
const COLOURS=['#4ec4b4','#e3a52a','#a07fd6','#e0573d','#5b8fd9','#5fae7a','#f0cf8a','#e48fc5'];
const VOICES=8,TRACE=64,WIDTH=2+2*TRACE;
export default function JoyPad({x,y,onChange,liveRef}){
 const svg=useRef(null),paths=useRef([]),dots=useRef([]);
 // the paths arrive about thirty times a second (a voice: sounding, the next slot, then 64 positions about 1.3 ms apart) and are drawn straight on the
 // shapes, without rendering the page
 useEffect(()=>{
  if(!liveRef)return undefined;
  liveRef.current=data=>{
   const t=data?.trace;
   for(let v=0;v<VOICES;v++){
    const line=paths.current[v],dot=dots.current[v];if(!line||!dot)continue;
    const base=v*WIDTH;
    if(!t||t[base]<.5){line.style.opacity=0;dot.style.opacity=0;continue;}
    const head=t[base+1]|0;let pts='',cx=0,cy=0;
    for(let k=0;k<TRACE;k++){
     const i=(head+k)%TRACE,[px,py]=toPad(t[base+2+2*i],t[base+3+2*i]);
     pts+=`${px.toFixed(1)},${py.toFixed(1)} `;cx=px;cy=py;
    }
    line.setAttribute('points',pts);line.style.opacity=.85;
    dot.setAttribute('cx',cx);dot.setAttribute('cy',cy);dot.style.opacity=1;
   }
  };
  return ()=>{liveRef.current=null;};
 },[liveRef]);
 const move=e=>{
  const box=svg.current.getBoundingClientRect();
  const px=(((e.clientX-box.left)/box.width)*2-1)*REACH,py=(1-((e.clientY-box.top)/box.height)*2)*REACH;
  // inside the diamond: the sum and the difference of the axes are each held to one, as the engine does
  const s=Math.max(-1,Math.min(1,px+py)),t=Math.max(-1,Math.min(1,px-py));
  onChange(+((s+t)/2).toFixed(3),+((s-t)/2).toFixed(3));
 };
 // preventDefault: dragging across the page must not start a text selection
 const down=e=>{e.preventDefault();svg.current.setPointerCapture(e.pointerId);move(e);};
 const [jx,jy]=toPad(x,y);
 return <div className="vector-pad">
  <svg ref={svg} data-desk-item viewBox="0 0 100 100" role="application" aria-label="Joystick" onPointerDown={down} onPointerMove={e=>e.buttons&&move(e)}>
   <polygon points="0.00,50.00 50.00,0.00 100.00,50.00 50.00,100.00" className="vp-field"/>
   <polygon points="16.67,50.00 50.00,16.67 83.33,50.00 50.00,83.33" className="vp-diamond"/>
   <line x1={50-K} y1="50" x2={50+K} y2="50" className="vp-axis"/><line x1="50" y1={50-K} x2="50" y2={50+K} className="vp-axis"/>
   {['A','B','C','D'].map((c,i)=>{const [cx,cy]=[[50-K-6,53],[50,50-K-3],[50+K+6,53],[50,50+K+9]][i];return <text key={c} x={cx} y={cy} textAnchor="middle" className="vp-corner">{c}</text>;})}
   {COLOURS.map((c,v)=><g key={v} style={{'--voice':c}}>
    <polyline ref={el=>{paths.current[v]=el;}} points="" className="vp-trace" style={{opacity:0}}/>
    <circle ref={el=>{dots.current[v]=el;}} cx="50" cy="50" r="2.6" className="vp-live" style={{opacity:0}}/>
   </g>)}
   <circle cx={jx} cy={jy} r="5" className="vp-joy"/>
  </svg>
 </div>;
}
