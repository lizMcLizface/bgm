//! Original RoomColour pre-delay and damping, with native20ms a-rate controls.
//! Portable processing only: no WebAudio objects, threads or platform clocks.
#[path="../../common/native_target.rs"] mod target;
mod delay;
#[path="../../tape-fx/src/tone.rs"] mod tone;
#[cfg(feature="allocation-audit")]mod allocation;
const BLOCK:usize=2048;
#[derive(Clone,Copy)]
struct Activity{frame:u64,source:usize,delay_audio:bool,filter_audio:bool}

pub struct Engine {
 rate:f64,channels:usize,max_channels:usize,source_channels:usize,delay_audio:bool,filter_audio:bool,activity:Vec<Activity>,activity_head:usize,activity_applied:u64,targets:[target::Gain;2],delay:delay::Delay,tone:tone::Lowpass,
 initial:[f64;2],events:Vec<(usize,f64,f64)>,ready:bool,frame:u64,peak:f64,rejected:u64,
 input:[[f32;BLOCK];2],output:[[f32;BLOCK];2],controls:[[f32;128];2],delay_controls:[[f32;128];2],
}
fn value(index:usize,raw:f64)->Option<f64>{
 if !raw.is_finite(){return None;}
 match index {0 if (0. ..=0.225).contains(&raw)=>Some((raw-0.025).clamp(0.,0.2)),1 if (200. ..=20000.).contains(&raw)=>Some((20000.*(raw.max(200.)/6000.).powf(1.5)).min(20000.)),_=>None}
}
impl Engine {
 pub fn new(rate:f64,channels:usize)->Option<Box<Self>>{
  if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels){return None;}
  Some(Box::new(Self{rate,channels,max_channels:channels,source_channels:channels,delay_audio:true,filter_audio:true,activity:Vec::with_capacity(256),activity_head:0,activity_applied:0,targets:[target::Gain::prepared(rate,0.,0.02)?,target::Gain::prepared(rate,350.,0.02)?],delay:delay::Delay::new(rate),tone:tone::Lowpass::new(rate),initial:[0.025,6000.],events:Vec::with_capacity(512),ready:false,frame:0,peak:0.,rejected:0,input:[[0.;BLOCK];2],output:[[0.;BLOCK];2],controls:[[0.;128];2],delay_controls:[[0.;128];2]}))
 }
 pub fn initial(&mut self,index:usize,raw:f64)->bool{if self.ready||value(index,raw).is_none(){return false;}self.initial[index]=raw;true}
 pub fn event(&mut self,index:usize,seconds:f64,raw:f64)->bool{
  if self.ready||value(index,raw).is_none()||!seconds.is_finite()||seconds<0.||seconds*self.rate>9007199254740864.||self.events.iter().filter(|e|e.0==index).count()>=255||self.events.iter().rev().find(|e|e.0==index).is_some_and(|e|e.1>=seconds&&seconds!=0.)||self.events.len()>=512||self.events.last().is_some_and(|e|e.1>seconds){return false;}
  self.events.push((index,seconds,raw));true
 }
 pub fn prepare(&mut self)->bool{
  if self.ready{return false;}
  for i in 0..2{self.targets[i].replace_zero(value(i,self.initial[i]).unwrap());}
  // Same-parameter calls at the same native second replace that target.
  for &(i,seconds,raw) in &self.events{
   let mapped=value(i,raw).unwrap();
   let ok=if seconds==0.{self.targets[i].replace_zero(mapped)}else{self.targets[i].push(seconds,mapped)};
   if !ok{return false;}
  }
  self.targets.iter_mut().for_each(target::Gain::seal);self.ready=true;true
 }
 pub fn schedule(&mut self,index:usize,seconds:f64,raw:f64)->bool{
  let Some(mapped)=value(index,raw)else{return false;};
  let generated=self.frame.div_ceil(128)*128;
  if !self.ready||!self.targets[index].schedule(seconds,mapped,generated){self.rejected+=1;return false;}true
 }
 /// Authored native layout/processing clock. Never infer a silence flag from PCM.
 pub fn activity(&mut self,frame:u64,source:usize,delay_audio:bool,filter_audio:bool)->bool{
  let generated=self.frame.div_ceil(128)*128;
  if !self.ready||frame%128!=0||frame<generated||frame>9007199254740864||source>self.max_channels||self.activity.last().is_some_and(|e|e.frame>frame){self.rejected+=1;return false;}
  let event=Activity{frame,source,delay_audio,filter_audio};
  if self.activity_head<self.activity.len(){if let Some(last)=self.activity.last_mut(){if last.frame==frame{*last=event;return true;}}}
  if self.activity_head>0{self.activity.drain(..self.activity_head);self.activity_head=0;}
  if self.activity.len()>=256{self.rejected+=1;return false;}
  self.activity.push(event);true
 }
 pub fn render(&mut self,n:usize)->bool{
  if !self.ready||n>BLOCK||self.frame+n as u64>9007199254740864||(0..self.max_channels).any(|c|self.input[c][..n].iter().any(|x|!x.is_finite())){return false;}
  self.peak=0.;
  for i in 0..n{let f=self.frame;
   if f%128==0{
    while self.activity_head<self.activity.len()&&self.activity[self.activity_head].frame==f{
     let e=self.activity[self.activity_head];let layout=e.source.max(1);
     if layout!=self.channels{self.delay.layout(self.channels,layout);self.tone.reset();self.channels=layout;}
     self.source_channels=e.source;self.delay_audio=e.delay_audio;self.filter_audio=e.filter_audio;self.activity_head+=1;self.activity_applied+=1;
    }
    self.targets[0].prepare_quantum(f);self.delay_controls[0]=self.targets[0].samples;
    if self.delay_audio&&self.channels==2{self.targets[0].prepare_quantum(f);self.delay_controls[1]=self.targets[0].samples;}
    self.targets[1].prepare_quantum(f);if !self.targets[1].clamp_output(0.,(self.rate*0.5)as f32){return false;}
   }
   let d=self.delay_controls[0][f as usize%128];let right=if self.channels==2{self.delay_controls[1][f as usize%128]}else{0.};let hz=self.targets[1].samples[f as usize%128];self.controls[0][f as usize%128]=d;self.controls[1][f as usize%128]=hz;
   let x=[if self.source_channels>0{self.input[0][i]}else{0.},if self.source_channels==2{self.input[1][i]}else{0.}];
   let delayed=if self.delay_audio{self.delay.tick(x,[d,right])}else{[0.;2]};
   let mut y=if self.filter_audio{self.tone.tick(delayed,hz,f)}else{[0.;2]};
   if self.channels==1{y[1]=if self.max_channels==2{y[0]}else{0.};}
   for c in 0..2{self.output[c][i]=y[c];self.peak=self.peak.max(y[c].abs()as f64);}self.frame+=1;
  }true
 }
 pub fn reset(&mut self){for t in &mut self.targets{t.clear_events();}for i in 0..2{self.targets[i].replace_zero(value(i,self.initial[i]).unwrap());}for &(i,s,v) in &self.events{if s==0.{self.targets[i].replace_zero(value(i,v).unwrap());}else{self.targets[i].push(s,value(i,v).unwrap());}}self.targets.iter_mut().for_each(target::Gain::seal);self.delay.reset();self.tone.reset();self.channels=self.max_channels;self.source_channels=self.max_channels;self.delay_audio=true;self.filter_audio=true;self.activity.clear();self.activity_head=0;self.activity_applied=0;self.frame=0;self.peak=0.;self.rejected=0;self.input.fill([0.;BLOCK]);self.output.fill([0.;BLOCK]);self.controls.fill([0.;128]);self.delay_controls.fill([0.;128]);}
}
#[no_mangle]pub extern "C" fn room_colour_api()->u32{1}
#[no_mangle]pub extern "C" fn room_colour_new(rate:f64,channels:usize)->*mut Engine{Engine::new(rate,channels).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn room_colour_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn room_colour_initial(p:&mut Engine,i:usize,v:f64)->u32{p.initial(i,v)as u32}
#[no_mangle]pub extern "C" fn room_colour_event(p:&mut Engine,i:usize,s:f64,v:f64)->u32{p.event(i,s,v)as u32}
#[no_mangle]pub extern "C" fn room_colour_prepare(p:&mut Engine)->u32{p.prepare()as u32}
#[no_mangle]pub extern "C" fn room_colour_schedule(p:&mut Engine,i:usize,s:f64,v:f64)->u32{p.schedule(i,s,v)as u32}
#[no_mangle]pub extern "C" fn room_colour_activity(p:&mut Engine,frame:f64,source:f64,delay_mode:f64,filter_mode:f64)->u32{
 if !frame.is_finite()||frame.fract()!=0.||frame<0.||frame>9007199254740864.||!source.is_finite()||source.fract()!=0.||!(0. ..=2.).contains(&source)||!delay_mode.is_finite()||delay_mode.fract()!=0.||!(0. ..=1.).contains(&delay_mode)||!filter_mode.is_finite()||filter_mode.fract()!=0.||!(0. ..=1.).contains(&filter_mode){p.rejected+=1;return 0;}
 p.activity(frame as u64,source as usize,delay_mode==0.,filter_mode==0.)as u32
}
#[no_mangle]pub extern "C" fn room_colour_input(p:&mut Engine,c:usize)->*mut f32{p.input.get_mut(c).map(|ch|ch.as_mut_ptr()).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub extern "C" fn room_colour_output(p:&Engine,c:usize)->*const f32{p.output.get(c).map(|ch|ch.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn room_colour_controls(p:&Engine,c:usize)->*const f32{p.controls.get(c).map(|ch|ch.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn room_colour_render(p:&mut Engine,n:usize)->u32{p.render(n)as u32}
#[no_mangle]pub extern "C" fn room_colour_reset(p:&mut Engine){p.reset();}
#[no_mangle]pub extern "C" fn room_colour_stat(p:&Engine,i:usize)->f64{match i{0=>p.frame as f64,1=>p.peak,2=>p.channels as f64,3=>p.rejected as f64,4=>((p.frame+127)/128*128)as f64,5=>p.ready as u32 as f64,6=>p.source_channels as f64,7=>p.channels as f64,8=>(!p.delay_audio)as u32 as f64,9=>(!p.filter_audio)as u32 as f64,10=>p.activity_applied as f64,11=>(p.activity.len()-p.activity_head)as f64,12=>p.max_channels as f64,_=>0.}}
