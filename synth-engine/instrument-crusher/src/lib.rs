//! Literal original Nodes.BitCrusher AudioWorklet, not the desk RackCrusher.
//! Complete mix uses independent Native gain timelines and first-plane-only wet
//! output. No automatic demand/tail inference or ScriptProcessor fallback claim.
#[path="../../fdn-room-live/src/timeline.rs"]mod timeline;
#[cfg(feature="allocation-audit")]mod allocation;
mod power;
const Q:usize=128;const CAP:usize=256;const MAX:u64=1099511627648;
fn frame(v:f64)->Option<u64>{if v.is_finite()&&v>=0.&&v<=MAX as f64&&v.fract()==0.&&v%128.==0.{Some(v as u64)}else{None}}
fn finite(v:f64)->bool{v.is_finite()&&(v as f32).is_finite()}
fn initial(lane:usize)->f64{[1.,1.,8.,0.25][lane]}
pub struct Engine{rate:f64,channels:usize,ready:bool,frame:u64,origin:u64,last_author:Option<u64>,lanes:[timeline::LiveTimeline;4],targets:[f64;4],input:[[f32;Q];2],output:[[f32;Q];2],wet:[f32;Q],phaser:f64,last:f64,active:bool,generation:u32,calls:u64,commands:u64,rejected:u64,raw_frames:u64,unpulled:u64,peak:f64,step:f64}
impl Engine{
 fn new(rate:f64,channels:u32)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels){return None;}Some(Box::new(Self{rate,channels:channels as usize,ready:false,frame:0,origin:0,last_author:None,lanes:std::array::from_fn(|i|timeline::LiveTimeline::new(initial(i),CAP,rate)),targets:std::array::from_fn(initial),input:[[0.;Q];2],output:[[0.;Q];2],wet:[0.;Q],phaser:0.,last:0.,active:false,generation:0,calls:0,commands:0,rejected:0,raw_frames:0,unpulled:0,peak:0.,step:power::pow075(8.)}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn prepare(&mut self,origin:f64)->bool{let Some(f)=frame(origin)else{return self.reject();};if self.ready{return self.reject();}self.ready=true;self.origin=f;self.frame=f;true}
 fn chronology(&self,author:u64)->bool{self.ready&&author>=self.origin&&author<=self.frame&&self.last_author.is_none_or(|f|author>=f)}
 fn capacity(&self,lane:u32,count:u32,author:f64)->bool{let Some(f)=frame(author)else{return false;};lane<4&&count>0&&count<=CAP as u32&&self.ready&&f>=self.origin&&self.last_author.is_none_or(|last|f>=last)&&self.lanes[lane as usize].available_at(count as usize,author)}
 fn admit(&mut self,lane:u32,value:f64,author:f64,seconds:f64)->bool{let Some(f)=frame(author)else{return self.reject();};if !self.chronology(f)||!finite(value)||!seconds.is_finite()||seconds!=author/self.rate||!self.capacity(lane,1,author){return self.reject();}let i=lane as usize;self.lanes[i].prune_for_insert(author);assert!(self.lanes[i].add_seconds(seconds,0,value,0.));self.targets[i]=value;self.last_author=Some(f);self.commands+=1;true}
 fn birth(&mut self,bits:f64,freq:f64)->bool{if !self.ready||self.active||!finite(bits)||!finite(freq)||self.generation==u32::MAX{return self.reject();}self.phaser=0.;self.last=0.;self.active=true;self.generation+=1;self.lanes[2].reset(bits.clamp(1.,16.));self.lanes[3].reset(freq.clamp(0.,1.));self.targets[2]=bits;self.targets[3]=freq;true}
 fn retire(&mut self)->bool{if !self.ready||!self.active{return self.reject();}self.active=false;true}
 fn sync(&mut self,time:f64)->bool{let Some(f)=frame(time)else{return self.reject();};if !self.ready||f<self.frame{return self.reject();}self.frame=f;true}
 fn render(&mut self,channels:u32,pulled:bool,raw_pulled:bool,mix:bool)->bool{if !self.ready||self.frame>MAX-128||channels>2||channels!=0&&channels as usize!=self.channels||!pulled&&(channels!=0||raw_pulled)||raw_pulled&&!self.active||(0..channels as usize).any(|c|self.input[c].iter().any(|v|!v.is_finite())){return self.reject();}
  self.output.fill([0.;Q]);self.wet.fill(0.);self.peak=0.;
  if pulled{
   if mix{self.lanes[0].prepare(self.frame,self.rate);self.lanes[1].prepare(self.frame,self.rate);}
   if raw_pulled{
    for i in 2..4{self.lanes[i].prepare(self.frame,self.rate);}let bits=self.lanes[2].output[0].clamp(1.,16.);let freq=self.lanes[3].output[0].clamp(0.,1.)as f64;self.step=power::pow075(bits as f64);
    for i in 0..Q{self.phaser+=freq;if self.phaser>=1.{self.phaser-=1.;self.last=if channels>0{self.step*((self.input[0][i]as f64/self.step)+0.5).floor()}else{0.};}self.wet[i]=self.last as f32;}self.raw_frames+=128;
   }
   for c in 0..self.channels{for i in 0..Q{let value=if mix{let dry=if channels>0{self.input[c][i]*self.lanes[0].output[i]}else{0.};let wet=if c==0{self.wet[i]*self.lanes[1].output[i]}else{0.};dry+wet}else if c==0{self.wet[i]}else{0.};if !value.is_finite(){return self.reject();}self.output[c][i]=value;self.peak=self.peak.max(value.abs()as f64);}}
  }else{self.unpulled+=128;}
  self.frame+=128;self.calls+=1;true
 }
}
#[no_mangle]pub extern "C" fn instrument_crusher_api()->u32{1}
#[no_mangle]pub extern "C" fn instrument_crusher_new(rate:f64,channels:u32)->*mut Engine{Engine::new(rate,channels).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn instrument_crusher_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn instrument_crusher_prepare(p:&mut Engine,origin:f64)->u32{p.prepare(origin)as u32}
#[no_mangle]pub extern "C" fn instrument_crusher_sync(p:&mut Engine,time:f64)->u32{p.sync(time)as u32}
#[no_mangle]pub extern "C" fn instrument_crusher_set(p:&mut Engine,lane:u32,value:f64,author:f64,seconds:f64)->u32{p.admit(lane,value,author,seconds)as u32}
#[no_mangle]pub extern "C" fn instrument_crusher_capacity(p:&Engine,lane:u32,count:u32,author:f64)->u32{p.capacity(lane,count,author)as u32}
#[no_mangle]pub extern "C" fn instrument_crusher_birth(p:&mut Engine,bits:f64,freq:f64)->u32{p.birth(bits,freq)as u32}
#[no_mangle]pub extern "C" fn instrument_crusher_retire(p:&mut Engine)->u32{p.retire()as u32}
#[no_mangle]pub extern "C" fn instrument_crusher_render(p:&mut Engine,channels:u32,pulled:u32,raw_pulled:u32,mix:u32)->u32{if pulled>1||raw_pulled>1||mix>1{return p.reject()as u32;}p.render(channels,pulled==1,raw_pulled==1,mix==1)as u32}
#[no_mangle]pub extern "C" fn instrument_crusher_input(p:&mut Engine,channel:u32)->*mut f32{p.input.get_mut(channel as usize).map_or(std::ptr::null_mut(),|v|v.as_mut_ptr())}
#[no_mangle]pub extern "C" fn instrument_crusher_output(p:&Engine,channel:u32)->*const f32{p.output.get(channel as usize).map_or(std::ptr::null(),|v|v.as_ptr())}
#[no_mangle]pub extern "C" fn instrument_crusher_target(p:&Engine,lane:u32)->f64{p.targets.get(lane as usize).copied().unwrap_or(f64::NAN)}
#[no_mangle]pub extern "C" fn instrument_crusher_curve(p:&Engine,lane:u32,index:u32)->f64{p.lanes.get(lane as usize).and_then(|l|l.output.get(index as usize)).map_or(f64::NAN,|v|*v as f64)}
#[no_mangle]pub extern "C" fn instrument_crusher_pow(bits:f64)->f64{power::pow075(bits)}
#[no_mangle]pub extern "C" fn instrument_crusher_stat(p:&Engine,index:u32)->f64{match index{0=>p.frame as f64,1=>p.peak,2=>p.origin as f64,3=>p.calls as f64,4=>p.commands as f64,5=>p.rejected as f64,6=>p.raw_frames as f64,7=>p.unpulled as f64,8=>p.phaser,9=>p.last,10=>p.channels as f64,11=>p.generation as f64,12=>p.active as u32 as f64,13=>p.step,_=>f64::NAN}}
