//! Literal original Nodes.Distortion:44100-point curve, NONE oversampling.
//! The even grid is intentionally asymmetric:shape(0) is nonzero negative DC.
//! No Native automatic-tail inference. Resource generation is outside render.
#[path="../../fdn-room-live/src/timeline.rs"]mod timeline;
#[cfg(feature="allocation-audit")]mod allocation;
const POINTS:usize=44100;const Q:usize=128;const CURVES:usize=8;const COMMANDS:usize=256;
struct Curve{gain:f64,data:Vec<f32>}
impl Curve{fn new(gain:f64)->Self{let mut data=vec![0.;POINTS];for(i,v)in data.iter_mut().enumerate(){let x=i as f64*2./POINTS as f64-1.;*v=((3.+gain)*((x*0.25).sinh()*5.).atan()/(std::f64::consts::PI+gain*x.abs()))as f32;}Self{gain,data}}}
#[derive(Clone,Copy)]struct Command{frame:u64,seconds:f64,kind:u32,lane:usize,value:f64,curve:usize}
pub struct Engine{rate:f64,channels:usize,curves:Vec<Curve>,active:usize,commands:Vec<Command>,at:usize,lanes:[timeline::LiveTimeline;2],ready:bool,frame:u64,input:[[f32;Q];2],output:[[f32;Q];2],wet:[[f32;Q];2],calls:u64,rendered:u64,unpulled:u64,applied:u64,rejected:u64,peak:f64}
fn amount(v:f64)->bool{v.is_finite()&&(v as f32).is_finite()}
impl Engine{
 fn new(rate:f64,channels:u32)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels){return None;}let mut curves=Vec::with_capacity(CURVES);curves.push(Curve::new(0.));curves.push(Curve::new(0.));Some(Box::new(Self{rate,channels:channels as usize,curves,active:1,commands:Vec::with_capacity(COMMANDS),at:0,lanes:std::array::from_fn(|_|timeline::LiveTimeline::new(1.,COMMANDS+1,rate)),ready:false,frame:0,input:[[0.;Q];2],output:[[0.;Q];2],wet:[[0.;Q];2],calls:0,rendered:0,unpulled:0,applied:0,rejected:0,peak:0.}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn prepare_curve(&mut self,gain:f64)->i32{if self.ready||!gain.is_finite()||!(0. ..=30.).contains(&gain)||self.curves.len()>=CURVES{self.rejected+=1;return -1;}let slot=self.curves.len();self.curves.push(Curve::new(gain));slot as i32}
 fn event(&mut self,kind:u32,lane:u32,seconds:f64,value:f64,curve:u32)->bool{let frame=(seconds*self.rate).round();if self.ready||kind>1||lane>1||!seconds.is_finite()||seconds<0.||seconds>3600.||frame%128.!=0.||seconds!=frame/self.rate||self.commands.len()>=COMMANDS||self.commands.last().is_some_and(|e|seconds<e.seconds)||kind==0&&!amount(value)||kind==1&&curve as usize>=self.curves.len(){return self.reject();}self.commands.push(Command{frame:frame as u64,seconds,kind,lane:lane as usize,value,curve:curve as usize});true}
 fn replay(&mut self){self.lanes[0].reset(1.);self.lanes[1].reset(1.);assert!(self.lanes[0].add_seconds(0.,0,1.,0.));assert!(self.lanes[1].add_seconds(0.,0,0.,0.));self.active=1;self.at=0;self.frame=0;self.calls=0;self.rendered=0;self.unpulled=0;self.applied=0;self.peak=0.;self.input.fill([0.;Q]);self.output.fill([0.;Q]);self.wet.fill([0.;Q]);}
 fn prepare(&mut self)->bool{if self.ready{return self.reject();}self.replay();self.ready=true;true}
 fn shape(&self,x:f32)->f32{let virtual_index=((x+1.)*((POINTS-1)as f32*0.5)).clamp(0.,(POINTS-1)as f32);let at=virtual_index as usize;let next=(at+1).min(POINTS-1);let f=virtual_index-at as f32;let data=&self.curves[self.active].data;let delta=data[next]-data[at];let scaled=f*delta;scaled+data[at]}
 fn render(&mut self,channels:u32,pulled:bool)->bool{if !self.ready||self.frame+128>self.rate as u64*3600||channels>2||channels!=0&&channels as usize!=self.channels||!pulled&&channels!=0||(0..channels as usize).any(|c|self.input[c].iter().any(|x|!x.is_finite())){return self.reject();}
  while self.at<self.commands.len()&&self.commands[self.at].frame<=self.frame{let e=self.commands[self.at];if e.kind==0{self.lanes[e.lane].prune_for_insert(e.frame as f64);assert!(self.lanes[e.lane].add_seconds(e.seconds,0,e.value,0.));}else{self.active=e.curve;}self.at+=1;self.applied+=1;}
  self.output.fill([0.;Q]);self.wet.fill([0.;Q]);self.peak=0.;if pulled{for lane in &mut self.lanes{lane.prepare(self.frame,self.rate);}for c in 0..self.channels{for i in 0..Q{let input=if channels>0{self.input[c][i]}else{0.};let shaped=self.shape(input);let dry=input*self.lanes[0].output[i];let wet=shaped*self.lanes[1].output[i];let y=dry+wet;if !y.is_finite(){return self.reject();}self.wet[c][i]=shaped;self.output[c][i]=y;self.peak=self.peak.max(y.abs()as f64);}}self.rendered+=128;}else{self.unpulled+=128;}self.calls+=1;self.frame+=128;true}
}
#[no_mangle]pub extern "C" fn instrument_distortion_api()->u32{1}
#[no_mangle]pub extern "C" fn instrument_distortion_new(rate:f64,channels:u32)->*mut Engine{Engine::new(rate,channels).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn instrument_distortion_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn instrument_distortion_curve_prepare(p:&mut Engine,gain:f64)->i32{p.prepare_curve(gain)}
#[no_mangle]pub extern "C" fn instrument_distortion_curve(p:&Engine,slot:u32)->*const f32{p.curves.get(slot as usize).map_or(std::ptr::null(),|c|c.data.as_ptr())}
#[no_mangle]pub extern "C" fn instrument_distortion_event(p:&mut Engine,kind:u32,lane:u32,seconds:f64,value:f64,curve:u32)->u32{p.event(kind,lane,seconds,value,curve)as u32}
#[no_mangle]pub extern "C" fn instrument_distortion_prepare(p:&mut Engine)->u32{p.prepare()as u32}
#[no_mangle]pub extern "C" fn instrument_distortion_render(p:&mut Engine,channels:u32,pulled:u32)->u32{if pulled>1{return p.reject()as u32;}p.render(channels,pulled==1)as u32}
#[no_mangle]pub extern "C" fn instrument_distortion_reset(p:&mut Engine)->u32{if !p.ready{return p.reject()as u32;}p.replay();true as u32}
#[no_mangle]pub extern "C" fn instrument_distortion_input(p:&mut Engine,c:u32)->*mut f32{p.input.get_mut(c as usize).map_or(std::ptr::null_mut(),|a|a.as_mut_ptr())}
#[no_mangle]pub extern "C" fn instrument_distortion_output(p:&Engine,c:u32)->*const f32{p.output.get(c as usize).map_or(std::ptr::null(),|a|a.as_ptr())}
#[no_mangle]pub extern "C" fn instrument_distortion_wet(p:&Engine,c:u32)->*const f32{p.wet.get(c as usize).map_or(std::ptr::null(),|a|a.as_ptr())}
#[no_mangle]pub extern "C" fn instrument_distortion_stat(p:&Engine,i:u32)->f64{match i{0=>p.frame as f64,1=>p.peak,2=>p.calls as f64,3=>p.rendered as f64,4=>p.unpulled as f64,5=>p.applied as f64,6=>p.rejected as f64,7=>p.curves.len()as f64,8=>p.active as f64,9=>p.curves[p.active].gain,10=>p.commands.len()as f64,11=>p.shape(0.)as f64,12=>p.ready as u32 as f64,_=>f64::NAN}}
