// Shows modulation on the machine's own controls (docs/SEQUENCER_DEVICE_PLAN.md): while a knob is modulated, its slider or knob moves with the live value and glows.
// This is painted straight on the DOM (20 times a second, no React render), so a control that React draws again puts the live position back after it renders
// (holdModulation). A control being held is left alone, so you can still drag the knob's own value. Controls name their parameter in data-mod-key.
import {toPosition} from '../params';

const live=new Map(); // parameter key -> the position (0..1) it is shown at
const paint=(el,p)=>{
 if(el.matches(':active'))return;
 if(el.tagName==='INPUT')el.value=String(p);
 el.style.setProperty('--p',p);
 el.classList.add('modulated');
};
const release=(el,p)=>{
 if(el.tagName==='INPUT')el.value=String(p);
 el.style.setProperty('--p',p);
 el.classList.remove('modulated');
};
const controls=(root,key)=>root.querySelectorAll(`[data-mod-key="${key}"]`);

/** `out` is the modulated values { key: value }; `spec(key)` the parameter row, `base(key)` the knob's own value (put back when a key leaves `out`). */
export function paintModulation(out,spec,base,root=document){
 for(const key of [...live.keys()]){
  if(key in out)continue;
  live.delete(key);
  const s=spec(key);
  if(s)controls(root,key).forEach(el=>release(el,toPosition(s,base(key))));
 }
 for(const [key,value] of Object.entries(out)){
  const s=spec(key);
  if(!s)continue;
  const p=toPosition(s,value);
  live.set(key,p);
  controls(root,key).forEach(el=>paint(el,p));
 }
}

/** A control calls this after it renders: React may have put the knob's own value back. */
export function holdModulation(el,key){
 const p=live.get(key);
 if(p!==undefined&&el)paint(el,p);
}
