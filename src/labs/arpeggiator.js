import {startTicker,stopTicker} from '../audio/ticker';
// Reuses unCAGED's sorted-chord traversal and capture/transposition concept,
// with a bounded audio-clock lookahead instead of per-note wall-clock timeouts.
export function arpNotes(notes,{octaves=1,transpose=0,root=null,reference=null}={}){const shift=transpose+(root===null||reference===null?0:root-reference);return [...new Set(Array.from({length:octaves},(_,o)=>notes.map(n=>n+o*12+shift)).flat())].filter(n=>n>=21&&n<=108).sort((a,b)=>a-b);}
export function arpStep(notes,step,mode='up',seed=42){if(!notes.length)return [];if(mode==='chord')return notes;if(notes.length===1)return [notes[0]];let index=step%notes.length;
 if(mode==='down')index=notes.length-1-index;
 if(mode==='upDown'||mode==='downUp'){const t=step%(notes.length*2-2);index=t<notes.length?t:notes.length*2-2-t;if(mode==='downUp')index=notes.length-1-index;}
 if(mode==='random'){let n=(seed+Math.imul(step+1,1664525))>>>0;n^=n>>>16;n=Math.imul(n,2246822507)>>>0;index=n%notes.length;}
 return [notes[index]];
}
export class LabArpeggiator {
 constructor(context,{read,schedule}){this.context=context;this.read=read;this.schedule=schedule;this.step=0;this.running=false;}
 start(){if(this.running)return;this.running=true;this.next=this.context.currentTime+.06;this.step=0;this.timer=startTicker(()=>this.tick(),25);this.visibility=()=>this.tick();document.addEventListener('visibilitychange',this.visibility);this.tick();}
 tick(){if(!this.running)return;const now=this.context.currentTime;if(this.next<now-.1)this.next=now+.03;const hidden=document.visibilityState==='hidden',settings=this.read(this.next),interval=60/settings.bpm*settings.rate;
  // Bound both the hidden window and queued note pairs (including large chords).
  const voices=settings.mode==='chord'?Math.max(1,arpNotes(settings.notes,settings).length):1;
  const ahead=hidden?Math.max(.12,Math.min(4,512*interval*(1-settings.swing)/voices)):.12;
  const started=performance.now();let count=0;while(this.next<now+ahead&&count++<256){if(this.next>now+.5&&performance.now()-started>8)break;const c=this.read(this.next),interval=60/c.bpm*c.rate,span=interval*(1+(this.step%2?-c.swing:c.swing)),notes=arpNotes(c.notes,c);for(const midi of arpStep(notes,this.step,c.mode,c.seed))this.schedule(midi,this.next,Math.max(.02,span*c.gate),Math.min(1,c.velocity*(this.step%4===0?1:.85)));this.next+=span;this.step++;}}
 stop(){this.running=false;if(this.timer)stopTicker(this.timer);this.timer=null;document.removeEventListener('visibilitychange',this.visibility);}
}
