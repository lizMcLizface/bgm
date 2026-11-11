//! Independent f64 radix-2 FFT. Plans, bit reversal and twiddles are prepared
//! outside render; no library FFT, native binary or render allocation is used.
use std::f64::consts::TAU;
#[derive(Clone, Copy, Default)]
pub struct Complex {pub re:f64,pub im:f64}
pub struct Plan {reverse:Vec<usize>,twiddle:Vec<Complex>}
impl Plan {
 pub fn new(n:usize)->Self {
  assert!(n.is_power_of_two());let bits=n.trailing_zeros();
  Self{reverse:(0..n).map(|i|i.reverse_bits()>>(usize::BITS-bits)).collect(),twiddle:(0..n/2).map(|i|{let angle=-TAU*i as f64/n as f64;Complex{re:angle.cos(),im:angle.sin()}}).collect()}
 }
 pub fn transform(&self,values:&mut[Complex],inverse:bool){
  let n=values.len();for i in 0..n{let j=self.reverse[i];if i<j{values.swap(i,j);}}
  let mut width=2;while width<=n{let half=width/2;let stride=n/width;for start in(0..n).step_by(width){for k in 0..half{let a=values[start+k];let b=values[start+k+half];let t=self.twiddle[k*stride];let imaginary=if inverse{-t.im}else{t.im};let re=b.re*t.re-b.im*imaginary;let im=b.re*imaginary+b.im*t.re;values[start+k]=Complex{re:a.re+re,im:a.im+im};values[start+k+half]=Complex{re:a.re-re,im:a.im-im};}}width*=2;}
  if inverse{let scale=1./n as f64;for value in values{value.re*=scale;value.im*=scale;}}
 }
 pub fn bytes(&self)->usize{self.reverse.len()*std::mem::size_of::<usize>()+self.twiddle.len()*std::mem::size_of::<Complex>()}
}
