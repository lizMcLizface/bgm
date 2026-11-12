//! Faithful native SSE full-quantum delay fork of accepted instrument-delay.
//! Only maximum/ring preparation is original Chorus0.03seconds (not1second).
const N:usize=128;
pub struct Line{ring:[Vec<f32>;2],at:usize,rate:f32}
impl Line{
 pub fn new(rate:usize,channels:usize)->Self{Self{ring:std::array::from_fn(|c|if c<channels{vec![0.;N+((0.03*rate as f64*1024.).round()/1024.).ceil()as usize]}else{Vec::new()}),at:0,rate:rate as f32}}
 pub fn reset(&mut self){for plane in &mut self.ring{plane.fill(0.);}self.at=0;}
 pub fn process(&mut self,input:&[[f32;N];2],seconds:&[f32;N],channels:usize)->[[f32;N];2]{
  let length=self.ring[0].len();
  // Native ProcessARate copies the complete quantum before any interpolation.
  // Per-sample writes would be wrong for fractional delay shorter than one sample.
  for c in 0..channels{for i in 0..N{self.ring[c][(self.at+i)%length]=input[c][i];}}
  let mut output=[[0.;N];2];
  for i in 0..N{let w=(self.at+i)%length;let desired=seconds[i].max(0.)*self.rate;let mut position=w as f32+(length as f32-desired);if position>=length as f32{position-=length as f32;}
   let a=position as usize;let b=if a+1==length{0}else{a+1};let fraction=position-a as f32;
   for c in 0..channels{let first=self.ring[c][a];output[c][i]=first+fraction*(self.ring[c][b]-first);}
  }self.at=(self.at+N)%length;output
 }
}
