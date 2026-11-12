//! Literal Flanger, explicit immutable input-first or delay-first cache boundary.
//! Same Native graph; pointer HashSet traversal is declared rather than guessed.
#[path="../../fdn-room-live/src/timeline.rs"]mod timeline;
#[path="../../rack-native-normal/src/oscillator.rs"]mod sine;
mod delay;#[cfg(feature="allocation-audit")]mod allocation;
use std::sync::atomic::{AtomicUsize,Ordering};
const N:usize=128;const LANES:usize=6;const CAP:usize=256;const MAX:u64=1099511627648;
static HANDLES:AtomicUsize=AtomicUsize::new(0);
fn frame(v:f64)->Option<u64>{if v.is_finite()&&v>=0.&&v<=MAX as f64&&v.fract()==0.&&v%128.==0.{Some(v as u64)}else{None}}
fn initial(lane:usize)->f64{match lane{3=>0.,4=>440.,_=>1.}}
pub struct Engine{rate:f64,entry:u32,channels:usize,origin:u64,frame:u64,ready:bool,start_seconds:f64,started:[bool;1],last:Option<u64>,lanes:[timeline::LiveTimeline;LANES],curves:[[f32;N];LANES],accurate:[bool;LANES],sines:[Option<sine::Sine>;1],delay:delay::Line,previous:[[f32;N];2],input:[[f32;N];2],output:[[f32;N];2],modulation:[[f32;N];1],calls:u64,commands:u64,rejected:u64,rendered:u64,unpulled:u64,late:u64,clamps:u64,peak:f64,planned:usize}
impl Engine{
 fn new(rate:f64,channels:u32,entry:u32)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels)||entry>1{return None;}let planned=std::mem::size_of::<Self>()+LANES*CAP*128+channels as usize*(128+rate as usize)*4;if planned>4194304{return None;}if HANDLES.fetch_update(Ordering::Relaxed,Ordering::Relaxed,|n|if n<8{Some(n+1)}else{None}).is_err(){return None;}
 Some(Box::new(Self{rate,entry,channels:channels as usize,origin:0,frame:0,ready:false,start_seconds:0.,started:[false;1],last:None,lanes:std::array::from_fn(|i|timeline::LiveTimeline::new(initial(i),CAP,rate)),curves:std::array::from_fn(|i|[initial(i)as f32;N]),accurate:[false;LANES],sines:[Some(sine::Sine::new(rate,0.))],delay:delay::Line::new(rate as usize,channels as usize),previous:[[0.;N];2],input:[[0.;N];2],output:[[0.;N];2],modulation:[[0.;N];1],calls:0,commands:0,rejected:0,rendered:0,unpulled:0,late:0,clamps:0,peak:0.,planned}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn valid(lane:usize,value:f64)->bool{value.is_finite()&&(value as f32).is_finite()&&match lane{0|1=>(0. ..=1.).contains(&value),2=>(-0.9 ..=1.).contains(&value),3=>(0. ..=1.).contains(&value),4=>(0. ..=100.).contains(&value),5=>(0. ..=1000.).contains(&value),_=>false}}
 fn credit(&self,lane:usize,n:usize,author:f64)->bool{lane<LANES&&n<=CAP&&frame(author).is_some_and(|at|self.ready&&at>=self.origin&&self.last.is_none_or(|v|at>=v))&&self.lanes[lane].available_at(n,author)}
 fn command(&mut self,lane:usize,op:u32,value:f64,tau:f64,author:f64,seconds:f64)->bool{let Some(at)=frame(author)else{return self.reject();};if !self.ready||at<self.origin||at>self.frame||self.last.is_some_and(|v|at<v)||lane>=LANES||!matches!(op,0|2|3|4)||!seconds.is_finite()||seconds<0.||seconds>MAX as f64/self.rate||!tau.is_finite()||tau<0.||op==2&&tau==0.||op!=3&&!Self::valid(lane,value)||op!=3&&!self.credit(lane,1,author){return self.reject();}let time=seconds.max(at as f64/self.rate);if time!=seconds{self.clamps+=1;}self.lanes[lane].prune_for_insert(author);if op==3{self.lanes[lane].cancel(time*self.rate);}else{if op==4{self.lanes[lane].intrinsic(value);}assert!(self.lanes[lane].add_seconds(time,if op==2{2}else{0},value,if op==2{tau}else{0.}));}self.last=Some(at);self.commands+=1;if at<self.frame{self.late+=1;}true}
 fn prepare(&mut self,origin:f64,seconds:f64)->bool{let Some(at)=frame(origin)else{return self.reject();};if self.ready||seconds!=origin/self.rate{return self.reject();}self.ready=true;self.origin=at;self.frame=at;self.start_seconds=seconds;true}
 fn sync(&mut self,at:f64)->bool{let Some(f)=frame(at)else{return self.reject();};if !self.ready||f<self.frame{return self.reject();}self.frame=f;true}
 fn lfo(&mut self,_index:usize)->[f32;N]{let index=0;let rate_lane=4;let depth_lane=5;let constant=!self.accurate[rate_lane];let mut offset=0;let sine=self.sines[index].as_mut().unwrap();
  if !self.started[index]{let start=self.start_seconds*self.rate;let ceil=((start*1024.).round()/1024.).ceil()as u64;offset=ceil.saturating_sub(self.frame).min(128)as usize;if offset==128{return[0.;N];}let fraction=start-ceil as f64;if fraction>0.{offset+=1;}sine.scheduling_offset(fraction,self.curves[rate_lane][0],constant);self.started[index]=true;}
  let n=128-offset;let start=sine.virtual_index();let mut output=[0.;N];for i in offset..128{let k=i-offset;let value=sine.tick(self.curves[rate_lane][k],self.frame+k as u64,constant,!constant&&k<n/4*4);output[i]=if !self.accurate[depth_lane]&&self.curves[depth_lane][127]==0.{0.}else{value*self.curves[depth_lane][i]};}
  if constant&&n!=128{sine.finish_partial_constant(start,n,self.curves[rate_lane][0]);}output
 }

 fn gain(&self,value:f32,lane:usize,index:usize)->f32{if !self.accurate[lane]&&self.curves[lane][127]==0.{0.}else{value*self.curves[lane][index]}}
 fn render(&mut self,channels:u32,pulled:bool)->bool{if !self.ready||self.frame>MAX-128||channels!=0&&channels as usize!=self.channels||!pulled&&channels!=0||(0..channels as usize).any(|c|self.input[c].iter().any(|v|!v.is_finite()||v.abs()>4.)){return self.reject();}self.output.fill([0.;N]);self.peak=0.;
 if pulled{for lane in 0..LANES{self.accurate[lane]=self.lanes[lane].accurate(self.frame);self.lanes[lane].prepare(self.frame,self.rate);self.curves[lane]=self.lanes[lane].output;}self.modulation[0]=self.lfo(0);let input=if channels==0{[[0.;N];2]}else{self.input};let mut times=[0.;N];for i in 0..N{times[i]=(self.curves[3][i]+self.modulation[0][i]).clamp(0.,1.);}
 let mut mixed=[[0.;N];2];let delayed=if self.entry==0{let d=self.delay.process(&self.previous,&times,self.channels);for c in 0..self.channels{for i in 0..N{mixed[c][i]=(0.+input[c][i])+self.gain(d[c][i],2,i);}}self.previous=mixed;d}else{for c in 0..self.channels{for i in 0..N{mixed[c][i]=(0.+input[c][i])+self.gain(self.previous[c][i],2,i);}}let d=self.delay.process(&mixed,&times,self.channels);self.previous=d;d};
 for c in 0..self.channels{for i in 0..N{let wet=if self.entry==0{(0.+mixed[c][i])+delayed[c][i]}else{(0.+delayed[c][i])+mixed[c][i]};let y=(0.+self.gain(input[c][i],0,i))+self.gain(wet,1,i);if !y.is_finite(){return self.reject();}self.output[c][i]=y;self.peak=self.peak.max(y.abs()as f64);}}self.rendered+=128;
 }else{self.unpulled+=128;}self.frame+=128;self.calls+=1;true}
 fn reset(&mut self)->bool{if !self.ready{return self.reject();}for i in 0..LANES{self.lanes[i].reset(initial(i));self.curves[i].fill(initial(i)as f32);}self.sines[0].as_mut().unwrap().reset();self.delay.reset();self.started=[false;1];self.previous.fill([0.;N]);self.input.fill([0.;N]);self.output.fill([0.;N]);self.modulation.fill([0.;N]);self.last=None;self.calls=0;self.commands=0;self.rejected=0;self.rendered=0;self.unpulled=0;self.late=0;self.clamps=0;self.peak=0.;self.ready=false;self.prepare(self.origin as f64,self.start_seconds)}
}
impl Drop for Engine{fn drop(&mut self){HANDLES.fetch_sub(1,Ordering::Relaxed);}}
#[no_mangle]pub extern "C" fn instrument_flanger_api()->u32{1}
#[no_mangle]pub extern "C" fn instrument_flanger_new(rate:f64,channels:u32,entry:u32)->*mut Engine{Engine::new(rate,channels,entry).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn instrument_flanger_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn instrument_flanger_prepare(p:&mut Engine,origin:f64,seconds:f64)->u32{p.prepare(origin,seconds)as u32}
#[no_mangle]pub extern "C" fn instrument_flanger_sync(p:&mut Engine,at:f64)->u32{p.sync(at)as u32}
#[no_mangle]pub extern "C" fn instrument_flanger_reset(p:&mut Engine)->u32{p.reset()as u32}
#[no_mangle]pub extern "C" fn instrument_flanger_command(p:&mut Engine,lane:u32,op:u32,value:f64,tau:f64,author:f64,seconds:f64)->u32{p.command(lane as usize,op,value,tau,author,seconds)as u32}
#[no_mangle]pub extern "C" fn instrument_flanger_credit(p:&Engine,lane:u32,n:u32,author:f64)->u32{p.credit(lane as usize,n as usize,author)as u32}
#[no_mangle]pub extern "C" fn instrument_flanger_render(p:&mut Engine,channels:u32,pulled:u32)->u32{if pulled>1{return p.reject()as u32;}p.render(channels,pulled==1)as u32}
#[no_mangle]pub extern "C" fn instrument_flanger_input(p:&mut Engine,c:u32)->*mut f32{p.input.get_mut(c as usize).map_or(std::ptr::null_mut(),|x|x.as_mut_ptr())}
#[no_mangle]pub extern "C" fn instrument_flanger_output(p:&Engine,c:u32)->*const f32{p.output.get(c as usize).map_or(std::ptr::null(),|x|x.as_ptr())}
#[no_mangle]pub extern "C" fn instrument_flanger_curve(p:&Engine,lane:u32,index:u32)->f64{p.curves.get(lane as usize).and_then(|v|v.get(index as usize)).map_or(f64::NAN,|x|*x as f64)}
#[no_mangle]pub extern "C" fn instrument_flanger_stat(p:&Engine,index:u32)->f64{match index{0=>p.frame as f64,1=>p.peak,2=>p.calls as f64,3=>p.commands as f64,4=>p.rejected as f64,5=>p.rendered as f64,6=>p.unpulled as f64,7=>p.late as f64,8=>p.clamps as f64,9=>p.entry as f64,10=>p.channels as f64,11=>p.planned as f64,12=>p.sines[0].as_ref().unwrap().phase(),_=>f64::NAN}}
