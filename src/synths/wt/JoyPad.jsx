import React,{useRef} from 'react';

// The joystick as a diamond: wave A at the left, B at the top, C at the right, D at the bottom (the same diamond as the
// Prophet VS, with a continuous position). Dragging sets the resting position; the vector envelope and the LFOs add to it.
export default function JoyPad({x,y,onChange}){
 const svg=useRef(null);
 const move=e=>{
  const box=svg.current.getBoundingClientRect();
  let px=((e.clientX-box.left)/box.width)*2-1,py=1-((e.clientY-box.top)/box.height)*2;
  // keep the stick inside the diamond
  const over=Math.abs(px)+Math.abs(py);
  if(over>1){px/=over;py/=over;}
  onChange(Math.max(-1,Math.min(1,+px.toFixed(3))),Math.max(-1,Math.min(1,+py.toFixed(3))));
 };
 const down=e=>{svg.current.setPointerCapture(e.pointerId);move(e);};
 const jx=50+x*50,jy=50-y*50;
 return <div className="vector-pad">
  <svg ref={svg} viewBox="0 0 100 100" role="application" aria-label="Joystick" onPointerDown={down} onPointerMove={e=>e.buttons&&move(e)}>
   <polygon points="50,0 100,50 50,100 0,50" className="vp-diamond"/>
   <line x1="0" y1="50" x2="100" y2="50" className="vp-axis"/><line x1="50" y1="0" x2="50" y2="100" className="vp-axis"/>
   {['A','B','C','D'].map((c,i)=>{const [cx,cy]=[[8,50],[50,9],[92,50],[50,95]][i];return <text key={c} x={cx} y={cy+3} textAnchor="middle" className="vp-corner">{c}</text>;})}
   <circle cx={jx} cy={jy} r="5" className="vp-joy"/>
  </svg>
 </div>;
}
