// Juno-106 patch SysEx → this synth's parameters. A patch message is
// F0 41 30 0n pp <16 sliders> <buttons> <switches> F7 (pp = patch 0–127;
// 31 instead of 30 is the "manual" panel dump without a number). Sliders are
// in panel order: LFO rate, LFO delay, DCO LFO, PWM, noise, VCF freq, res, env,
// LFO, kybd, VCA level, A, D, S, R, sub. Buttons: bit0-2 range 16'/8'/4',
// bit3 pulse, bit4 saw, bit5 chorus off, bit6 chorus I (else II). Switches: bit0
// PWM manual, bit1 VCF env inverted, bit2 VCA gate, bits3-4 = 3 − HPF position.
// (One published table reads the HPF bits the other way round; this follows
// plain binary, as the KR-106 project does.)
// No patch data ships with the site: banks are imported by the player.

// Slider value (0–1) to unit mappings. The envelope and LFO end points are
// Roland's published specifications (A 1.5 ms–3 s, D/R 1.5 ms–12 s, LFO
// 0.1–30 Hz, delay 0–3 s); every curve shape, the filter range and the depth
// scalings are estimates to be tuned against recordings of the real instrument.
export const CALIBRATION={
 lfoRate:[.1,30],      // Hz, exponential
 lfoDelay:3,            // s at full slider, square law
 lfoDco:4,              // semitones at full slider, square law (service notes: LFO MOD ±400 cents)
 cutoff:[7,54000],      // Hz, exponential: measured self-oscillation of the filter at slider 0 and 10 (the service notes quote 5 Hz–50 kHz)
 kybdReference:60,      // key follow is +3/−2 octaves over the 61 keys: zero at middle C, which is also where this engine tracks from
 envelope:[.03,3],      // slider-to-time shape: t = lo + (hi − lo)·(a·x + (1 − a)·x^p)
 vcaFloor:-20,          // dB at VCA level 0
 attack:[.0015,3],      // s
 decay:[.0015,12],
 release:[.0015,12],
};

export const JUNO_NAMES=[
 'Brass','Brass Swell','Trumpet','Flutes','Moving Strings','Brass & Strings','Choir','Piano I',
 'Organ I','Organ II','Combo Organ','Calliope','Donald Pluck','Celeste','Elect. Piano I','Elect. Piano II',
 'Clock Chimes','Steel Drums','Xylophone','Brass III','Fanfare','Strings III','Pizzicato','High Strings',
 'Bass Clarinet','English Horn','Brass Ensemble','Guitar','Koto','Dark Pluck','Funky I','Synth Bass I',
 'Lead I','Lead II','Lead III','Funky II','Synth Bass II','Funky III','Thud Wah','Going Up',
 'Piano II','Clav.','Frontier Organ','Snare Drum','Tom Toms','Timpani','Shaker','Synth Pad',
 'Sweep I','Pluck Sweep','Repeater','Sweep II','Pluck Bell','Dark Synth Piano','Sustainer','Wah Release',
 'Gong','Resonance Funk','Drum Booms','Dust Storm','Rocket Men','Hand Claps','F X Sweep','Caverns',
 'Strings','Violin','Chorus Vibes','Organ 1','Harpsichord 1','Recorder','Perc. Pluck','Noise Sweep',
 'Space Chimes','Nylon Guitar','Orchestral Pad','Bright Pluck','Organ Bell','Accordion','FX Rise 1','FX Rise 2',
 'Brass','Helicopter','Lute','Chorus Funk','Tomita','FX Sweep 1','Sharp Reed','Bass Pluck',
 'Resonant Rise','Harpsichord 2','Dark Ensemble','Contact Wah','Noise Sweep 2','Glassy Wah','Phase Ensemble','Chorused Bell',
 'Clav','Organ 2','Bassoon','Auto Release Noise Sweep','Brass Ensemble','Ethereal','Chorus Bell 2','Blizzard',
 'E. Piano w/Tremolo','Clarinet','Thunder','Reedy Organ','Flute / Horn','Toy Rhodes',"Surf's Up",'OW Bass',
 'Piccolo','Melodic Taps','Meow Brass','Violin (high)','High Bells','Rolling Wah','Ping Bell','Brassy Organ',
 'Low Dark Strings','Piccolo Trumpet','Cello','High Strings','Rocket Men','Forbidden Planet','Froggy','Owgan',
];
// SysEx carries no names. A patch is named after the factory list only when its 18
// data bytes match a factory patch (wherever it sits in the bank): these are 32-bit
// FNV-1a fingerprints of the factory patches A11–B88, not the patch data itself.
export const FACTORY_FINGERPRINTS=[
 'e6a38949', 'c1839abc', '58088ae8', '14fd8bda', '794feb08', '5380784f', '2bb834f1', '3ecb1262',
 '96537fe2', '2412702a', 'c4c5e0ec', '559b93c6', '1fe37c67', '7e5fb231', '218c3a53', 'd913402c',
 'b62a8431', '91287766', '1808f218', 'f80f0c7a', 'c18a0603', '64fa9e80', 'a3e264aa', '5dbb3022',
 '84a03902', '865dab31', 'a51c4bfc', 'ae697fad', 'c6b95b4e', '47933a72', '8bab2717', '5f3ef99d',
 '55eca602', '415035c2', '1dbf68b6', '41591cce', '2554c9d4', '3ace3f58', 'f2032b91', '1a304a22',
 '953564c0', '4f7de3b4', '48ebae39', '9c35d40e', '6a1cc87d', 'bf97ba88', 'ce052289', '76e2f1ef',
 '103b6290', '8a9df03f', '7d3a38e1', '25d7b3cf', '719ed1e8', '64876c84', '758ada4b', 'da8b4e04',
 'cd17b833', '50a7bea3', '489e2b6d', '04da5312', '91a2c811', 'f7b811b4', '39d1c5a1', '08f4b423',
 '8c4ca118', 'd75a2aa6', '7baecd33', '93c8f85a', 'bebbe55d', '73484bc1', '5bdc793a', 'dc82ad0d',
 '9e7df9dd', 'e19727b4', '9bd6bc93', 'acf2c238', '6ad24b28', '1d83ee89', 'a1c63af6', 'f0780fc7',
 '06f52bd6', 'dd665367', 'fabee6ab', '2a8e1f39', 'd9c6d163', 'd7000d27', '0558c213', '231964f0',
 '75a9c341', '4f026589', '7825f9da', 'c1228fed', '7ca6fa7c', 'a21c2f28', 'f5a3f5bd', 'b1b07186',
 '8f5c5e43', '3900d229', '99d980a6', '465d00b3', 'f2e719b8', 'f15d980c', '351df951', '1aefd239',
 '3cac9dc6', '0aca81f2', 'eb7897e0', '989b7f85', '94db7ae4', '302d168e', '365e839f', '8a45d5fd',
 'a92fb686', 'ce9da3e2', 'e50f32d2', 'effd542b', 'fb9b81a7', '2cfd6b2a', '2679ba0e', '7dc41870',
 'c7509f6f', '073eb3c7', 'c92bb911', '5d9054ee', 'a8138931', 'e1050029', '68de63f5', '2d9d47a8',
];
/** FNV-1a over a patch's 16 slider bytes, buttons and switches, as 8 hex digits. */
export function fingerprint(sliders,buttons,switches){
 let h=0x811c9dc5;
 for(const b of [...sliders,buttons,switches])h=Math.imul(h^b,0x01000193)>>>0;
 return h.toString(16).padStart(8,'0');
}
/** Factory name of a patch by its content, or null for anything else. */
export const factoryName=(sliders,buttons,switches)=>{const i=FACTORY_FINGERPRINTS.indexOf(fingerprint(sliders,buttons,switches));return i<0?null:JUNO_NAMES[i];};

/** 0 → "A11", 63 → "A88", 64 → "B11". */
export const patchCode=index=>(index<64?'A':'B')+(Math.floor(index%64/8)+1)+(index%8+1);

const exp=([lo,hi],x)=>lo*(hi/lo)**x;
const time=([lo,hi],x)=>{const [a,p]=CALIBRATION.envelope;return lo+(hi-lo)*(a*x+(1-a)*x**p);};
/** Decodes one patch's 16 slider bytes and two switch bytes into parameter values. */
export function junoValues(sliders,buttons,switches){
 const x=sliders.map(v=>Math.min(127,Math.max(0,v))/127);
 const [lfoRate,lfoDelay,lfoDco,pwm,noise,cutoff,res,env,lfoVcf,kybd,level,a,d,s,r,sub]=x;
 const C=CALIBRATION;
 return {
  lfoRate:exp(C.lfoRate,lfoRate),lfoDelay:C.lfoDelay*lfoDelay**2,lfoDco:C.lfoDco*lfoDco**2,
  pwm,noise,sub,res,env,lfoVcf,kybd,
  // the VCA slider never silences (factory patches sit at 0): −20…0 dB; the engine squares its level
  level:Math.sqrt(10**((C.vcaFloor*(1-level))/20)),
  cutoff:exp(C.cutoff,cutoff)*2**(kybd*(60-C.kybdReference)/12),
  attack:time(C.attack,a),decay:time(C.decay,d),sustain:s,release:time(C.release,r),
  range:buttons&1?0:buttons&4?2:1,pulse:buttons>>3&1,saw:buttons>>4&1,
  chorus:buttons&32?0:buttons&64?1:2,
  pwmSource:switches&1,envPolarity:switches>>1&1,vcaMode:switches>>2&1,hpf:3-(switches>>3&3),
  // as the hardware: no velocity or pressure routes, dry output
  velVcf:0,velVca:0,afterVcf:0,bendVcf:0,reverbMix:0,
 };
}

/** Every patch message in a SysEx file (a bank or single dumps), in file order. */
export function parseJunoSysex(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const patches=[];
 for(let i=0;i<bytes.length;i++){
  if(bytes[i]!==0xF0)continue;
  const end=bytes.indexOf(0xF7,i);if(end<0)break;
  const m=bytes.subarray(i,end+1);i=end;
  if(m.length!==24||m[1]!==0x41||(m[2]!==0x30&&m[2]!==0x31))continue;
  const index=m[2]===0x30?m[4]&127:null;
  const sliders=[...m.subarray(5,21)];
  patches.push({index,code:index===null?'Manual':patchCode(index),factoryName:factoryName(sliders,m[21],m[22]),values:junoValues(sliders,m[21],m[22])});
 }
 return patches;
}

/** A full bank as 128 slots (missing numbers stay empty). `name` is the factory name for factory patches, else ''. */
export function bankFromSysex(input){
 const slots=Array(128).fill(null);let next=0;
 for(const p of parseJunoSysex(input)){
  const index=p.index??next;if(index>127)continue;next=index+1;
  slots[index]={...p,code:patchCode(index),name:p.factoryName??''};
 }
 return slots;
}
