//! Stable native modulation identities. Sine phase belongs to actual pulls;
//! frequency/depth AudioParam clocks retain their independent authored events.
use crate::{live_sine::Sine,live_timeline::LiveTimeline};
pub struct Capture{pub id:usize,pub axis:u32,pub kind:u32,pub enabled:bool,pub phase:f64,pub initial_frequency:f64,pub initial_depth:f64,pub not_before:f64,pub frequency_revision:u32,pub depth_revision:u32,pub frequencies:Vec<(u32,f64,f64,f64,u32)>,pub depths:Vec<(u32,f64,f64,f64,u32)>,pub points:Vec<(f64,f64)>}
struct State{phase:f64,initial_frequency:f64,initial_depth:f64,axis:u32,kind:u32,enabled:bool,not_before:f64,origin:f64,sine:Sine,frequency:LiveTimeline,depth:LiveTimeline,frequency_revision:u32,depth_revision:u32,points:Vec<(f64,f64)>}
fn origin_fallback(_c:&Capture)->f64{0.}
pub struct LiveControls{rate:f64,state:[Option<State>;4],pub output:[[f32;128];4]}
impl LiveControls{
 pub fn new(rate:f64)->Self{Self{rate,state:std::array::from_fn(|_|None),output:[[0.;128];4]}}
 fn valid(&self,c:&Capture)->bool{
  if c.id>=4||c.axis>1||c.kind>1||!c.phase.is_finite()||!(0. ..1.).contains(&c.phase)||!c.not_before.is_finite()||c.not_before<0.||c.not_before>9007199254740864.||!c.initial_frequency.is_finite()||!(0. ..=44100.).contains(&c.initial_frequency)||!c.initial_depth.is_finite()||c.initial_depth.abs()>24000.||c.frequencies.len()>128||c.depths.len()>128||c.points.len()>128||c.kind==0&&!c.points.is_empty()||c.kind==1&&(c.points.len()<2||c.points[0].0!=0.){return false;}
  if c.frequencies.iter().any(|p|p.0==0||!p.1.is_finite()||p.1<0.||p.1>9007199254740864.||!p.2.is_finite()||!(0. ..=44100.).contains(&p.2)||!p.3.is_finite()||p.3<0.||p.3>9007199254740864.||p.4>1)||c.depths.iter().any(|p|p.0==0||![p.1,p.2,p.3].iter().all(|v|v.is_finite())||p.1<0.||p.1>9007199254740864.||p.2.abs()>24000.||p.3<0.||p.3>self.rate*30.||p.4>1||p.4==1&&p.3!=0.)||c.points.iter().any(|p|!p.0.is_finite()||p.0<0.||!p.1.is_finite()||p.1.abs()>1.2+f64::EPSILON)||c.points.windows(2).any(|p|p[0].0>=p[1].0){return false;}
  if c.frequencies.windows(2).any(|p|p[0].0.checked_add(1)!=Some(p[1].0)||p[0].1>p[1].1)||c.depths.windows(2).any(|p|p[0].0.checked_add(1)!=Some(p[1].0)||p[0].1>p[1].1)||c.frequencies.last().map_or(0,|p|p.0)!=c.frequency_revision||c.depths.last().map_or(0,|p|p.0)!=c.depth_revision{return false;}
  if let Some(old)=&self.state[c.id]{if old.axis!=c.axis||old.phase!=c.phase||old.initial_frequency!=c.initial_frequency||old.initial_depth!=c.initial_depth||c.frequency_revision<old.frequency_revision||c.depth_revision<old.depth_revision||c.frequencies.first().is_some_and(|p|p.0>old.frequency_revision.saturating_add(1))||c.depths.first().is_some_and(|p|p.0>old.depth_revision.saturating_add(1))||!old.frequency.available_at(c.frequencies.iter().filter(|p|p.0>old.frequency_revision&&p.4==0).count(),c.frequencies.iter().find(|p|p.0>old.frequency_revision&&p.4==0).map_or(origin_fallback(c),|p|p.3))||!old.depth.available_at(c.depths.iter().filter(|p|p.0>old.depth_revision&&p.4==0).count(),c.depths.iter().find(|p|p.0>old.depth_revision&&p.4==0).map_or(origin_fallback(c),|p|p.1)){return false;}}
  else if c.frequencies.first().is_some_and(|p|p.0!=1)||c.depths.first().is_some_and(|p|p.0!=1){return false;}
  true
 }
 pub fn update(&mut self,origin:f64,captures:Vec<Capture>)->bool{
  if !origin.is_finite()||origin<0.||origin>9007199254740864.||captures.len()>4||captures.iter().any(|c|!self.valid(c))||captures.iter().enumerate().any(|(i,c)|captures[..i].iter().any(|other|other.id==c.id)){return false;}
  for state in self.state.iter_mut().flatten(){state.enabled=false;}
  for c in captures{let s=self.state[c.id].get_or_insert_with(||State{phase:c.phase,initial_frequency:c.initial_frequency,initial_depth:c.initial_depth,axis:c.axis,kind:c.kind,enabled:false,not_before:crate::engine::source_frame(c.not_before)as f64,origin,sine:Sine::new(self.rate,c.phase),frequency:LiveTimeline::new(c.initial_frequency.min(self.rate/2.),256),depth:LiveTimeline::new(c.initial_depth,256),frequency_revision:0,depth_revision:0,points:Vec::new()});
   for(revision,time,value,called,intrinsic)in c.frequencies{if revision>s.frequency_revision{if intrinsic==1{s.frequency.intrinsic(value.min(self.rate/2.));}else{s.frequency.prune_for_insert(called);s.frequency.add(time.max(called),0,value.min(self.rate/2.),0.);}s.frequency_revision=revision;}}
   for(revision,time,value,tau,intrinsic)in c.depths{if revision>s.depth_revision{if intrinsic==1{s.depth.intrinsic(value);}else{s.depth.prune_for_insert(time);s.depth.add(time,if tau>0.{2}else{0},value,tau);}s.depth_revision=revision;}}
   s.enabled=c.enabled;s.kind=c.kind;s.not_before=crate::engine::source_frame(c.not_before)as f64;s.origin=origin;s.points=c.points;
  }true
 }
 pub fn prepare(&mut self,frame:u64,awake:bool){
  for(id,slot)in self.state.iter_mut().enumerate(){self.output[id].fill(0.);let Some(s)=slot else{continue;};if !awake||!s.enabled||frame+128<=s.not_before.ceil()as u64{continue;}
   let constant=!s.frequency.accurate(frame);if s.kind==0{s.frequency.prepare(frame,self.rate);}s.depth.prepare(frame,self.rate);
   for i in 0..128{let now=frame+i as u64;if (now as f64)<s.not_before{continue;}
    let wave=if s.kind==0{s.sine.tick(s.frequency.output[i],now,constant,!constant)}else{let t=now as f64-s.origin;let at=s.points.partition_point(|p|p.0<t);if at==0{s.points[0].1 as f32}else if at==s.points.len(){s.points[at-1].1 as f32}else{let a=s.points[at-1];let b=s.points[at];(a.1+(b.1-a.1)*(t-a.0)/(b.0-a.0))as f32}};
    self.output[id][i]=wave*s.depth.output[i];
   }
  }
 }
 pub fn sum(&self,axis:u32,index:usize)->f32{let mut value=0f32;for(id,s)in self.state.iter().enumerate(){if s.as_ref().is_some_and(|s|s.axis==axis){value+=self.output[id][index];}}value}
 pub fn phase(&self,id:usize)->f64{self.state.get(id).and_then(Option::as_ref).map_or(f64::NAN,|s|s.sine.phase())}
 pub fn reset(&mut self){for s in self.state.iter_mut().flatten(){s.sine.reset();s.frequency.reset(s.frequency.latest()as f64);s.depth.reset(s.depth.latest()as f64);s.not_before=0.;s.origin=0.;}self.output.fill([0.;128]);}
}
