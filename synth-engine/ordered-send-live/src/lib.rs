//! Explicit ordered Gain -> stereo sum. The immutable slot order is part of the
//! NEW profile, never inferred from Native AudioSummingJunction HashSet order.
//! Activity is authored metadata: 0=params-only, 1=active non-silent bus,
//! 2=active silent bus. Numeric zeros never establish a Native silence flag.
#[path="../../rack-filter-normal/src/timeline.rs"] mod timeline;
#[cfg(feature="allocation-audit")] mod allocation;
const SLOTS:usize=8;const Q:usize=128;const CAP:usize=256;const MAX:u64=1099511627648;
pub struct Engine{rate:f64,count:usize,channels:[usize;SLOTS],gains:[timeline::LiveTimeline;SLOTS],ready:bool,bound:bool,frame:u64,last_author:f64,input:[[[f32;Q];2];SLOTS],output:[[f32;Q];2],activity:[u32;SLOTS],accurate:[bool;SLOTS],silent:bool,calls:u64,rejected:u64,late:u64,clamped:u64}
impl Engine{
 fn new(rate:f64,count:usize)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=SLOTS).contains(&count){return None;}Some(Box::new(Self{rate,count,channels:[2;SLOTS],gains:std::array::from_fn(|_|timeline::LiveTimeline::new(1.,CAP,rate)),ready:false,bound:false,frame:0,last_author:-1.,input:[[[0.;Q];2];SLOTS],output:[[0.;Q];2],activity:[0;SLOTS],accurate:[false;SLOTS],silent:true,calls:0,rejected:0,late:0,clamped:0}))}
 fn initial(&mut self,slot:usize,channels:usize,gain:f64)->bool{if self.ready||slot>=self.count||!(1..=2).contains(&channels)||!gain.is_finite()||!(0. ..=4.).contains(&gain){return false;}self.channels[slot]=channels;self.gains[slot].intrinsic(gain);true}
 fn command(&mut self,slot:usize,kind:u32,seconds:f64,value:f64,tau:f64,author:f64)->bool{
  if !self.ready||slot>=self.count||![0,2,3].contains(&kind)||!seconds.is_finite()||seconds<0.||seconds>MAX as f64/self.rate||!value.is_finite()||!(0. ..=4.).contains(&value)||!tau.is_finite()||tau<0.||tau>3600.||kind==2&&(tau==0.||(tau as f32)==0.)||kind!=2&&tau!=0.||kind==3&&value!=0.||!author.is_finite()||author<0.||author.fract()!=0.||author%128.!=0.||author>self.frame as f64||author<self.last_author||kind!=3&&!self.gains[slot].available_at(1,author){self.rejected+=1;return false;}
  let time=seconds.max(author/self.rate);if time!=seconds{self.clamped+=1;}self.gains[slot].prune_for_insert(author);if kind==3{self.gains[slot].cancel(time*self.rate);}else{assert!(self.gains[slot].add_seconds(time,kind,value,tau));}if author<self.frame as f64{self.late+=1;}self.last_author=author;true
 }
 fn render(&mut self,activity:u32)->bool{
  if !self.ready||!self.bound||self.frame+128>MAX||activity>>(self.count*2)!=0{self.rejected+=1;return false;}
  // Validate the complete physical cohort BEFORE any timeline advances.
  for s in 0..self.count{let a=(activity>>(s*2))&3;if a==3||a==1&&(0..self.channels[s]).any(|c|self.input[s][c].iter().any(|x|!x.is_finite())){self.rejected+=1;return false;}self.activity[s]=a;}
  self.output[0].fill(0.);self.output[1].fill(0.);self.silent=true;
  for s in 0..self.count{
   self.accurate[s]=self.gains[s].accurate(self.frame);self.gains[s].prepare(self.frame,self.rate);
   // GainHandler calculates params even with no audio. Scalar zero declares
   // its output silent; an accurate all-zero curve stays NON-silent.
   let silent=self.activity[s]!=1||!self.accurate[s]&&self.gains[s].output[0]==0.;
   if silent{continue;}
   for c in 0..2{let source=if self.channels[s]==1{0}else{c};for i in 0..Q{let value=self.input[s][source][i]*self.gains[s].output[i];self.output[c][i]=if self.silent{value}else{self.output[c][i]+value};if !self.output[c][i].is_finite(){self.rejected+=1;return false;}}}
   self.silent=false;
  }
  self.frame+=128;self.calls+=1;true
 }
}
#[no_mangle]pub extern "C" fn ordered_send_api()->u32{1}
#[no_mangle]pub extern "C" fn ordered_send_new(rate:f64,count:usize)->*mut Engine{Engine::new(rate,count).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn ordered_send_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn ordered_send_initial(p:&mut Engine,slot:usize,channels:usize,gain:f64)->u32{p.initial(slot,channels,gain)as u32}
#[no_mangle]pub extern "C" fn ordered_send_prepare(p:&mut Engine,frame:f64)->u32{if p.ready||!frame.is_finite()||frame<0.||frame>MAX as f64||frame.fract()!=0.||frame%128.!=0.{return 0;}p.frame=frame as u64;p.ready=true;1}
#[no_mangle]pub extern "C" fn ordered_send_first_frame(p:&mut Engine,frame:f64)->u32{if !p.ready||p.bound||p.calls!=0||!frame.is_finite()||frame<p.frame as f64||frame>MAX as f64||frame.fract()!=0.||frame%128.!=0.{return 0;}p.frame=frame as u64;p.bound=true;1}
#[no_mangle]pub extern "C" fn ordered_send_command(p:&mut Engine,s:usize,k:u32,t:f64,v:f64,tau:f64,a:f64)->u32{p.command(s,k,t,v,tau,a)as u32}
#[no_mangle]pub extern "C" fn ordered_send_input(p:&mut Engine,s:usize,c:usize)->*mut f32{if s>=p.count||c>=p.channels[s]{std::ptr::null_mut()}else{p.input[s][c].as_mut_ptr()}}
#[no_mangle]pub extern "C" fn ordered_send_output(p:&Engine,c:usize)->*const f32{p.output.get(c).map_or(std::ptr::null(),|v|v.as_ptr())}
#[no_mangle]pub extern "C" fn ordered_send_render(p:&mut Engine,activity:u32)->u32{p.render(activity)as u32}
#[no_mangle]pub extern "C" fn ordered_send_free_slots(p:&Engine,s:usize,observed:f64)->f64{if !p.ready||s>=p.count||!observed.is_finite()||observed<0.||observed.fract()!=0.||observed%128.!=0.||observed>p.frame as f64||observed<p.last_author{return f64::NAN;}let mut lo=0;let mut hi=CAP;while lo<hi{let m=(lo+hi+1)/2;if p.gains[s].available_at(m,observed){lo=m;}else{hi=m-1;}}lo as f64}
#[no_mangle]pub extern "C" fn ordered_send_stat(p:&Engine,k:usize)->f64{match k{0=>p.frame as f64,1=>p.calls as f64,2=>p.rejected as f64,3=>p.silent as u32 as f64,4=>p.late as f64,5=>p.clamped as f64,6=>p.last_author,7=>p.count as f64,_=>f64::NAN}}
#[cfg(test)]mod tests{
 use super::*;
 fn engine(count:usize)->Box<Engine>{let mut e=Engine::new(48000.,count).unwrap();e.ready=true;e.bound=true;e}
 #[test]fn explicit_nonassociative_order(){let mut e=engine(3);for(s,v)in[1e20f32,-1e20,1.].iter().enumerate(){e.input[s][0].fill(*v);e.input[s][1].fill(*v);}assert!(e.render(21));assert_eq!(e.output[0][0],1.);}
 #[test]fn first_nonsilent_copies_signed_zero(){let mut e=engine(2);e.input[1][0].fill(-0.);e.input[1][1].fill(-0.);assert!(e.render(4));assert_eq!(e.output[0][0].to_bits(),(-0f32).to_bits());assert!(!e.silent);}
 #[test]fn silent_source_is_skipped_not_added(){let mut e=engine(2);e.input[0][0].fill(-0.);e.input[0][1].fill(-0.);e.input[1][0].fill(f32::NAN);assert!(e.render(9));assert_eq!(e.output[0][0].to_bits(),(-0f32).to_bits());}
 #[test]fn mono_speaker_copy(){let mut e=engine(1);e.channels[0]=1;e.input[0][0].fill(0.25);assert!(e.render(1));assert_eq!(e.output[0],e.output[1]);}
 #[test]fn zero_curve_and_scalar_have_distinct_flags(){let mut e=engine(1);e.gains[0].intrinsic(0.);assert!(e.render(1));assert!(e.silent);assert!(e.command(0,0,128./48000.,0.,0.,128.));assert!(e.render(1));assert!(!e.silent);assert!(e.output[0].iter().all(|v|*v==0.));}
 #[test]fn params_only_advances_real_timeline(){let mut e=engine(1);assert!(e.command(0,2,0.,0.,0.03,0.));assert!(e.render(0));let before=e.gains[0].output[127];assert!(e.render(0));assert!(e.gains[0].output[127]<before);assert!(e.silent);}
 #[test]fn whole_input_validation_is_atomic(){let mut e=engine(2);e.input[1][0][127]=f32::NAN;assert!(!e.render(5));assert_eq!(e.frame,0);assert_eq!(e.calls,0);assert!(!e.render(13));}
 #[test]fn capacity_and_authored_boundary(){let mut e=engine(1);for i in 0..256{assert!(e.command(0,0,1.+i as f64,0.3,0.,0.));}assert!(!e.command(0,0,300.,0.3,0.,0.));assert!(!e.command(0,0,0.,0.3,0.,128.));}
}
