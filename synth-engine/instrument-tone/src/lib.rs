//! Exact original Nodes.Filter / Nodes.EQ2 numerical stages, explicitly pulled.
//! Original constructor assignments are distinct from scheduled step events.
#[path="../../fdn-room-live/src/timeline.rs"]mod timeline;
mod biquad;
#[path="../../rack-native/src/tail.rs"]mod tail;
#[cfg(feature="allocation-audit")]mod allocation;
const N:usize=128;const CAP:usize=256;const MAX:u64=1099511627648;
fn frame(v:f64)->Option<u64>{if v.is_finite()&&v>=0.&&v<=MAX as f64&&v.fract()==0.&&v%128.==0.{Some(v as u64)}else{None}}
fn finite(v:f64)->bool{v.is_finite()&&(v as f32).is_finite()}
fn default(i:usize)->f64{match i%4{0=>350.,1=>1.,_=>0.}}
pub struct Engine{rate:f64,mode:u32,channels:usize,ready:bool,frame:u64,origin:u64,last:Option<u64>,kinds:[u32;4],lanes:[timeline::LiveTimeline;16],targets:[f64;16],curves:[[f32;N];16],filters:[biquad::Biquad;4],input:[[f32;N];2],output:[[f32;N];2],calls:u64,commands:u64,rejected:u64,rendered:u64,unpulled:u64,late:u64,clamped:u64,peak:f64}
impl Engine{
 fn new(rate:f64,channels:u32,mode:u32)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels)||mode>2{return None;}Some(Box::new(Self{rate,mode,channels:channels as usize,ready:false,frame:0,origin:0,last:None,kinds:[0,5,4,6],lanes:std::array::from_fn(|i|timeline::LiveTimeline::new(default(i),CAP,rate)),targets:std::array::from_fn(default),curves:std::array::from_fn(|i|[default(i)as f32;N]),filters:[biquad::Biquad::default();4],input:[[0.;N];2],output:[[0.;N];2],calls:0,commands:0,rejected:0,rendered:0,unpulled:0,late:0,clamped:0,peak:0.}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn active(&self,lane:usize)->bool{lane<16&&if self.mode==0{lane<4}else if self.mode==1{lane>=4}else{true}}
 fn chronology(&self,author:u64)->bool{self.ready&&author>=self.origin&&author<=self.frame&&self.last.is_none_or(|v|author>=v)}
 fn credit(&self,lane:usize,n:usize,author:f64)->bool{self.active(lane)&&n<=CAP&&frame(author).is_some_and(|f|self.ready&&f>=self.origin&&self.last.is_none_or(|last|f>=last))&&self.lanes[lane].available_at(n,author)}
 fn value_ok(lane:usize,v:f64)->bool{finite(v)&&match lane%4{0=>(0. ..=11000.).contains(&v),1=>(0. ..=100.).contains(&v),2=>(-40. ..=40.).contains(&v),_=>(-153600. ..=153600.).contains(&v)}}
 fn command(&mut self,lane:usize,op:u32,v:f64,tau:f64,author:f64,seconds:f64)->bool{
  let Some(at)=frame(author)else{return self.reject();};
  if !self.chronology(at)||!self.active(lane)||!matches!(op,0|2|3|4)||!seconds.is_finite()||seconds<0.||seconds>MAX as f64/self.rate||!tau.is_finite()||tau<0.||op==2&&tau==0.||op!=3&&!Self::value_ok(lane,v)||op!=3&&!self.credit(lane,1,author){return self.reject();}
  let time=seconds.max(author/self.rate);if time!=seconds{self.clamped+=1;}self.lanes[lane].prune_for_insert(author);
  if op==3{self.lanes[lane].cancel(time*self.rate);}else{let value=if op==4&&lane%4==0{v.clamp(0.,self.rate/2.)}else{v};if op==4{self.lanes[lane].intrinsic(value);}assert!(self.lanes[lane].add_seconds(time,if op==2{2}else{0},value,if op==2{tau}else{0.}));self.targets[lane]=v;}
  self.last=Some(at);self.commands+=1;if at<self.frame{self.late+=1;}true
 }
 fn prepare(&mut self,origin:f64)->bool{let Some(at)=frame(origin)else{return self.reject();};if self.ready{return self.reject();}self.ready=true;self.frame=at;self.origin=at;let t=origin/self.rate;
  // EQ constructor order: low frequency/gain, high frequency/gain, mid frequency/Q/gain.
  if self.mode!=0{for(lane,value)in[(4,320.),(6,0.),(12,3200.),(14,0.),(8,1000.),(9,0.7),(10,0.)]{assert!(self.command(lane,4,value,0.,origin,t));}}
  if self.mode!=1{assert!(self.command(0,0,11000.,0.,origin,t));}true
 }
 fn sync(&mut self,at:f64)->bool{let Some(f)=frame(at)else{return self.reject();};if !self.ready||f<self.frame{return self.reject();}self.frame=f;true}
 fn filter_type(&mut self,kind:u32,author:f64)->bool{let Some(at)=frame(author)else{return self.reject();};if self.mode==1||kind>6||!self.chronology(at){return self.reject();}if kind!=self.kinds[0]{self.filters[0].clear();self.kinds[0]=kind;}self.last=Some(at);self.commands+=1;true}
 fn render(&mut self,channels:u32,pulled:bool)->bool{
  if !self.ready||self.frame>MAX-128||channels>2||channels!=0&&channels as usize!=self.channels||!pulled&&channels!=0||(0..channels as usize).any(|c|self.input[c].iter().any(|v|!v.is_finite())){return self.reject();}
  self.output.fill([0.;N]);self.peak=0.;if pulled{
   for lane in 0..16{if !self.active(lane){continue;}self.lanes[lane].prepare(self.frame,self.rate);if lane%4==0{self.lanes[lane].clamp_output(0.,(self.rate/2.)as f32);}self.curves[lane]=self.lanes[lane].output;}
   let order=if self.mode==0{[0,4,4,4]}else if self.mode==1{[1,2,3,4]}else{[1,2,3,0]};
   for at in 0..N{let mut x=[if channels>0{self.input[0][at]}else{0.},if channels>1{self.input[1][at]}else{0.}];for stage in order{if stage==4{break;}let lane=stage*4;let normalized=self.curves[lane][at]as f64/(self.rate/2.);let detune=self.curves[lane+3][at];let normalized=if detune==0.{normalized}else{normalized*((detune/1200f32)as f64).exp2()};x=self.filters[stage].sample(x,self.channels,self.kinds[stage],normalized,self.curves[lane+1][at]as f64,self.curves[lane+2][at]as f64);}
    for(c,value)in x.into_iter().enumerate().take(self.channels){if !value.is_finite(){return self.reject();}self.output[c][at]=value;self.peak=self.peak.max(value.abs()as f64);}}
   for f in &mut self.filters{f.end_quantum();}self.rendered+=128;
  }else{self.unpulled+=128;}
  self.frame+=128;self.calls+=1;true
 }
}
#[no_mangle]pub extern "C" fn instrument_tone_api()->u32{1}
#[no_mangle]pub extern "C" fn instrument_tone_new(rate:f64,channels:u32,mode:u32)->*mut Engine{Engine::new(rate,channels,mode).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn instrument_tone_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn instrument_tone_prepare(p:&mut Engine,at:f64)->u32{p.prepare(at)as u32}
#[no_mangle]pub extern "C" fn instrument_tone_sync(p:&mut Engine,at:f64)->u32{p.sync(at)as u32}
#[no_mangle]pub extern "C" fn instrument_tone_command(p:&mut Engine,lane:u32,op:u32,value:f64,tau:f64,author:f64,seconds:f64)->u32{p.command(lane as usize,op,value,tau,author,seconds)as u32}
#[no_mangle]pub extern "C" fn instrument_tone_type(p:&mut Engine,kind:u32,author:f64)->u32{p.filter_type(kind,author)as u32}
#[no_mangle]pub extern "C" fn instrument_tone_credit(p:&Engine,lane:u32,n:u32,author:f64)->u32{p.credit(lane as usize,n as usize,author)as u32}
#[no_mangle]pub extern "C" fn instrument_tone_render(p:&mut Engine,channels:u32,pulled:u32)->u32{if pulled>1{return p.reject()as u32;}p.render(channels,pulled==1)as u32}
#[no_mangle]pub extern "C" fn instrument_tone_input(p:&mut Engine,c:u32)->*mut f32{p.input.get_mut(c as usize).map_or(std::ptr::null_mut(),|v|v.as_mut_ptr())}
#[no_mangle]pub extern "C" fn instrument_tone_output(p:&Engine,c:u32)->*const f32{p.output.get(c as usize).map_or(std::ptr::null(),|v|v.as_ptr())}
#[no_mangle]pub extern "C" fn instrument_tone_curve(p:&Engine,lane:u32,at:u32)->f64{p.curves.get(lane as usize).and_then(|v|v.get(at as usize)).map_or(f64::NAN,|v|*v as f64)}
#[no_mangle]pub extern "C" fn instrument_tone_target(p:&Engine,lane:u32)->f64{p.targets.get(lane as usize).copied().unwrap_or(f64::NAN)}
#[no_mangle]pub extern "C" fn instrument_tone_stat(p:&Engine,i:u32)->f64{match i{0=>p.frame as f64,1=>p.peak,2=>p.calls as f64,3=>p.commands as f64,4=>p.rejected as f64,5=>p.rendered as f64,6=>p.unpulled as f64,7=>p.late as f64,8=>p.clamped as f64,9=>p.mode as f64,10=>p.channels as f64,11=>p.kinds[0]as f64,_=>f64::NAN}}
