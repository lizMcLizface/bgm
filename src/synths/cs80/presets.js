// Factory sounds: original patches in the CS-80 idiom, not copies of its ROM
// presets or of any recording. Each is a set of overrides on the defaults.
import {sanitize,CHANNEL_KEYS} from './params';

const ch=(prefix,values)=>Object.fromEntries(Object.entries(values).map(([k,v])=>[prefix+'.'+k,v]));
const both=values=>({...ch('i',values),...ch('ii',values)});

const RAW=[
 {name:'Rain Brass',colour:'#c8452b',note:'Slow-swelling brass. Lean in with aftertouch or the pad for brightness and vibrato.',values:{
  ...both({saw:1,square:0,hpf:30,lpf:420,lpRes:.22,il:-.1,al:.62,fa:.32,fd:2.2,fr:1.4,a:.16,d:2.5,s:.9,r:1.3,level:.85,initBrill:.35,initLevel:.45,afterBrill:.45,afterLevel:.35,keytrack:.7}),
  'ii.square':.35,'ii.pw':.42,'ii.pwm':.25,'ii.pwmRate':.4,'ii.lpf':520,'ii.fa':.45,
  detune:9,subRate:5.2,atVibrato:.35,subDelay:1.2,subVco:.08,drift:.5,width:.55,volume:.65,
  chorusMix:.15,reverbMix:.38,reverbDecay:6.5,reverbTone:5200,reverbSize:.8}},
 {name:'Replicant Lead',colour:'#e0a526',note:'A singing lead. Bend with the ribbon and press for vibrato; portamento ties the phrase together.',values:{
  ...both({hpf:60,lpf:900,lpRes:.3,il:0,al:.45,fa:.18,fd:1.6,fr:.9,a:.06,d:1.5,s:.95,r:.9,initBrill:.4,initLevel:.4,afterBrill:.5,afterLevel:.3,keytrack:.8}),
  'i.saw':1,'ii.saw':0,'ii.square':.6,'ii.pw':.3,'ii.sine':.35,'ii.feet':1,
  detune:4,portamento:.09,subRate:5.6,subDelay:.6,subVco:.12,atVibrato:.55,atPitch:.15,
  voices:6,drift:.45,width:.35,chorusMix:.1,reverbMix:.42,reverbDecay:7,reverbSize:.85,volume:.56}},
 {name:'Velvet Strings',colour:'#5b8fd9',note:'Wide, slow strings from two pulse-width-modulated channels.',values:{
  ...both({saw:.55,square:.7,pw:.5,pwm:.55,hpf:110,hpRes:.1,lpf:3200,lpRes:.08,il:0,al:.12,fa:.6,fd:3,fr:2,a:.55,d:3,s:.92,r:1.8,initBrill:.2,initLevel:.35,afterBrill:.3,afterLevel:.25,keytrack:.85}),
  'i.pwmRate':.55,'ii.pwmRate':.83,'ii.feet':1,
  detune:11,subRate:5,subDelay:1.5,subVco:.05,width:.85,drift:.55,voices:10,
  chorusMix:.45,chorusRate:.5,chorusDepth:.55,reverbMix:.36,reverbDecay:5,volume:.7}},
 {name:'Glass Bells',colour:'#7fd0c8',note:'Sine and ring modulation. The ring envelope sweeps its speed on every key.',values:{
  ...both({saw:0,square:0,sine:1,hpf:20,lpf:6000,a:.002,d:2.4,s:0,r:2.2,initLevel:.6,initBrill:0,afterBrill:0,afterLevel:.2}),
  'i.feet':1,'ii.feet':2,'ii.saw':.15,'ii.lpf':2400,'ii.al':.3,'ii.fd':.5,'ii.d':1.2,
  ringDepth:.62,ringSpeed:340,ringAttack:.002,ringDecay:1.4,ringSweep:-.25,
  detune:3,drift:.25,width:.6,voices:12,reverbMix:.45,reverbDecay:8,reverbTone:9000,volume:.77}},
 {name:'Night Choir',colour:'#9b6bd6',note:'Band-pass vowels from the high-pass and low-pass in series, with delayed vibrato.',values:{
  ...both({saw:.5,square:.6,pw:.35,pwm:.4,hpf:420,hpRes:.45,lpf:1250,lpRes:.4,il:0,al:.1,fa:.8,fd:2,fr:2,a:.7,d:3,s:.95,r:2.2,initBrill:.15,initLevel:.3,afterBrill:.35,afterLevel:.3,keytrack:.6}),
  'i.pwmRate':.3,'ii.pwmRate':.47,'ii.hpf':650,'ii.lpf':1800,'ii.feet':1,
  detune:7,subRate:5.4,subDelay:1.4,subVco:.12,width:.75,drift:.6,voices:10,
  chorusMix:.35,reverbMix:.5,reverbDecay:7.5,reverbSize:.9,volume:.84}},
 {name:'Funky Clav',colour:'#e86a92',note:'Snappy resonant pluck; velocity sets the bite.',values:{
  ...both({saw:.3,square:1,pw:.18,hpf:180,hpRes:.2,lpf:500,lpRes:.62,il:0,al:.8,fa:.002,fd:.18,fr:.12,a:.002,d:.55,s:.15,r:.12,initBrill:.7,initLevel:.7,afterBrill:.3,afterLevel:0,keytrack:.9}),
  'ii.level':.35,'ii.feet':2,'ii.pw':.5,
  detune:2,width:.3,drift:.2,voices:8,reverbMix:.12,reverbDecay:1.2,volume:.76}},
 {name:'Silk Flute',colour:'#f3d38a',note:'Breathy sine and filtered noise; the vibrato arrives after a moment.',values:{
  ...both({saw:0,square:.12,pw:.5,noise:.25,sine:1,hpf:300,hpRes:.1,lpf:2400,lpRes:.25,il:-.2,al:.3,fa:.12,fd:1,fr:.4,a:.09,d:1,s:.9,r:.45,initBrill:.4,initLevel:.5,afterBrill:.3,afterLevel:.4,keytrack:1}),
  'ii.level':.25,'ii.feet':2,'ii.noise':.5,'ii.sine':0,'ii.square':0,'ii.hpf':1600,'ii.lpf':5000,
  subRate:5,subDelay:.7,subVco:.15,atVibrato:.3,drift:.3,width:.25,voices:6,reverbMix:.35,reverbDecay:4.5,volume:.59}},
 {name:'Deep Bass',colour:'#3f6b4f',note:'16-foot saw and square under a closing filter.',values:{
  ...both({feet:0,saw:1,square:.6,pw:.4,hpf:28,lpf:260,lpRes:.3,il:0,al:.55,fa:.003,fd:.6,fr:.2,a:.003,d:1.2,s:.7,r:.18,initBrill:.5,initLevel:.5,afterBrill:.3,afterLevel:0,keytrack:.5}),
  'ii.level':.6,'ii.square':0,detune:5,width:.15,drift:.3,voices:4,reverbMix:.05,volume:.77}},
 {name:'Electric Tines',colour:'#d98b4a',note:'Sine bell with a touch of saw, gentle tremolo from the sub oscillator.',values:{
  ...both({saw:.2,square:0,sine:.9,hpf:60,lpf:1300,lpRes:.1,il:0,al:.5,fa:.002,fd:.7,fr:.4,a:.002,d:2.8,s:0,r:.6,initBrill:.6,initLevel:.75,afterBrill:0,afterLevel:0,keytrack:1}),
  'ii.feet':2,'ii.level':.3,'ii.saw':0,'ii.d':.6,
  subFunction:1,subRate:4.2,subVca:.28,width:.45,drift:.3,voices:12,chorusMix:.3,reverbMix:.25,reverbDecay:3,volume:.74}},
 {name:'Sweep Pad',colour:'#4a62b8',note:'A long filter sweep on both channels; hold a chord and let it bloom.',values:{
  ...both({saw:1,square:.4,pw:.3,pwm:.35,hpf:40,lpf:220,lpRes:.45,il:0,al:.85,fa:4,fd:7,fr:4,hpEg:.15,a:1.2,d:6,s:.85,r:3.5,initBrill:.1,initLevel:.25,afterBrill:.3,afterLevel:.2,keytrack:.7}),
  'ii.fa':5.5,'ii.lpf':300,'ii.feet':2,'ii.level':.45,
  detune:8,width:.9,drift:.6,voices:10,chorusMix:.4,reverbMix:.48,reverbDecay:9,reverbSize:.95,volume:.63}},
 {name:'Pipe Organ',colour:'#8a8f98',note:'Square stops at 8 and 4 feet; no touch response.',values:{
  ...both({saw:0,square:1,pw:.5,hpf:40,lpf:4200,lpRes:0,il:0,al:0,a:.02,d:1,s:1,r:.12,initBrill:0,initLevel:0,afterBrill:0,afterLevel:0,keytrack:1}),
  'ii.feet':2,'ii.level':.6,'ii.sine':.4,detune:1,drift:.15,width:.3,voices:12,reverbMix:.4,reverbDecay:4,volume:.39}},
 {name:'Plain',colour:'#c9c3b4',note:'A neutral starting point: one saw per channel, open filter.',values:{volume:.67}},
];

export const PRESETS=RAW.map(p=>({...p,values:sanitize(p.values)}));
export const channelKeys=prefix=>CHANNEL_KEYS.map(k=>prefix+'.'+k);
