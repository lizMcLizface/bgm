// Approximations of the CS-80's 22 factory presets: 11 per channel, in the
// order of the original button rows (row I sets channel I, row II channel II).
// The names and order are the original's; the settings are educated guesses
// from the preset names and published descriptions. The real presets were
// fixed circuits, never documented as panel settings, so treat these as
// "in the spirit of", not reproductions.
import {defaultValues} from './params';

// Every channel key, so a preset fully replaces its channel.
const BASE={feet:1,pw:.5,pwm:0,pwmRate:.8,saw:0,square:0,noise:0,sine:0,hpf:20,hpRes:0,lpf:2000,lpRes:0,il:0,al:0,fa:.05,fd:.8,fr:.5,hpEg:0,
 a:.01,d:1,s:.8,r:.5,level:.8,initBrill:0,initLevel:0,afterBrill:0,afterLevel:0,keytrack:.8};
const preset=(name,colour,values)=>({name,colour,values:{...BASE,...values}});
const STRINGS='#5b8fd9',BRASS='#d9772b',WOOD='#5fae7a',KEYS='#e3c04a',PLUCK='#9a6bd1',ORGAN='#9aa0a8',GUITAR='#a8784a',FUNK='#e86a92',BASS='#3f8b5f';

export const ROW_I=[
 preset('Strings 1',STRINGS,{saw:.7,square:.6,pw:.45,pwm:.4,pwmRate:.6,hpf:150,hpRes:.1,lpf:2400,lpRes:.1,al:.15,fa:.6,fd:2,fr:1.5,a:.4,d:2,s:.9,r:1.3,initBrill:.2,initLevel:.4,afterBrill:.35,afterLevel:.35}),
 preset('Strings 3',STRINGS,{saw:.4,square:.8,pwm:.6,pwmRate:5.5,hpf:320,hpRes:.15,lpf:4200,lpRes:.05,al:.1,fa:.4,fd:1.5,fr:1.2,a:.3,d:1.5,s:.9,r:1.1,level:.75,initBrill:.2,initLevel:.35,afterBrill:.3,afterLevel:.3}),
 preset('Brass 1',BRASS,{saw:1,hpf:40,lpf:450,lpRes:.2,il:-.05,al:.55,fa:.12,fd:1.4,fr:.6,a:.07,d:1.2,s:.85,r:.45,level:.85,initBrill:.4,initLevel:.4,afterBrill:.5,afterLevel:.3,keytrack:.7}),
 preset('Flute 1',WOOD,{square:.15,noise:.18,sine:.9,hpf:350,hpRes:.1,lpf:2000,lpRes:.2,il:-.2,al:.25,fa:.12,fd:.8,fr:.35,a:.08,s:.9,r:.35,initBrill:.35,initLevel:.5,afterBrill:.3,afterLevel:.4,keytrack:1}),
 preset('Electric Piano',KEYS,{saw:.2,sine:.9,hpf:60,lpf:1400,lpRes:.1,al:.4,fa:.002,fd:.6,fr:.4,a:.002,d:2.6,s:0,r:.6,level:.85,initBrill:.55,initLevel:.7,afterLevel:.1,keytrack:1}),
 preset('Clavichord 1',PLUCK,{saw:.25,square:1,pw:.22,hpf:420,hpRes:.3,lpf:900,lpRes:.45,al:.75,fa:.002,fd:.22,fr:.12,a:.002,d:.8,s:.05,r:.15,initBrill:.6,initLevel:.6,afterBrill:.2,keytrack:.9}),
 preset('Harpsichord 1',PLUCK,{feet:2,saw:.7,square:.5,pw:.3,hpf:300,hpRes:.1,lpf:2600,lpRes:.2,al:.5,fa:.002,fd:.45,fr:.4,a:.001,d:1.5,s:0,r:.5,level:.75,initBrill:.3,initLevel:.4,keytrack:1}),
 preset('Organ 1',ORGAN,{square:1,sine:.4,hpf:30,lpf:2200,a:.01,s:1,r:.08,level:.75,afterBrill:.2,keytrack:1}),
 preset('Guitar 1',GUITAR,{saw:.6,square:.6,pw:.35,hpf:120,lpf:800,lpRes:.35,al:.55,fa:.002,fd:.5,fr:.3,a:.002,d:1.8,s:.1,r:.3,initBrill:.5,initLevel:.6,afterBrill:.3,afterLevel:.1,keytrack:.9}),
 preset('Funky 1',FUNK,{square:1,pw:.25,hpf:80,lpf:300,lpRes:.7,al:.9,fa:.002,fd:.18,fr:.1,a:.002,d:.5,s:.4,r:.1,initBrill:.6,initLevel:.5,afterBrill:.5,afterLevel:.2}),
 preset('Funky 3',FUNK,{saw:1,hpf:60,lpf:600,lpRes:.62,il:.6,al:-.2,fa:.08,fd:.4,fr:.2,a:.002,d:.6,s:.6,r:.15,initBrill:.5,initLevel:.5,afterBrill:.6,afterLevel:.2}),
];
export const ROW_II=[
 preset('Strings 2',STRINGS,{saw:1,hpf:120,hpRes:.05,lpf:2000,lpRes:.1,al:.2,fa:.7,fd:2,fr:1.6,a:.45,d:2,s:.92,r:1.5,level:.75,initBrill:.2,initLevel:.35,afterBrill:.35,afterLevel:.35}),
 preset('Strings 4',STRINGS,{feet:2,saw:.3,square:.8,pwm:.6,pwmRate:.5,hpf:400,lpf:3800,lpRes:.05,al:.1,fa:.5,fd:2,fr:1.6,a:.5,d:2,s:.9,r:1.6,level:.6,initBrill:.15,initLevel:.3,afterBrill:.3,afterLevel:.3,keytrack:.9}),
 preset('Brass 2',BRASS,{saw:1,square:.3,pw:.4,hpf:40,lpf:600,lpRes:.25,al:.55,fa:.2,fd:1.6,fr:.8,a:.12,d:1.4,s:.9,r:.7,initBrill:.35,initLevel:.4,afterBrill:.45,afterLevel:.3,keytrack:.7}),
 preset('Brass 3',BRASS,{feet:0,saw:1,hpf:30,lpf:380,lpRes:.2,al:.7,fa:.06,fd:.8,fr:.4,a:.03,d:.9,s:.75,r:.4,initBrill:.45,initLevel:.45,afterBrill:.5,afterLevel:.3,keytrack:.6}),
 preset('Bass 1',BASS,{feet:0,saw:1,square:.5,pw:.4,hpf:25,lpf:280,lpRes:.35,al:.5,fa:.002,fd:.45,fr:.15,a:.002,d:.9,s:.5,r:.15,level:.9,initBrill:.5,initLevel:.5,afterBrill:.3,keytrack:.5}),
 preset('Clavichord 2',PLUCK,{feet:2,square:1,pw:.12,hpf:600,hpRes:.2,lpf:1500,lpRes:.3,al:.5,fa:.002,fd:.2,fr:.1,a:.001,d:.5,s:0,r:.1,level:.7,initBrill:.5,initLevel:.6,keytrack:1}),
 preset('Harpsichord 2',PLUCK,{saw:.8,square:.4,pw:.15,hpf:500,hpRes:.1,lpf:3200,lpRes:.15,al:.3,fa:.002,fd:.6,fr:.4,a:.001,d:1.1,s:0,r:.4,level:.7,initBrill:.3,initLevel:.4,keytrack:1}),
 preset('Organ 2',ORGAN,{feet:2,square:1,sine:.5,hpf:30,lpf:3000,a:.01,s:1,r:.08,level:.6,afterBrill:.2,keytrack:1}),
 preset('Guitar 2',GUITAR,{square:.8,pw:.4,noise:.06,hpf:200,lpf:1100,lpRes:.3,al:.45,fa:.002,fd:.35,fr:.25,a:.002,d:1.2,s:0,r:.25,level:.75,initBrill:.4,initLevel:.6,keytrack:.9}),
 preset('Funky 2',FUNK,{saw:1,square:.6,pw:.3,hpf:60,lpf:450,lpRes:.75,al:.7,fa:.02,fd:.3,fr:.12,a:.005,d:.6,s:.5,r:.12,initBrill:.6,initLevel:.5,afterBrill:.5}),
 preset('Funky 4',FUNK,{square:1,pw:.15,hpf:250,hpRes:.5,lpf:900,lpRes:.5,il:-.3,al:.5,fa:.04,fd:.25,fr:.1,a:.002,d:.3,s:.3,r:.1,level:.75,initBrill:.5,initLevel:.5,afterBrill:.4}),
];

/** The panel's global controls at rest, so presets are heard as they are; volume and space are left alone. */
export function neutralPanel(values){
 const d=defaultValues(),keep=new Set(['volume','chorusMix','chorusRate','chorusDepth','reverbMix','reverbDecay','reverbTone','reverbSize','reverbPredelay']);
 const out={...values};
 for(const key of Object.keys(d))if(!key.includes('.')&&!keep.has(key))out[key]=d[key];
 return {...out,detune:0,drift:.3,atVibrato:.15};
}
/** Copies one row preset into its channel. */
export const withChannel=(values,channel,p)=>({...values,...Object.fromEntries(Object.entries(p.values).map(([k,v])=>[channel+'.'+k,v]))});
/** The preset (if any) a channel currently matches exactly. */
export const matchChannel=(values,channel,row)=>row.findIndex(p=>Object.entries(p.values).every(([k,v])=>Math.abs(values[channel+'.'+k]-v)<1e-9));
