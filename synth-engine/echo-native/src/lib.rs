//! Captured continuous original nativeEcho topology, pinned128-frame feedback.
#[cfg(feature="allocation-audit")] mod allocation;
const MAX:usize=2048;
struct Delay{ring:[Vec<f32>;2],at:usize,frames:f32}
impl Delay{
 fn new(rate:f64,maximum:f64,seconds:f64)->Self{let n=(maximum*rate).ceil()as usize+128;Self{ring:std::array::from_fn(|_|vec![0.;n]),at:0,frames:seconds as f32*rate as f32}}
 fn reset(&mut self){for r in &mut self.ring{r.fill(0.);}self.at=0;}
 fn tick(&mut self,x:[f32;2])->[f32;2]{let n=self.ring[0].len();for c in 0..2{self.ring[c][self.at]=x[c];}
  let mut p=self.at as f32+(n as f32-self.frames);if p>=n as f32{p-=n as f32;}
  let a=p as usize;let b=if a+1>=n{0}else{a+1};let f=p-a as f32;
  let y=std::array::from_fn(|c|self.ring[c][a]+f*(self.ring[c][b]-self.ring[c][a]));
  self.at=if self.at+1==n{0}else{self.at+1};y}
}
pub struct Echo{delay:Delay,pre:Option<Delay>,gain:f32,feedback:f32,alpha:f64,last:[f64;2],previous:[[f32;128];2],swap:bool,frame:u64,peak:f32,input:[[f32;MAX];2],output:[[f32;MAX];2]}
impl Echo{
 fn new(rate:f64,send:f64,ms:f64,feedback:f64,tone:f64,swap:u32,comp:u32)->Option<Box<Self>>{
  if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!send.is_finite()||!(0. ..=0.8).contains(&send)||!ms.is_finite()||ms.fract()!=0.||!(40. ..=2000.).contains(&ms)||!feedback.is_finite()||!(0. ..=0.85).contains(&feedback)||!tone.is_finite()||!(300. ..=14000.).contains(&tone)||swap>1||comp!=128{return None;}
  let seconds=(ms/1000.-comp as f64/rate).max(1./rate);
  Some(Box::new(Self{delay:Delay::new(rate,2.1,seconds),pre:if comp>0{Some(Delay::new(rate,0.2,comp as f64/rate))}else{None},gain:send as f32,feedback:feedback as f32,alpha:1.-(-2.*std::f64::consts::PI*tone.min(rate*0.4)/rate).exp(),last:[0.;2],previous:[[0.;128];2],swap:swap!=0,frame:0,peak:0.,input:[[0.;MAX];2],output:[[0.;MAX];2]}))
 }
 fn reset(&mut self){self.delay.reset();if let Some(p)=&mut self.pre{p.reset();}self.last=[0.;2];self.previous=[[0.;128];2];self.frame=0;self.peak=0.;}
 fn render(&mut self,n:usize)->bool{
  if n>MAX{return false;}self.peak=0.;
  for i in 0..n{let at=self.frame as usize%128;let mut x=[self.input[0][i]*self.gain,self.input[1][i]*self.gain];
   if let Some(p)=&mut self.pre{x=p.tick(x);}
   for c in 0..2{x[c]+=self.previous[if self.swap{1-c}else{c}][at]*self.feedback;}
   let delayed=self.delay.tick(x);let mut out=[0.;2];
   for c in 0..2{let y=self.alpha*delayed[c]as f64-(-(1.-self.alpha))*self.last[c];self.last[c]=y;out[c]=y as f32;self.output[c][i]=out[c];self.peak=self.peak.max(out[c].abs());}
   for c in 0..2{self.previous[c][at]=out[c];}self.frame+=1;
  }true
 }
}
unsafe fn engine<'a>(h:usize)->&'a mut Echo{&mut*(h as*mut Echo)}
#[no_mangle]pub extern "C" fn echo_native_api()->u32{1}
#[no_mangle]pub extern "C" fn echo_native_new(rate:f64,send:f64,ms:f64,feedback:f64,tone:f64,swap:u32,comp:u32)->usize{Echo::new(rate,send,ms,feedback,tone,swap,comp).map_or(0,|e|Box::into_raw(e)as usize)}
#[no_mangle]pub unsafe extern "C" fn echo_native_free(h:usize){if h!=0{drop(Box::from_raw(h as*mut Echo));}}
#[no_mangle]pub unsafe extern "C" fn echo_native_input(h:usize,c:usize)->*mut f32{if h==0||c>1{std::ptr::null_mut()}else{engine(h).input[c].as_mut_ptr()}}
#[no_mangle]pub unsafe extern "C" fn echo_native_output(h:usize,c:usize)->*const f32{if h==0||c>1{std::ptr::null()}else{engine(h).output[c].as_ptr()}}
#[no_mangle]pub unsafe extern "C" fn echo_native_render(h:usize,n:usize)->u32{if h==0{0}else{engine(h).render(n)as u32}}
#[no_mangle]pub unsafe extern "C" fn echo_native_reset(h:usize){if h!=0{engine(h).reset();}}
#[no_mangle]pub unsafe extern "C" fn echo_native_stat(h:usize,k:u32)->f64{if h==0{return f64::NAN;}let e=engine(h);match k{0=>e.frame as f64,1=>e.peak as f64,2=>e.delay.frames as f64,_=>f64::NAN}}
