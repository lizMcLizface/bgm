import React from 'react';

// Small hand-drawn rack companions, kept as SVG so they stay crisp on tablets.
export default function RackGraphic({kind,on=true}){
 const face=(x,y)=><g className="rack-face"><circle cx={x-5} cy={y} r="1.8"/><circle cx={x+5} cy={y} r="1.8"/><path d={`M${x-3} ${y+5}q3 3 6 0`} fill="none"/></g>;
 return <svg className={'rack-graphic '+(on?'on':'')} viewBox="0 0 100 76" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  {kind==='saturation'&&<><path d="M28 62V30Q14 15 31 11Q50 3 69 11Q86 15 72 30V62Z" fill="currentColor" fillOpacity=".12"/><path d="M24 65h52M37 30q-5 8 0 13m13-16q-5 8 0 13m13-10q-5 8 0 13"/>{face(50,48)}<path d="M13 43l-6 7m80-7 6 7"/></>}
  {kind==='eq'&&<><path d="M9 61h82M18 61V42m32 19V23m31 38V34"/><path d="M7 40q12-15 23 0t21-10 22 3 20-8"/><circle cx="18" cy="42" r="5" fill="var(--rack-bg)"/><circle cx="50" cy="23" r="5" fill="var(--rack-bg)"/><circle cx="81" cy="34" r="5" fill="var(--rack-bg)"/>{face(50,49)}</>}
  {kind==='compressor'&&<><path d="M21 15h58M21 61h58m-29-58v8m-4-4 4 4 4-4m-4 66v-8m-4 4 4-4 4 4"/><path d="M29 45Q18 26 37 28Q50 13 64 28Q84 27 72 46Q66 57 50 52Q32 57 29 45Z" fill="currentColor" fillOpacity=".12"/>{face(50,37)}</>}
  {kind==='phaser'&&<><ellipse className="rack-orbit" cx="50" cy="38" rx="40" ry="15" transform="rotate(-25 50 38)"/><circle cx="50" cy="38" r="21" fill="var(--rack-bg)"/><path d="M39 24q-9 11 0 24"/>{face(54,35)}<circle cx="81" cy="19" r="5" fill="currentColor"/><path d="M15 15v7m-3-4h6"/></>}
  {kind==='flanger'&&<><path d="M8 55Q32 76 48 43T92 25M8 25Q32 4 48 37T92 55" opacity=".6"/><path className="rack-float" d="m31 37 21-22 18 8-5 27-17 8-3-13Z" fill="var(--rack-bg)"/><circle cx="55" cy="32" r="5"/><path d="m35 48-8 9m13-6-7 10m-5-19-7 7"/></>}
  {kind==='chorus'&&<>{[25,50,75].map((x,i)=><g className="rack-float" style={{animationDelay:`${i*-.5}s`}} key={x}><path d={`M${x-12} 53V${27+i%2*7}q12-21 24 0V53l-6-5-6 5-6-5Z`} fill="var(--rack-bg)"/>{face(x,34+i%2*7)}</g>)}<path d="M12 14v8m0-4 7-2v-7m62 3v8m0-4 7-2v-7"/></>}
  {kind==='delay'&&<><path d="M9 58q20-65 40 0t40-12" strokeDasharray="3 5"/><circle className="rack-float" cx="29" cy="25" r="12" fill="var(--rack-bg)"/>{face(29,23)}<circle cx="66" cy="54" r="9"/><path d="m65 32 9-4m-7-1 7 1-3 6M12 65h24m24 0h28"/></>}
  {(kind==='reverb'||kind==='instrument')&&<><path d="M18 61V31L50 9l32 22v30Z" fill="currentColor" fillOpacity=".08"/><path d="M34 61V33q16-22 32 0v28M22 64h56"/><path d="M43 52q7-9 14 0m-18-8q11-14 22 0m-26-9q15-17 30 0"/><path className="rack-float" d="m80 8 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/></>}
  {kind==='master'&&<><rect x="23" y="9" width="54" height="58" rx="9" fill="currentColor" fillOpacity=".08"/><circle cx="50" cy="46" r="15"/>{face(50,43)}<circle cx="50" cy="22" r="5"/><path d="m12 32-5 5 5 5m76-10 5 5-5 5"/></>}
 </svg>;
}
