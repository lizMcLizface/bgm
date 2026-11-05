import React,{useMemo} from 'react';
import {algorithmGraph} from './algorithms';

// The selected algorithm as a small signal-flow drawing: modulators above the operators they
// drive, carriers (which reach the output) on the bottom row, a loop on the feedback operator.
// Every algorithm is drawn on the same canvas, sized for the widest and the tallest of the 32, so the display
// keeps its size and the operator boxes keep theirs as the algorithm changes; only the wiring moves.
const W=32,H=20,GX=6,GY=13;
const rowsOf=graph=>{const rows={};for(let op=1;op<=6;op++)(rows[graph.depth[op]]??=[]).push(op);return rows;};
const CANVAS=(()=>{
 let widest=1,levels=0;
 for(let a=0;a<32;a++){const rows=rowsOf(algorithmGraph(a));widest=Math.max(widest,...Object.values(rows).map(r=>r.length));levels=Math.max(levels,...Object.keys(rows).map(Number));}
 return {width:widest*(W+GX)+GX,height:(levels+1)*(H+GY)+GY,levels};
})();

export default function AlgorithmDiagram({algorithm,selected,onSelect}){
 const graph=useMemo(()=>algorithmGraph(algorithm),[algorithm]);
 const {width,height,levels}=CANVAS,rows=rowsOf(graph),at={};
 for(const [d,list] of Object.entries(rows)){
  list.sort((a,b)=>a-b);
  const span=list.length*(W+GX)-GX,left=(width-span)/2;
  // carriers sit on the same bottom row whatever the algorithm, modulators above them
  list.forEach((op,i)=>{at[op]={x:left+i*(W+GX),y:GY/2+(levels-d)*(H+GY)};});
 }
 return <svg className="alg-diagram" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Algorithm ${algorithm+1}`}>
  {graph.edges.map(([from,to],i)=><line key={i} x1={at[from].x+W/2} y1={at[from].y+H} x2={at[to].x+W/2} y2={at[to].y} stroke="currentColor" strokeWidth="1.5" opacity=".7"/>)}
  {graph.carriers.map(op=><line key={'c'+op} x1={at[op].x+W/2} y1={at[op].y+H} x2={at[op].x+W/2} y2={at[op].y+H+GY/2} stroke="currentColor" strokeWidth="1.5" opacity=".7"/>)}
  {graph.feedback.map(op=><path key={'f'+op} d={`M${at[op].x+W} ${at[op].y+H/2} h6 v-${H/2+4} h-${W/2+6} v4`} fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".7"/>)}
  {Object.entries(at).map(([op,{x,y}])=><g key={op} className={'alg-op'+(Number(op)===selected?' on':'')+(graph.carriers.includes(Number(op))?' carrier':'')} onClick={()=>onSelect?.(Number(op))}>
   <rect x={x} y={y} width={W} height={H} rx="4"/><text x={x+W/2} y={y+H/2+4} textAnchor="middle">{op}</text>
  </g>)}
 </svg>;
}
