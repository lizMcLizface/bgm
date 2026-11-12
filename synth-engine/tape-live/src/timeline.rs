//! Normal native profile: original seconds and time constants remain authoritative.
//! Fork of synth-engine/piano-live/src/live_timeline.rs SHA256 normalized LF 9cb7d8d92254c50d7887533b76e0a0098b36e293a834f67c5229c47d36ce9930.
//! Mixed comparisons follow pinned AudioParamHandler; accepted shared file is untouched.
//! Bounded pulled AudioParam set/linear/target/cancel subset of pinned Chromium.
//! Values are generated only for actual native128-frame pulls. Old immutable
//! Timeline evaluation remains separate. No render allocation or deallocation.
#[derive(Clone,Copy)]struct Event{time:f64,seconds:f64,kind:u32,value:f32,tau:f64,tau_seconds:f64,new:bool,order:u64,saved:Option<(f64,f32)>,cached:bool}
pub struct LiveTimeline{rate:f64,events:Vec<Event>,current:f32,order:u64,pub output:[f32;128]}
fn converged(value:f32,target:f32,time:f64,start:f64,tau:f64)->bool{time>start+10.*tau||target==0.&&value.abs()<4.539992976248485e-5||target!=0.&&(target-value).abs()<4.539992976248485e-5*value.abs()}
impl LiveTimeline{
 pub fn new(initial:f64,capacity:usize,rate:f64)->Self{Self{rate,events:Vec::with_capacity(capacity),current:initial as f32,order:0,output:[initial as f32;128]}}
 fn skipped_for_insert(&self,frame:f64)->usize{let mut n=0;for(i,e)in self.events.iter().enumerate(){let next=self.events.get(i+1);let special=e.kind==0&&e.time<=frame&&frame<e.time+1.;if next.is_none_or(|n|n.time>=frame)||special{break;}n+=1;}n}
 pub fn available_at(&self,n:usize,frame:f64)->bool{self.events.len()-self.skipped_for_insert(frame)+n<=self.events.capacity()}
 pub fn prune_for_insert(&mut self,frame:f64){let n=self.skipped_for_insert(frame);if n>0{self.events.drain(..n);}}
 pub fn intrinsic(&mut self,value:f64){self.current=value as f32;}
 pub fn latest(&self)->f32{self.events.last().map_or(self.current,|e|e.value)}
 pub fn accurate(&self,frame:u64)->bool{let Some(first)=self.events.first()else{return false;};if first.seconds>(frame+128)as f64/self.rate&&(first.kind==0||first.kind==2){return false;}if self.events.len()>=2{return true;}if first.kind==2{first.seconds<=(frame+128)as f64/self.rate}else{first.seconds>=frame as f64/self.rate}}
 pub fn available(&self,n:usize)->bool{self.events.len()+n<=self.events.capacity()}
 pub fn add_seconds(&mut self,time:f64,kind:u32,value:f64,tau:f64)->bool{if !self.available(1){return false;}self.order+=1;let e=Event{time:time*self.rate,seconds:time,kind,value:value as f32,tau:tau*self.rate,tau_seconds:tau,new:true,order:self.order,saved:None,cached:false};let at=self.events.partition_point(|e|e.seconds<=time);self.events.insert(at,e);true}
 pub fn cancel(&mut self,time:f64){self.events.retain(|e|e.time<time);}
 pub fn hold(&mut self,time:f64)->bool{
  if !self.available(2){return false;}let after=self.events.partition_point(|e|e.time<=time);let mut index=after;
  if after>0&&self.events[after-1].kind==2{index=after-1;}else if after==self.events.len(){return true;}
  let e=self.events[index];let mut replacement=None;
  if e.kind==1{replacement=Some((Some((e.time,e.value)),0.));}
  else if e.kind==2&&e.time<time{index+=1;replacement=Some((None,0.));}
  self.events.truncate(index);
  if let Some((saved,value))=replacement{self.order+=1;self.events.push(Event{time,seconds:time/self.rate,kind:3,value,tau:0.,tau_seconds:0.,new:true,order:self.order,saved,cached:false});}true
 }
 pub fn reset(&mut self,initial:f64){self.events.clear();self.current=initial as f32;self.output.fill(initial as f32);self.order=0;}
 pub fn clip_output(&mut self,min:f32,max:f32){for value in &mut self.output{*value=value.clamp(min,max);}self.current=self.output[127];}
 pub fn prepare(&mut self,frame:u64,sr:f64){
  let end=frame+128;let time=frame as f64/sr;
  if self.events.is_empty()||end as f64/sr<=self.events[0].seconds{self.output.fill(self.current);return;}
  let mut changed=false;for(i,e)in self.events.iter_mut().enumerate(){e.order=i as u64;if e.new{if e.seconds<time{e.seconds=time;e.time=e.seconds*sr;changed=true;}e.new=false;}}
  if changed{self.events.sort_unstable_by(|a,b|a.seconds.total_cmp(&b.seconds).then(a.order.cmp(&b.order)));}
  let last=*self.events.last().unwrap();
  if last.seconds+1.5*128./sr<time&&(last.kind!=2||converged(self.current,last.value,time,last.seconds,last.tau_seconds)){
   if last.kind==2{self.current=last.value;}self.output.fill(self.current);let remove=self.events.len().saturating_sub(1);if remove>0{self.events.drain(..remove);}return;
  }
  let mut write=0usize;let mut current=frame;let mut value=self.current;
  if self.events[0].seconds>time{write=(self.events[0].time.ceil() as u64-frame).min(128)as usize;self.output[..write].fill(value);current+=write as u64;}
  let mut index=0;let mut skipped=0;
  while index<self.events.len()&&write<128{
   let mut event=self.events[index];let next=self.events.get(index+1).copied();
   let special=event.kind==0&&event.time<=current as f64&&(current as f64)<event.time+1.;
   if next.is_some_and(|n|n.time<current as f64)&&!special{skipped+=1;index+=1;continue;}
   if event.kind==2&&next.is_some_and(|n|n.kind==1){
    let tau=(event.tau_seconds) as f32 as f64;let c=(1.-(-1./(tau*sr)).exp())as f32;
    if (2.*event.time-2.*current as f64+1.).abs()<=1.{value=(event.value as f64+(value-event.value)as f64*(-(current as f64/sr-event.seconds)/tau).exp())as f32;}else{value+=(event.value-value)*c;}
    event.kind=0;event.seconds=current as f64/sr;event.time=event.seconds*sr;event.value=value;self.events[index]=event;
   }
   let mut next_kind=next.map_or(u32::MAX,|n|n.kind);let mut seconds2=next.map_or(end as f64/sr+1.,|n|n.seconds);let mut time2=seconds2*sr;let mut value2=next.map_or(event.value,|n|n.value);
   if let Some(n)=next.filter(|n|n.kind==3&&n.saved.is_some()){
    let(t,v)=n.saved.unwrap();next_kind=1;time2=n.time;seconds2=n.seconds;
    value2=if n.cached{n.value}else{let k=if t==event.time{0.}else{(n.time-event.time)/(t-event.time)};(event.value as f64+(v-event.value)as f64*k)as f32};
    self.events[index+1].value=value2;self.events[index+1].cached=true;
   }
   let stop=if end as f64>time2{time2.ceil()as u64}else{end};let fill=(stop-frame).min(128)as usize;
   if next_kind==1{
    let delta=seconds2-event.seconds;let k=if delta<=f32::MIN_POSITIVE as f64{0.}else{(1./delta)as f32};let d=value2-event.value;
    let base=(current as f64/sr-event.seconds)as f32;let scale=k*d;
    let mut lane=[0f32;4];for(i,v)in lane.iter_mut().enumerate(){*v=event.value+((i as f32*(1./sr)as f32)+base)*scale;}
    let inc=(4./sr*k as f64*d as f64)as f32;let vector_end=write+(fill-write)/4*4;
    while write<vector_end{for i in 0..4{self.output[write+i]=lane[i];lane[i]+=inc;}write+=4;current+=4;}
    if write>0{value=self.output[write-1];}
    while write<fill{let x=((current as f64/sr-event.seconds)*k as f64)as f32;value=event.value+x*d;self.output[write]=value;write+=1;current+=1;}
   }else if event.kind==2{
    let tau=(event.tau_seconds) as f32 as f64;let c=(1.-(-1./(tau*sr)).exp())as f32;
    if event.time<=current as f64&&(current as f64)<event.time+1.{value=(event.value as f64+(value-event.value)as f64*(-(current as f64/sr-event.seconds)/tau).exp())as f32;}else{value+=(event.value-value)*c;}
    if converged(value,event.value,current as f64/sr,event.seconds,(event.tau_seconds) as f32 as f64){self.output[write..fill].fill(event.value);write=fill;}
    else{let coeff=[c,c*(2.-c),c*((c-3.)*c+3.),c*(c*((4.-c)*c-6.)+4.)];let vector_end=write+(fill-write)/4*4;
     while write<vector_end{let d=event.value-value;self.output[write]=value;for i in 1..4{self.output[write+i]=value+d*coeff[i-1];}value+=d*coeff[3];write+=4;}
     while write<fill{self.output[write]=value;value+=(event.value-value)*c;write+=1;}
     if write>0{value=self.output[write-1];}
    }current=stop;
   }else if event.kind==3{
    if event.cached{value=event.value;}else if index>0&&event.time<=current as f64&&(current as f64)<event.time+1.&&self.events[index-1].kind==2{let e=self.events[index-1];let c=(1.-(-1./((e.tau_seconds) as f32 as f64*sr)).exp())as f32;value+=(e.value-value)*c;}
    self.output[write..fill].fill(value);write=fill;current=stop;
   }else{value=event.value;self.output[write..fill].fill(value);write=fill;current=stop;}
   index+=1;
  }
  self.output[write..].fill(value);self.current=self.output[127];if skipped>0{self.events.drain(..skipped);}
 }
}
