// Jupiter-8 patch layout (28 bytes per patch on tape), reverse-engineered by
// correlating the factory cassette with the factory patch sheets
// (docs/JP8_TAPE_FORMAT.md). Continuous controls are 0–255 = slider bottom…top.
// Switch meanings come from lever direction on the sheets (bit 1 = lever up)
// and patch names (e.g. every "sync" patch has sync on).

export const SLIDERS=[
 ['vco2Range',0],   // continuous pitch: 36 semitones over 0–255, 8' at ≈82 (fitted from the interval patches)
 ['vcoModLfo',1],['vcoModEnv',2],['pwm',3],['crossMod',4],
 ['vco2Fine',5],    // knob, centre ≈ 128
 ['sourceMix',6],   // knob: VCO-1 … VCO-2
 ['cutoff',7],['resonance',8],['envMod',9],
 ['env1Sustain',10],['env2Sustain',11],
 ['lfoRate',12],['lfoDelay',13],['hpf',14],['vcfLfo',15],['keyFollow',16],['vcaLevel',17],
 ['env1Attack',18],['env1Decay',19],['env1Release',20],
 ['env2Attack',21],['env2Decay',22],['env2Release',23],
];
export const LFO_WAVES=['sine','saw','square','random'];          // knob positions left → right
export const VCO1_WAVES=['triangle','saw','pulse','square'];
export const VCO2_WAVES=['sine','saw','pulse','noise'];
export const FEET=["16'","8'","4'","2'"];

/** Raw 28-byte patch → named values (continuous 0–1, switches as named choices). */
export function decodePatch(data){
 const b=[...data];
 const out=Object.fromEntries(SLIDERS.map(([k,i])=>[k,b[i]/255]));
 const s24=b[24],s25=b[25],s26=b[26];
 return {
  ...out,
  // continuous, relative to 8': the fifth/fourth patches land within ±0.4 st of their intervals
  vco2Semitones:(b[0]-82)*36/255,
  lfoWave:LFO_WAVES[s24&3],
  vcoModVco1:!!(s24&4),vcoModVco2:!!(s24&8),     // FREQ MOD destination: VCO-1 / both / VCO-2
  pwmSource:{3:'lfo',2:'manual',1:'env1'}[(s24>>4)&3]??'manual',
  vco1Range:FEET[(s24>>6)&3],
  vco1Wave:VCO1_WAVES[(s25>>2)&3],
  vco2Wave:VCO2_WAVES[(s25>>4)&3],
  vcaLfo:(s25>>6)&3,                              // VCA LFO depth switch, 0–3
  sync:!(s26&2),
  vco2Low:!(s26&4),                               // VCO-2 LOW FREQ (as a modulator)
  vcfSlopeUp:!!(s26&8),                           // which slope "up" is (−12 or −24 dB) is not yet confirmed
  vcfEnvUp:!!(s26&16),                            // VCF env source switch up (believed ENV-1)
  env1KeyFollow:!(s26&32),
  env1Inverted:!(s26&64),
  env2KeyFollow:!(s26&128),
 };
}
