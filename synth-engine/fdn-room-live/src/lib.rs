//! Original FdnRoom frontend and unchanged owned FDN, one canonical live quantum.
//! Absolute control clocks are distinct from delay/FDN DSP cursors.
mod timeline;
#[path="../../room-colour/src/delay.rs"]mod delay;
#[path="../../tape-fx/src/tone.rs"]mod tone;
#[path="../../rack-native/src/biquad.rs"]mod biquad;
#[path="../../rack-native/src/tail.rs"]mod tail;
mod rooms;
#[cfg(feature="allocation-audit")]mod allocation;
const Q:usize=128;const CAP:usize=256;const MAX:u64=1099511627648;
pub struct Engine{rate:f64,ready:bool,frame:u64,origin:u64,last_author:u64,has_author:bool,lanes:[timeline::LiveTimeline;6],targets:[f64;6],curves:[[f32;Q];6],delay_right:[f32;Q],delay:delay::Delay,tone:tone::Lowpass,hp:biquad::Biquad,lp:biquad::Biquad,layout:usize,fx:Box<calmbgm_effects::Engine>,fx_started:bool,room_type:usize,decay:f64,input:[[f32;Q];2],output:[[f32;Q];2],dry:[[f32;Q];2],calls:u64,commands:u64,rendered:u64,unpulled:u64,wet_frames:u64,wet_dsp:u64,late:u64,max_late:u64,rejected:u64,peak:f64}
fn frame(f:f64)->Option<u64>{if f.is_finite()&&f>=0.&&f<=MAX as f64&&f.fract()==0.&&f%128.==0.{Some(f as u64)}else{None}}
fn mapped(i:usize,v:f64,rate:f64)->Option<f64>{if !v.is_finite(){return None;}let n=match i{0|1=>v,2=>(v-0.025).clamp(0.,0.2),3=>(20000.*(v.max(200.)/6000.).powf(1.5)).min(20000.),4|5=>v.clamp(0.,rate/2.),_=>return None};if (n as f32).is_finite(){Some(n)}else{None}}
impl Engine{
 fn new(rate:f64)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate){return None;}Some(Box::new(Self{rate,ready:false,frame:0,origin:0,last_author:0,has_author:false,lanes:std::array::from_fn(|i|timeline::LiveTimeline::new([1.,1.,0.,350.,350.,350.][i],CAP,rate)),targets:[1.,1.,0.,350.,350.,350.],curves:[[0.;Q];6],delay_right:[0.;Q],delay:delay::Delay::new(rate),tone:tone::Lowpass::new(rate),hp:biquad::Biquad::default(),lp:biquad::Biquad::default(),layout:1,fx:calmbgm_effects::Engine::new(rate as f32)?,fx_started:false,room_type:3,decay:8.,input:[[0.;Q];2],output:[[0.;Q];2],dry:[[0.;Q];2],calls:0,commands:0,rendered:0,unpulled:0,wet_frames:0,wet_dsp:0,late:0,max_late:0,rejected:0,peak:0.}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn prepare(&mut self,origin:f64)->bool{let Some(f)=frame(origin)else{return self.reject();};if self.ready{return self.reject();}self.ready=true;self.origin=f;self.frame=f;true}
 fn sync(&mut self,at:f64)->bool{let Some(f)=frame(at)else{return self.reject();};if !self.ready||f<self.frame{return self.reject();}self.frame=f;true}
 fn lane(&mut self,i:usize,v:f64,authored:f64,seconds:f64)->bool{
  let(Some(f),Some(value))=(frame(authored),mapped(i,v,self.rate))else{return self.reject();};
  if !self.ready||f<self.origin||f>self.frame||self.has_author&&f<self.last_author||!seconds.is_finite()||seconds!=f as f64/self.rate||!self.lanes[i].available_at(1,f as f64){return self.reject();}
  self.lanes[i].prune_for_insert(f as f64);
  let property=matches!(i,0|1|4|5);if property{self.lanes[i].intrinsic(value);}
  assert!(self.lanes[i].add_seconds(seconds,if property{0}else{2},value,if property{0.}else{0.02}));
  self.targets[i]=v;self.last_author=f;self.has_author=true;self.commands+=1;if self.frame>f{self.late+=1;self.max_late=self.max_late.max(self.frame-f);}true
 }
 fn amount(&mut self,i:usize,value:f64,author:f64,seconds:f64)->bool{if i>1||!value.is_finite(){return self.reject();}let target=if i==0{if value<0.5{1.}else{1.-(value-0.5)*2.}}else{if value<0.5{value*2.}else{1.}};self.lane(i,target,author,seconds)}
 fn room(&mut self,kind:usize,decay:f64,start:bool)->bool{
  if !self.ready||!(1..=6).contains(&kind)||!decay.is_finite()||start&&self.fx_started||!start&&!self.fx_started{return self.reject();}
  let p=rooms::parameters(kind,decay);for(i,v)in p.into_iter().enumerate(){assert!(self.fx.param(i,v));}self.room_type=kind;self.decay=decay.max(0.3);if start{self.fx_started=true;}self.commands+=1;true
 }
 fn render(&mut self,channels:usize,pulled:bool)->bool{
  if !self.ready||self.frame+128>MAX||channels>2||(0..channels).any(|c|self.input[c].iter().any(|v|!v.is_finite())){return self.reject();}
  self.output.fill([0.;Q]);self.peak=0.;if !pulled{self.unpulled+=128;self.frame+=128;self.calls+=1;return true;}
  self.lanes[0].prepare(self.frame,self.rate);self.curves[0]=self.lanes[0].output;
  for i in 0..Q{let x=[if channels>0{self.input[0][i]}else{0.},if channels==2{self.input[1][i]}else if channels==1{self.input[0][i]}else{0.}];for c in 0..2{self.dry[c][i]=x[c]*self.curves[0][i];}}
  if self.fx_started{
   if channels>0&&channels!=self.layout{self.delay.layout(self.layout,channels);self.tone.reset();self.hp.clear();self.lp.clear();self.layout=channels;}
   for lane in 1..6{self.lanes[lane].prepare(self.frame,self.rate);if lane>=3{self.lanes[lane].clamp_output(0.,(self.rate/2.)as f32);}self.curves[lane]=self.lanes[lane].output;if lane==2{self.delay_right=self.curves[2];if self.layout==2{self.lanes[2].prepare(self.frame,self.rate);self.delay_right=self.lanes[2].output;}}}
   let q=std::f64::consts::FRAC_1_SQRT_2 as f32 as f64;
   for i in 0..Q{
    let mut x=[if channels>0{self.input[0][i]*self.curves[1][i]}else{0.},if channels==2{self.input[1][i]*self.curves[1][i]}else{0.}];
    x=self.delay.tick(x,[self.curves[2][i],self.delay_right[i]]);
    x=self.tone.tick(x,self.curves[3][i],self.wet_dsp+i as u64);
    x=self.hp.sample(x,self.layout,1,self.curves[4][i]as f64,q,0.,self.rate);
    x=self.lp.sample(x,self.layout,0,self.curves[5][i]as f64,q,0.,self.rate);
    if self.layout==1{x[1]=x[0];}
    self.fx.input_mut(2).unwrap()[i]=x[0];self.fx.input_mut(3).unwrap()[i]=x[1];
   }
   self.hp.end_quantum();self.lp.end_quantum();assert!(self.fx.render(128));self.wet_frames+=128;self.wet_dsp+=128;
   for c in 0..2{for i in 0..Q{self.output[c][i]=self.dry[c][i]+self.fx.output(c).unwrap()[i];}}
  }else{self.output=self.dry;}
  for p in &self.output{for &v in p{if !v.is_finite(){return self.reject();}self.peak=self.peak.max(v.abs()as f64);}}
  self.rendered+=128;self.frame+=128;self.calls+=1;true
 }
 fn clear(&mut self){self.fx.clear();}
}
#[no_mangle]pub extern "C" fn fdn_live_api()->u32{1}
#[no_mangle]pub extern "C" fn fdn_live_new(rate:f64)->*mut Engine{Engine::new(rate).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn fdn_live_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn fdn_live_prepare(p:&mut Engine,f:f64)->u32{p.prepare(f)as u32}
#[no_mangle]pub extern "C" fn fdn_live_sync(p:&mut Engine,f:f64)->u32{p.sync(f)as u32}
#[no_mangle]pub extern "C" fn fdn_live_lane(p:&mut Engine,index:u32,value:f64,f:f64,seconds:f64)->u32{p.lane(index as usize,value,f,seconds)as u32}
#[no_mangle]pub extern "C" fn fdn_live_amount_lane(p:&mut Engine,index:u32,value:f64,f:f64,seconds:f64)->u32{p.amount(index as usize,value,f,seconds)as u32}
#[no_mangle]pub extern "C" fn fdn_live_room(p:&mut Engine,kind:u32,decay:f64,start:u32)->u32{if start>1{return 0;}p.room(kind as usize,decay,start==1)as u32}
#[no_mangle]pub extern "C" fn fdn_live_render(p:&mut Engine,channels:u32,pulled:u32)->u32{if pulled>1{return 0;}p.render(channels as usize,pulled==1)as u32}
#[no_mangle]pub extern "C" fn fdn_live_clear(p:&mut Engine){p.clear();}
#[no_mangle]pub extern "C" fn fdn_live_input(p:&mut Engine,c:u32)->*mut f32{p.input.get_mut(c as usize).map_or(std::ptr::null_mut(),|v|v.as_mut_ptr())}
#[no_mangle]pub extern "C" fn fdn_live_output(p:&Engine,c:u32)->*const f32{p.output.get(c as usize).map_or(std::ptr::null(),|v|v.as_ptr())}
#[no_mangle]pub extern "C" fn fdn_live_curve(p:&Engine,l:u32,i:u32)->f64{p.curves.get(l as usize).and_then(|v|v.get(i as usize)).map_or(f64::NAN,|v|*v as f64)}
#[no_mangle]pub extern "C" fn fdn_live_capacity(p:&Engine,l:u32,n:u32,author:f64)->u32{let Some(f)=frame(author)else{return 0;};if !p.ready||l>5||n as usize>CAP||f<p.origin||p.has_author&&f<p.last_author{return 0;}p.lanes[l as usize].available_at(n as usize,author)as u32}
#[no_mangle]pub extern "C" fn fdn_live_stat(p:&Engine,i:u32)->f64{match i{0=>p.frame as f64,1=>p.peak,2=>p.origin as f64,3=>p.calls as f64,4=>p.commands as f64,5=>p.rejected as f64,6=>p.rendered as f64,7=>p.unpulled as f64,8=>p.wet_frames as f64,9=>p.late as f64,10=>p.max_late as f64,11=>p.room_type as f64,12=>p.decay,13=>p.fx_started as u32 as f64,14=>p.fx.stat(2),15=>p.fx.stat(5),_=>f64::NAN}}
