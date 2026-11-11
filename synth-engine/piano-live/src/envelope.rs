//! Original envelopeShape/releasePoints formulas from src/util/util.js and
//! src/app/engine/envelope.js. Values may overshoot: do not clip gain to0..1.
pub fn shape(t:f64,kind:u32,exponent:f64)->f64{
    let value=match kind{
        0=>t,
        1=>t.powf(exponent),
        2=>1.-(1.-t).powf(exponent),
        3=>{let v=(t*std::f64::consts::FRAC_PI_2).sin();if exponent!=1.{v.powf(exponent)}else{v}},
        4=>{let v=1.-(t*std::f64::consts::FRAC_PI_2).cos();if exponent!=1.{v.powf(exponent)}else{v}},
        5=>{let v=t*t*(3.-2.*t);if exponent!=1.{v.powf(exponent)}else{v}},
        6=>if t<0.2{(t/0.2).powf(exponent)*0.6}else{0.6+(t-0.2)/0.8*0.4},
        7=>{let v=t*t*t*(t*(t*6.-15.)+10.);if exponent!=1.{v.powf(exponent)}else{v}},
        8=>1.-(1.-t).powf(exponent*2.),
        9=>t.powf(exponent*0.5),
        10=>if t<0.7{(t/0.7).powf(exponent)*1.2}else{(1.2-((t-0.7)/0.3)*0.2).max(1.)},
        11=>if t<0.6{(t/0.6).powf(exponent)*1.3}else{1.3-((t-0.6)/0.4)*0.3},
        _=>t,
    };value.clamp(0.,2.)
}
pub fn segments(seconds:f64,kind:u32)->usize{if kind==0{1}else{((seconds*60.).ceil() as usize).clamp(4,48)}}
