// Factory sounds: original voices in the DX7 idiom, not copies of Yamaha's cartridges (those load
// on the "Cartridge" shelf from a .syx file). Each is built from per-operator settings.
import {sanitize} from './params';

const FIELDS=['r1','r2','r3','r4','l1','l2','l3','l4'];
/** Operator settings: eg [R1..R4, L1..L4], plus level, ratio (coarse/fine), detune, velocity sensitivity, mode. */
function operators(ops){
 const out={};
 ops.forEach((o,i)=>{
  const n=i+1,k=f=>`op${n}.${f}`;
  const eg=o.eg??[99,99,99,99,99,99,99,0];
  FIELDS.forEach((f,j)=>{out[k(f)]=eg[j];});
  out[k('level')]=o.level??0;out[k('coarse')]=o.coarse??1;out[k('fine')]=o.fine??0;out[k('detune')]=7+(o.detune??0);
  out[k('velocity')]=o.vel??0;out[k('mode')]=o.fixed?1:0;out[k('ams')]=o.ams??0;out[k('rateScale')]=o.rs??0;
  out[k('leftDepth')]=o.ld??0;out[k('rightDepth')]=o.rd??0;out[k('leftCurve')]=o.lc??0;out[k('rightCurve')]=o.rc??3;
 });
 return out;
}
const voice=(alg,fb,ops,extra={})=>({algorithm:alg-1,feedback:fb,...operators(ops),...extra});
const ORGAN=[99,99,99,99,99,99,99,0];

const RAW=[
 {name:'Tine Piano',colour:'#d98b4a',note:'Algorithm 5 as three two-operator stacks: a bright tine on top of a mellow body.',values:voice(5,6,[
  {level:99,eg:[95,29,20,50,99,95,0,0],vel:2,rd:19,rc:3},{level:58,coarse:14,eg:[95,50,35,78,99,75,0,0],vel:6},
  {level:99,detune:-3,eg:[95,29,20,50,99,95,0,0],vel:2},{level:80,eg:[95,50,22,45,99,85,0,0],vel:5},
  {level:99,detune:3,eg:[95,20,20,50,99,92,0,0],vel:2},{level:75,eg:[98,70,50,45,99,92,0,0],vel:4},
 ],{pitchModSens:3,lfoSpeed:30,volume:.6,reverbMix:.2})},
 {name:'Glass Bells',colour:'#a7c4d9',note:'Inharmonic ratios on a long decay.',values:voice(5,0,[
  {level:99,eg:[99,40,35,40,99,90,0,0]},{level:70,coarse:3,fine:50,eg:[99,50,40,40,99,80,0,0]},
  {level:90,coarse:3,fine:50,eg:[99,30,28,35,99,88,0,0]},{level:60,coarse:7,eg:[99,55,45,40,99,70,0,0]},
  {level:85,coarse:2,eg:[99,25,25,35,99,85,0,0]},{level:50,coarse:11,eg:[99,60,45,50,99,60,0,0]},
 ],{volume:.7,reverbMix:.4,reverbDecay:6})},
 {name:'Slap Bass',colour:'#3f6b4f',note:'Half-speed carriers with a hard, fast modulator: a plucked bass.',values:voice(5,5,[
  {level:99,coarse:0,eg:[99,55,25,60,99,80,0,0],vel:3},{level:78,coarse:1,eg:[99,70,30,60,99,50,0,0],vel:6},
  {level:92,coarse:1,eg:[99,50,25,60,99,82,0,0],vel:2},{level:70,coarse:1,eg:[99,75,30,60,99,40,0,0],vel:5},
  {level:0},{level:0},
 ],{volume:.95,reverbMix:.05})},
 {name:'Marimba',colour:'#c8452b',note:'A short, woody strike: a fourth-harmonic-ish partial that dies at once.',values:voice(5,3,[
  {level:99,eg:[99,45,35,70,99,70,0,0],vel:3},{level:70,coarse:4,eg:[99,70,45,70,99,35,0,0],vel:6},
  {level:80,coarse:4,eg:[99,50,40,70,99,55,0,0],vel:3},{level:55,coarse:10,eg:[99,80,50,70,99,20,0,0],vel:6},
  {level:0},{level:0},
 ],{volume:1,reverbMix:.2})},
 {name:'Clav',colour:'#f3d38a',note:'Feedback gives the bite; everything decays fast.',values:voice(5,7,[
  {level:99,eg:[99,60,40,60,99,75,0,0],vel:3},{level:82,eg:[99,75,40,60,99,55,0,0],vel:6},
  {level:90,coarse:2,eg:[99,55,40,60,99,60,0,0],vel:3},{level:70,coarse:2,eg:[99,75,40,60,99,35,0,0],vel:5},
  {level:0},{level:0},
 ],{volume:1,reverbMix:.1})},
 {name:'Drawbar Organ',colour:'#8a8f98',note:'Six sine carriers at organ footages (algorithm 32); the envelope is a gate.',values:voice(32,0,[
  {level:95,coarse:0,eg:ORGAN},{level:85,eg:ORGAN},{level:75,coarse:2,eg:ORGAN},{level:60,coarse:3,eg:ORGAN},{level:55,coarse:4,eg:ORGAN},{level:50,coarse:6,eg:ORGAN},
 ].map(o=>({...o,eg:[99,99,99,70,99,99,99,0]})),{volume:.55,reverbMix:.25})},
 {name:'Soft Pad',colour:'#7fd0c8',note:'Slow attack and long release; detuned stacks and a touch of vibrato.',values:voice(5,3,[
  {level:95,detune:-3,eg:[40,40,60,35,99,95,90,0]},{level:60,eg:[45,40,60,35,99,90,85,0]},
  {level:95,detune:3,eg:[38,40,60,35,99,95,90,0]},{level:55,coarse:2,eg:[45,40,60,35,99,88,80,0]},
  {level:90,detune:6,coarse:1,eg:[42,40,60,35,99,95,90,0]},{level:50,coarse:3,eg:[48,40,60,35,99,85,78,0]},
 ],{lfoSpeed:28,lfoDelay:40,pitchModDepth:12,pitchModSens:2,volume:.75,reverbMix:.4,reverbDecay:5})},
 {name:'Reed Lead',colour:'#9b7fd1',note:'Algorithm 5, strong feedback, a sustaining envelope; the mod wheel adds vibrato.',values:voice(5,7,[
  {level:99,eg:[75,60,50,45,99,95,92,0],vel:2},{level:72,eg:[78,60,50,45,99,90,88,0],vel:5},
  {level:0},{level:0},{level:0},{level:0},
 ],{lfoSpeed:42,lfoDelay:25,pitchModSens:4,modWheel:70,volume:1,reverbMix:.2,mono:1,portamento:25})},
 {name:'Init Voice',colour:'#c9c3b4',note:'A single sine: the DX7\'s own starting point.',values:voice(32,0,[
  {level:99,eg:ORGAN},{level:0},{level:0},{level:0},{level:0},{level:0},
 ],{volume:.5})},
];

export const PRESETS=RAW.map(p=>({...p,values:sanitize(p.values)}));
