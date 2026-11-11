//! Bounded slot-owned AudioParam timelines. Control writes can allocate only
//! during construction; evaluation and cancellation reuse preallocated storage.
const CAP: usize = 1024;
#[derive(Clone, Copy, Debug)]
pub struct Event {
    pub time: f64,
    pub kind: u32, // 0=set, 1=linear endpoint, 2=target
    pub value: f64,
    pub tau: f64,
    start: f64,
}
pub struct Timeline { initial:f64, events:Vec<Event>, live:Option<Box<crate::live_timeline::LiveTimeline>> }
impl Timeline {
    pub fn new(initial:f64)->Self {Self::with_capacity(initial,CAP)}
    pub fn with_capacity(initial:f64,capacity:usize)->Self{Self{initial,events:Vec::with_capacity(capacity.min(8192)),live:None}}
    pub fn enable_live(&mut self){if self.live.is_none(){let mut l=crate::live_timeline::LiveTimeline::new(self.initial,self.events.capacity());for e in &self.events{l.add(e.time,e.kind,e.value,e.tau);}self.live=Some(Box::new(l));}}
    pub fn prepare_live(&mut self,frame:u64,sr:f64){if let Some(l)=&mut self.live{l.prepare(frame,sr);}}
    pub fn sample(&self,index:usize,time:f64)->f64{self.live.as_ref().map_or_else(||self.at(time),|l|l.output[index] as f64)}
    pub fn live_sample(&self,index:usize)->f64{self.live.as_ref().filter(|_|index<128).map_or(f64::NAN,|l|l.output[index] as f64)}
    pub fn latest_target(&self)->f64{self.events.last().map_or(self.initial,|e|e.value)}
    pub fn len(&self)->usize {self.events.len()}
    pub fn can_add(&self,count:usize)->bool{self.events.len()+count<=self.events.capacity()&&self.live.as_ref().is_none_or(|l|l.available(count))}
    pub fn at(&self,time:f64)->f64 {
        let after=self.events.partition_point(|e|e.time<=time);
        let Some(previous)=after.checked_sub(1).map(|i|self.events[i])else{
            if let Some(next)=self.events.first().filter(|e|e.kind==1&&e.time>0.){return self.initial+(next.value-self.initial)*(time/next.time).clamp(0.,1.);}
            return self.initial;
        };
        if let Some(next)=self.events.get(after).filter(|e|e.kind==1){
            return previous.value+(next.value-previous.value)*(time-previous.time)/(next.time-previous.time);
        }
        if previous.kind==2{previous.value+(previous.start-previous.value)*(-(time-previous.time)/previous.tau).exp()}else{previous.value}
    }
    fn rebuild(&mut self){
        let mut value=self.initial;let mut previous_time=0.;let mut target:Option<(f64,f64)>=None;
        for e in &mut self.events{
            if let Some((goal,tau))=target{value=goal+(value-goal)*(-(e.time-previous_time)/tau).exp();}
            e.start=value;
            if e.kind==2{target=Some((e.value,e.tau));}else{value=e.value;target=None;}
            previous_time=e.time;
        }
    }
    pub fn add(&mut self,time:f64,kind:u32,value:f64,tau:f64)->bool{
        if !time.is_finite()||time<0.||kind>2||!value.is_finite()||!tau.is_finite()||kind==2&&tau<=0.{return false;}
        if self.events.len()==self.events.capacity()&&!self.events.iter().any(|e|e.time==time&&e.kind==kind){return false;}
        if let Some(l)=&mut self.live{if !l.add(time,kind,value,tau){return false;}}
        let value=value as f32 as f64; // actual AudioParam target storage
        if let Some(e)=self.events.iter_mut().find(|e|e.time==time&&e.kind==kind){e.value=value;e.tau=tau;self.rebuild();return true;}
        if self.events.len()==self.events.capacity(){return false;}
        let at=self.events.partition_point(|e|e.time<=time);
        self.events.insert(at,Event{time,kind,value,tau,start:0.});self.rebuild();true
    }
    pub fn cancel(&mut self,time:f64){if let Some(l)=&mut self.live{l.cancel(time);}self.events.retain(|e|e.time<time);self.rebuild();}
    pub fn hold(&mut self,time:f64)->bool{
        if let Some(mut live)=self.live.take(){if !live.available(2){self.live=Some(live);return false;}let ok=self.hold(time);let held=if ok{live.hold(time)}else{false};self.live=Some(live);return ok&&held;}
        let value=self.at(time);
        let next=self.events.partition_point(|e|e.time<=time);
        let ramp=self.events.get(next).is_some_and(|e|e.kind==1);
        self.cancel(time);
        if ramp&&!self.add(time,1,value,0.){return false;}
        self.add(time,0,value,0.)
    }
    pub fn reset(&mut self,initial:f64){self.initial=initial;self.events.clear();if let Some(l)=&mut self.live{l.reset(initial);}}
    /// Retain the true target/line anchor, not a rounded replacement value.
    /// Called only by control handlers before capacity validation.
    pub fn prune(&mut self,now:f64){
        let before=self.events.partition_point(|e|e.time<now);
        if before>1{
            let retain=before-1;
            let old=self.events[retain];
            // A target's start is required to retain its original exponential.
            self.initial=if old.kind==2{old.start}else{old.value};
            self.events.drain(..retain);
            self.rebuild();
        }
    }
}
