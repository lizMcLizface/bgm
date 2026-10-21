// Panel values read off the Juno-60 patch book (bookPresets.js) → engine values, through the same
// mapping as an imported 106 patch (sysex.js junoValues). The 60's panel is the 106's with a few
// differences: its HPF is a slider (here the nearest of the 106's positions), its PWM can follow the
// envelope (here a fixed width), and the book shows no range (8').
import {junoValues} from './sysex';

const SLIDER_ORDER=['lfoRate','lfoDelay','dcoLfo','pwm','noise','cutoff','res','env','vcfLfo','kybd','level','attack','decay','sustain','release','sub'];

/** {sliders (0–1), pulse, saw, sub, chorus 0|1|2, pwm 'lfo'|'manual'|'env', inverted, gate} → engine values. */
export function bookEngineValues(p){
 const s={...p.sliders,sub:p.sub?p.sliders.sub:0};
 const sliders=SLIDER_ORDER.map(k=>Math.round((s[k]??0)*127));
 const buttons=2|(p.pulse?8:0)|(p.saw?16:0)|[32,64,0][p.chorus];
 const hpf=s.hpf<.1?1:s.hpf<.45?2:3;
 const switches=(p.pwm==='lfo'?0:1)|(p.inverted?2:0)|(p.gate?4:0)|((3-hpf)<<3);
 return junoValues(sliders,buttons,switches);
}
