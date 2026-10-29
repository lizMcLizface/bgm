// Plays the audition phrases (src/app/auditionPhrases.js) on a synth page through its
// Performer, on timers: the page's engine takes notes as they happen. A new phrase
// replaces the one playing. The phrases play over the key and chords the main page last
// showed (A minor, Am F C G until it has), so a sound is heard in the music it is for.
import {phraseEvents,phraseSeconds,recalledContext} from '../../app/auditionPhrases';

export const PHRASE_KEYS=['Digit1','Digit2','Digit3','Digit4','Digit5'];
export const PHRASE_IDS=['bass-short','bass-slow','pad','arp','lead'];

/** The phrase id for a key event's code (Digit1-5 or Numpad1-5), or null. */
export const phraseForCode=code=>{const i=PHRASE_KEYS.indexOf(code.replace('Numpad','Digit'));return i<0?null:PHRASE_IDS[i];};

export function createPhraseRunner(performer,{setTimer=setTimeout,clearTimer=clearTimeout,context=recalledContext,onState=()=>{}}={}){
 let timers=[],keys=[];
 const stop=()=>{timers.forEach(clearTimer);timers=[];keys.forEach(k=>performer.up(k));keys=[];onState(null);};
 const play=id=>{
  stop();
  const ctx=context();onState(id);
  timers.push(setTimer(()=>onState(null),phraseSeconds(id,ctx)*1000));
  phraseEvents(id,ctx).forEach(({midi,time,duration,velocity},i)=>{
   const key='phrase:'+i;
   timers.push(setTimer(()=>{performer.down(key,midi,velocity);keys.push(key);},time*1000));
   timers.push(setTimer(()=>{performer.up(key);keys=keys.filter(k=>k!==key);},(time+duration)*1000));
  });
 };
 return {play,stop};
}
