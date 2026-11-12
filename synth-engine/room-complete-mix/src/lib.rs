//! Original Room unsmoothed dry/wet law, two independently captured Native steps.
//! Source-local prepared program only. No live control or automatic demand claim.
#[cfg(feature="allocation-audit")]mod allocation;mod timeline;
const BLOCK:usize=2048;const CAPACITY:usize=256;
#[derive(Clone,Copy)]struct Event{lane:usize,seconds:f64,amount:f64}
pub struct Engine{rate:f64,source:usize,wet:usize,output_channels:usize,initial:f64,events:Vec<Event>,lanes:[timeline::LiveTimeline;2],ready:bool,frame:u64,calls:u64,rejected:u64,peak:f64,input_dry:[[f32;BLOCK];2],input_wet:[[f32;BLOCK];2],output:[[f32;BLOCK];2]}
fn amount(v:f64)->bool{v.is_finite()&&(0. ..=1.).contains(&v)}
fn gain(lane:usize,v:f64)->f64{if lane==0{if v<0.5{1.}else{1.-((v-0.5)*2.)}}else if v<0.5{v*2.}else{1.}}
impl Engine{
 pub fn new(rate:f64,source:usize,wet:usize)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&source)||!(1..=2).contains(&wet){return None;}Some(Box::new(Self{rate,source,wet,output_channels:source.max(wet),initial:0.,events:Vec::with_capacity(510),lanes:std::array::from_fn(|_|timeline::LiveTimeline::new(1.,CAPACITY,rate)),ready:false,frame:0,calls:0,rejected:0,peak:0.,input_dry:[[0.;BLOCK];2],input_wet:[[0.;BLOCK];2],output:[[0.;BLOCK];2]}))}
 pub fn initial(&mut self,v:f64)->bool{if self.ready||!amount(v){self.rejected+=1;return false;}self.initial=v;true}
 pub fn event(&mut self,lane:usize,seconds:f64,v:f64)->bool{if self.ready||lane>1||!amount(v)||!seconds.is_finite()||!(0. ..=3600.).contains(&seconds)||self.events.len()>=510||self.events.iter().filter(|e|e.lane==lane).count()>=255||self.events.last().is_some_and(|e|seconds<e.seconds){self.rejected+=1;return false;}self.events.push(Event{lane,seconds,amount:v});true}
 fn replay(&mut self){for lane in 0..2{self.lanes[lane].reset(1.);assert!(self.lanes[lane].add_seconds(0.,0,gain(lane,self.initial),0.));}for e in &self.events{assert!(self.lanes[e.lane].add_seconds(e.seconds,0,gain(e.lane,e.amount),0.));}}
 pub fn prepare(&mut self)->bool{if self.ready{self.rejected+=1;return false;}self.replay();self.ready=true;true}
 pub fn render(&mut self,n:usize)->bool{if !self.ready||n>BLOCK||self.frame+n as u64>self.rate as u64*3600||(0..self.source).any(|c|self.input_dry[c][..n].iter().any(|x|!x.is_finite()))||(0..self.wet).any(|c|self.input_wet[c][..n].iter().any(|x|!x.is_finite())){self.rejected+=1;return false;}self.peak=0.;for i in 0..n{if self.frame%128==0{for lane in &mut self.lanes{lane.prepare(self.frame,self.rate);}}let at=self.frame as usize%128;let dg=self.lanes[0].output[at];let wg=self.lanes[1].output[at];for c in 0..self.output_channels{let dry=self.input_dry[c.min(self.source-1)][i]*dg;let wet=self.input_wet[c.min(self.wet-1)][i]*wg;let y=dry+wet;self.output[c][i]=y;self.peak=self.peak.max(y.abs()as f64);}self.frame+=1;}self.calls+=1;true}
 pub fn reset(&mut self){self.replay();self.frame=0;self.calls=0;self.rejected=0;self.peak=0.;self.input_dry.fill([0.;BLOCK]);self.input_wet.fill([0.;BLOCK]);self.output.fill([0.;BLOCK]);}
}
#[no_mangle]pub extern "C" fn room_complete_mix_api()->u32{1}
#[no_mangle]pub extern "C" fn room_complete_mix_new(rate:f64,source:f64,wet:f64)->*mut Engine{if !source.is_finite()||source.fract()!=0.||!wet.is_finite()||wet.fract()!=0.{return std::ptr::null_mut();}Engine::new(rate,source as usize,wet as usize).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn room_complete_mix_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn room_complete_mix_initial(p:&mut Engine,v:f64)->u32{p.initial(v)as u32}
#[no_mangle]pub extern "C" fn room_complete_mix_event(p:&mut Engine,lane:f64,seconds:f64,v:f64)->u32{if !lane.is_finite()||lane.fract()!=0.||!(0. ..=1.).contains(&lane){return 0;}p.event(lane as usize,seconds,v)as u32}
#[no_mangle]pub extern "C" fn room_complete_mix_prepare(p:&mut Engine)->u32{p.prepare()as u32}
#[no_mangle]pub extern "C" fn room_complete_mix_input(p:&mut Engine,branch:usize,channel:usize)->*mut f32{let planes=if branch==0{&mut p.input_dry}else if branch==1{&mut p.input_wet}else{return std::ptr::null_mut();};planes.get_mut(channel).map(|p|p.as_mut_ptr()).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub extern "C" fn room_complete_mix_output(p:&Engine,channel:usize)->*const f32{p.output.get(channel).map(|p|p.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn room_complete_mix_render(p:&mut Engine,n:usize)->u32{p.render(n)as u32}
#[no_mangle]pub extern "C" fn room_complete_mix_reset(p:&mut Engine){p.reset();}
#[no_mangle]pub extern "C" fn room_complete_mix_stat(p:&Engine,key:usize)->f64{match key{0=>p.frame as f64,1=>p.peak,2=>p.calls as f64,3=>p.rejected as f64,4=>p.source as f64,5=>p.wet as f64,6=>p.output_channels as f64,7=>p.ready as u32 as f64,8=>p.events.len()as f64,_=>f64::NAN}}
