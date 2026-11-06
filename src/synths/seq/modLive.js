// Shows modulation on the machine's own controls (docs/SEQUENCER_DEVICE_PLAN.md): while a knob is modulated, its slider or knob moves with the live value and glows,
// and the display's encoder and readouts (the OLED values, the BPM number) follow too.
// This is painted straight on the DOM (20 times a second, no React render), so a control that React draws again puts the live position back after it renders
// (holdModulation). A control being held is left alone, so you can still drag the knob's own value. Controls name their parameter in data-mod-key; text that
// shows a value names it in data-mod-text (data-mod-fmt="fixed1" for the BPM number); an encoder's pointer turns with the value.
import {toPosition,formatValue} from '../params';

const live=new Map(); // parameter key -> { p: position 0..1, v: value }
const turn=(el,p)=>{const g=el.querySelector('svg g');if(g)g.setAttribute('transform',`rotate(${-135+270*p} 24 24)`);};
const paint=(el,p)=>{
 if(el.matches(':active'))return;
 if(el.tagName==='INPUT')el.value=String(p);
 if(el.classList.contains('enc-knob'))turn(el,p);
 el.style.setProperty('--p',p);
 el.classList.add('modulated');
};
const release=(el,p)=>{
 if(el.tagName==='INPUT')el.value=String(p);
 if(el.classList.contains('enc-knob'))turn(el,p);
 el.style.setProperty('--p',p);
 el.classList.remove('modulated');
};
const text=(el,spec,value)=>{el.textContent=el.dataset.modFmt==='fixed1'?Number(value).toFixed(1):formatValue(spec,value);};
const controls=(root,key)=>root.querySelectorAll(`[data-mod-key="${key}"]`);
const texts=(root,key)=>root.querySelectorAll(`[data-mod-text="${key}"]`);

/** `out` is the modulated values { key: value }; `spec(key)` the parameter row, `base(key)` the knob's own value (put back when a key leaves `out`). */
export function paintModulation(out,spec,base,root=document){
 for(const key of [...live.keys()]){
  if(key in out)continue;
  live.delete(key);
  const s=spec(key);
  if(!s)continue;
  controls(root,key).forEach(el=>release(el,toPosition(s,base(key))));
  texts(root,key).forEach(el=>text(el,s,base(key)));
 }
 for(const [key,value] of Object.entries(out)){
  const s=spec(key);
  if(!s)continue;
  const p=toPosition(s,value);
  live.set(key,{p,v:value,s});
  controls(root,key).forEach(el=>paint(el,p));
  texts(root,key).forEach(el=>text(el,s,value));
 }
}

/** A control calls this after it renders: React may have put the knob's own value back. */
export function holdModulation(el,key){
 const l=live.get(key);
 if(l&&el)paint(el,l.p);
}
