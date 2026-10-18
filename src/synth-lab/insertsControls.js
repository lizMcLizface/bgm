import {INSERTS} from './insertsConfig';
export function drawInsertControls(root,settings,change){
 root.replaceChildren();for(const [id,name,min,max,step]of INSERTS){const wrap=document.createElement('label'),title=document.createElement('span'),number=document.createElement('input'),slider=document.createElement('input');title.textContent=name;number.type='number';number.className='parameter-number';slider.type='range';
  for(const field of [number,slider]){field.min=min;field.max=max;field.step=step;field.value=settings[id];field.ariaLabel=name+(field===slider?' slider':' value');field.dataset.insert=id;}
  const update=field=>{if(field.value===''||!Number.isFinite(Number(field.value)))return;settings[id]=Math.max(min,Math.min(max,step===1?Math.round(Number(field.value)):Number(field.value)));number.value=slider.value=settings[id];change(settings);};number.onchange=()=>update(number);slider.oninput=()=>update(slider);const span=document.createElement('span');span.append(title,number);wrap.append(span,slider);root.append(wrap);
 }
}
export const INSERTS_NOTE='Per-instrument order: saturation → three-band EQ → six-stage phaser → stereo flanger → stereo chorus, before room/echo sends. Amount and parameter edits ramp; bypass fades to dry and clears hidden history. EQ and drive can boost peaks: use output trim for headroom. Subtractive internal chorus is separate, so leave one chorus off unless stacking is intentional.';
