// Follows an external MIDI clock (24 pulses per quarter note) and its start, continue and stop
// messages. The engine keeps its own sample-accurate clock; this only steers its tempo, so a
// jittery MIDI link never makes the groove stumble.
export function createClockSync({enabled,onTempo,onStart,onStop}){
 let ticks=[],count=0;
 return status=>{
  if(!enabled())return;
  if(status===0xF8){
   const now=performance.now();ticks.push(now);if(ticks.length>49)ticks.shift();
   if(ticks.length===49&&++count%24===0){
    const bpm=Math.round(60000*48/(now-ticks[0])*10)/10;
    if(bpm>=30&&bpm<=300)onTempo(bpm);
   }
  }else if(status===0xFA){ticks=[];count=0;onStart(true);}
  else if(status===0xFB)onStart(false);
  else if(status===0xFC)onStop();
 };
}
