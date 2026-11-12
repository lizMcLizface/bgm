//! Original Tape curve law, computed outside the audio callback.
//! Separate from captured/live Tape DSP; no source engine is modified.
const POINTS:usize=2049;
pub struct Preparation{curve:[f32;POINTS],drive:f64,calls:u64}
impl Preparation{
 pub fn new()->Box<Self>{Box::new(Self{curve:[0.;POINTS],drive:-1.,calls:0})}
 pub fn prepare(&mut self,drive:f64)->bool{
  if !drive.is_finite()||!(0. ..=1.).contains(&drive)||self.calls>=9007199254740991{return false;}
  let k=1.+drive*5.;let gain=(1.+0.15*(k-1.))/k;
  for(i,x)in self.curve.iter_mut().enumerate(){*x=((k*(i as f64/1024.-1.)).tanh()*gain)as f32;}
  self.drive=drive;self.calls+=1;true
 }
}
#[no_mangle]pub extern "C" fn tape_curve_api()->u32{1}
#[no_mangle]pub extern "C" fn tape_curve_new()->*mut Preparation{Box::into_raw(Preparation::new())}
#[no_mangle]pub unsafe extern "C" fn tape_curve_free(p:*mut Preparation){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn tape_curve_prepare(p:&mut Preparation,drive:f64)->u32{p.prepare(drive)as u32}
#[no_mangle]pub extern "C" fn tape_curve_output(p:&Preparation)->*const f32{p.curve.as_ptr()}
#[no_mangle]pub extern "C" fn tape_curve_stat(p:&Preparation,index:u32)->f64{match index{0=>p.drive,1=>p.calls as f64,2=>POINTS as f64,_=>f64::NAN}}
#[cfg(feature="allocation-audit")]mod allocation;
