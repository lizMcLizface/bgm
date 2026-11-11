//! Actual BreathFormants air branch for piano sources. The tonal piano source
//! bypasses that formant input; only this independent seeded air branch reaches
//! the shared gain. Original offset, high/low filters and level schedule remain.
use crate::{biquad::Biquad,timeline::Timeline,engine::source_frame};
#[derive(Clone,Copy)]
struct AirSource{id:u32,slot:usize,start:f64,end:f64,frame:u64,position:f64,started:bool,finished:bool}
impl Default for AirSource{fn default()->Self{Self{id:0,slot:0,start:0.,end:0.,frame:0,position:0.,started:false,finished:true}}}
struct AirSlot{gain:Timeline,normal:Timeline,high:Biquad,low:Biquad,ever:bool}
impl AirSlot{fn new()->Self{Self{gain:Timeline::new(0.),normal:Timeline::new(1.),high:Biquad::default(),low:Biquad::default(),ever:false}}}
pub struct Air{live_history:bool,sr:f64,noise:Vec<f32>,sources:Vec<AirSource>,slots:Vec<AirSlot>}
impl Air{
 pub fn new(sr:f64,voices:usize)->Self{
  let mut state=0x5f3759dfu32;let mut noise=vec![0f32;(sr*2.) as usize];let mut mean=0.;
  for sample in &mut noise{state^=state<<13;state^=state>>17;state^=state<<5;*sample=(state as f64/4294967296.*2.-1.) as f32;mean+=*sample as f64;}
  mean/=noise.len() as f64;for sample in &mut noise{*sample=(*sample as f64-mean) as f32;}
  Self{live_history:false,sr,noise,sources:vec![AirSource::default();2000],slots:(0..voices).map(|_|AirSlot::new()).collect()}
 }
 pub fn enable_live_history(&mut self){self.live_history=true;for s in &mut self.slots{if s.ever{s.gain.enable_live();s.normal.enable_live();}}}
 pub fn samples(&self)->&[f32]{&self.noise}
 pub fn has_id(&self,id:u32)->bool{self.sources.iter().any(|s|!s.finished&&s.id==id)}
 pub fn can_schedule(&mut self,slot:usize,now:f64,breath:f64)->bool{let s=&mut self.slots[slot];s.gain.prune(now);s.normal.prune(now);s.gain.can_add(4)&&s.normal.can_add(2)&&(breath<=0.||self.sources.iter().any(|s|s.finished))}
 pub fn schedule(&mut self,id:u32,slot:usize,start:f64,end:f64,duration:f64,frequency:f64,breath:f64,formant:f64){
  let s=&mut self.slots[slot];s.ever|=breath>0.||formant>0.;if !s.ever{return;}if self.live_history{s.gain.enable_live();s.normal.enable_live();}
  s.normal.cancel(start);s.normal.add(start,0,(1./(1.-formant*0.55)).min(2.),0.);
  s.gain.cancel(start);s.gain.add(start,0,0.,0.);
  if breath>0.{let amount=breath*0.25;let attack=(duration/self.sr*0.15).clamp(0.008,0.06)*self.sr;s.gain.add(start+attack,1,amount,0.);s.gain.add(start+attack,2,amount*0.55,self.sr*0.12);
   let offset=(frequency*0.013)%2.;let position=((offset*self.sr*1024.).round()/1024.).round();
   let index=self.sources.iter().position(|s|s.finished).unwrap();self.sources[index]=AirSource{id,slot,start,end,frame:source_frame(start),position,started:false,finished:false};
  }
 }
 pub fn stop_slot(&mut self,slot:usize,time:f64){for s in &mut self.sources{if s.slot==slot&&!s.finished{s.end=s.end.min(time);}}}
 pub fn cancel(&mut self){for s in &mut self.sources{s.finished=true;}for s in &mut self.slots{s.high.clear();s.low.clear();}}
 pub fn reset(&mut self){self.cancel();for s in &mut self.slots{s.gain.reset(0.);s.normal.reset(1.);}}
 pub fn render(&mut self,frame:u64,awake:&[bool;32])->[[f32;128];32]{
  let mut input=[[0f32;128];32];let len=self.noise.len();
  for s in &mut self.sources{if s.finished||!awake[s.slot]||s.frame>=frame+128{continue;}let end=source_frame(s.end);for(i,out)in input[s.slot].iter_mut().enumerate(){let now=frame+i as u64;if now<s.frame{continue;}if now>=end{s.finished=true;break;}if !s.started{s.position+=(s.frame as f64-s.start).max(0.);s.started=true;}let p=s.position%len as f64;let a=p as usize;let b=(a+1)%len;let t=p-a as f64;*out+=((1.-t)*self.noise[a] as f64+t*self.noise[b] as f64) as f32;s.position=(s.position+1.)%len as f64;}}
  for(slot,s)in self.slots.iter_mut().enumerate(){if !s.ever||!awake[slot]{input[slot].fill(0.);continue;}s.gain.prepare_live(frame,self.sr);s.normal.prepare_live(frame,self.sr);for(i,value)in input[slot].iter_mut().enumerate(){let now=(frame+i as u64) as f64;let high=s.high.sample(*value,1,650.,0.5,0.,self.sr);let low=s.low.sample(high,0,7000f64.min(self.sr*0.4),0.5,0.,self.sr);*value=(low*s.gain.sample(i,now) as f32)*s.normal.sample(i,now) as f32;}s.high.end_quantum();s.low.end_quantum();}
  input
 }
}
