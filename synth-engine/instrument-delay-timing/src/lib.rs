//! Literal original Nodes.Delay/PingPongDelay numerical graphs, native128 traversal.
//! Continuous fixed-layout profile. No invented min-delay compensation, silence
//! scan, native getter, host-task retirement or live routing authority.
#[path="../../fdn-room-live/src/timeline.rs"]mod timeline;
#[path="../../instrument-tone/src/biquad.rs"]mod biquad;
#[path="../../rack-native/src/tail.rs"]mod tail;
#[cfg(feature="allocation-audit")]mod allocation;
use std::sync::atomic::{AtomicUsize,Ordering};
const N:usize=128;const LANES:usize=11;const CAP:usize=256;const MAX:u64=1099511627648;
static HANDLES:AtomicUsize=AtomicUsize::new(0);
fn canonical(v:f64)->Option<u64>{if v.is_finite()&&v>=0.&&v<=MAX as f64&&v.fract()==0.&&v%128.==0.{Some(v as u64)}else{None}}
fn initial(lane:usize)->f64{match lane{3..=6|8=>1.,7=>350.,_=>0.}}
struct Line{ring:[Vec<f32>;2],at:usize,rate:f32}
impl Line{
 fn new(rate:usize,channels:usize)->Self{Self{ring:std::array::from_fn(|c|if c<channels{vec![0.;rate+N]}else{Vec::new()}),at:0,rate:rate as f32}}
 fn reset(&mut self){for plane in &mut self.ring{plane.fill(0.);}self.at=0;}
 fn process(&mut self,input:&[[f32;N];2],seconds:&[[f32;N];2],channels:usize)->[[f32;N];2]{
  let length=self.ring[0].len();
  // Native ProcessARate copies the complete quantum before any interpolation.
  // Per-sample writes would be wrong for fractional delay shorter than one sample.
  for c in 0..channels{for i in 0..N{self.ring[c][(self.at+i)%length]=input[c][i];}}
  let mut output=[[0.;N];2];
  for c in 0..channels{for i in 0..N{let w=(self.at+i)%length;let desired=seconds[c][i].max(0.)*self.rate;let mut position=w as f32+(length as f32-desired);if position>=length as f32{position-=length as f32;}
   let a=position as usize;let b=if a+1==length{0}else{a+1};let fraction=position-a as f32;
   let first=self.ring[c][a];output[c][i]=first+fraction*(self.ring[c][b]-first);
  }}self.at=(self.at+N)%length;output
 }
}
fn gain(input:&[[f32;N];2],values:&[f32;N],accurate:bool,channels:usize)->[[f32;N];2]{
 let mut out=[[0.;N];2];for c in 0..channels{for i in 0..N{out[c][i]=if !accurate&&values[127]==0.{0.}else{input[c][i]*values[i]};}}out
}
fn sum(a:&[[f32;N];2],b:&[[f32;N];2],channels:usize)->[[f32;N];2]{let mut out=[[0.;N];2];for c in 0..channels{for i in 0..N{out[c][i]=(0.+a[c][i])+b[c][i];}}out}
pub struct Engine{
 rate:f64,mode:u32,channels:usize,out_channels:usize,origin:u64,frame:u64,ready:bool,last:Option<u64>,
 lines:[Option<Line>;3],lanes:[timeline::LiveTimeline;LANES],curves:[[f32;N];LANES],accurate:[bool;LANES],
 previous:[[f32;N];2],filter:biquad::Biquad,input:[[f32;N];2],output:[[f32;N];2],
 calls:u64,commands:u64,rejected:u64,rendered:u64,unpulled:u64,late:u64,clamps:u64,peak:f64,planned:usize
}
impl Engine{
 fn estimate(rate:usize,channels:usize,mode:u32)->usize{std::mem::size_of::<Self>()+(if mode==0{1}else{3})*channels*(rate+N)*4+LANES*CAP*128}
 fn new(rate:f64,channels:u32,mode:u32)->Option<Box<Self>>{
  if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels)||mode>1{return None;}
  let planned=Self::estimate(rate as usize,channels as usize,mode);if planned>8*1024*1024{return None;}
  if HANDLES.fetch_update(Ordering::Relaxed,Ordering::Relaxed,|n|if n<8{Some(n+1)}else{None}).is_err(){return None;}
  Some(Box::new(Self{rate,mode,channels:channels as usize,out_channels:if mode==0{channels as usize}else{2},origin:0,frame:0,ready:false,last:None,
   lines:std::array::from_fn(|i|if i==0||mode==1{Some(Line::new(rate as usize,channels as usize))}else{None}),
   lanes:std::array::from_fn(|i|timeline::LiveTimeline::new(initial(i),CAP,rate)),curves:std::array::from_fn(|i|[initial(i)as f32;N]),accurate:[false;LANES],previous:[[0.;N];2],filter:biquad::Biquad::default(),input:[[0.;N];2],output:[[0.;N];2],calls:0,commands:0,rejected:0,rendered:0,unpulled:0,late:0,clamps:0,peak:0.,planned}))
 }
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn active(&self,lane:usize)->bool{lane<LANES&&(self.mode==1||!matches!(lane,1|2|6))}
 fn value_ok(lane:usize,value:f64)->bool{value.is_finite()&&(value as f32).is_finite()&&match lane{0..=6=>(0. ..=1.).contains(&value),7=>(0. ..=11000.).contains(&value),8=>(0. ..=100.).contains(&value),9=>(-40. ..=40.).contains(&value),10=>(-153600. ..=153600.).contains(&value),_=>false}}
 fn credit(&self,lane:usize,n:usize,author:f64)->bool{self.active(lane)&&n<=CAP&&canonical(author).is_some_and(|at|self.ready&&at>=self.origin&&self.last.is_none_or(|last|at>=last))&&self.lanes[lane].available_at(n,author)}
 fn command(&mut self,lane:usize,op:u32,value:f64,tau:f64,author:f64,seconds:f64)->bool{
  let Some(at)=canonical(author)else{return self.reject();};if !self.ready||at<self.origin||at>self.frame||self.last.is_some_and(|last|at<last)||!self.active(lane)||!matches!(op,0|2|3|4)||!seconds.is_finite()||seconds<0.||seconds>MAX as f64/self.rate||!tau.is_finite()||tau<0.||op==2&&tau==0.||op!=3&&!Self::value_ok(lane,value)||op!=3&&!self.credit(lane,1,author){return self.reject();}
  let time=seconds.max(author/self.rate);if time!=seconds{self.clamps+=1;}self.lanes[lane].prune_for_insert(author);
  if op==3{self.lanes[lane].cancel(time*self.rate);}else{let value=if op==4&&lane==7{value.min(self.rate/2.)}else{value};if op==4{self.lanes[lane].intrinsic(value);}assert!(self.lanes[lane].add_seconds(time,if op==2{2}else{0},value,if op==2{tau}else{0.}));}
  self.last=Some(at);self.commands+=1;if at<self.frame{self.late+=1;}true
 }
 fn prepare(&mut self,origin:f64)->bool{let Some(at)=canonical(origin)else{return self.reject();};if self.ready{return self.reject();}self.ready=true;self.origin=at;self.frame=at;let seconds=origin/self.rate;
  // Filter is constructed before the original connections / amount / feedback calls.
  for(lane,value)in[(7,11000.),(3,1.),(4,0.),(5,0.)]{assert!(self.command(lane,0,value,0.,origin,seconds));}if self.mode==1{assert!(self.command(6,0,0.,0.,origin,seconds));}true
 }
 fn sync(&mut self,frame:f64)->bool{let Some(at)=canonical(frame)else{return self.reject();};if !self.ready||at<self.frame{return self.reject();}self.frame=at;true}
 fn reset(&mut self)->bool{if !self.ready{return self.reject();}for line in self.lines.iter_mut().flatten(){line.reset();}for i in 0..LANES{self.lanes[i].reset(initial(i));self.curves[i].fill(initial(i)as f32);}self.filter=biquad::Biquad::default();self.previous.fill([0.;N]);self.input.fill([0.;N]);self.output.fill([0.;N]);self.last=None;self.calls=0;self.commands=0;self.rejected=0;self.rendered=0;self.unpulled=0;self.late=0;self.clamps=0;self.peak=0.;self.ready=false;self.prepare(self.origin as f64)}
 // Native DelayHandler evaluates the same delayTime timeline once PER channel.
 // The second evaluation may update a running SetTarget from channel0 intrinsic.
 // Gain/filter timelines remain evaluated once; no per-channel parameter fitting.
 fn delay_curves(&mut self,lane:usize)->[[f32;N];2]{
  let mut out=[self.curves[lane];2];
  for channel in 1..self.channels{self.lanes[lane].prepare(self.frame,self.rate);self.lanes[lane].clamp_output(0.,1.);self.curves[lane]=self.lanes[lane].output;out[channel]=self.curves[lane];}
  out
 }
 fn render(&mut self,channels:u32,pulled:bool)->bool{
  if !self.ready||self.frame>MAX-128||channels!=0&&channels as usize!=self.channels||!pulled&&channels!=0||(0..channels as usize).any(|c|self.input[c].iter().any(|x|!x.is_finite()||x.abs()>4.)){return self.reject();}
  self.output.fill([0.;N]);self.peak=0.;
  if pulled{
   for lane in 0..LANES{if !self.active(lane){continue;}self.accurate[lane]=self.lanes[lane].accurate(self.frame);self.lanes[lane].prepare(self.frame,self.rate);if lane<=2{self.lanes[lane].clamp_output(0.,1.);}if lane==7{self.lanes[lane].clamp_output(0.,(self.rate/2.)as f32);}self.curves[lane]=self.lanes[lane].output;}
   let input=if channels==0{[[0.;N];2]}else{self.input};
   let tone_input=if self.mode==0{
    let loop_input=sum(&input,&self.previous,self.channels);let seconds=self.delay_curves(0);let delayed=self.lines[0].as_mut().unwrap().process(&loop_input,&seconds,self.channels);
    let feedback=gain(&delayed,&self.curves[5],self.accurate[5],self.channels);self.previous=feedback;feedback
   }else{
    // Literal merger input0 pulls left first. The cycle returns previous left
    // Delay output through CURRENT left feedback gain, not a guessed 128 trim.
    let left_feedback=gain(&self.previous,&self.curves[5],self.accurate[5],self.channels);
    let seconds=self.delay_curves(1);let pre=self.lines[1].as_mut().unwrap().process(&input,&seconds,self.channels);
    let right_input=sum(&pre,&left_feedback,self.channels);let seconds=self.delay_curves(2);let right=self.lines[2].as_mut().unwrap().process(&right_input,&seconds,self.channels);
    let right_feedback=gain(&right,&self.curves[6],self.accurate[6],self.channels);let left_input=sum(&input,&right_feedback,self.channels);
    let seconds=self.delay_curves(0);let left=self.lines[0].as_mut().unwrap().process(&left_input,&seconds,self.channels);self.previous=left;
    let mut merged=[[0.;N];2];for i in 0..N{merged[0][i]=if self.channels==1{left[0][i]}else{(0.+left[0][i]*0.5)+left[1][i]*0.5};merged[1][i]=if self.channels==1{right[0][i]}else{(0.+right[0][i]*0.5)+right[1][i]*0.5};}merged
   };
   let mut filtered=[[0.;N];2];for i in 0..N{let normalized=self.curves[7][i]as f64/(self.rate/2.);let detune=self.curves[10][i];let normalized=if detune==0.{normalized}else{normalized*((detune/1200f32)as f64).exp2()};let value=self.filter.sample([tone_input[0][i],tone_input[1][i]],self.out_channels,0,normalized,self.curves[8][i]as f64,self.curves[9][i]as f64);for c in 0..self.out_channels{filtered[c][i]=value[c];}}self.filter.end_quantum();
   let wet=gain(&filtered,&self.curves[4],self.accurate[4],self.out_channels);let dry=gain(&input,&self.curves[3],self.accurate[3],self.channels);
   for c in 0..self.out_channels{for i in 0..N{let dry=dry[if self.channels==1{0}else{c}][i];let y=(0.+dry)+wet[c][i];if !y.is_finite(){return self.reject();}self.output[c][i]=y;self.peak=self.peak.max(y.abs()as f64);}}self.rendered+=128;
  }else{self.unpulled+=128;}self.calls+=1;self.frame+=128;true
 }
}
impl Drop for Engine{fn drop(&mut self){HANDLES.fetch_sub(1,Ordering::Relaxed);}}
#[no_mangle]pub extern "C" fn instrument_delay_api()->u32{1}
#[no_mangle]pub extern "C" fn instrument_delay_new(rate:f64,channels:u32,mode:u32)->*mut Engine{Engine::new(rate,channels,mode).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn instrument_delay_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn instrument_delay_prepare(p:&mut Engine,origin:f64)->u32{p.prepare(origin)as u32}
#[no_mangle]pub extern "C" fn instrument_delay_sync(p:&mut Engine,frame:f64)->u32{p.sync(frame)as u32}
#[no_mangle]pub extern "C" fn instrument_delay_reset(p:&mut Engine)->u32{p.reset()as u32}
#[no_mangle]pub extern "C" fn instrument_delay_command(p:&mut Engine,lane:u32,op:u32,value:f64,tau:f64,author:f64,seconds:f64)->u32{p.command(lane as usize,op,value,tau,author,seconds)as u32}
#[no_mangle]pub extern "C" fn instrument_delay_credit(p:&Engine,lane:u32,n:u32,author:f64)->u32{p.credit(lane as usize,n as usize,author)as u32}
#[no_mangle]pub extern "C" fn instrument_delay_render(p:&mut Engine,channels:u32,pulled:u32)->u32{if pulled>1{return p.reject()as u32;}p.render(channels,pulled==1)as u32}
#[no_mangle]pub extern "C" fn instrument_delay_input(p:&mut Engine,c:u32)->*mut f32{p.input.get_mut(c as usize).map_or(std::ptr::null_mut(),|p|p.as_mut_ptr())}
#[no_mangle]pub extern "C" fn instrument_delay_output(p:&Engine,c:u32)->*const f32{p.output.get(c as usize).map_or(std::ptr::null(),|p|p.as_ptr())}
#[no_mangle]pub extern "C" fn instrument_delay_curve(p:&Engine,lane:u32,index:u32)->f64{p.curves.get(lane as usize).and_then(|p|p.get(index as usize)).map_or(f64::NAN,|x|*x as f64)}
#[no_mangle]pub extern "C" fn instrument_delay_stat(p:&Engine,index:u32)->f64{match index{0=>p.frame as f64,1=>p.peak,2=>p.calls as f64,3=>p.commands as f64,4=>p.rejected as f64,5=>p.rendered as f64,6=>p.unpulled as f64,7=>p.late as f64,8=>p.clamps as f64,9=>p.mode as f64,10=>p.channels as f64,11=>p.out_channels as f64,12=>p.planned as f64,_=>f64::NAN}}
