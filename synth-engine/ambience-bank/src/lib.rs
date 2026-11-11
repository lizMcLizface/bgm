//! Credit-prepared original stereo loop banks. All storage is cold allocated.
//! Runtime upload/cancel/reclaim/source/render perform no allocation or growth.
//! Cursor arithmetic is the frozen ambience-playback reference, with paged reads.
#[cfg(feature="allocation-audit")]
mod allocation;
const Q:usize=128;
const PAGE:usize=1024;
const BANKS:usize=16;
const SOURCES:usize=16;
const GC_PAGES:usize=32;
const MAX_FRAME:u64=9007199254740991;
fn boundary(frame:f64)->u64{((frame*1024.).round()/1024.).ceil().max(0.)as u64}
fn time(frame:f64)->bool{frame.is_finite()&&frame>=0.&&frame<=MAX_FRAME as f64}
fn clock(frame:f64)->Option<u64>{if !time(frame)||frame.fract()!=0.||frame as u64%Q as u64!=0{None}else{Some(frame as u64)}}
struct Bank{key:u32,state:u32,frames:usize,need:usize,allocated:usize,written:usize,refs:u32,pages:Vec<u32>}
impl Bank{fn new(max:usize)->Self{Self{key:0,state:0,frames:0,need:0,allocated:0,written:0,refs:0,pages:vec![u32::MAX;max]}}}
#[derive(Clone,Copy)]
struct Source{token:u32,bank:usize,bank_key:u32,retained:bool,scheduled:bool,started:bool,ended:bool,onset:f64,offset:f64,stop:f64,position:f64,frame:Option<u64>,rendered:u64,skipped:u64}
impl Default for Source{fn default()->Self{Self{token:0,bank:0,bank_key:0,retained:false,scheduled:false,started:false,ended:false,onset:0.,offset:0.,stop:f64::INFINITY,position:0.,frame:None,rendered:0,skipped:0}}}
pub struct Engine{
 rate:u32,arena:Vec<f32>,free:Vec<u32>,free_count:usize,available:usize,banks:Vec<Bank>,next_key:u32,
 sources:[Source;SOURCES],last_tokens:[u32;SOURCES],output:[[[f32;Q];2];SOURCES],scratch:[[f32;PAGE];2],frame:Option<u64>,uploaded:u64,reclaimed:u64,resetting:bool,
}
impl Engine{
 pub fn new(rate:u32)->Option<Box<Self>>{if !(8000..=192000).contains(&rate){return None;}let pages=(169*rate as usize).div_ceil(PAGE)+BANKS;let max=(29*rate as usize).div_ceil(PAGE);if pages.checked_mul(PAGE*8).is_none_or(|n|n>256*1024*1024){return None;}Some(Box::new(Self{rate,arena:vec![0.;pages*PAGE*2],free:(0..pages as u32).collect(),free_count:pages,available:pages,banks:(0..BANKS).map(|_|Bank::new(max)).collect(),next_key:1,sources:[Source::default();SOURCES],last_tokens:[0;SOURCES],output:[[[0.;Q];2];SOURCES],scratch:[[0.;PAGE];2],frame:None,uploaded:0,reclaimed:0,resetting:false}))}
 fn bank_index(&self,key:u32)->Option<usize>{if key==0{None}else{self.banks.iter().position(|b|b.key==key&&b.state!=0)}}
 pub fn begin(&mut self,frames:usize)->u32{if self.resetting||frames==0||frames>29*self.rate as usize||self.next_key==u32::MAX{return 0;}let need=frames.div_ceil(PAGE);let Some(index)=self.banks.iter().position(|b|b.state==0)else{return 0;};if need>self.available{return 0;}let b=&mut self.banks[index];b.key=self.next_key;b.state=1;b.frames=frames;b.need=need;b.allocated=0;b.written=0;b.refs=1;self.next_key+=1;self.available-=need;b.key}
 pub fn can_upload(&self,key:u32,offset:usize,n:usize)->bool{self.bank_index(key).is_some_and(|i|{let b=&self.banks[i];b.state==1&&n>0&&n<=PAGE&&offset==b.written&&n==PAGE.min(b.frames-b.written)&&offset%PAGE==0&&b.allocated<b.need&&self.free_count>0})}
 pub fn upload(&mut self,key:u32,offset:usize,n:usize)->bool{if !self.can_upload(key,offset,n)||self.scratch.iter().any(|c|c[..n].iter().any(|v|!v.is_finite())){return false;}let index=self.bank_index(key).unwrap();self.free_count-=1;let page=self.free[self.free_count]as usize;let b=&mut self.banks[index];b.pages[b.allocated]=page as u32;b.allocated+=1;b.written+=n;for ch in 0..2{let at=page*PAGE*2+ch*PAGE;for i in 0..n{self.arena[at+i]=self.scratch[ch][i];}for i in 0..n{self.scratch[ch][i]=self.arena[at+i];}}self.uploaded+=n as u64;true}
 pub fn seal(&mut self,key:u32)->bool{let Some(i)=self.bank_index(key)else{return false;};let b=&mut self.banks[i];if b.state!=1||b.written!=b.frames||b.allocated!=b.need{return false;}b.state=2;true}
 pub fn retain(&mut self,key:u32)->bool{let Some(i)=self.bank_index(key)else{return false;};let b=&mut self.banks[i];if b.state!=2||b.refs==u32::MAX{return false;}b.refs+=1;true}
 fn retire(&mut self,index:usize){let b=&mut self.banks[index];self.available+=b.need-b.allocated;b.state=3;b.refs=0;if b.allocated==0{b.state=0;b.key=0;b.written=0;b.frames=0;b.need=0;}}
 fn release_index(&mut self,index:usize){let b=&mut self.banks[index];if b.refs>1{b.refs-=1;}else{self.retire(index);}}
 pub fn release(&mut self,key:u32)->bool{let Some(i)=self.bank_index(key)else{return false;};if ![1,2].contains(&self.banks[i].state)||self.banks[i].refs==0{return false;}self.release_index(i);true}
 pub fn cancel(&mut self,key:u32)->bool{let Some(i)=self.bank_index(key)else{return false;};if self.banks[i].state!=1||self.banks[i].refs!=1{return false;}self.retire(i);true}
 pub fn gc(&mut self)->usize{let mut count=0;for b in &mut self.banks{if b.state!=3{continue;}while b.allocated>0&&count<GC_PAGES{b.allocated-=1;self.free[self.free_count]=b.pages[b.allocated];self.free_count+=1;self.available+=1;count+=1;self.reclaimed+=1;}if b.allocated==0{b.state=0;b.key=0;b.written=0;b.frames=0;b.need=0;}if count==GC_PAGES{break;}}if self.resetting&&self.banks.iter().all(|b|b.state==0){self.resetting=false;}count}
 pub fn source_new(&mut self,slot:usize,token:u32,key:u32)->bool{if self.resetting||slot>=SOURCES||token==0||token<=self.last_tokens[slot]||self.sources[slot].token!=0{return false;}let Some(bank)=self.bank_index(key)else{return false;};if !self.retain(key){return false;}self.sources[slot]=Source{token,bank,bank_key:key,retained:true,..Source::default()};self.last_tokens[slot]=token;true}
 fn source(&mut self,slot:usize,token:u32)->Option<&mut Source>{self.sources.get_mut(slot).filter(|s|s.token==token&&token!=0)}
 pub fn start(&mut self,slot:usize,token:u32,onset:f64,offset:f64,call:f64)->bool{let Some(call)=clock(call)else{return false;};if !time(onset)||!time(offset){return false;}let Some(s)=self.sources.get(slot)else{return false;};if s.token!=token||token==0||s.scheduled{return false;}let length=self.banks[s.bank].frames as f64;let s=&mut self.sources[slot];s.onset=onset.max(call as f64);s.offset=offset;let sample=offset.round();s.position=if sample>=length{0.}else{sample};s.scheduled=true;true}
 pub fn stop(&mut self,slot:usize,token:u32,at:f64)->bool{if !time(at){return false;}let Some(s)=self.source(slot,token)else{return false;};if !s.scheduled{return false;}if !s.ended{s.stop=at;}true}
 pub fn source_free(&mut self,slot:usize,token:u32)->bool{if slot>=SOURCES||token==0{return false;}if self.sources[slot].token==0{return self.last_tokens[slot]==token;}if self.sources[slot].token!=token{return false;}let s=self.sources[slot];if s.retained{self.release_index(s.bank);}self.sources[slot]=Source::default();self.output[slot].fill([0.;Q]);true}
 pub fn render(&mut self,at:f64,mask:u32)->bool{let Some(frame)=clock(at)else{return false;};if frame>MAX_FRAME-Q as u64||mask>65535||self.frame.is_some_and(|end|frame<end){return false;}self.output.fill([[0.;Q];2]);
  for slot in 0..SOURCES{if mask&(1<<slot)==0||self.sources[slot].token==0||self.sources[slot].ended{continue;}let release={let s=&mut self.sources[slot];let b=&self.banks[s.bank];if b.state!=2||b.key!=s.bank_key{return false;}if let Some(end)=s.frame{s.skipped+=frame-end;}if s.scheduled{let first=boundary(s.onset);let end=if s.stop.is_finite(){boundary(s.stop)}else{MAX_FRAME};for i in 0..Q{let now=frame+i as u64;if now>=end{s.ended=true;break;}if now<first{continue;}if !s.started{s.position+=(first as f64-s.onset).max(0.);s.position%=b.frames as f64;s.started=true;}let k=s.position as usize;let next=if k+1==b.frames{0}else{k+1};let fraction=s.position-k as f64;let a=b.pages[k/PAGE]as usize*PAGE*2+k%PAGE;let z=b.pages[next/PAGE]as usize*PAGE*2+next%PAGE;for ch in 0..2{self.output[slot][ch][i]=((1.-fraction)*self.arena[a+ch*PAGE]as f64+fraction*self.arena[z+ch*PAGE]as f64)as f32;}s.position+=1.;if s.position>=b.frames as f64{s.position-=b.frames as f64;}s.rendered+=1;}}s.frame=Some(frame+Q as u64);if s.ended&&s.retained{s.retained=false;Some(s.bank)}else{None}};if let Some(bank)=release{self.release_index(bank);}}
  self.frame=Some(frame+Q as u64);self.gc();true
 }
 pub fn reset(&mut self){for slot in 0..SOURCES{let token=self.sources[slot].token;if token!=0{self.source_free(slot,token);}}for i in 0..BANKS{if self.banks[i].state==1||self.banks[i].state==2{self.retire(i);}}self.resetting=true;self.frame=None;self.output.fill([[0.;Q];2]);self.gc();}
}
#[no_mangle]pub extern "C" fn ambience_bank_api()->u32{1}
#[no_mangle]pub extern "C" fn ambience_bank_new(rate:u32)->*mut Engine{Engine::new(rate).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn ambience_bank_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn ambience_bank_begin(p:&mut Engine,n:usize)->u32{p.begin(n)}
#[no_mangle]pub extern "C" fn ambience_bank_scratch(p:&mut Engine,ch:usize)->*mut f32{p.scratch.get_mut(ch).map_or(std::ptr::null_mut(),|c|c.as_mut_ptr())}
#[no_mangle]pub extern "C" fn ambience_bank_can_upload(p:&Engine,key:u32,offset:usize,n:usize)->u32{p.can_upload(key,offset,n)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_upload(p:&mut Engine,key:u32,offset:usize,n:usize)->u32{p.upload(key,offset,n)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_seal(p:&mut Engine,key:u32)->u32{p.seal(key)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_retain(p:&mut Engine,key:u32)->u32{p.retain(key)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_release(p:&mut Engine,key:u32)->u32{p.release(key)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_cancel(p:&mut Engine,key:u32)->u32{p.cancel(key)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_gc(p:&mut Engine)->usize{p.gc()}
#[no_mangle]pub extern "C" fn ambience_bank_source_new(p:&mut Engine,slot:usize,token:u32,key:u32)->u32{p.source_new(slot,token,key)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_source_start(p:&mut Engine,slot:usize,token:u32,onset:f64,offset:f64,call:f64)->u32{p.start(slot,token,onset,offset,call)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_source_stop(p:&mut Engine,slot:usize,token:u32,at:f64)->u32{p.stop(slot,token,at)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_source_free(p:&mut Engine,slot:usize,token:u32)->u32{p.source_free(slot,token)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_render(p:&mut Engine,frame:f64,mask:u32)->u32{p.render(frame,mask)as u32}
#[no_mangle]pub extern "C" fn ambience_bank_output(p:&Engine,slot:usize,ch:usize)->*const f32{p.output.get(slot).and_then(|o|o.get(ch)).map_or(std::ptr::null(),|c|c.as_ptr())}
#[no_mangle]pub extern "C" fn ambience_bank_reset(p:&mut Engine){p.reset();}
#[no_mangle]pub extern "C" fn ambience_bank_stat(p:&Engine,i:u32)->f64{match i{0=>p.rate as f64,1=>p.arena.len()as f64*4.,2=>p.available as f64,3=>p.free_count as f64,4=>p.banks.iter().filter(|b|b.state==1).count()as f64,5=>p.banks.iter().filter(|b|b.state==2).count()as f64,6=>p.banks.iter().filter(|b|b.state==3).map(|b|b.allocated).sum::<usize>()as f64,7=>p.sources.iter().filter(|s|s.token!=0).count()as f64,8=>p.uploaded as f64,9=>p.reclaimed as f64,10=>p.frame.unwrap_or(0)as f64,11=>p.resetting as u32 as f64,_=>f64::NAN}}
#[no_mangle]pub extern "C" fn ambience_bank_resource_stat(p:&Engine,key:u32,i:u32)->f64{let Some(index)=p.bank_index(key)else{return f64::NAN;};let b=&p.banks[index];match i{0=>b.state as f64,1=>b.frames as f64,2=>b.written as f64,3=>b.refs as f64,4=>b.allocated as f64,5=>b.need as f64,_=>f64::NAN}}
#[no_mangle]pub extern "C" fn ambience_bank_source_stat(p:&Engine,slot:usize,token:u32,i:u32)->f64{let Some(s)=p.sources.get(slot).filter(|s|s.token==token&&token!=0)else{return f64::NAN;};match i{0=>s.bank_key as f64,1=>s.scheduled as u32 as f64,2=>s.started as u32 as f64,3=>s.ended as u32 as f64,4=>s.position,5=>s.frame.unwrap_or(0)as f64,6=>s.rendered as f64,7=>s.skipped as f64,8=>s.onset,9=>s.offset,10=>s.stop,_=>f64::NAN}}
