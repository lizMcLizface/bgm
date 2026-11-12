//! Original Room Gain controller: absolute output clock, literal repeated steps.
//! Existing c7b4 prepared mixer and all captured DSP modules remain untouched.
#[path="../../room-complete-mix/src/timeline.rs"]mod timeline;
#[cfg(feature="allocation-audit")]mod allocation;
const QUANTUM:usize=128;const CAPACITY:usize=256;const PAIRS:usize=16;const FRAME_MAX:u64=1099511627648;
#[derive(Clone,Copy)]struct Reservation{id:u32,amount:f64,dry_frame:u64,dry_seconds:f64,dry_done:bool,prepared:bool}
pub struct Engine{rate:f64,source:usize,wet:usize,frame:u64,started:bool,origin:u64,last_call:u64,has_call:bool,lanes:[timeline::LiveTimeline;2],reserved:[usize;2],tickets:[Option<Reservation>;PAIRS],dry:[[f32;QUANTUM];2],wet_input:[[f32;QUANTUM];2],output:[[f32;QUANTUM];2],calls:u64,audio_frames:u64,parameter_frames:u64,unpulled_frames:u64,commands:u64,pairs:u64,rejected:u64,late:u64,max_late:u64,peak:f64,last_seconds:[f64;2],last_main_seconds:[f64;2],last_observed:[u64;2],ready_reserves:u64,ready_cancels:u64}
fn valid_amount(v:f64)->bool{v.is_finite()&&(0. ..=1.).contains(&v)}
fn gain(lane:usize,v:f64)->f64{if lane==0{if v<0.5{1.}else{1.-((v-0.5)*2.)}}else if v<0.5{v*2.}else{1.}}
fn frame(v:f64)->Option<u64>{if v.is_finite()&&v.fract()==0.&&(0. ..=FRAME_MAX as f64).contains(&v)&&(v as u64)%128==0{Some(v as u64)}else{None}}
impl Engine{
 pub fn new(rate:f64,source:usize,wet:usize)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&source)||!(1..=2).contains(&wet){return None;}Some(Box::new(Self{rate,source,wet,frame:0,started:false,origin:0,last_call:0,has_call:false,lanes:std::array::from_fn(|_|timeline::LiveTimeline::new(1.,CAPACITY,rate)),reserved:[0;2],tickets:[None;PAIRS],dry:[[0.;QUANTUM];2],wet_input:[[0.;QUANTUM];2],output:[[0.;QUANTUM];2],calls:0,audio_frames:0,parameter_frames:0,unpulled_frames:0,commands:0,pairs:0,rejected:0,late:0,max_late:0,peak:0.,last_seconds:[0.;2],last_main_seconds:[0.;2],last_observed:[0;2],ready_reserves:0,ready_cancels:0}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn time(&self,t:f64)->bool{t.is_finite()&&t>=0.&&t*self.rate<=FRAME_MAX as f64}
 pub fn sync(&mut self,at:u64,isolated:bool)->bool{if at>FRAME_MAX||at%128!=0||self.started&&(at<self.frame||at>self.frame&&!isolated){return self.reject();}if !self.started{self.origin=at;self.started=true;}self.frame=at;true}
 fn can_step(&self,lane:usize,t:f64,call:u64,extra:usize)->bool{lane<2&&self.time(t)&&(!self.has_call||call>=self.last_call)&&self.lanes[lane].available_at(self.reserved[lane]+extra,call as f64)}
 fn commit_step(&mut self,lane:usize,amount:f64,t:f64,call:u64){let now=call as f64/self.rate;let clamped=if t<now{now}else{t};self.lanes[lane].prune_for_insert(call as f64);assert!(self.lanes[lane].add_seconds(clamped,0,gain(lane,amount),0.));self.last_call=call;self.has_call=true;self.last_seconds[lane]=t;self.last_main_seconds[lane]=clamped;self.last_observed[lane]=self.frame;self.commands+=1;if self.frame>call{self.late+=1;self.max_late=self.max_late.max(self.frame-call);}}
 /// Both capacities/times are checked before either timeline mutates.
 pub fn pair(&mut self,amount:f64,dry:f64,wet:f64,cd:u64,cw:u64)->bool{
  if !valid_amount(amount)||wet<dry||cw<cd||cd%128!=0||cw%128!=0||cw>FRAME_MAX||!self.can_step(0,dry,cd,1)||!self.can_step(1,wet,cw,1){return self.reject();}
  self.commit_step(0,amount,dry,cd);self.commit_step(1,amount,wet,cw);self.pairs+=1;true
 }
 /// Reserve both lanes before the first live leaf, without changing the wet lane.
 pub fn reserve(&mut self,id:u32,amount:f64,call:u64)->bool{
  if id==0||id>8388607||!valid_amount(amount)||call%128!=0||call>FRAME_MAX||self.tickets.iter().flatten().any(|t|t.id==id)||!self.can_step(0,0.,call,1)||!self.can_step(1,0.,call,1){return self.reject();}
  let Some(slot)=self.tickets.iter_mut().find(|p|p.is_none())else{return self.reject();};*slot=Some(Reservation{id,amount,dry_frame:call,dry_seconds:0.,dry_done:false,prepared:false});self.reserved[0]+=1;self.reserved[1]+=1;true
 }

 /// Preparation reserves BOTH lanes conservatively without pruning or
 /// borrowing a future Native main/render clock. No gain event is added.
 pub fn reserve_ready(&mut self,id:u32,amount:f64)->bool{
  if id==0||id>8388607||!valid_amount(amount)||self.tickets.iter().flatten().any(|r|r.id==id)||!(0..2).all(|lane|self.lanes[lane].available_at(self.reserved[lane]+1,0.)){return self.reject();}
  let Some(slot)=self.tickets.iter_mut().find(|p|p.is_none())else{return self.reject();};
  *slot=Some(Reservation{id,amount,dry_frame:0,dry_seconds:0.,dry_done:false,prepared:true});self.reserved[0]+=1;self.reserved[1]+=1;self.ready_reserves+=1;true
 }
 pub fn cancel_ready(&mut self,id:u32)->bool{
  let Some(index)=self.tickets.iter().position(|r|r.is_some_and(|r|r.id==id))else{return self.reject();};let r=self.tickets[index].unwrap();
  if !r.prepared||r.dry_done{return self.reject();}
  self.reserved[0]-=1;self.reserved[1]-=1;self.tickets[index]=None;self.ready_cancels+=1;true
 }
 pub fn ready_credit(&self,lane:usize)->usize{if lane>1{return 0;}let mut n=0;while n<CAPACITY&&self.lanes[lane].available_at(self.reserved[lane]+n+1,0.){n+=1;}n}
 pub fn leaf(&mut self,id:u32,lane:usize,amount:f64,t:f64,call:u64)->bool{
  let Some(index)=self.tickets.iter().position(|r|r.is_some_and(|r|r.id==id))else{return self.reject();};let r=self.tickets[index].unwrap();
  if lane>1||amount.to_bits()!=r.amount.to_bits()||!self.time(t)||call%128!=0||call>FRAME_MAX||self.has_call&&call<self.last_call||lane==0&&(r.dry_done||!r.prepared&&call!=r.dry_frame)||lane==1&&(!r.dry_done||call<r.dry_frame||t<r.dry_seconds)||!self.lanes[lane].available_at(1,call as f64){return self.reject();}
  self.reserved[lane]-=1;self.commit_step(lane,amount,t,call);
  if lane==0{self.tickets[index]=Some(Reservation{dry_done:true,dry_seconds:t,dry_frame:call,..r});}else{self.tickets[index]=None;self.pairs+=1;}true
 }
 pub fn render(&mut self,dry_mode:usize,wet_mode:usize)->bool{
  if !self.started||dry_mode>2||wet_mode>2||self.frame+128>FRAME_MAX||(dry_mode==2&&(0..self.source).any(|c|self.dry[c].iter().any(|v|!v.is_finite())))||(wet_mode==2&&(0..self.wet).any(|c|self.wet_input[c].iter().any(|v|!v.is_finite()))){return self.reject();}
  let modes=[dry_mode,wet_mode];for(lane,mode)in modes.iter().enumerate(){if *mode!=0{self.lanes[lane].prepare(self.frame,self.rate);}}
  self.peak=0.;for c in 0..self.source.max(self.wet){for i in 0..QUANTUM{let d=if dry_mode==2{self.dry[c.min(self.source-1)][i]*self.lanes[0].output[i]}else{0.};let w=if wet_mode==2{self.wet_input[c.min(self.wet-1)][i]*self.lanes[1].output[i]}else{0.};let y=d+w;if !y.is_finite(){return self.reject();}self.output[c][i]=y;self.peak=self.peak.max(y.abs()as f64);}}
  self.calls+=1;if modes.contains(&2){self.audio_frames+=128;}else if modes.contains(&1){self.parameter_frames+=128;}else{self.unpulled_frames+=128;}self.frame+=128;true
 }
}
#[no_mangle]pub extern "C" fn room_control_api()->u32{1}
#[no_mangle]pub extern "C" fn room_control_new(rate:f64,source:f64,wet:f64)->*mut Engine{if !source.is_finite()||source.fract()!=0.||!wet.is_finite()||wet.fract()!=0.{return std::ptr::null_mut();}Engine::new(rate,source as usize,wet as usize).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn room_control_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn room_control_sync(p:&mut Engine,at:f64,isolated:u32)->u32{if isolated>1{return 0;}frame(at).is_some_and(|f|p.sync(f,isolated!=0))as u32}
#[no_mangle]pub extern "C" fn room_control_pair(p:&mut Engine,v:f64,d:f64,w:f64,cd:f64,cw:f64)->u32{let(Some(a),Some(b))=(frame(cd),frame(cw))else{return 0;};p.pair(v,d,w,a,b)as u32}
#[no_mangle]pub extern "C" fn room_control_reserve(p:&mut Engine,id:f64,v:f64,call:f64)->u32{if !id.is_finite()||id.fract()!=0.||id<1.||id>8388607.{return 0;}frame(call).is_some_and(|f|p.reserve(id as u32,v,f))as u32}
#[no_mangle]pub extern "C" fn room_control_leaf(p:&mut Engine,id:f64,lane:f64,v:f64,t:f64,call:f64)->u32{if !id.is_finite()||id.fract()!=0.||id<1.||id>8388607.||!lane.is_finite()||lane.fract()!=0.||!(0. ..=1.).contains(&lane){return 0;}frame(call).is_some_and(|f|p.leaf(id as u32,lane as usize,v,t,f))as u32}
#[no_mangle]pub extern "C" fn room_control_input(p:&mut Engine,branch:u32,ch:u32)->*mut f32{if ch>1{return std::ptr::null_mut();}if branch==0{p.dry[ch as usize].as_mut_ptr()}else if branch==1{p.wet_input[ch as usize].as_mut_ptr()}else{std::ptr::null_mut()}}
#[no_mangle]pub extern "C" fn room_control_output(p:&Engine,ch:u32)->*const f32{if ch>1{std::ptr::null()}else{p.output[ch as usize].as_ptr()}}
#[no_mangle]pub extern "C" fn room_control_render(p:&mut Engine,d:u32,w:u32)->u32{p.render(d as usize,w as usize)as u32}
#[no_mangle]pub extern "C" fn room_control_value(p:&Engine,lane:u32,sample:u32)->f64{if lane>1||sample>127{f64::NAN}else{p.lanes[lane as usize].output[sample as usize]as f64}}
#[no_mangle]pub extern "C" fn room_control_stat(p:&Engine,key:u32)->f64{match key{0=>p.frame as f64,1=>p.calls as f64,2=>p.audio_frames as f64,3=>p.parameter_frames as f64,4=>p.unpulled_frames as f64,5=>p.commands as f64,6=>p.pairs as f64,7=>p.rejected as f64,8=>p.late as f64,9=>p.max_late as f64,10=>p.reserved[0]as f64,11=>p.reserved[1]as f64,12=>p.tickets.iter().flatten().count()as f64,13=>p.peak,14=>p.origin as f64,15=>p.last_seconds[0],16=>p.last_seconds[1],17=>p.last_main_seconds[0],18=>p.last_main_seconds[1],19=>p.last_observed[0]as f64,20=>p.last_observed[1]as f64,_=>f64::NAN}}

#[no_mangle]pub extern "C" fn room_control_ready_api()->u32{1}
#[no_mangle]pub extern "C" fn room_control_reserve_ready(p:&mut Engine,id:f64,v:f64)->u32{if !id.is_finite()||id.fract()!=0.||id<1.||id>8388607.{return 0;}p.reserve_ready(id as u32,v)as u32}
#[no_mangle]pub extern "C" fn room_control_cancel_ready(p:&mut Engine,id:f64)->u32{if !id.is_finite()||id.fract()!=0.||id<1.||id>8388607.{return 0;}p.cancel_ready(id as u32)as u32}
#[no_mangle]pub extern "C" fn room_control_ready_credit(p:&Engine,lane:u32)->f64{if lane>1{f64::NAN}else{p.ready_credit(lane as usize)as f64}}
#[no_mangle]pub extern "C" fn room_control_ready_stat(p:&Engine,key:u32)->f64{match key{0=>p.ready_reserves as f64,1=>p.ready_cancels as f64,2=>p.tickets.iter().flatten().filter(|r|r.prepared&&!r.dry_done).count()as f64,3=>p.tickets.iter().flatten().filter(|r|r.prepared&&r.dry_done).count()as f64,_=>f64::NAN}}
