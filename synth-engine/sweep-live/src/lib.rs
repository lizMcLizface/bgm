//! Original SweepFilter: HP -> LP, four independent Native parameter timelines.
//! Complete calls reserve all lanes before ordered insertion. Captured/frozen
//! insertion epoch is explicit; no universal unsuspended Native handler claim.
#[path="../../fdn-room-live/src/timeline.rs"]mod timeline;
#[path="../../rack-native/src/biquad.rs"]mod biquad;
#[path="../../rack-native/src/tail.rs"]mod tail;
#[cfg(feature="allocation-audit")]mod allocation;
const Q:usize=128;const CAP:usize=256;const MAX:u64=1099511627648;
fn frame(v:f64)->Option<u64>{if v.is_finite()&&v>=0.&&v<=MAX as f64&&v.fract()==0.&&v%128.==0.{Some(v as u64)}else{None}}
fn finite(v:f64)->bool{v.is_finite()&&(v as f32).is_finite()}
fn defaults(i:usize)->f64{if i<2{350.}else{1.}}
pub struct Engine{rate:f64,channels:usize,ready:bool,frame:u64,origin:u64,last_author:Option<u64>,lanes:[timeline::LiveTimeline;4],targets:[f64;4],filters:[biquad::Biquad;2],curves:[[f32;Q];4],input:[[f32;Q];2],output:[[f32;Q];2],calls:u64,commands:u64,rejected:u64,rendered:u64,unpulled:u64,late:u64,max_late:u64,peak:f64}
impl Engine{
 fn new(rate:f64,channels:u32)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels){return None;}Some(Box::new(Self{rate,channels:channels as usize,ready:false,frame:0,origin:0,last_author:None,lanes:std::array::from_fn(|i|timeline::LiveTimeline::new(defaults(i),CAP,rate)),targets:std::array::from_fn(defaults),filters:[biquad::Biquad::default();2],curves:std::array::from_fn(|i|[defaults(i)as f32;Q]),input:[[0.;Q];2],output:[[0.;Q];2],calls:0,commands:0,rejected:0,rendered:0,unpulled:0,late:0,max_late:0,peak:0.}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn prepare(&mut self,origin:f64)->bool{let Some(f)=frame(origin)else{return self.reject();};if self.ready{return self.reject();}self.ready=true;self.origin=f;self.frame=f;true}
 fn chronology(&self,author:u64)->bool{self.ready&&author>=self.origin&&author<=self.frame&&self.last_author.is_none_or(|last|author>=last)}
 fn capacity(&self,count:u32,author:f64)->bool{let Some(f)=frame(author)else{return false;};self.ready&&f>=self.origin&&self.last_author.is_none_or(|last|f>=last)&&count>0&&count<=CAP as u32&&self.lanes.iter().all(|l|l.available_at(count as usize,author))}
 fn admit(&mut self,lp:f64,hp:f64,q:f64,tc:f64,author:f64,seconds:f64)->bool{
  let Some(f)=frame(author)else{return self.reject();};if !self.chronology(f)||!seconds.is_finite()||seconds!=f as f64/self.rate||!finite(lp)||!finite(hp)||!finite(q)||!tc.is_finite()||!self.capacity(1,author){return self.reject();}
  let values=[lp,hp,q,std::f64::consts::FRAC_1_SQRT_2];let target=tc>0.;
  // Scheduled values are RAW Float32 values. Unlike an intrinsic .value write,
  // setValueAtTime/SetTarget do not pre-clamp the event to the nominal range.
  for(i,value)in values.into_iter().enumerate(){self.lanes[i].prune_for_insert(author);assert!(self.lanes[i].add_seconds(seconds,if target{2}else{0},value,if target{tc}else{0.}));self.targets[i]=value;}
  self.last_author=Some(f);self.commands+=1;if self.frame>f{self.late+=1;self.max_late=self.max_late.max(self.frame-f);}true
 }
 fn sync(&mut self,time:f64)->bool{let Some(f)=frame(time)else{return self.reject();};if !self.ready||f<self.frame{return self.reject();}self.frame=f;true}
 fn render(&mut self,channels:u32,pulled:bool)->bool{
  if !self.ready||self.frame>MAX-128||channels>2||channels!=0&&channels as usize!=self.channels||!pulled&&channels!=0||(0..channels as usize).any(|c|self.input[c].iter().any(|v|!v.is_finite())){return self.reject();}
  self.output.fill([0.;Q]);self.peak=0.;if pulled{
   for i in 0..4{self.lanes[i].prepare(self.frame,self.rate);self.lanes[i].clamp_output(if i<2{0.}else{-f32::MAX},if i<2{(self.rate/2.)as f32}else{f32::MAX});self.curves[i]=self.lanes[i].output;}
   for at in 0..Q{let mut x=[if channels>0{self.input[0][at]}else{0.},if channels>1{self.input[1][at]}else{0.}];x=self.filters[0].sample(x,self.channels,1,self.curves[1][at]as f64,self.curves[3][at]as f64,0.,self.rate);x=self.filters[1].sample(x,self.channels,0,self.curves[0][at]as f64,self.curves[2][at]as f64,0.,self.rate);for(c,value)in x.into_iter().enumerate().take(self.channels){if !value.is_finite(){return self.reject();}self.output[c][at]=value;self.peak=self.peak.max(value.abs()as f64);}}
   for filter in &mut self.filters{filter.end_quantum();}self.rendered+=128;
  }else{self.unpulled+=128;}
  self.frame+=128;self.calls+=1;true
 }
}
#[no_mangle]pub extern "C" fn sweep_live_api()->u32{1}
#[no_mangle]pub extern "C" fn sweep_live_new(rate:f64,channels:u32)->*mut Engine{Engine::new(rate,channels).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn sweep_live_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn sweep_live_prepare(p:&mut Engine,origin:f64)->u32{p.prepare(origin)as u32}
#[no_mangle]pub extern "C" fn sweep_live_sync(p:&mut Engine,time:f64)->u32{p.sync(time)as u32}
#[no_mangle]pub extern "C" fn sweep_live_set(p:&mut Engine,lp:f64,hp:f64,q:f64,tc:f64,author:f64,seconds:f64)->u32{p.admit(lp,hp,q,tc,author,seconds)as u32}
#[no_mangle]pub extern "C" fn sweep_live_capacity(p:&Engine,count:u32,author:f64)->u32{p.capacity(count,author)as u32}
#[no_mangle]pub extern "C" fn sweep_live_render(p:&mut Engine,channels:u32,pulled:u32)->u32{if pulled>1{return p.reject()as u32;}p.render(channels,pulled==1)as u32}
#[no_mangle]pub extern "C" fn sweep_live_input(p:&mut Engine,channel:u32)->*mut f32{p.input.get_mut(channel as usize).map_or(std::ptr::null_mut(),|v|v.as_mut_ptr())}
#[no_mangle]pub extern "C" fn sweep_live_output(p:&Engine,channel:u32)->*const f32{p.output.get(channel as usize).map_or(std::ptr::null(),|v|v.as_ptr())}
#[no_mangle]pub extern "C" fn sweep_live_target(p:&Engine,lane:u32)->f64{p.targets.get(lane as usize).copied().unwrap_or(f64::NAN)}
#[no_mangle]pub extern "C" fn sweep_live_curve(p:&Engine,lane:u32,index:u32)->f64{p.curves.get(lane as usize).and_then(|v|v.get(index as usize)).map_or(f64::NAN,|v|*v as f64)}
#[no_mangle]pub extern "C" fn sweep_live_stat(p:&Engine,index:u32)->f64{match index{0=>p.frame as f64,1=>p.peak,2=>p.origin as f64,3=>p.calls as f64,4=>p.commands as f64,5=>p.rejected as f64,6=>p.rendered as f64,7=>p.unpulled as f64,8=>p.late as f64,9=>p.max_late as f64,10=>p.channels as f64,11=>p.last_author.map_or(-1.,|v|v as f64),_=>f64::NAN}}
