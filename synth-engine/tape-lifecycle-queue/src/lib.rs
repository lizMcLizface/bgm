//! Fixed owned future retirement queue. No Native hidden task inference.
mod lifecycle;
#[cfg(feature="allocation-audit")]mod allocation;
const MAX_FRAME:f64=1099511627648.;const MAX_SEQUENCE:u32=16777215;const INVALID:u32=u32::MAX;
#[derive(Clone,Copy)]struct Event{frame:u64,kind:u32,remaining:u32,epoch:u32,sequence:u32}
const EMPTY:Event=Event{frame:0,kind:0,remaining:7,epoch:1,sequence:0};
pub struct Queue{policy:lifecycle::Lifecycle,next:u64,current:u64,pending:bool,events:[Event;32],head:usize,len:usize,sequence:u32,observed:u32,projected_outputs:u32,projected_epoch:u32,max_queued:usize,rejected:u64,last_error:u32,failed_sequence:u32}
fn canonical(f:f64)->bool{f.is_finite()&&f>=0.&&f<=MAX_FRAME&&f.fract()==0.&&f%128.==0.}
fn boolean(v:f64)->Option<bool>{if v==0.{Some(false)}else if v==1.{Some(true)}else{None}}
impl Queue{
 pub fn new(rate:f64,origin:f64)->Option<Box<Self>>{if !canonical(origin){return None;}let policy=*lifecycle::Lifecycle::new(rate)?;Some(Box::new(Self{policy,next:origin as u64,current:origin as u64,pending:false,events:[EMPTY;32],head:0,len:0,sequence:0,observed:0,projected_outputs:7,projected_epoch:1,max_queued:0,rejected:0,last_error:0,failed_sequence:0}))}
 fn reject(&mut self,code:u32)->u32{self.rejected+=1;self.last_error=code;self.failed_sequence=0;INVALID}
 pub fn enqueue(&mut self,frame:f64,kind:u32,remaining:u32,epoch:u32,sequence:u32)->bool{if self.pending||!canonical(frame)||frame<self.next as f64||self.len>=32||self.sequence==MAX_SEQUENCE||sequence!=self.sequence+1||self.len>0&&frame<(self.events[(self.head+self.len-1)%32].frame as f64){self.reject(1);return false;}
  let (outputs,new_epoch)=if kind==0{if ![0,4,6,7].contains(&remaining)||remaining&self.projected_outputs!=remaining||epoch!=self.projected_epoch{self.reject(2);return false;}(remaining,epoch)}else if kind==1{if remaining!=7||epoch<=self.projected_epoch{self.reject(2);return false;}(7,epoch)}else{self.reject(2);return false;};
  self.events[(self.head+self.len)%32]=Event{frame:frame as u64,kind,remaining,epoch,sequence};self.len+=1;self.sequence=sequence;self.projected_outputs=outputs;self.projected_epoch=new_epoch;self.max_queued=self.max_queued.max(self.len);true
 }
 pub fn begin(&mut self,frame:f64,silent:bool,active:bool,demand:bool)->u32{if self.pending||!canonical(frame)||frame<self.next as f64{ return self.reject(3);}if self.len>0&&self.events[self.head].frame<frame as u64{let sequence=self.events[self.head].sequence;self.reject(4);self.failed_sequence=sequence;return INVALID;}
  // The entire same-frame batch and callback authority validate on a stack copy.
  // Failure never partially changes connectivity, removes an event or emits ACK.
  let mut candidate=self.policy;let mut due=0;let mut observed=self.observed;
  while due<self.len{let event=self.events[(self.head+due)%32];if event.frame!=frame as u64{break;}let ok=if event.kind==0{candidate.retire(frame,event.remaining,event.epoch)}else{candidate.activate(frame,event.epoch)};if !ok{self.reject(5);self.failed_sequence=event.sequence;return INVALID;}observed=event.sequence;due+=1;}
  let mask=candidate.begin(frame,silent,active,demand);if mask==INVALID{return self.reject(6);}self.policy=candidate;self.head=(self.head+due)%32;self.len-=due;self.observed=observed;self.pending=true;self.current=frame as u64;
  if self.len==0{self.projected_outputs=lifecycle::tape_lifecycle_stat(&self.policy,21)as u32;self.projected_epoch=lifecycle::tape_lifecycle_stat(&self.policy,22)as u32;}mask
 }
 pub fn finish(&mut self,tone:f64)->bool{if !self.pending||!self.policy.finish(tone){self.reject(7);return false;}self.pending=false;self.next=self.current+128;true}
}
#[no_mangle]pub extern "C" fn tape_lifecycle_queue_api()->u32{1}
#[no_mangle]pub extern "C" fn tape_lifecycle_queue_new(rate:f64,origin:f64)->*mut Queue{Queue::new(rate,origin).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn tape_lifecycle_queue_free(p:*mut Queue){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn tape_lifecycle_queue_event(p:&mut Queue,frame:f64,kind:u32,remaining:u32,epoch:u32,sequence:u32)->u32{p.enqueue(frame,kind,remaining,epoch,sequence)as u32}
#[no_mangle]pub extern "C" fn tape_lifecycle_queue_begin(p:&mut Queue,frame:f64,silent:f64,active:f64,demand:f64)->u32{let(Some(s),Some(a),Some(d))=(boolean(silent),boolean(active),boolean(demand))else{return p.reject(8);};p.begin(frame,s,a,d)}
#[no_mangle]pub extern "C" fn tape_lifecycle_queue_finish(p:&mut Queue,tone:f64)->u32{p.finish(tone)as u32}
#[no_mangle]pub extern "C" fn tape_lifecycle_queue_stat(p:&Queue,key:u32)->f64{match key{0=>p.next as f64,1=>p.current as f64,2=>p.pending as u32 as f64,3=>p.len as f64,4=>p.sequence as f64,5=>p.observed as f64,6=>p.projected_outputs as f64,7=>p.projected_epoch as f64,8=>p.max_queued as f64,9=>p.rejected as f64,10=>p.last_error as f64,11=>p.failed_sequence as f64,_=>f64::NAN}}
#[no_mangle]pub extern "C" fn tape_lifecycle_queue_policy_stat(p:&Queue,key:u32)->f64{lifecycle::tape_lifecycle_stat(&p.policy,key)}

#[no_mangle]pub extern "C" fn tape_lifecycle_queue_event_stat(p:&Queue,index:u32,key:u32)->f64{if index as usize>=p.len{return f64::NAN;}let e=p.events[(p.head+index as usize)%32];match key{0=>e.frame as f64,1=>e.kind as f64,2=>e.remaining as f64,3=>e.epoch as f64,4=>e.sequence as f64,_=>f64::NAN}}
