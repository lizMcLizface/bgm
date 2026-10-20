// Prophet VS parameter table. Ids must match synth-engine/classics/src/vs.rs; the shared space
// effects (ids from 200) come from ../params. The keys are the program fields' own names
// (src/synths/vs/sysex.js `raw`), so a decoded program loads by name. Append-only.
// Row format: see defineParams.
import {defineParams,SPACE} from '../params';
import {DESTINATIONS,LOOPS,LFO_SHAPES} from './sysex';

const ON=['Off','On'];
const OSC=['A','B','C','D'];
const RATES=['1','2','3','4','4A'];
const n=(key,id,label,min,max,def)=>[key,id,label,min,max,def,'n','step'];

export const DESTINATION_KEYS=Object.keys(DESTINATIONS);

export const {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs}=defineParams([
 // oscillators (waves 0–31 user, 32–127 ROM)
 ...OSC.map((x,i)=>n('wave'+x,i,'Wave',0,127,33)),
 ...OSC.map((x,i)=>n('coarse'+x,4+i,'Coarse',0,24,0)),
 ...OSC.map((x,i)=>n('fine'+x,8+i,'Fine',0,99,0)),
 // filter and LFOs
 n('cutoff',12,'Cutoff',0,99,99),n('resonance',13,'Res',0,99,0),n('filterEnvAmount',14,'Env',0,99,0),
 ['lfo1Shape',15,'Shape',0,4,0,'','step',LFO_SHAPES],['lfo2Shape',16,'Shape',0,4,0,'','step',LFO_SHAPES],
 n('lfo1Rate',17,'Rate',0,99,30),n('lfo2Rate',18,'Rate',0,99,30),n('lfo1Amount',19,'Amount',0,99,0),n('lfo2Amount',20,'Amount',0,99,0),
 // amplifier envelope: rates 1, 2, 3, 4, 4A (0 is the fastest, 99 the slowest) and levels 0–3 (levels 4 and 4A are zero)
 ...RATES.map((r,i)=>n('ampRate'+r,21+i,'R'+r,0,99,[0,0,0,29,29][i])),
 ...[0,1,2,3].map(i=>n('ampLevel'+i,26+i,'L'+i,0,99,i?99:0)),
 ['ampLoop',30,'Loop',0,6,0,'','step',LOOPS],n('ampRepeat',31,'Repeat',0,7,0),
 // filter envelope: levels 0–4
 ...RATES.map((r,i)=>n('filterRate'+r,32+i,'R'+r,0,99,[0,0,0,29,29][i])),
 ...[0,1,2,3,4].map(i=>n('filterLevel'+i,37+i,'L'+i,0,99,0)),
 ['filterLoop',42,'Loop',0,6,0,'','step',LOOPS],n('filterRepeat',43,'Repeat',0,7,0),
 // mix envelope: the vector position through five points (X left/right, Y top/bottom)
 ...RATES.map((r,i)=>n('mixRate'+r,44+i,'R'+r,0,99,0)),
 ...[0,1,2,3,4].map(i=>n('mixX'+i,49+i,'X'+i,-64,63,0)),
 ...[0,1,2,3,4].map(i=>n('mixY'+i,54+i,'Y'+i,-64,63,0)),
 ['mixLoop',59,'Loop',0,6,0,'','step',LOOPS],n('mixRepeat',60,'Repeat',0,7,0),
 // modulation matrix: amounts, then the destination switches (bit masks, see DESTINATIONS)
 n('pressureAmount',61,'Pressure',-99,99,0),n('velocityAmount',62,'Velocity',-99,99,0),n('keyboardAmount',63,'Keyboard',-99,99,0),n('filterEnvModAmount',64,'Filter env',-99,99,0),
 n('lfo1Dest',65,'LFO 1 →',0,1023,0),n('lfo2Dest',66,'LFO 2 →',0,1023,0),n('pressureDest',67,'Pressure →',0,32767,0),n('velocityDest',68,'Velocity →',0,31,0),
 n('keyboardDest',69,'Keyboard →',0,15,0),n('filterEnvDest',70,'Filter env →',0,3,0),n('modWheelDest',71,'Wheel →',0,7,0),
 // voice
 n('unison',72,'Unison',0,7,0),n('glide',73,'Glide',0,99,0),n('volume',74,'Volume',0,99,70),
 ...[0,1,2,3,4,5,6,7].map(v=>n('pan'+v,75+v,'Pan '+(v+1),-63,63,0)),
 // additions
 ['raw',83,'Raw waves',0,2,0,'','step',['Clean','Raw','Lo-fi']],
 n('joyX',84,'Joy X',-64,63,0),n('joyY',85,'Joy Y',-64,63,0),
 ['tune',86,'Tune',-100,100,0,'ct','lin'],
 // the chorus is the shared one: the program's own rate and depth are mapped here (not on the panel)
 ...SPACE,
]);

/** The program's raw fields → engine values (the program's field names are the keys). */
export function engineValues(raw){
 const out={};
 for(const p of PARAMS)if(p.id<86&&raw[p.key]!==undefined)out[p.key]=raw[p.key];
 // chorus: both sides on = a stereo chorus; rate 0–99 → 0.1–4 Hz, depth 0–99 → mix
 const on=(raw.chorusSides??3)>0;
 out.chorusMix=on?Math.min(1,.15+(raw.chorusDepth??0)/99*.45):0;
 out.chorusRate=.1*40**((raw.chorusRate??30)/99);
 out.chorusDepth=Math.min(1,(raw.chorusDepth??30)/99);
 out.reverbMix=0;
 return out;
}
