import {cleanExpression,pitchMotionCents} from '../app/engine/noteExpression';
export function noteEvents(notes,rate){return notes.flatMap((n,i)=>{
 const id=i+1,start=n.time,e=cleanExpression(n.expression),duration=n.duration*(e?.gateScale??1),detune=(n.detune||0)/100,from=e?.slideFromMidi??n.midi;
 let path=[{time:0,midi:from},...(e?.pitchTargets?.filter(p=>p.time>0&&p.time<=duration)??[])];
 if(path.length===1&&from!==n.midi)path.push({time:Math.min(duration,e.slideSeconds),midi:n.midi});
 const baseAt=t=>{let a=path[0];for(const b of path.slice(1)){if(t<=b.time){const u=(t-a.time)/(b.time-a.time),s=u*u*(3-2*u);return a.midi+(b.midi-a.midi)*s;}a=b;}return a.midi;};
 if(e?.pitchMotion){const end=Math.min(30,duration);path=Array.from({length:Math.ceil(end*12)+1},(_,j)=>{const time=Math.min(end,j/12);return {time,midi:baseAt(time)+pitchMotionCents(e.pitchMotion,time)/100};});}
 return [[0,id,Math.round(start*rate),path[0].midi+detune,n.velocity],[1,id,Math.round((start+duration)*rate),0,0],...path.slice(1).map((p,j)=>[5,id,Math.round((start+path[j].time)*rate),p.midi+detune,p.time-path[j].time])];
});}
