//! Original five-Biquad Filter, seven independent native AudioParams and immediate type.
//! Explicit per-stage pull/layout ownership. No silent flag is inferred from numeric PCM.
mod timeline;
#[path="../../rack-native/src/biquad.rs"]mod biquad;
#[path="../../rack-native/src/tail.rs"]mod tail;
#[cfg(feature="allocation-audit")]mod allocation;
const MAX_FRAME:f64=1099511627648.;const CAPACITY:usize=256;
fn integer(v:f64,max:usize)->Option<usize>{if v.is_finite()&&v>=0.&&v<=max as f64&&v.fract()==0.{Some(v as usize)}else{None}}
fn frame(v:f64)->bool{v.is_finite()&&v>=0.&&v<=MAX_FRAME&&v.fract()==0.&&v%128.==0.}
fn timestamp(f:f64,s:f64,rate:f64)->bool{frame(f)&&s.is_finite()&&s>=0.&&s==f/rate}
fn intrinsic(i:usize)->f64{if i<5{350.}else if i==5{0.707f32 as f64}else{0.}}
fn kind(mode:usize)->u32{[4,0,1,2,3,5,6][mode]}
pub struct Engine{rate:f64,ready:bool,frame:u64,origin:u64,last_authored:f64,mode:usize,lanes:[timeline::LiveTimeline;7],targets:[f64;7],filters:[biquad::Biquad;5],layouts:[usize;5],curves:[[f32;128];7],input:[[f32;128];2],output:[[f32;128];2],calls:u64,commands:u64,rejected:u64,late:u64,max_late:u64,mask:u32,params:u32,layout_mask:u32,audio_frames:[u64;5],parameter_frames:[u64;5],unpulled_frames:[u64;5],tail_seconds:[f64;5],peak:f64}
impl Engine{
 fn new(rate:f64)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate){return None;}Some(Box::new(Self{rate,ready:false,frame:0,origin:0,last_authored:-1.,mode:0,lanes:std::array::from_fn(|i|timeline::LiveTimeline::new(intrinsic(i),CAPACITY,rate)),targets:std::array::from_fn(intrinsic),filters:[biquad::Biquad::default();5],layouts:[1;5],curves:[[0.;128];7],input:[[0.;128];2],output:[[0.;128];2],calls:0,commands:0,rejected:0,late:0,max_late:0,mask:0,params:0,layout_mask:0,audio_frames:[0;5],parameter_frames:[0;5],unpulled_frames:[0;5],tail_seconds:[0.;5],peak:0.}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn prepare(&mut self,f:f64,s:f64)->bool{if self.ready||!timestamp(f,s,self.rate){return self.reject();}self.ready=true;self.frame=f as u64;self.origin=self.frame;assert!(self.lanes[5].add_seconds(s,0,intrinsic(5),0.));assert!(self.lanes[6].add_seconds(s,0,0.,0.));true}
 fn valid(&self,index:usize,value:f64)->bool{value.is_finite()&&value as f32 as f64==value&&match index{0..=4=>(0. ..=self.rate/2.).contains(&value),5=>(0.1..=20.).contains(&value),6=>(-24. ..=24.).contains(&value),_=>false}}
 fn command(&mut self,index:usize,value:f64,authored:f64,seconds:f64,initial:bool)->bool{if !self.ready||!timestamp(authored,seconds,self.rate)||authored<self.origin as f64||authored>self.frame as f64||authored<self.last_authored{return self.reject();}if index==7{let Some(mode)=integer(value,6)else{return self.reject();};if self.mode!=mode{self.filters[4].clear();self.mode=mode;}}else{if !self.valid(index,value)||!self.lanes[index].available_at(1,self.frame as f64){return self.reject();}self.lanes[index].prune_for_insert(self.frame as f64);assert!(self.lanes[index].add_seconds(seconds,if initial{0}else{2},value,if initial{0.}else{0.02}));self.targets[index]=value;}self.last_authored=authored;self.commands+=1;if self.frame>authored as u64{self.late+=1;self.max_late=self.max_late.max(self.frame-authored as u64);}true}
 fn sync(&mut self,f:f64)->bool{if !self.ready||!frame(f)||f<self.frame as f64{return self.reject();}self.frame=f as u64;true}
 fn render(&mut self,channels:usize,audio:u32,params:u32,layouts:u32)->bool{
  if !self.ready||self.frame+128>MAX_FRAME as u64||channels>2||audio>31||params>31||layouts>31||audio&!params!=0||(0..channels).any(|c|self.input[c].iter().any(|v|!v.is_finite())){return self.reject();}
  for i in 0..5{let count=if layouts&(1<<i)!=0{2}else{1};if count!=self.layouts[i]{self.filters[i]=biquad::Biquad::default();self.layouts[i]=count;}}
  for lane in 0..7{let stage=lane.min(4);if params&(1<<stage)!=0{self.lanes[lane].prepare(self.frame,self.rate);self.curves[lane]=self.lanes[lane].output;}}
  self.output.fill([0.;128]);self.peak=0.;
  for sample in 0..128{let mut x=[if channels>0{self.input[0][sample]}else{0.},if channels>1{self.input[1][sample]}else{0.}];let mut count=channels.max(1);for stage in 0..5{let next=self.layouts[stage];if count==1&&next==2{x[1]=x[0];}else if count==2&&next==1{x[0]=(x[0]+x[1])*0.5;x[1]=0.;}if audio&(1<<stage)==0{x=[0.;2];}else{x=self.filters[stage].sample(x,next,if stage<2{1}else if stage<4{0}else{kind(self.mode)},self.curves[stage][sample]as f64,if stage==4{self.curves[5][sample]as f64}else{0.707f32 as f64},if stage==4{self.curves[6][sample]as f64}else{0.},self.rate);}count=next;}for c in 0..count{if !x[c].is_finite(){return self.reject();}self.output[c][sample]=x[c];self.peak=self.peak.max(x[c].abs()as f64);}}
  for stage in 0..5{if audio&(1<<stage)!=0{self.filters[stage].end_quantum();self.audio_frames[stage]+=128;self.tail_seconds[stage]=self.filters[stage].tail_frame(30.*self.rate)/self.rate;}else if params&(1<<stage)!=0{self.parameter_frames[stage]+=128;}else{self.unpulled_frames[stage]+=128;}}
  self.frame+=128;self.calls+=1;self.mask=audio;self.params=params;self.layout_mask=layouts;true
 }
 fn reset(&mut self,f:f64,s:f64)->bool{if !self.ready||!timestamp(f,s,self.rate){return self.reject();}for i in 0..7{self.lanes[i].reset(intrinsic(i));self.targets[i]=intrinsic(i);}self.filters=[biquad::Biquad::default();5];self.layouts=[1;5];self.curves.fill([0.;128]);self.input.fill([0.;128]);self.output.fill([0.;128]);self.mode=0;self.frame=f as u64;self.origin=self.frame;self.last_authored=-1.;self.calls=0;self.commands=0;self.late=0;self.max_late=0;self.mask=0;self.params=0;self.layout_mask=0;self.audio_frames.fill(0);self.parameter_frames.fill(0);self.unpulled_frames.fill(0);self.tail_seconds.fill(0.);self.peak=0.;assert!(self.lanes[5].add_seconds(s,0,intrinsic(5),0.));assert!(self.lanes[6].add_seconds(s,0,0.,0.));true}
}
#[no_mangle]pub extern "C" fn filter_normal_api()->u32{1}
#[no_mangle]pub extern "C" fn filter_normal_new(rate:f64)->*mut Engine{Engine::new(rate).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn filter_normal_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn filter_normal_prepare(p:&mut Engine,f:f64,s:f64)->u32{p.prepare(f,s)as u32}
#[no_mangle]pub extern "C" fn filter_normal_sync(p:&mut Engine,f:f64)->u32{p.sync(f)as u32}
#[no_mangle]pub extern "C" fn filter_normal_command(p:&mut Engine,i:f64,v:f64,f:f64,s:f64,initial:f64)->u32{let Some(i)=integer(i,7)else{return 0;};if initial!=0.&&initial!=1.{return 0;}p.command(i,v,f,s,initial==1.)as u32}
#[no_mangle]pub extern "C" fn filter_normal_render(p:&mut Engine,channels:f64,audio:f64,params:f64,layouts:f64)->u32{let(Some(c),Some(a),Some(b),Some(l))=(integer(channels,2),integer(audio,31),integer(params,31),integer(layouts,31))else{return 0;};p.render(c,a as u32,b as u32,l as u32)as u32}
#[no_mangle]pub extern "C" fn filter_normal_reset(p:&mut Engine,f:f64,s:f64)->u32{p.reset(f,s)as u32}
#[no_mangle]pub extern "C" fn filter_normal_input(p:&mut Engine,ch:f64)->*mut f32{integer(ch,1).map_or(std::ptr::null_mut(),|i|p.input[i].as_mut_ptr())}
#[no_mangle]pub extern "C" fn filter_normal_output(p:&Engine,ch:f64)->*const f32{integer(ch,1).map_or(std::ptr::null(),|i|p.output[i].as_ptr())}
#[no_mangle]pub extern "C" fn filter_normal_target(p:&Engine,i:f64)->f64{integer(i,7).map_or(f64::NAN,|i|if i==7{p.mode as f64}else{p.targets[i]})}
#[no_mangle]pub extern "C" fn filter_normal_curve(p:&Engine,l:f64,i:f64)->f64{let(Some(l),Some(i))=(integer(l,6),integer(i,127))else{return f64::NAN;};p.lanes[l].output[i]as f64}
#[no_mangle]pub extern "C" fn filter_normal_stat(p:&Engine,i:f64)->f64{let Some(i)=integer(i,13)else{return f64::NAN;};match i{0=>p.frame as f64,1=>p.peak,2=>p.mode as f64,3=>p.layouts[4]as f64,4=>p.calls as f64,5=>p.commands as f64,6=>p.rejected as f64,7=>p.late as f64,8=>p.max_late as f64,9=>p.origin as f64,10=>p.last_authored,11=>p.mask as f64,12=>p.params as f64,13=>p.layout_mask as f64,_=>f64::NAN}}
#[no_mangle]pub extern "C" fn filter_normal_activity(p:&Engine,stage:f64,field:f64)->f64{let(Some(s),Some(f))=(integer(stage,4),integer(field,3))else{return f64::NAN;};match f{0=>p.audio_frames[s]as f64,1=>p.parameter_frames[s]as f64,2=>p.unpulled_frames[s]as f64,3=>p.tail_seconds[s],_=>f64::NAN}}
