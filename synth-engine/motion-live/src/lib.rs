//! Original Motion live state. Existing finite Motion/native defaults unchanged.
mod timeline;
mod oscillator;
#[cfg(feature="allocation-audit")]mod allocation;
use timeline::LiveTimeline;
const Q:usize=128;const FRAME_MAX:f64=1099511627648.;const CAPACITY:usize=256;
const INITIAL:[f64;5]=[1.,0.,4.,0.,0.2];
pub struct Engine{rate:f64,ready:bool,construct_count:usize,construct:[(f64,f64);6],frame:u64,origin:u64,last_authored:f64,lanes:[LiveTimeline;5],targets:[f64;5],sines:[oscillator::Sine;2],started:[bool;2],start_seconds:[f64;2],input:[[f32;Q];2],output:[[f32;Q];2],lfo:[[f32;Q];2],calls:u64,processed:u64,skipped:u64,parameters:u64,commands:u64,rejected:u64,late:u64,max_late:u64,peak:f64}
fn canonical(f:f64)->bool{f.is_finite()&&f>=0.&&f<=FRAME_MAX&&f.fract()==0.&&f%128.==0.}
fn timestamp(f:f64,s:f64,r:f64)->bool{canonical(f)&&s.is_finite()&&s>=0.&&s==f/r}
fn integer(v:f64,max:usize)->Option<usize>{if v.is_finite()&&v.fract()==0.&&v>=0.&&v<=max as f64{Some(v as usize)}else{None}}
fn valid_lane(i:usize,v:f64)->bool{v.is_finite()&&v==v as f32 as f64&&match i{0=>(0.5..=1.).contains(&v),1=>(0. ..=0.5).contains(&v),3=>(0. ..=1.).contains(&v),2|4=>((0.01f32 as f64)..=20.).contains(&v),_=>false}}
fn balance(ch:usize,input:f32)->f32{let data:&[u8]=if ch==0{include_bytes!("../resources/balance-left.f32")}else{include_bytes!("../resources/balance-right.f32")};let read=|i:usize|{let at=i*4;f32::from_le_bytes(data[at..at+4].try_into().unwrap())};let position=((input+1.)*512.).clamp(0.,1024.);let a=position as usize;let b=(a+1).min(1024);let fraction=position-a as f32;let left=read(a);left+fraction*(read(b)-left)}
impl Engine{
 pub fn new(rate:f64)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate){return None;}Some(Box::new(Self{rate,ready:false,construct_count:0,construct:[(0.,0.);6],frame:0,origin:0,last_authored:-1.,lanes:std::array::from_fn(|i|LiveTimeline::new(INITIAL[i],CAPACITY,rate)),targets:INITIAL,sines:std::array::from_fn(|_|oscillator::Sine::new(rate,0.)),started:[false;2],start_seconds:[0.;2],input:[[0.;Q];2],output:[[0.;Q];2],lfo:[[0.;Q];2],calls:0,processed:0,skipped:0,parameters:0,commands:0,rejected:0,late:0,max_late:0,peak:0.}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 pub fn constructor(&mut self,slot:usize,frame:f64,seconds:f64)->bool{if self.ready||slot!=self.construct_count||slot>=6||!timestamp(frame,seconds,self.rate)||slot>0&&frame<self.construct[slot-1].0{return self.reject();}self.construct[slot]=(frame,seconds);self.construct_count+=1;true}
 pub fn prepare(&mut self,frame:f64,seconds:f64)->bool{if self.ready||self.construct_count!=6||!timestamp(frame,seconds,self.rate)||frame>self.construct[0].0{return self.reject();}for(slot,lane)in[1,3,2,4].iter().enumerate(){let v=INITIAL[*lane];self.lanes[*lane].intrinsic(v);assert!(self.lanes[*lane].add_seconds(self.construct[slot].1,0,v,0.));}self.start_seconds=[self.construct[4].1,self.construct[5].1];self.frame=frame as u64;self.origin=self.frame;self.last_authored=self.construct[5].0;self.ready=true;true}
 pub fn sync(&mut self,frame:f64)->bool{if !self.ready||!canonical(frame)||frame<self.frame as f64{return self.reject();}self.skipped+=frame as u64-self.frame;self.frame=frame as u64;true}
 pub fn lane(&mut self,lane:usize,value:f64,frame:f64,seconds:f64)->bool{if !self.ready||!valid_lane(lane,value)||!timestamp(frame,seconds,self.rate)||frame<self.last_authored||frame>self.frame as f64||!self.lanes[lane].available_at(1,self.frame as f64){return self.reject();}self.lanes[lane].prune_for_insert(self.frame as f64);assert!(self.lanes[lane].add_seconds(seconds,0,value,0.));self.targets[lane]=value;self.last_authored=frame;self.commands+=1;if frame<self.frame as f64{self.late+=1;self.max_late=self.max_late.max(self.frame-frame as u64);}true}
 fn oscillator_block(&mut self,which:usize,constant:bool){
  let lane=if which==0{2}else{4};let sine=&mut self.sines[which];let mut offset=0;
  if !self.started[which]{let start=self.start_seconds[which]*self.rate;let ceil=((start*1024.).round()/1024.).ceil()as u64;offset=ceil.saturating_sub(self.frame).min(Q as u64)as usize;if offset==Q{self.lfo[which].fill(0.);return;}let fraction=start-ceil as f64;if fraction>0.{offset+=1;}sine.scheduling_offset(fraction,self.lanes[lane].output[0],constant);self.started[which]=true;}
  let n=Q-offset;let start=sine.virtual_index();self.lfo[which][..offset].fill(0.);
  for i in 0..n{self.lfo[which][offset+i]=sine.tick(self.lanes[lane].output[i],self.frame+i as u64,constant,!constant&&i<n/4*4);}
  if constant&&n!=Q{sine.finish_partial_constant(start,n,self.lanes[lane].output[0]);}
 }
 pub fn render(&mut self,channels:usize,mode:usize)->bool{
  if !self.ready||self.frame+128>FRAME_MAX as u64||mode>2||channels>2||mode==2&&(channels==0||(0..channels).any(|c|self.input[c].iter().any(|v|!v.is_finite())))||mode>0&&self.frame<self.construct[5].0 as u64{return self.reject();}
  self.calls+=1;self.peak=0.;self.output.fill([0.;Q]);if mode==0{self.skipped+=128;self.frame+=128;return true;}
  let constant=[!self.lanes[2].accurate(self.frame),!self.lanes[4].accurate(self.frame)];for lane in &mut self.lanes{lane.prepare(self.frame,self.rate);}for i in 0..2{self.oscillator_block(i,constant[i]);}
  if mode==1{self.parameters+=128;}else{for i in 0..Q{let tremolo=self.lanes[0].output[i]+self.lfo[0][i]*self.lanes[1].output[i];let pan=self.lfo[1][i]*self.lanes[3].output[i];let left=self.input[0][i]*tremolo;let right=self.input[channels-1][i]*tremolo;let out=[left*balance(0,pan),right*balance(1,pan)];if out.iter().any(|v|!v.is_finite()){return self.reject();}for ch in 0..2{self.output[ch][i]=out[ch];self.peak=self.peak.max(out[ch].abs()as f64);}}self.processed+=128;}
  self.frame+=128;true
 }
}
#[no_mangle]pub extern "C" fn motion_live_api()->u32{1}
#[no_mangle]pub extern "C" fn motion_live_new(rate:f64)->*mut Engine{Engine::new(rate).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn motion_live_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn motion_live_constructor(p:&mut Engine,slot:f64,frame:f64,seconds:f64)->u32{integer(slot,5).is_some_and(|s|p.constructor(s,frame,seconds))as u32}
#[no_mangle]pub extern "C" fn motion_live_prepare(p:&mut Engine,frame:f64,seconds:f64)->u32{p.prepare(frame,seconds)as u32}
#[no_mangle]pub extern "C" fn motion_live_sync(p:&mut Engine,frame:f64)->u32{p.sync(frame)as u32}
#[no_mangle]pub extern "C" fn motion_live_lane(p:&mut Engine,lane:f64,value:f64,frame:f64,seconds:f64)->u32{integer(lane,4).is_some_and(|i|p.lane(i,value,frame,seconds))as u32}
#[no_mangle]pub extern "C" fn motion_live_render(p:&mut Engine,channels:f64,mode:f64)->u32{let(Some(c),Some(m))=(integer(channels,2),integer(mode,2))else{return 0;};p.render(c,m)as u32}
#[no_mangle]pub extern "C" fn motion_live_input(p:&mut Engine,ch:f64)->*mut f32{integer(ch,1).map_or(std::ptr::null_mut(),|c|p.input[c].as_mut_ptr())}
#[no_mangle]pub extern "C" fn motion_live_output(p:&Engine,ch:f64)->*const f32{integer(ch,1).map_or(std::ptr::null(),|c|p.output[c].as_ptr())}
#[no_mangle]pub extern "C" fn motion_live_target(p:&Engine,lane:f64)->f64{integer(lane,4).map_or(f64::NAN,|i|p.targets[i])}
#[no_mangle]pub extern "C" fn motion_live_value(p:&Engine,lane:f64,sample:f64)->f64{let(Some(l),Some(i))=(integer(lane,4),integer(sample,127))else{return f64::NAN;};p.lanes[l].output[i]as f64}
#[no_mangle]pub extern "C" fn motion_live_stat(p:&Engine,key:f64)->f64{let Some(i)=integer(key,13)else{return f64::NAN;};match i{0=>p.frame as f64,1=>p.peak,2=>p.sines[0].phase(),3=>p.sines[1].phase(),4=>p.calls as f64,5=>p.processed as f64,6=>p.skipped as f64,7=>p.parameters as f64,8=>p.commands as f64,9=>p.rejected as f64,10=>p.late as f64,11=>p.max_late as f64,12=>p.origin as f64,13=>p.last_authored,_=>f64::NAN}}
