//! NEW rack outer Gain stages. Actual observed clock and Native DSP pull are
//! separate: unpulled prepares no AudioParam values; params-only prepares values
//! without audio; audio uses authoritative per-slot Native activity flags.
//! The Gain/mix loop and Timeline arithmetic are pinned to accepted ordered-send.
#[path="../../rack-filter-normal/src/timeline.rs"] mod timeline;
#[cfg(feature="allocation-audit")] mod allocation;
const SLOTS:usize=2;const Q:usize=128;const CAP:usize=256;const MAX:u64=1099511627648;
pub struct Engine{rate:f64,count:usize,channels:[usize;SLOTS],gains:[timeline::LiveTimeline;SLOTS],ready:bool,origin:u64,observed:Option<u64>,committed:bool,mode:u32,last_author:f64,input:[[[f32;Q];2];SLOTS],output:[[f32;Q];2],activity:[u32;SLOTS],accurate:[bool;SLOTS],silent:bool,observations:u64,calls:u64,unpulled:u64,params_only:u64,rejected:u64,late:u64,clamped:u64,last_render:Option<u64>}
impl Engine{
 fn new(rate:f64,count:usize)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=SLOTS).contains(&count){return None;}Some(Box::new(Self{rate,count,channels:[2;SLOTS],gains:std::array::from_fn(|_|timeline::LiveTimeline::new(1.,CAP,rate)),ready:false,origin:0,observed:None,committed:true,mode:0,last_author:-1.,input:[[[0.;Q];2];SLOTS],output:[[0.;Q];2],activity:[0;SLOTS],accurate:[false;SLOTS],silent:true,observations:0,calls:0,unpulled:0,params_only:0,rejected:0,late:0,clamped:0,last_render:None}))}
 fn initial(&mut self,slot:usize,channels:usize,gain:f64)->bool{if self.ready||slot>=self.count||!(1..=2).contains(&channels)||!gain.is_finite()||!(0. ..=16.).contains(&gain){return false;}self.channels[slot]=channels;self.gains[slot].intrinsic(gain);true}
 fn sync(&mut self,frame:f64,mode:u32)->bool{if !self.ready||!self.committed||mode>2||!frame.is_finite()||frame<self.origin as f64||frame>MAX as f64||frame.fract()!=0.||frame%128.!=0.||self.observed.is_some_and(|old|frame!=old as f64+128.){self.rejected+=1;return false;}self.observed=Some(frame as u64);self.mode=mode;self.committed=false;self.observations+=1;true}
 fn command(&mut self,slot:usize,kind:u32,seconds:f64,value:f64,tau:f64,author:f64)->bool{
  let Some(frame)=self.observed else{self.rejected+=1;return false;};
  if !self.ready||slot>=self.count||![0,2,3].contains(&kind)||!seconds.is_finite()||seconds<0.||seconds>MAX as f64/self.rate||!value.is_finite()||!(0. ..=16.).contains(&value)||!tau.is_finite()||tau<0.||tau>3600.||kind==2&&(tau==0.||(tau as f32)==0.)||kind!=2&&tau!=0.||kind==3&&value!=0.||!author.is_finite()||author<0.||author.fract()!=0.||author%128.!=0.||author>frame as f64||author<self.last_author||kind!=3&&!self.gains[slot].available_at(1,author){self.rejected+=1;return false;}
  let time=seconds.max(author/self.rate);if time!=seconds{self.clamped+=1;}self.gains[slot].prune_for_insert(author);if kind==3{self.gains[slot].cancel(time*self.rate);}else{assert!(self.gains[slot].add_seconds(time,kind,value,tau));}if author<frame as f64{self.late+=1;}self.last_author=author;true
 }
 fn render(&mut self,activity:u32)->bool{
  let Some(frame)=self.observed else{self.rejected+=1;return false;};
  if !self.ready||self.committed||frame+128>MAX||activity>>(self.count*2)!=0||self.mode<2&&activity!=0{self.rejected+=1;return false;}
  // Validate the complete physical stage BEFORE any timeline advances.
  for s in 0..self.count{let a=(activity>>(s*2))&3;if a==3||a==1&&(0..self.channels[s]).any(|c|self.input[s][c].iter().any(|x|!x.is_finite())){self.rejected+=1;return false;}self.activity[s]=a;}
  self.output[0].fill(0.);self.output[1].fill(0.);self.silent=true;
  if self.mode==0{self.unpulled+=1;self.committed=true;return true;}
  for s in 0..self.count{
   self.accurate[s]=self.gains[s].accurate(frame);self.gains[s].prepare(frame,self.rate);
   // Literal accepted GainHandler loop: numeric zeros do not establish flags.
   let silent=self.activity[s]!=1||!self.accurate[s]&&self.gains[s].output[0]==0.;
   if silent{continue;}
   for c in 0..2{let source=if self.channels[s]==1{0}else{c};for i in 0..Q{let value=self.input[s][source][i]*self.gains[s].output[i];self.output[c][i]=if self.silent{value}else{self.output[c][i]+value};if !self.output[c][i].is_finite(){self.rejected+=1;return false;}}}
   self.silent=false;
  }
  self.last_render=Some(frame+128);self.calls+=1;self.params_only+=u64::from(self.mode==1);self.committed=true;true
 }
}
#[no_mangle]pub extern "C" fn rack_outer_api()->u32{1}
#[no_mangle]pub extern "C" fn rack_outer_new(rate:f64,count:usize)->*mut Engine{Engine::new(rate,count).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn rack_outer_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn rack_outer_initial(p:&mut Engine,s:usize,c:usize,v:f64)->u32{p.initial(s,c,v)as u32}
#[no_mangle]pub extern "C" fn rack_outer_prepare(p:&mut Engine,frame:f64)->u32{if p.ready||!frame.is_finite()||frame<0.||frame>MAX as f64||frame.fract()!=0.||frame%128.!=0.{return 0;}p.origin=frame as u64;p.ready=true;1}
#[no_mangle]pub extern "C" fn rack_outer_sync(p:&mut Engine,frame:f64,mode:u32)->u32{p.sync(frame,mode)as u32}
#[no_mangle]pub extern "C" fn rack_outer_command(p:&mut Engine,s:usize,k:u32,t:f64,v:f64,tau:f64,a:f64)->u32{p.command(s,k,t,v,tau,a)as u32}
#[no_mangle]pub extern "C" fn rack_outer_input(p:&mut Engine,s:usize,c:usize)->*mut f32{if s>=p.count||c>=p.channels[s]{std::ptr::null_mut()}else{p.input[s][c].as_mut_ptr()}}
#[no_mangle]pub extern "C" fn rack_outer_output(p:&Engine,c:usize)->*const f32{p.output.get(c).map_or(std::ptr::null(),|v|v.as_ptr())}
#[no_mangle]pub extern "C" fn rack_outer_render(p:&mut Engine,activity:u32)->u32{p.render(activity)as u32}
#[no_mangle]pub extern "C" fn rack_outer_free_slots(p:&Engine,s:usize,observed:f64)->f64{if !p.ready||s>=p.count||!observed.is_finite()||observed<0.||observed.fract()!=0.||observed%128.!=0.||p.observed.is_none_or(|frame|observed>frame as f64)||observed<p.last_author{return f64::NAN;}let mut lo=0;let mut hi=CAP;while lo<hi{let m=(lo+hi+1)/2;if p.gains[s].available_at(m,observed){lo=m;}else{hi=m-1;}}lo as f64}
#[no_mangle]pub extern "C" fn rack_outer_stat(p:&Engine,k:usize)->f64{match k{0=>p.observed.map_or(-1.,|v|v as f64),1=>p.calls as f64,2=>p.rejected as f64,3=>p.silent as u32 as f64,4=>p.late as f64,5=>p.clamped as f64,6=>p.last_author,7=>p.count as f64,8=>p.observations as f64,9=>p.unpulled as f64,10=>p.params_only as f64,11=>p.last_render.map_or(-1.,|v|v as f64),12=>p.mode as f64,_=>f64::NAN}}
#[cfg(test)]mod tests{
 use super::*;
 fn engine(count:usize)->Box<Engine>{let mut e=Engine::new(48000.,count).unwrap();e.ready=true;e}
 #[test]fn range_covers_original_bypass_gain(){let mut e=Engine::new(48000.,1).unwrap();assert!(e.initial(0,2,16.));e.ready=true;assert!(e.sync(0.,2));assert!(e.command(0,0,0.,10f64.powf(24./20.),0.,0.));e.input[0][0].fill(0.125);e.input[0][1].fill(0.125);assert!(e.render(1));assert_eq!(e.output[0][0],0.125*(10f64.powf(24./20.)as f32));assert!(!e.command(0,0,0.,16.1,0.,0.));}
 #[test]fn unpulled_history_does_not_prepare_intrinsic(){let mut e=engine(1);assert!(e.sync(0.,0));assert!(e.command(0,2,0.,0.,0.03,0.));assert!(e.render(0));for q in 1..64{assert!(e.sync((q*128)as f64,0));assert!(e.render(0));}assert_eq!(e.gains[0].output[0],1.);assert_eq!(e.calls,0);assert!(e.sync(8192.,2));e.input[0][0].fill(1.);e.input[0][1].fill(1.);assert!(e.render(1));assert!(e.output[0][0]>0.9);assert_eq!(e.observations,65);}
 #[test]fn params_only_advances_gain_without_audio(){let mut e=engine(1);assert!(e.sync(0.,1));assert!(e.command(0,2,0.,0.,0.03,0.));assert!(e.render(0));let first=e.gains[0].output[127];assert!(e.sync(128.,1));assert!(e.render(0));assert!(e.gains[0].output[127]<first);assert_eq!(e.params_only,2);}
 #[test]fn double_or_gap_pull_is_refused_before_timeline(){let mut e=engine(1);assert!(e.sync(0.,0));assert!(!e.sync(128.,0));assert!(e.render(0));assert!(!e.render(0));assert!(!e.sync(256.,2));assert!(e.sync(128.,2));e.input[0][0][127]=f32::NAN;assert!(!e.render(1));assert_eq!(e.calls,0);}
 #[test]fn zero_is_not_silence_metadata(){let mut e=engine(2);assert!(e.sync(0.,2));e.input[1][0].fill(-0.);e.input[1][1].fill(-0.);assert!(e.render(4));assert_eq!(e.output[0][0].to_bits(),(-0f32).to_bits());assert!(!e.silent);}
}
