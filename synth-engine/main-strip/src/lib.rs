//! Separate prepared Main tone -> volume -> duck strip. Continuous fixed layout only.
//! Original AudioParam seconds/order; no inferred silent flag or automatic live adoption.
#[path="../../rack-filter-normal/src/timeline.rs"]mod timeline;
#[path="../../rack-native/src/biquad.rs"]mod biquad;
#[path="../../rack-native/src/tail.rs"]mod tail;
#[cfg(feature="allocation-audit")]mod allocation;
const BLOCK:usize=2048;const CAP:usize=1024;
pub struct Engine{rate:f64,channels:usize,ready:bool,frame:u64,lanes:[timeline::LiveTimeline;3],filter:biquad::Biquad,input:[[f32;BLOCK];2],output:[[f32;BLOCK];2],calls:u64,rejected:u64,peak:f64}
impl Engine{
 fn new(rate:f64,channels:usize)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels){return None;}Some(Box::new(Self{rate,channels,ready:false,frame:0,lanes:std::array::from_fn(|i|timeline::LiveTimeline::new(if i==0{20000f64.min(rate/2.)}else{1.},CAP,rate)),filter:biquad::Biquad::default(),input:[[0.;BLOCK];2],output:[[0.;BLOCK];2],calls:0,rejected:0,peak:0.}))}
 fn command(&mut self,lane:usize,kind:usize,seconds:f64,value:f64,tau:f64)->bool{if self.ready||lane>2||kind>3||!seconds.is_finite()||!(0. ..=3600.).contains(&seconds)||!value.is_finite()||!tau.is_finite()||tau<0.||kind==2&&tau==0.||kind<3&&(!(0. ..=if lane==0{self.rate/2.}else{1.}).contains(&value)||!self.lanes[lane].available(1)){self.rejected+=1;return false;}if kind==3{self.lanes[lane].cancel(seconds*self.rate);}else{assert!(self.lanes[lane].add_seconds(seconds,kind as u32,value,tau));}true}
 fn initial(&mut self,lane:usize,value:f64)->bool{if self.ready||lane>2||!value.is_finite()||!(0. ..=if lane==0{self.rate/2.}else{1.}).contains(&value){self.rejected+=1;return false;}self.lanes[lane].intrinsic(value);true}
 fn render(&mut self,n:usize)->bool{if !self.ready||n>BLOCK||self.frame+n as u64>self.rate as u64*3600||(0..self.channels).any(|c|self.input[c][..n].iter().any(|x|!x.is_finite())){self.rejected+=1;return false;}self.peak=0.;for i in 0..n{if self.frame%128==0{for lane in &mut self.lanes{lane.prepare(self.frame,self.rate);}}let at=self.frame as usize%128;let x=[self.input[0][i],if self.channels==2{self.input[1][i]}else{0.}];let y=self.filter.sample(x,self.channels,0,self.lanes[0].output[at]as f64,0.5,0.,self.rate);for c in 0..self.channels{let v=y[c]*self.lanes[1].output[at];let v=v*self.lanes[2].output[at];if !v.is_finite(){self.rejected+=1;return false;}self.output[c][i]=v;self.peak=self.peak.max(v.abs()as f64);}self.frame+=1;if self.frame%128==0{self.filter.end_quantum();}}self.calls+=1;true}
}
#[no_mangle]pub extern "C" fn main_strip_api()->u32{1}
#[no_mangle]pub extern "C" fn main_strip_new(rate:f64,channels:usize)->*mut Engine{Engine::new(rate,channels).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn main_strip_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn main_strip_initial(p:&mut Engine,lane:usize,value:f64)->u32{p.initial(lane,value)as u32}
#[no_mangle]pub extern "C" fn main_strip_command(p:&mut Engine,lane:usize,kind:usize,seconds:f64,value:f64,tau:f64)->u32{p.command(lane,kind,seconds,value,tau)as u32}
#[no_mangle]pub extern "C" fn main_strip_prepare(p:&mut Engine)->u32{if p.ready{return 0;}p.ready=true;1}
#[no_mangle]pub extern "C" fn main_strip_input(p:&mut Engine,ch:usize)->*mut f32{p.input.get_mut(ch).map(|p|p.as_mut_ptr()).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub extern "C" fn main_strip_output(p:&Engine,ch:usize)->*const f32{p.output.get(ch).map(|p|p.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn main_strip_render(p:&mut Engine,n:usize)->u32{p.render(n)as u32}
#[no_mangle]pub extern "C" fn main_strip_stat(p:&Engine,key:usize)->f64{match key{0=>p.frame as f64,1=>p.peak,2=>p.calls as f64,3=>p.rejected as f64,_=>f64::NAN}}
