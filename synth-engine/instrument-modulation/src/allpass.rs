//! Pinned Chromium Biquad::SetAllpassParams and accepted DF1/F32 histories.
//! Native revision/source attribution is retained in the profile/notices.
//! Separate helper; accepted InstrumentTone seven-mode Biquad stays unchanged.
#[derive(Clone,Copy)]
pub struct Allpass{c:[f64;5],history:[[f64;4];2],key:[f64;2]}
impl Default for Allpass{fn default()->Self{Self{c:[1.,0.,0.,0.,0.],history:[[0.;4];2],key:[f64::NAN;2]}}}
impl Allpass{
 pub fn sample(&mut self,input:[f32;2],channels:usize,normalized:f64,q:f64)->[f32;2]{
  if self.key!=[normalized,q]{let f=normalized.clamp(0.,1.);let q=q.max(0.);self.c=if f==0.||f==1.{[1.,0.,0.,0.,0.]}else if q==0.{[-1.,0.,0.,0.,0.]}else{let w=std::f64::consts::PI*f;let alpha=w.sin()/(2.*q);let k=w.cos();let inverse=1./(1.+alpha);[(1.-alpha)*inverse,(-2.*k)*inverse,(1.+alpha)*inverse,(-2.*k)*inverse,(1.-alpha)*inverse]};self.key=[normalized,q];}
  let[b0,b1,b2,a1,a2]=self.c;let mut output=[0.;2];for c in 0..channels{let h=&mut self.history[c];let x=input[c]as f64;let y=(b0*x+b1*h[0]+b2*h[1]-a1*h[2]-a2*h[3])as f32;h[1]=h[0];h[0]=x;h[3]=h[2];h[2]=y as f64;output[c]=y;}output
 }
 pub fn reset(&mut self){*self=Self::default();}
 pub fn end_quantum(&mut self){for h in &mut self.history{for x in h{if x.abs()<f32::MIN_POSITIVE as f64{*x=0.;}}}}
}
