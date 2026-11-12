//! Original Chorus/Phaser numerical graphs. Canonical Chorus voice sum0,1,2.
//! Input is actual captured PCM; no Native marker, coefficient or getter enters.
#[path="../../fdn-room-live/src/timeline.rs"]mod timeline;
#[path="../../rack-native-normal/src/oscillator.rs"]mod sine;
mod delay;mod allpass;
#[cfg(feature="allocation-audit")]mod allocation;
use std::sync::atomic::{AtomicUsize,Ordering};
const N:usize=128;const LANES:usize=24;const CAP:usize=256;const MAX:u64=1099511627648;
static HANDLES:AtomicUsize=AtomicUsize::new(0);
fn frame(v:f64)->Option<u64>{if v.is_finite()&&v>=0.&&v<=MAX as f64&&v.fract()==0.&&v%128.==0.{Some(v as u64)}else{None}}
fn initial(mode:u32,lane:usize)->f64{match lane{0|1|21=>1.,2=>440.,3|4=>if mode==0{440.}else{0.},5=>1.,6|7=>if mode==0{1.}else{0.},11..=14=>1.,15..=20=>350.,_=>0.}}
pub struct Engine{rate:f64,mode:u32,channels:usize,origin:u64,frame:u64,ready:bool,start_seconds:f64,started:[bool;3],last:Option<u64>,
 lanes:[timeline::LiveTimeline;LANES],curves:[[f32;N];LANES],accurate:[bool;LANES],sines:[Option<sine::Sine>;3],delays:[Option<delay::Line>;3],filters:[allpass::Allpass;6],
 previous:[[f32;N];2],input:[[f32;N];2],output:[[f32;N];2],voices:[[[f32;N];2];3],modulation:[[f32;N];3],calls:u64,commands:u64,rejected:u64,rendered:u64,unpulled:u64,late:u64,clamps:u64,peak:f64,planned:usize}
impl Engine{
 fn new(rate:f64,channels:u32,mode:u32)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels)||mode>1{return None;}
  let length=128+((0.03*rate*1024.).round()/1024.).ceil()as usize;let planned=std::mem::size_of::<Self>()+LANES*CAP*128+if mode==0{3*channels as usize*length*4}else{0};if planned>2*1024*1024{return None;}if HANDLES.fetch_update(Ordering::Relaxed,Ordering::Relaxed,|n|if n<8{Some(n+1)}else{None}).is_err(){return None;}
  Some(Box::new(Self{rate,mode,channels:channels as usize,origin:0,frame:0,ready:false,start_seconds:0.,started:[false;3],last:None,lanes:std::array::from_fn(|i|timeline::LiveTimeline::new(initial(mode,i),CAP,rate)),curves:std::array::from_fn(|i|[initial(mode,i)as f32;N]),accurate:[false;LANES],sines:std::array::from_fn(|i|if i==0||mode==0{Some(sine::Sine::new(rate,0.))}else{None}),delays:std::array::from_fn(|_|if mode==0{Some(delay::Line::new(rate as usize,channels as usize))}else{None}),filters:[allpass::Allpass::default();6],previous:[[0.;N];2],input:[[0.;N];2],output:[[0.;N];2],voices:[[[0.;N];2];3],modulation:[[0.;N];3],calls:0,commands:0,rejected:0,rendered:0,unpulled:0,late:0,clamps:0,peak:0.,planned}))
 }
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn active(&self,lane:usize)->bool{if self.mode==0{lane<=13}else{matches!(lane,0|1|2|5|14|15..=21)}}
 fn valid(lane:usize,value:f64)->bool{value.is_finite()&&(value as f32).is_finite()&&match lane{0|1|11..=14=>(0. ..=1.).contains(&value),2..=4=>(0. ..=100.).contains(&value),5..=7=>(0. ..=1000.).contains(&value),8..=10=>(0. ..=0.03).contains(&value),15..=20=>(0. ..=20000.).contains(&value),21=>(0. ..=100.).contains(&value),_=>false}}
 fn credit(&self,lane:usize,n:usize,author:f64)->bool{lane<LANES&&self.active(lane)&&n<=CAP&&frame(author).is_some_and(|at|self.ready&&at>=self.origin&&self.last.is_none_or(|v|at>=v))&&self.lanes[lane].available_at(n,author)}
 fn command(&mut self,lane:usize,op:u32,value:f64,tau:f64,author:f64,seconds:f64)->bool{let Some(at)=frame(author)else{return self.reject();};if !self.ready||at<self.origin||at>self.frame||self.last.is_some_and(|v|at<v)||lane>=LANES||!self.active(lane)||!matches!(op,0|2|3|4)||!seconds.is_finite()||seconds<0.||seconds>MAX as f64/self.rate||!tau.is_finite()||tau<0.||op==2&&tau==0.||op!=3&&!Self::valid(lane,value)||op!=3&&!self.credit(lane,1,author){return self.reject();}
  let time=seconds.max(at as f64/self.rate);if time!=seconds{self.clamps+=1;}self.lanes[lane].prune_for_insert(author);if op==3{self.lanes[lane].cancel(time*self.rate);}else{let value=if op==4&&(15..=20).contains(&lane){value.min(self.rate/2.)}else{value};if op==4{self.lanes[lane].intrinsic(value);}assert!(self.lanes[lane].add_seconds(time,if op==2{2}else{0},value,if op==2{tau}else{0.}));}self.last=Some(at);self.commands+=1;if at<self.frame{self.late+=1;}true
 }
 fn step(&mut self,lane:usize,value:f64,seconds:f64){assert!(self.command(lane,0,value,0.,self.origin as f64,seconds));}
 fn prepare(&mut self,origin:f64,seconds:f64)->bool{let Some(at)=frame(origin)else{return self.reject();};if self.ready||seconds!=origin/self.rate{return self.reject();}self.ready=true;self.origin=at;self.frame=at;self.start_seconds=seconds;
  if self.mode==0{for i in 0..3{self.step(8+i,0.005+i as f64*0.003,seconds);assert!(self.command(2+i,3,0.,0.,origin,seconds+0.001));self.step(2+i,0.5+i as f64*0.2,seconds+0.001);self.step(5+i,0.002,seconds);self.step(11+i,0.3,seconds);}self.step(0,1.,seconds);self.step(1,0.,seconds);}
  else{assert!(self.command(2,3,0.,0.,origin,seconds+0.001));self.step(2,0.5,seconds+0.001);self.step(5,800.,seconds);for i in 0..6{self.step(15+i,800.,seconds);self.step(21,0.5,seconds);}self.step(0,1.,seconds);self.step(1,0.,seconds);self.step(14,0.3,seconds);self.step(5,640.,seconds);}true
 }
 fn sync(&mut self,at:f64)->bool{let Some(f)=frame(at)else{return self.reject();};if !self.ready||f<self.frame{return self.reject();}self.frame=f;true}
 fn lfo(&mut self,index:usize)->[f32;N]{let rate_lane=2+index;let depth_lane=5+index;let constant=!self.accurate[rate_lane];let mut offset=0;let sine=self.sines[index].as_mut().unwrap();
  if !self.started[index]{let start=self.start_seconds*self.rate;let ceil=((start*1024.).round()/1024.).ceil()as u64;offset=ceil.saturating_sub(self.frame).min(128)as usize;if offset==128{return[0.;N];}let fraction=start-ceil as f64;if fraction>0.{offset+=1;}sine.scheduling_offset(fraction,self.curves[rate_lane][0],constant);self.started[index]=true;}
  let n=128-offset;let start=sine.virtual_index();let mut output=[0.;N];for i in offset..128{let k=i-offset;let value=sine.tick(self.curves[rate_lane][k],self.frame+k as u64,constant,!constant&&k<n/4*4);output[i]=if !self.accurate[depth_lane]&&self.curves[depth_lane][127]==0.{0.}else{value*self.curves[depth_lane][i]};}
  if constant&&n!=128{sine.finish_partial_constant(start,n,self.curves[rate_lane][0]);}output
 }
 fn gain(&self,value:f32,lane:usize,index:usize)->f32{if !self.accurate[lane]&&self.curves[lane][127]==0.{0.}else{value*self.curves[lane][index]}}
 fn render(&mut self,channels:u32,pulled:bool)->bool{
  if !self.ready||self.frame>MAX-128||channels!=0&&channels as usize!=self.channels||!pulled&&channels!=0||(0..channels as usize).any(|c|self.input[c].iter().any(|v|!v.is_finite()||v.abs()>4.)){return self.reject();}self.output.fill([0.;N]);self.peak=0.;
  if pulled{for lane in 0..LANES{if !self.active(lane){continue;}self.accurate[lane]=self.lanes[lane].accurate(self.frame);self.lanes[lane].prepare(self.frame,self.rate);if (15..=20).contains(&lane){self.lanes[lane].clamp_output(0.,(self.rate/2.)as f32);}self.curves[lane]=self.lanes[lane].output;}
   let input=if channels==0{[[0.;N];2]}else{self.input};for i in 0..if self.mode==0{3}else{1}{self.modulation[i]=self.lfo(i);}
   let mut wet=[[0.;N];2];
   if self.mode==0{for voice in 0..3{let mut times=[0.;N];for i in 0..N{times[i]=(self.curves[8+voice][i]+self.modulation[voice][i]).clamp(0.,0.03f32);}let delayed=self.delays[voice].as_mut().unwrap().process(&input,&times,self.channels);for c in 0..self.channels{for i in 0..N{self.voices[voice][c][i]=self.gain(delayed[c][i],11+voice,i);}}}
    for c in 0..self.channels{for i in 0..N{let mut sum=0.;for voice in 0..3{sum+=self.voices[voice][c][i];}wet[c][i]=sum;}}
   }else{
    for i in 0..N{let mut value=[0.;2];for c in 0..self.channels{value[c]=(0.+input[c][i])+self.gain(self.previous[c][i],14,i);}for stage in 0..6{let frequency=(self.curves[15+stage][i]+self.modulation[0][i]).clamp(0.,(self.rate/2.)as f32);value=self.filters[stage].sample(value,self.channels,frequency as f64/(self.rate/2.),self.curves[21][i]as f64);}for c in 0..self.channels{wet[c][i]=value[c];}}self.previous=wet;for filter in &mut self.filters{filter.end_quantum();}
   }
   for c in 0..self.channels{for i in 0..N{let dry=self.gain(input[c][i],0,i);let wet=self.gain(wet[c][i],1,i);let value=(0.+dry)+wet;if !value.is_finite(){return self.reject();}self.output[c][i]=value;self.peak=self.peak.max(value.abs()as f64);}}self.rendered+=128;
  }else{self.unpulled+=128;}self.frame+=128;self.calls+=1;true
 }
 fn reset(&mut self)->bool{if !self.ready{return self.reject();}for i in 0..LANES{self.lanes[i].reset(initial(self.mode,i));self.curves[i].fill(initial(self.mode,i)as f32);}for sine in self.sines.iter_mut().flatten(){sine.reset();}for line in self.delays.iter_mut().flatten(){line.reset();}for filter in &mut self.filters{filter.reset();}self.started=[false;3];self.previous.fill([0.;N]);self.input.fill([0.;N]);self.output.fill([0.;N]);self.voices.fill([[0.;N];2]);self.modulation.fill([0.;N]);self.last=None;self.calls=0;self.commands=0;self.rejected=0;self.rendered=0;self.unpulled=0;self.late=0;self.clamps=0;self.peak=0.;self.ready=false;self.prepare(self.origin as f64,self.start_seconds)}
}
impl Drop for Engine{fn drop(&mut self){HANDLES.fetch_sub(1,Ordering::Relaxed);}}
#[no_mangle]pub extern "C" fn instrument_modulation_api()->u32{1}
#[no_mangle]pub extern "C" fn instrument_modulation_new(rate:f64,channels:u32,mode:u32)->*mut Engine{Engine::new(rate,channels,mode).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn instrument_modulation_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn instrument_modulation_prepare(p:&mut Engine,origin:f64,seconds:f64)->u32{p.prepare(origin,seconds)as u32}
#[no_mangle]pub extern "C" fn instrument_modulation_sync(p:&mut Engine,at:f64)->u32{p.sync(at)as u32}
#[no_mangle]pub extern "C" fn instrument_modulation_reset(p:&mut Engine)->u32{p.reset()as u32}
#[no_mangle]pub extern "C" fn instrument_modulation_command(p:&mut Engine,lane:u32,op:u32,value:f64,tau:f64,author:f64,seconds:f64)->u32{p.command(lane as usize,op,value,tau,author,seconds)as u32}
#[no_mangle]pub extern "C" fn instrument_modulation_credit(p:&Engine,lane:u32,n:u32,author:f64)->u32{p.credit(lane as usize,n as usize,author)as u32}
#[no_mangle]pub extern "C" fn instrument_modulation_render(p:&mut Engine,channels:u32,pulled:u32)->u32{if pulled>1{return p.reject()as u32;}p.render(channels,pulled==1)as u32}
#[no_mangle]pub extern "C" fn instrument_modulation_input(p:&mut Engine,c:u32)->*mut f32{p.input.get_mut(c as usize).map_or(std::ptr::null_mut(),|x|x.as_mut_ptr())}
#[no_mangle]pub extern "C" fn instrument_modulation_output(p:&Engine,c:u32)->*const f32{p.output.get(c as usize).map_or(std::ptr::null(),|x|x.as_ptr())}
#[no_mangle]pub extern "C" fn instrument_modulation_voice(p:&Engine,voice:u32,c:u32)->*const f32{p.voices.get(voice as usize).and_then(|v|v.get(c as usize)).map_or(std::ptr::null(),|v|v.as_ptr())}
#[no_mangle]pub extern "C" fn instrument_modulation_lfo(p:&Engine,voice:u32,index:u32)->f64{p.modulation.get(voice as usize).and_then(|v|v.get(index as usize)).map_or(f64::NAN,|x|*x as f64)}
#[no_mangle]pub extern "C" fn instrument_modulation_curve(p:&Engine,lane:u32,index:u32)->f64{p.curves.get(lane as usize).and_then(|v|v.get(index as usize)).map_or(f64::NAN,|x|*x as f64)}
#[no_mangle]pub extern "C" fn instrument_modulation_stat(p:&Engine,index:u32)->f64{match index{0=>p.frame as f64,1=>p.peak,2=>p.calls as f64,3=>p.commands as f64,4=>p.rejected as f64,5=>p.rendered as f64,6=>p.unpulled as f64,7=>p.late as f64,8=>p.clamps as f64,9=>p.mode as f64,10=>p.channels as f64,11=>p.planned as f64,12=>p.sines[0].as_ref().map_or(0.,|v|v.phase()),13=>p.sines[1].as_ref().map_or(0.,|v|v.phase()),14=>p.sines[2].as_ref().map_or(0.,|v|v.phase()),_=>f64::NAN}}
