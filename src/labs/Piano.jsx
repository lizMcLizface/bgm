import React from 'react';
import {buildKeyRange,countWhiteKeys} from './piano/keyModel';
import {getIntervalColor,getIntervalLabel} from './piano/intervals';
import './piano.css';
const NAMES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
// A key's paint: a plain colour, or {color, ahead} for a key filling from the bottom (a note about to sound).
const keyPaint=(c,black)=>c&&typeof c==='object'?`linear-gradient(to top, ${c.color} ${c.ahead*100}%, ${black?'#282d35':'#e7e7e3'} ${c.ahead*100}%)`:c;
export const noteName=m=>NAMES[((m%12)+12)%12]+(Math.floor(m/12)-1);
// unCAGED key model, mini-piano white/black geometry and interval colours,
// adapted to React/pointer events instead of its singleton DOM/dispatch bus.
export default function Piano({low=48,high=83,scale=[],chord=[],active=[],root=0,onDown,onUp,mini=false,label='Piano',keyLabels={},colors,slide=false}){
 // slide: fingers play across keys (and nearer a key's front edge is louder); the container, not each key, takes the pointer
 const fingers=React.useRef(new Map());
 const hit=e=>{const el=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-midi]');if(!el)return null;const r=el.getBoundingClientRect();return {midi:Number(el.dataset.midi),velocity:.3+.7*Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))};};
 const slideDown=e=>{if(e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);const h=hit(e);if(!h)return;fingers.current.set(e.pointerId,h.midi);onDown('touch:'+e.pointerId,h.midi,e.pointerType==='pen'&&e.pressure>0?e.pressure:h.velocity);};
 const slideMove=e=>{if(!fingers.current.has(e.pointerId))return;const h=hit(e);if(h&&h.midi!==fingers.current.get(e.pointerId)){fingers.current.set(e.pointerId,h.midi);onDown('touch:'+e.pointerId,h.midi,h.velocity);}};
 const slideUp=e=>{if(!fingers.current.has(e.pointerId))return;fingers.current.delete(e.pointerId);onUp?.('touch:'+e.pointerId);};
 const keys=buildKeyRange(low,high),white=countWhiteKeys(keys),scaleSet=new Set(scale.map(n=>n%12)),chordSet=new Set(chord.map(n=>n%12)),activeSet=new Set(active);let at=0;
 return <div className={'lab-piano '+(mini?'mini':'')} role="group" aria-label={label} style={{'--white-keys':white}} {...(slide&&onDown?{onPointerDown:slideDown,onPointerMove:slideMove,onPointerUp:slideUp,onPointerCancel:slideUp,onLostPointerCapture:slideUp}:{})}>{keys.map(k=>{const position=k.isBlack?at-.32:at++,interval=(k.pitchClass-root+12)%12,played=activeSet.has(k.midi),isChord=chordSet.has(k.pitchClass),inScale=scaleSet.has(k.pitchClass);return <button type="button" key={k.midi} data-midi={k.midi} aria-label={`${noteName(k.midi)}${isChord?' chord tone':inScale?' scale tone':''}`} aria-pressed={played} tabIndex={mini?-1:0} className={`${k.isBlack?'black':'white'} ${isChord?'chord':inScale?'scale':''} ${played?'held':''}`} style={{left:`${100*position/white}%`,width:`${100*(k.isBlack?.62:1)/white}%`,'--interval':keyPaint(colors?.[k.pitchClass],k.isBlack)??getIntervalColor(interval)}}
 onPointerDown={onDown&&!slide?e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);onDown('pointer:'+e.pointerId,k.midi,e.pointerType==='pen'&&e.pressure>0?e.pressure:null);}:undefined} onPointerUp={onUp&&!slide?e=>onUp('pointer:'+e.pointerId):undefined} onPointerCancel={onUp&&!slide?e=>onUp('pointer:'+e.pointerId):undefined} onLostPointerCapture={onUp&&!slide?e=>onUp('pointer:'+e.pointerId):undefined}
 onKeyDown={onDown?e=>{if(!e.repeat&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onDown('button:'+k.midi,k.midi);}}:undefined} onKeyUp={onUp?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onUp('button:'+k.midi);}}:undefined}>
 <span>{isChord||inScale?getIntervalLabel(interval):''}</span><small>{mini?'':keyLabels[k.midi]||NAMES[k.pitchClass]}</small></button>;})}</div>;
}
