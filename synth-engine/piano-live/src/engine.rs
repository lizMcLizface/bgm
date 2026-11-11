//! Actual MonoSynth piano BufferSources and physical-slot gain/filter ownership.
//! Resource/control mutation is an explicit message operation; render never
//! creates or reclaims a vector or a bank. Finite piano/Graph code is untouched.
use crate::{biquad::Biquad,envelope,timeline::Timeline};
use crate::control::Control;
const MAX_BANKS:usize=128;
const MAX_SOURCES:usize=2000;
const MAX_BYTES:usize=64*1024*1024;
const Q:usize=128;
struct LiveControl{wave:Control,initial:f64,target:f64,tau:f64,delay:f64}
impl LiveControl{
 fn new(mut wave:Control,delay:f64,sr:f64)->Option<Self>{if !delay.is_finite()||!(0. ..=sr*30.).contains(&delay)||wave.kind==1&&delay!=0.{return None;}let initial=wave.initial;let target=wave.target;let tau=wave.tau;wave.initial=1.;wave.target=1.;wave.tau=0.;if delay>0.&&wave.kind==0{let mut points=Vec::with_capacity(wave.points.len());for(time,hz)in wave.points{if time<=delay{wave.frequency=hz;}else{points.push((time-delay,hz));}}wave.points=points;}Some(Self{wave,initial,target,tau,delay})}
 fn at(&self,frame:f64,sr:f64)->f64{let frame=frame.max(0.);let depth=if self.tau>0.{self.target+(self.initial-self.target)*(-frame/self.tau).exp()}else{self.target};self.wave.at((frame-self.delay).max(0.),sr)*depth}
}

pub fn source_frame(frame:f64)->u64{((frame*1024.).round()/1024.).ceil().max(0.) as u64}
pub struct Bank{pub key:u32,pub strike:Vec<f32>,pub body:Vec<f32>,pub frequency:f64,order:u64}
pub struct Source{
    pub id:u32,pub bank:usize,pub slot:usize,pub owner:u32,pub onset:f64,pub stop:f64,
    pub pitch:f64,pub pitch_tau:f64,pub curve:Vec<(f64,f64)>,pub pitch_connected:bool,
    frame:u64,position:f64,body_position:f64,started:bool,finished:bool,
}
impl Default for Source{fn default()->Self{Self{id:0,bank:0,slot:0,owner:0,onset:0.,stop:0.,pitch:0.,pitch_tau:1.,curve:Vec::new(),pitch_connected:false,frame:0,position:0.,body_position:0.,started:false,finished:true}}}
pub struct Slot{
    pub gain:Timeline,pub detune:Timeline,pub frequency:Timeline,pub q:Timeline,
    pub filter_gain:Timeline,pub volume:Timeline,pub kind:u32,pub awake:bool,
    pub last_gain:f32,pub last_detune:f32,filter:Biquad,history:[(u64,f32);128],
}
impl Slot{
    fn new(sr:f64)->Self{Self{gain:Timeline::with_capacity(0.,4096),detune:Timeline::with_capacity(0.,2048),frequency:Timeline::with_capacity(11000f64.min(sr/2.),256),q:Timeline::with_capacity(1.,256),filter_gain:Timeline::with_capacity(0.,256),volume:Timeline::with_capacity(0.2,256),kind:0,awake:true,last_gain:0.,last_detune:0.,filter:Biquad::default(),history:[(u64::MAX,0.);128]}}
    pub fn gain_value_at(&self,time:f64)->f32{let prior=source_frame(time).saturating_sub(1);let (tag,value)=self.history[(prior/128) as usize%128];if tag==prior{value}else{self.gain.at(prior as f64) as f32}}
    fn prune(&mut self,now:f64){for t in [&mut self.gain,&mut self.detune,&mut self.frequency,&mut self.q,&mut self.filter_gain,&mut self.volume]{t.prune(now);}}
}
pub struct Engine{
    pub sr:f64,pub slots:Vec<Slot>,banks:Vec<Option<Bank>>,sources:Vec<Source>,
    pub air:crate::air::Air,bytes:usize,order:u64,frame:Option<u64>,owner:u32,controls:Vec<LiveControl>,control_origin:f64,
    pub output:[[f32;2];Q],starts:u64,stops:u64,rejected:u64,late:u64,skipped:u64,peak:f64,
}
fn interpolation(samples:&[f32],position:f64,looped:bool)->f32{
    if samples.is_empty()||!looped&&position>=samples.len() as f64{return 0.;}
    let p=if looped{position%samples.len() as f64}else{position};let i=p as usize;let part=p-i as f64;
    let a=samples[i] as f64;
    if i+1<samples.len(){((1.-part)*a+part*samples[i+1] as f64) as f32}
    else if looped{((1.-part)*a+part*samples[0] as f64) as f32}
    else if i>0{(a+(a-samples[i-1] as f64)*part) as f32}else{a as f32}
}
fn curve_at(points:&[(f64,f64)],time:f64)->f64{
    let at=points.partition_point(|p|p.0<=time);
    if at==0{return points[0].1;}if at==points.len(){return points[at-1].1;}
    let a=points[at-1];let b=points[at];a.1+(b.1-a.1)*(time-a.0)/(b.0-a.0)
}
impl Engine{
    pub fn new(sr:f64,voices:usize)->Option<Self>{
        if !sr.is_finite()||!(8000. ..=192000.).contains(&sr)||!(1..=32).contains(&voices){return None;}
        Some(Self{sr,slots:(0..voices).map(|_|Slot::new(sr)).collect(),banks:(0..MAX_BANKS).map(|_|None).collect(),sources:(0..MAX_SOURCES).map(|_|Source::default()).collect(),air:crate::air::Air::new(sr,voices),bytes:(sr*2.) as usize*4,order:0,frame:None,owner:0,controls:Vec::with_capacity(4),control_origin:0.,output:[[0.;2];Q],starts:0,stops:0,rejected:0,late:0,skipped:0,peak:0.})
    }
    pub fn has_bank(&self,key:u32)->bool{self.banks.iter().any(|b|b.as_ref().is_some_and(|b|b.key==key))}
    fn pinned(&self,index:usize)->bool{self.sources.iter().any(|s|s.id!=0&&!s.finished&&s.bank==index)}
    pub fn bank(&mut self,key:u32,frequency:f64,strike:Vec<f32>,body:Vec<f32>)->bool{
        if key==0||!frequency.is_finite()||!(1. ..=20000.).contains(&frequency)||strike.is_empty()||strike.len()>(self.sr*9.).ceil() as usize||body.len()!=0&&body.len()!=2048||strike.iter().chain(&body).any(|v|!v.is_finite()){self.rejected+=1;return false;}
        if self.has_bank(key){return true;}
        let bytes=(strike.len()+body.len())*4;if bytes>MAX_BYTES{return false;}
        for source in &mut self.sources{if source.finished&&source.id!=0{*source=Source::default();}}
        while self.bytes+bytes>MAX_BYTES||self.banks.iter().all(Option::is_some){
            let candidate=self.banks.iter().enumerate().filter(|(i,b)|b.is_some()&&!self.pinned(*i)).min_by_key(|(_,b)|b.as_ref().unwrap().order).map(|(i,_)|i);
            let Some(index)=candidate else{self.rejected+=1;return false;};let old=self.banks[index].take().unwrap();self.bytes-=(old.strike.len()+old.body.len())*4;
        }
        let index=self.banks.iter().position(Option::is_none).unwrap();self.order+=1;
        self.banks[index]=Some(Bank{key,strike,body,frequency,order:self.order});self.bytes+=bytes;true
    }
    pub fn controls(&mut self,origin:f64,controls:Vec<(Control,f64)>)->bool{
        if !origin.is_finite()||origin<0.||controls.len()>4||controls.iter().any(|(c,_)|!c.valid()||c.kind==1&&(c.points.len()<2||c.points[0].0!=0.)||c.points.len()>128||c.points.iter().any(|p|!p.0.is_finite()||p.0<0.||!p.1.is_finite()||if c.kind==0{!(0. ..=44100.).contains(&p.1)}else{p.1.abs()>1.2+f64::EPSILON})||c.points.windows(2).any(|p|p[0].0>=p[1].0)){return false;}
        let Some(controls)=controls.into_iter().map(|(c,delay)|LiveControl::new(c,delay,self.sr)).collect::<Option<Vec<_>>>()else{return false;};self.controls=controls;self.control_origin=origin;true
    }
    pub fn parameter(&mut self,slot:usize,axis:u32,value:f64,at:f64,tau:f64)->bool{
        if slot>=self.slots.len()||!value.is_finite()||!at.is_finite()||at<0.||!tau.is_finite()||tau<0.||axis>6{return false;}
        let s=&mut self.slots[slot];
        if axis==0{if value.fract()!=0.||!(0. ..=6.).contains(&value){return false;}s.kind=value as u32;return true;}
        if !(match axis{1=>(0. ..=11000.).contains(&value),2=>(0. ..=100.).contains(&value),3=>(-120. ..=120.).contains(&value),4=>(-24000. ..=24000.).contains(&value),5=>(0. ..=1.).contains(&value),6=>(-4. ..=4.).contains(&value),_=>false}){return false;}
        let t=match axis{1=>&mut s.frequency,2=>&mut s.q,3=>&mut s.filter_gain,4=>&mut s.detune,6=>&mut s.gain,_=>&mut s.volume};t.prune((self.frame.unwrap_or(0) as f64).min(at));t.add(at,if tau>0.{2}else{0},value,tau)
    }
    pub fn awake(&mut self,slot:usize,awake:bool)->bool{let Some(slot)=self.slots.get_mut(slot)else{return false;};slot.awake=awake;true}
    pub fn pitch_connected(&mut self,slot:usize,on:bool){for source in &mut self.sources{if source.slot==slot&&!source.finished{source.pitch_connected=on;}}}
    /// Match stopStrings' immediate editing of every already-created source,
    /// including a future source stopped at its own onset. A later new source
    /// is not included in this edit.
    pub fn stop_slot(&mut self,slot:usize,time:f64)->bool{
        if slot>=self.slots.len()||!time.is_finite()||time<0.{return false;}
        for s in &mut self.sources{if s.id!=0&&!s.finished&&s.slot==slot{s.stop=s.stop.min(s.onset.max(time));}}self.air.stop_slot(slot,time);
        true
    }
    #[allow(clippy::too_many_arguments)]
    pub fn schedule(&mut self,key:u32,id:u32,owner:u32,slot:usize,onset:f64,fade:Option<f64>,gain:&[(f64,f64)],filter:&[(u32,f64,f64,f64)],pitch:f64,pitch_tau:f64,curve:Vec<(f64,f64)>,pitch_connected:bool,breath:f64,formant:f64,duration:f64)->bool{
        if !breath.is_finite()||!(0. ..=1.).contains(&breath)||!formant.is_finite()||!(0. ..=1.).contains(&formant)||!duration.is_finite()||!(0. ..=self.sr*630.).contains(&duration)||id==0||owner==0||self.owner!=0&&self.owner!=owner||slot>=self.slots.len()||!onset.is_finite()||onset<0.||!pitch.is_finite()||pitch.abs()>2400.||!pitch_tau.is_finite()||pitch_tau<self.sr*0.001||gain.len()<2||gain.len()>256||gain[0].0!=0.||gain.last().unwrap().1!=0.||gain.iter().any(|p|!p.0.is_finite()||!(0. ..=self.sr*630.).contains(&p.0)||!p.1.is_finite()||p.1.abs()>4.)||gain.windows(2).any(|p|p[0].0>=p[1].0)||filter.is_empty()||filter.len()>128||filter[0].0!=0||filter[0].1!=0.||filter.iter().any(|p|p.0>2||!p.1.is_finite()||p.1<0.||!p.2.is_finite()||p.2.abs()>24000.||!p.3.is_finite()||p.0==2&&p.3<self.sr*0.00001)||filter.windows(2).any(|p|p[0].1>p[1].1)||!curve.is_empty()&&curve[0].0!=0.||curve.len()>128||curve.iter().any(|p|!p.0.is_finite()||p.0<0.||!p.1.is_finite()||p.1.abs()>2400.)||curve.windows(2).any(|p|p[0].0>=p[1].0)||fade.is_some_and(|f|!f.is_finite()||f<0.||f>onset){self.rejected+=1;return false;}
        let Some(bank)=self.banks.iter().position(|b|b.as_ref().is_some_and(|b|b.key==key))else{self.rejected+=1;return false;};
        if self.sources.iter().any(|s|s.id==id&&!s.finished)||self.air.has_id(id){self.rejected+=1;return false;}
        let Some(index)=self.sources.iter().position(|s|s.id==0||s.finished)else{self.rejected+=1;return false;};
        let now=self.frame.unwrap_or(0) as f64;if !self.air.can_schedule(slot,now.min(onset),breath){return false;}let s=&mut self.slots[slot];s.prune(now.min(fade.unwrap_or(onset)));
        if s.gain.len()+gain.len()+4>4096||s.detune.len()+filter.len()+2>2048{self.rejected+=1;return false;}
        if let Some(fade)=fade{if !s.gain.hold(fade)||!s.gain.add(fade,2,0.,self.sr*0.002){return false;}}
        else{s.gain.cancel(onset);}
        if !s.gain.add(onset,0,gain[0].1,0.){return false;}
        for &(time,value) in &gain[1..]{if !s.gain.add(onset+time,1,value,0.){return false;}}
        s.detune.cancel(onset);
        for &(kind,time,value,tau) in filter{if !s.detune.add(onset+time,kind,value,tau){return false;}}
        self.stop_slot(slot,onset);
        self.sources[index]=Source{id,bank,slot,owner,onset,stop:onset+gain.last().unwrap().0,pitch:pitch as f32 as f64,pitch_tau,curve:curve.into_iter().map(|(t,v)|(t,v as f32 as f64)).collect(),pitch_connected,frame:source_frame(onset),position:0.,body_position:0.,started:false,finished:false};
        if self.frame.is_some_and(|f|source_frame(onset)<f){self.late+=1;}
        self.air.schedule(id,slot,onset,onset+duration.max(gain.last().unwrap().0),duration,self.banks[bank].as_ref().unwrap().frequency,breath,formant);
        self.owner=owner;self.order+=1;self.banks[bank].as_mut().unwrap().order=self.order;true
    }
    pub fn release(&mut self,slot:usize,time:f64,seconds:f64,shape:u32,exponent:f64,filter_offset:f64,filter_tau:f64)->bool{
        if slot>=self.slots.len()||!time.is_finite()||time<0.||!seconds.is_finite()||!(0. ..=30.).contains(&seconds)||shape>11||!exponent.is_finite()||!(0.1..=4.).contains(&exponent)||!filter_offset.is_finite()||filter_offset.abs()>24000.||!filter_tau.is_finite()||filter_tau<self.sr*0.00001{return false;}
        let now=self.frame.unwrap_or(0) as f64;let s=&mut self.slots[slot];s.prune(now.min(time));if s.gain.len()+52>4096||s.detune.len()+3>2048{return false;}
        // Measured native AudioParam.value is the preceding rendered Float32
        // sample. Rust owns this value; no pulled native ledger is required.
        let level=s.gain_value_at(time) as f64;let seconds=seconds.max(0.005);let frames=seconds*self.sr;let count=envelope::segments(seconds,shape);
        if !s.gain.hold(time)||!s.gain.add(time,0,level,0.){return false;}
        for i in 1..=count{let fraction=i as f64/count as f64;let value=level+(0.-level)*envelope::shape(fraction,shape,exponent);if !s.gain.add(time+frames*fraction,1,value,0.){return false;}}
        if !s.detune.hold(time)||!s.detune.add(time,2,filter_offset,filter_tau){return false;}
        self.stop_slot(slot,time+frames);self.stops+=1;true
    }
    pub fn silence(&mut self,time:f64)->bool{
        if !time.is_finite()||time<0.{return false;}
        for slot in 0..self.slots.len(){let s=&mut self.slots[slot];s.prune((self.frame.unwrap_or(0) as f64).min(time));if !s.gain.hold(time)||!s.gain.add(time,2,0.,self.sr*0.05){return false;}self.stop_slot(slot,time+self.sr*0.3);}
        true
    }
    pub fn cancel(&mut self,owner:u32){if owner!=0&&self.owner!=owner{return;}self.air.cancel();for source in &mut self.sources{source.finished=true;}for slot in &mut self.slots{slot.filter.clear();slot.last_gain=0.;}}
    pub fn reset(&mut self){self.cancel(0);self.air.reset();for slot in &mut self.slots{slot.gain.reset(0.);slot.detune.reset(0.);slot.history.fill((u64::MAX,0.));for t in [&mut slot.frequency,&mut slot.q,&mut slot.filter_gain,&mut slot.volume]{let latest=t.latest_target();t.reset(latest);}}self.frame=None;self.owner=0;self.starts=0;self.stops=0;self.late=0;self.skipped=0;}
    pub fn render(&mut self,frame:u64)->bool{
        if frame%Q as u64!=0||self.frame.is_some_and(|f|frame<f){return false;}
        if let Some(expected)=self.frame{self.skipped+=frame-expected;}
        let mut signal=[[0f32;Q];32];let mut pitch_control=0.;
        for control in &self.controls{if control.wave.axis==0{pitch_control+=control.at(frame as f64-self.control_origin,self.sr);}}
        for source in &mut self.sources{
            if source.id==0||source.finished||!self.slots[source.slot].awake||source.frame>=frame+Q as u64{continue;}
            let bank=self.banks[source.bank].as_ref().unwrap();let body_rate=(bank.frequency*2048./self.sr) as f32 as f64;
            let target_start=source_frame(source.onset).div_ceil(Q as u64)*Q as u64;
            let intrinsic=if frame<target_start{0.}else if !source.curve.is_empty(){curve_at(&source.curve,frame as f64-source.onset)}else{source.pitch*(-((frame-target_start) as f64)/source.pitch_tau).exp()};
            let detune=(intrinsic as f32+(if source.pitch_connected{pitch_control as f32}else{0.})) as f64;
            let rate=2f64.powf(detune/1200.).min(1024.);let combined_body_rate=(rate*body_rate).min(1024.);
            let stop=source_frame(source.stop);let strike_stop=source_frame((source.onset+bank.strike.len() as f64).min(source.stop));
            for (i,input) in signal[source.slot].iter_mut().enumerate(){let now=frame+i as u64;if now<source.frame{continue;}if now>=stop{source.finished=true;break;}
                if !source.started{let offset=(source.frame as f64-source.onset).max(0.);source.position+=offset*rate;source.body_position+=offset*combined_body_rate;source.started=true;self.starts+=1;}
                let strike=if now<strike_stop{interpolation(&bank.strike,source.position,false)}else{0.};let body=interpolation(&bank.body,source.body_position,true);
                *input+=(strike+body) as f32;source.position+=rate;source.body_position+=combined_body_rate;if !bank.body.is_empty(){source.body_position%=bank.body.len() as f64;}
                if (now+1>=strike_stop||source.position>=bank.strike.len() as f64)&&bank.body.is_empty(){source.finished=true;break;}
            }
        }
        let mut awake=[false;32];for(i,slot)in self.slots.iter().enumerate(){awake[i]=slot.awake;}let air=self.air.render(frame,&awake);
        self.peak=0.;
        for i in 0..Q{let now=(frame+i as u64) as f64;let mut filter_control=0.;for control in &self.controls{if control.wave.axis==1{filter_control+=control.at(now-self.control_origin,self.sr);}}
            let mut sum=0f32;for (index,slot) in self.slots.iter_mut().enumerate(){if !slot.awake{continue;}
                let amplitude=slot.gain.at(now) as f32;slot.last_gain=amplitude;let input=(signal[index][i]*2.5f32+air[index][i])*amplitude;
                let detune=slot.detune.at(now) as f32+filter_control as f32;slot.last_detune=detune;
                let hz=(slot.frequency.at(now).clamp(0.,self.sr/2.)*2f64.powf(detune as f64/1200.)).clamp(0.,self.sr/2.);
                let y=slot.filter.sample(input,slot.kind,hz,slot.q.at(now).max(0.),slot.filter_gain.at(now),self.sr);
                sum+=y*slot.volume.at(now) as f32;
            }self.output[i]=[sum,sum];self.peak=self.peak.max(sum.abs() as f64);
        }
        for slot in &mut self.slots{slot.filter.end_quantum();slot.history[(frame/Q as u64) as usize%128]=(frame+127,slot.last_gain); }self.frame=Some(frame+Q as u64);true
    }
    pub fn stat(&self,index:u32)->f64{match index{0=>self.sources.iter().filter(|s|s.id!=0&&!s.finished&&s.started).count() as f64,4=>self.frame.unwrap_or(0) as f64,5=>self.peak,8=>self.sources.iter().filter(|s|s.id!=0&&!s.finished&&!s.started).count() as f64,9=>self.banks.iter().filter(|b|b.is_some()).count() as f64,10=>self.bytes as f64,11=>self.rejected as f64,12=>self.starts as f64,13=>self.stops as f64,14=>self.late as f64,15=>self.skipped as f64,_=>0.}}
}
