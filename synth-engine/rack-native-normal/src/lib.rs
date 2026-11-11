//! Separate normal Width/Ring primitive. Every original AudioParam owns a lane.
//! No transport assumptions: callers supply ordered authored and observed clocks.
//! Accepted captured/live rack-native profiles remain separate and unchanged.
mod timeline;
#[path="oscillator.rs"]mod sine;
#[cfg(feature="allocation-audit")]mod allocation;
use timeline::LiveTimeline;
const QUANTUM:usize=128;
const FRAME_MAX:f64=1099511627648.;
const CAPACITY:usize=256;
pub struct Engine{kind:usize,rate:f64,max_channels:usize,ready:bool,oscillator_started:bool,start_seconds:f64,frame:u64,origin:u64,last_authored:f64,lanes:[LiveTimeline;4],targets:[f64;4],input:[[f32;128];2],output:[[f32;128];2],sine:sine::Sine,calls:u64,processed:u64,skipped:u64,parameter_frames:u64,commands:u64,rejected:u64,late:u64,max_late:u64,peak:f64,output_channels:usize}
fn canonical(frame:f64)->bool{frame.is_finite()&&frame>=0.&&frame<=FRAME_MAX&&frame.fract()==0.&&frame%128.==0.}
fn timestamp(frame:f64,seconds:f64,rate:f64)->bool{canonical(frame)&&seconds.is_finite()&&seconds>=0.&&seconds==frame/rate}
fn index(n:f64,max:usize)->Option<usize>{if n.is_finite()&&n.fract()==0.&&n>=0.&&n<=max as f64{Some(n as usize)}else{None}}
impl Engine{
 fn intrinsic(kind:usize,lane:usize)->f64{if kind==1||lane==1||lane==2{1.}else if lane==0{300.}else{0.}}
 fn count(&self)->usize{if self.kind==1{4}else{3}}
 fn valid(&self,lane:usize,value:f64)->bool{value.is_finite()&&value==value as f32 as f64&&if self.kind==1{if lane<2{(0.5..=1.5).contains(&value)}else{lane<4&&(-0.5..=0.5).contains(&value)}}else{match lane{0=>(20. ..=2000.).contains(&value),1|2=>(0. ..=1.).contains(&value),_=>false}}}
 pub fn new(kind:usize,rate:f64,channels:usize)->Option<Box<Self>>{if !(1..=2).contains(&kind)||!rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels){return None;}Some(Box::new(Self{kind,rate,max_channels:channels,ready:false,oscillator_started:false,start_seconds:0.,frame:0,origin:0,last_authored:-1.,lanes:std::array::from_fn(|i|LiveTimeline::new(Self::intrinsic(kind,i),CAPACITY,rate)),targets:std::array::from_fn(|i|Self::intrinsic(kind,i)),input:[[0.;128];2],output:[[0.;128];2],sine:sine::Sine::new(rate,0.),calls:0,processed:0,skipped:0,parameter_frames:0,commands:0,rejected:0,late:0,max_late:0,peak:0.,output_channels:if kind==1{2}else{channels}}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 pub fn prepare(&mut self,frame:f64,seconds:f64)->bool{if self.ready||!timestamp(frame,seconds,self.rate){return self.reject();}if self.kind==2{assert!(self.lanes[0].add_seconds(seconds,0,300.,0.));}self.ready=true;self.start_seconds=seconds;self.frame=frame as u64;self.origin=self.frame;true}
 pub fn sync(&mut self,frame:f64)->bool{if !self.ready||!canonical(frame)||frame<self.frame as f64{return self.reject();}self.skipped+=frame as u64-self.frame;self.frame=frame as u64;true}
 pub fn lane(&mut self,lane:usize,value:f64,authored:f64,seconds:f64,initial:bool)->bool{
  if !self.ready||lane>=self.count()||!self.valid(lane,value)||!timestamp(authored,seconds,self.rate)||authored<self.origin as f64||authored>self.frame as f64||authored<self.last_authored||!self.lanes[lane].available_at(1,self.frame as f64){return self.reject();}
  self.lanes[lane].prune_for_insert(self.frame as f64);assert!(self.lanes[lane].add_seconds(seconds,if initial{0}else{2},value,if initial{0.}else{0.02}));self.targets[lane]=value;self.last_authored=authored;self.commands+=1;if self.frame>authored as u64{self.late+=1;self.max_late=self.max_late.max(self.frame-authored as u64);}true
 }
 fn oscillator_window(&mut self,constant:bool)->(usize,usize,f64){
  let mut offset=0;if !self.oscillator_started{let start=self.start_seconds*self.rate;let ceil=((start*1024.).round()/1024.).ceil() as u64;offset=ceil.saturating_sub(self.frame).min(128)as usize;if offset==128{return(offset,0,self.sine.virtual_index());}let fraction=start-ceil as f64;if fraction>0.{offset+=1;}self.sine.scheduling_offset(fraction,self.lanes[0].output[0],constant);self.oscillator_started=true;}(offset,128-offset,self.sine.virtual_index())
 }
 pub fn render(&mut self,channels:usize,demand:bool)->bool{
  if !self.ready||self.frame+128>FRAME_MAX as u64||channels>self.max_channels||(0..channels).any(|c|self.input[c].iter().any(|x|!x.is_finite())){return self.reject();}self.peak=0.;self.calls+=1;self.output_channels=if self.kind==1{2}else{channels.max(1)};
  if !demand||channels==0{self.output.fill([0.;128]);self.skipped+=128;self.frame+=128;return true;}
  let constant=!self.lanes[0].accurate(self.frame);for i in 0..self.count(){self.lanes[i].prepare(self.frame,self.rate);}
  let(offset,n,start)=if self.kind==2{self.oscillator_window(constant)}else{(0,128,0.)};
  for i in 0..QUANTUM{let l=self.input[0][i];let r=if channels==2{self.input[1][i]}else{0.};let out=if self.kind==1{[(l*self.lanes[0].output[i])+(r*self.lanes[2].output[i]),(r*self.lanes[1].output[i])+(l*self.lanes[3].output[i])]}else{let c=if i<offset{0.}else{let k=i-offset;self.sine.tick(self.lanes[0].output[k],self.frame+k as u64,constant,!constant&&k<n/4*4)};let wet=self.lanes[1].output[i];let dry=self.lanes[2].output[i];[(l*c)*wet+l*dry,(r*c)*wet+r*dry]};for ch in 0..2{if !out[ch].is_finite(){return self.reject();}self.output[ch][i]=out[ch];self.peak=self.peak.max(out[ch].abs() as f64);}}
  if self.kind==2&&constant&&n!=128{self.sine.finish_partial_constant(start,n,self.lanes[0].output[0]);}self.frame+=128;self.processed+=128;true
 }
 /// Native GainHandler::ProcessOnlyAudioParams evaluates its gain and pulls
 /// connected oscillator inputs without reading or producing program audio.
 pub fn parameters_only(&mut self,channels:usize)->bool{
  if !self.ready||self.frame+128>FRAME_MAX as u64||channels>self.max_channels{return self.reject();}self.peak=0.;self.calls+=1;self.output_channels=if self.kind==1{2}else{channels.max(1)};
  let constant=!self.lanes[0].accurate(self.frame);for i in 0..self.count(){self.lanes[i].prepare(self.frame,self.rate);}if self.kind==2{let(_,n,start)=self.oscillator_window(constant);for i in 0..n{self.sine.tick(self.lanes[0].output[i],self.frame+i as u64,constant,!constant&&i<n/4*4);}if constant&&n!=128{self.sine.finish_partial_constant(start,n,self.lanes[0].output[0]);}}
  self.output.fill([0.;128]);self.frame+=128;self.parameter_frames+=128;true
 }
 pub fn reset_native(&mut self,frame:f64,seconds:f64)->bool{if !self.ready||!timestamp(frame,seconds,self.rate){return self.reject();}for i in 0..4{let v=Self::intrinsic(self.kind,i);self.lanes[i].reset(v);self.targets[i]=v;}self.sine.reset();self.oscillator_started=false;self.start_seconds=seconds;self.input.fill([0.;128]);self.output.fill([0.;128]);self.frame=frame as u64;self.origin=self.frame;self.last_authored=-1.;if self.kind==2{assert!(self.lanes[0].add_seconds(seconds,0,300.,0.));}self.peak=0.;self.calls=0;self.processed=0;self.skipped=0;self.parameter_frames=0;self.commands=0;self.late=0;self.max_late=0;true}
}
#[no_mangle]pub extern "C" fn rack_normal_api()->u32{1}
#[no_mangle]pub extern "C" fn rack_normal_new(kind:f64,rate:f64,channels:f64)->*mut Engine{let(Some(k),Some(c))=(index(kind,2),index(channels,2))else{return std::ptr::null_mut();};Engine::new(k,rate,c).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn rack_normal_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn rack_normal_prepare(p:&mut Engine,frame:f64,seconds:f64)->u32{p.prepare(frame,seconds)as u32}
#[no_mangle]pub extern "C" fn rack_normal_sync(p:&mut Engine,frame:f64)->u32{p.sync(frame)as u32}
#[no_mangle]pub extern "C" fn rack_normal_lane(p:&mut Engine,lane:f64,value:f64,frame:f64,seconds:f64,initial:f64)->u32{let Some(i)=index(lane,3)else{return 0;};if initial!=0.&&initial!=1.{return 0;}p.lane(i,value,frame,seconds,initial==1.)as u32}
#[no_mangle]pub extern "C" fn rack_normal_render(p:&mut Engine,channels:f64,demand:f64)->u32{let Some(c)=index(channels,2)else{return 0;};if demand!=0.&&demand!=1.{return 0;}p.render(c,demand==1.)as u32}
#[no_mangle]pub extern "C" fn rack_normal_reset_native(p:&mut Engine,frame:f64,seconds:f64)->u32{p.reset_native(frame,seconds)as u32}
#[no_mangle]pub extern "C" fn rack_normal_input(p:&mut Engine,ch:f64)->*mut f32{index(ch,1).map_or(std::ptr::null_mut(),|c|p.input[c].as_mut_ptr())}
#[no_mangle]pub extern "C" fn rack_normal_output(p:&Engine,ch:f64)->*const f32{index(ch,1).map_or(std::ptr::null(),|c|p.output[c].as_ptr())}
#[no_mangle]pub extern "C" fn rack_normal_value(p:&Engine,lane:f64,sample:f64)->f64{let(Some(l),Some(i))=(index(lane,3),index(sample,127))else{return f64::NAN;};p.lanes[l].output[i]as f64}
#[no_mangle]pub extern "C" fn rack_normal_target(p:&Engine,lane:f64)->f64{index(lane,3).map_or(f64::NAN,|i|p.targets[i])}
#[no_mangle]pub extern "C" fn rack_normal_stat(p:&Engine,index:f64)->f64{let Some(i)=crate::index(index,13)else{return f64::NAN;};match i{0=>p.frame as f64,1=>p.peak,2=>p.sine.phase(),3=>p.output_channels as f64,4=>p.calls as f64,5=>p.processed as f64,6=>p.skipped as f64,7=>p.commands as f64,8=>p.rejected as f64,9=>p.late as f64,10=>p.max_late as f64,11=>p.origin as f64,12=>p.last_authored,13=>p.parameter_frames as f64,_=>f64::NAN}}

#[no_mangle]pub extern "C" fn rack_normal_parameters_only(p:&mut Engine,channels:f64)->u32{let Some(c)=index(channels,2)else{return 0;};p.parameters_only(c)as u32}
