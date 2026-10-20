import React,{useRef} from 'react';

// The vector joystick as a diamond: A at the left, B at the top, C at the right, D at the bottom.
// The numbered dots are the mix envelope's five points; the ring is the live joystick. Dragging
// moves the joystick, which adds to the envelope's position; it springs back to the centre on
// release unless "Hold" is on.
const R=63;
const toPad=(x,y)=>[(x+64)/127*100,(y+64)/127*100];

export default function VectorPad({values,onJoy,hold,onHold}){
 const svg=useRef(null);
 const points=[0,1,2,3,4].map(i=>[values['mixX'+i],values['mixY'+i]]);
 const joy=[values.joyX,values.joyY];
 const move=e=>{
  const box=svg.current.getBoundingClientRect();
  const x=Math.max(-64,Math.min(63,((e.clientX-box.left)/box.width)*127-64)),y=Math.max(-64,Math.min(63,((e.clientY-box.top)/box.height)*127-64));
  // the diamond's edge: keep the stick inside it
  const over=(Math.abs(x)+Math.abs(y))/R;
  onJoy(Math.round(over>1?x/over:x),Math.round(over>1?y/over:y));
 };
 const down=e=>{svg.current.setPointerCapture(e.pointerId);move(e);};
 const up=()=>{if(!hold)onJoy(0,0);};
 const [jx,jy]=toPad(...joy);
 return <div className="vector-pad">
  <svg ref={svg} viewBox="0 0 100 100" role="application" aria-label="Vector joystick" onPointerDown={down} onPointerMove={e=>e.buttons&&move(e)} onPointerUp={up} onPointerCancel={up}>
   <polygon points="50,0 100,50 50,100 0,50" className="vp-diamond"/>
   <line x1="0" y1="50" x2="100" y2="50" className="vp-axis"/><line x1="50" y1="0" x2="50" y2="100" className="vp-axis"/>
   {['A','B','C','D'].map((c,i)=>{const [x,y]=[[8,50],[50,9],[92,50],[50,95]][i];return <text key={c} x={x} y={y+3} textAnchor="middle" className="vp-corner">{c}</text>;})}
   <polyline points={points.map(p=>toPad(...p).join(',')).join(' ')} className="vp-path"/>
   {points.map((p,i)=>{const [x,y]=toPad(...p);return <g key={i}><circle cx={x} cy={y} r="3.2" className="vp-point"/><text x={x} y={y+1.2} textAnchor="middle" className="vp-n">{i}</text></g>;})}
   <circle cx={jx} cy={jy} r="5" className="vp-joy"/>
  </svg>
  <label className="toggle"><input type="checkbox" checked={hold} onChange={e=>onHold(e.target.checked)}/> Hold</label>
 </div>;
}
