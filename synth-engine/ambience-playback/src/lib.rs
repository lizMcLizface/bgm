//! Same-rate stereo AudioBufferSource loop playback at Ambience.loopSource.
//! PCM is prepared/uploaded off-render; one reader owns one immutable resource.
//! No weather, loop synthesis, fading, spatial processing or level trim is here.
#[cfg(feature="allocation-audit")]
mod allocation;
const Q:usize=128;
const MAX_BYTES:usize=64*1024*1024;
const MAX_FRAME:u64=9007199254740991;
fn boundary(frame:f64)->u64{((frame*1024.).round()/1024.).ceil().max(0.)as u64}
fn time(frame:f64)->bool{frame.is_finite()&&frame>=0.&&frame<=MAX_FRAME as f64}
fn point(data:&[f32],position:f64)->f32{let i=position as usize;let next=if i+1==data.len(){0}else{i+1};let fraction=position-i as f64;((1.-fraction)*data[i]as f64+fraction*data[next]as f64)as f32}
pub struct Engine{
 rate:u32,pcm:[Vec<f32>;2],output:[[f32;Q];2],prepared:bool,
 scheduled:bool,started:bool,ended:bool,onset:f64,offset:f64,stop:f64,
 position:f64,frame:Option<u64>,rendered:u64,skipped:u64,starts:u32,stops:u32,
}
impl Engine{
 pub fn new(rate:u32,frames:usize)->Option<Box<Self>>{
  if !(8000..=192000).contains(&rate)||frames==0||frames>rate as usize*31||frames.checked_mul(8).is_none_or(|n|n>MAX_BYTES){return None;}
  Some(Box::new(Self{rate,pcm:[vec![0.;frames],vec![0.;frames]],output:[[0.;Q];2],prepared:false,scheduled:false,started:false,ended:false,onset:0.,offset:0.,stop:f64::INFINITY,position:0.,frame:None,rendered:0,skipped:0,starts:0,stops:0}))
 }
 pub fn prepare(&mut self)->bool{if self.prepared||self.pcm.iter().flatten().any(|v|!v.is_finite()){return false;}self.prepared=true;true}
 pub fn start(&mut self,onset:f64,offset:f64,call:u64)->bool{
  if !self.prepared||self.scheduled||!time(onset)||!time(offset)||call>MAX_FRAME||call%Q as u64!=0{return false;}
  self.onset=onset.max(call as f64);self.offset=offset;let sample=offset.round();self.position=if sample>=self.pcm[0].len()as f64{0.}else{sample};self.scheduled=true;true
 }
 pub fn stop(&mut self,at:f64)->bool{if !self.scheduled||!time(at){return false;}if !self.ended{self.stop=at;}true}
 pub fn render(&mut self,frame:u64)->bool{
  if !self.prepared||frame%Q as u64!=0||frame>MAX_FRAME-Q as u64||self.frame.is_some_and(|end|frame<end){return false;}
  if let Some(end)=self.frame{self.skipped+=frame-end;}self.output.fill([0.;Q]);
  if self.scheduled&&!self.ended{
   let first=boundary(self.onset);let end=if self.stop.is_finite(){boundary(self.stop)}else{MAX_FRAME};
   for i in 0..Q{let now=frame+i as u64;if now>=end{self.ended=true;self.stops+=1;break;}if now<first{continue;}
    if !self.started{self.position+=(first as f64-self.onset).max(0.);self.position%=self.pcm[0].len()as f64;self.started=true;self.starts+=1;}
    for ch in 0..2{self.output[ch][i]=point(&self.pcm[ch],self.position);}
    self.position+=1.;if self.position>=self.pcm[0].len()as f64{self.position-=self.pcm[0].len()as f64;}
    self.rendered+=1;
   }
  }
  self.frame=Some(frame+Q as u64);true
 }
 pub fn reset(&mut self){self.scheduled=false;self.started=false;self.ended=false;self.onset=0.;self.offset=0.;self.stop=f64::INFINITY;self.position=0.;self.frame=None;self.rendered=0;self.skipped=0;self.starts=0;self.stops=0;self.output.fill([0.;Q]);}
}
#[no_mangle]pub extern "C" fn ambience_play_api()->u32{1}
#[no_mangle]pub extern "C" fn ambience_play_new(rate:u32,frames:usize)->*mut Engine{Engine::new(rate,frames).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn ambience_play_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn ambience_play_upload(p:&mut Engine,ch:usize)->*mut f32{if p.prepared{std::ptr::null_mut()}else{p.pcm.get_mut(ch).map_or(std::ptr::null_mut(),|c|c.as_mut_ptr())}}
#[no_mangle]pub extern "C" fn ambience_play_prepare(p:&mut Engine)->u32{p.prepare()as u32}
#[no_mangle]pub extern "C" fn ambience_play_start(p:&mut Engine,onset:f64,offset:f64,call:u64)->u32{p.start(onset,offset,call)as u32}
#[no_mangle]pub extern "C" fn ambience_play_stop(p:&mut Engine,at:f64)->u32{p.stop(at)as u32}
#[no_mangle]pub extern "C" fn ambience_play_render(p:&mut Engine,frame:u64)->u32{p.render(frame)as u32}
#[no_mangle]pub extern "C" fn ambience_play_output(p:&Engine,ch:usize)->*const f32{p.output.get(ch).map_or(std::ptr::null(),|c|c.as_ptr())}
#[no_mangle]pub extern "C" fn ambience_play_reset(p:&mut Engine){p.reset();}
#[no_mangle]pub extern "C" fn ambience_play_stat(p:&Engine,key:u32)->f64{match key{0=>p.rate as f64,1=>p.pcm[0].len()as f64,2=>p.prepared as u32 as f64,3=>p.scheduled as u32 as f64,4=>p.started as u32 as f64,5=>p.ended as u32 as f64,6=>p.frame.unwrap_or(0)as f64,7=>p.position,8=>p.rendered as f64,9=>p.skipped as f64,10=>p.starts as f64,11=>p.stops as f64,12=>p.onset,13=>p.offset,14=>p.stop,_=>f64::NAN}}
