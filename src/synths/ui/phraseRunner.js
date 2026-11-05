// Plays the audition phrases (src/app/auditionPhrases.js) on a synth page through its
// Performer, on timers: the page's engine takes notes as they happen. A new phrase
// replaces the one playing. The phrases play over the key and chords the main page last
// showed (A minor, Am F C G until it has), so a sound is heard in the music it is for.
// A page can add phrases of its own with `extra`: { id: context => { events, seconds, pedals, loop } }, notes in seconds like the
// audition phrases, so they play, pause and light their button the same way (the piano's test lines are these).
// A performer may have `sustain(on)` for pedal changes, and `prepare(events)`, which may return a promise, to have its notes ready first.
import {phraseEvents,phraseSeconds,recalledContext} from '../../app/auditionPhrases';

export const PHRASE_KEYS=['Digit1','Digit2','Digit3','Digit4','Digit5'];
export const PHRASE_IDS=['bass-short','bass-slow','pad','arp','lead'];

/** The phrase id for a key event's code (Digit1-5 or Numpad1-5), or null. */
export const phraseForCode=code=>{const i=PHRASE_KEYS.indexOf(code.replace('Numpad','Digit'));return i<0?null:PHRASE_IDS[i];};

// A phrase repeats until it is stopped (loop), so the notes keep playing while its button is held down.
export function createPhraseRunner(performer,{setTimer=setTimeout,clearTimer=clearTimeout,context=recalledContext,onState=()=>{},loop=true,extra={}}={}){
 let timers=[],keys=[],token=0,pedalDown=false;
 const stop=()=>{
  token++;timers.forEach(clearTimer);timers=[];keys.forEach(k=>performer.up(k));keys=[];
  if(pedalDown){performer.sustain?.(false);pedalDown=false;}
  onState(null);
 };
 const source=(id,ctx)=>extra[id]?{loop:false,pedals:[],...extra[id](ctx)}:{events:phraseEvents(id,ctx),seconds:phraseSeconds(id,ctx),pedals:[],loop};
 const play=id=>{
  stop();
  const ctx=context(),src=source(id,ctx),mine=token;onState(id);
  const go=()=>{
   if(mine!==token)return;
   timers.push(setTimer(()=>{if(src.loop)play(id);else{if(pedalDown){performer.sustain?.(false);pedalDown=false;}onState(null);}},src.seconds*1000));
   src.events.forEach(({midi,time,duration,velocity},i)=>{
    const key='phrase:'+i;
    timers.push(setTimer(()=>{performer.down(key,midi,velocity);keys.push(key);},time*1000));
    timers.push(setTimer(()=>{performer.up(key);keys=keys.filter(k=>k!==key);},(time+duration)*1000));
   });
   for(const {time,on} of src.pedals)timers.push(setTimer(()=>{performer.sustain?.(on);pedalDown=on;},time*1000));
  };
  const ready=performer.prepare?.(src.events);
  if(ready&&typeof ready.then==='function')ready.then(go);else go();
 };
 return {play,stop};
}
