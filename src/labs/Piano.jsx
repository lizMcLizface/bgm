import React from 'react';
import {buildKeyRange,countWhiteKeys} from './piano/keyModel';
import {getIntervalColor,getIntervalLabel} from './piano/intervals';
import './piano.css';
const NAMES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
export const noteName=m=>NAMES[((m%12)+12)%12]+(Math.floor(m/12)-1);
// unCAGED key model, mini-piano white/black geometry and interval colours,
// adapted to React/pointer events instead of its singleton DOM/dispatch bus.
export default function Piano({low=48,high=83,scale=[],chord=[],active=[],root=0,onDown,onUp,mini=false,label='Piano',keyLabels={}}){
 const keys=buildKeyRange(low,high),white=countWhiteKeys(keys),scaleSet=new Set(scale.map(n=>n%12)),chordSet=new Set(chord.map(n=>n%12)),activeSet=new Set(active);let at=0;
 return <div className={'lab-piano '+(mini?'mini':'')} role="group" aria-label={label} style={{'--white-keys':white}}>{keys.map(k=>{const position=k.isBlack?at-.32:at++,interval=(k.pitchClass-root+12)%12,played=activeSet.has(k.midi),isChord=chordSet.has(k.pitchClass),inScale=scaleSet.has(k.pitchClass);return <button type="button" key={k.midi} data-midi={k.midi} aria-label={`${noteName(k.midi)}${isChord?' chord tone':inScale?' scale tone':''}`} aria-pressed={played} tabIndex={mini?-1:0} className={`${k.isBlack?'black':'white'} ${isChord?'chord':inScale?'scale':''} ${played?'held':''}`} style={{left:`${100*position/white}%`,width:`${100*(k.isBlack?.62:1)/white}%`,'--interval':getIntervalColor(interval)}}
 onPointerDown={onDown?e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);onDown('pointer:'+e.pointerId,k.midi,e.pointerType==='pen'&&e.pressure>0?e.pressure:null);}:undefined} onPointerUp={onUp?e=>onUp('pointer:'+e.pointerId):undefined} onPointerCancel={onUp?e=>onUp('pointer:'+e.pointerId):undefined} onLostPointerCapture={onUp?e=>onUp('pointer:'+e.pointerId):undefined}
 onKeyDown={onDown?e=>{if(!e.repeat&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onDown('button:'+k.midi,k.midi);}}:undefined} onKeyUp={onUp?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onUp('button:'+k.midi);}}:undefined}>
 <span>{isChord||inScale?getIntervalLabel(interval):''}</span><small>{mini?'':keyLabels[k.midi]||NAMES[k.pitchClass]}</small></button>;})}</div>;
}
