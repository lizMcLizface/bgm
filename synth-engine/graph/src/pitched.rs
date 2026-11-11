//! Prepared block-capable composites. No allocation or reclamation in render/cancel/reset.
use super::{Error, Result, MAX_FRAME};
const MAX_POINTS: usize = 65_536;
#[derive(Clone, Copy)]
pub struct Setting { pub scope: u32, pub index: u32, pub value: f64 }
#[derive(Clone, Copy)]
struct Point { frame: u64, setting: Setting, extra: f32 }
enum Dsp { Core(Box<calmbgm_core::Engine>), Fm(Box<calmbgm_fm::Engine>) }
pub struct Pitched {
    dsp: Dsp, sr: f32, fm: bool, base: Vec<Setting>, points: Vec<Point>, gains: Vec<Point>,
    next: usize, next_gain: usize, gain: f64, owners: Vec<(u32,u32)>,
    performance: (u32,f32,bool), pub ready: bool, peak_active: f64,
}
impl Pitched {
    pub fn new(fm: bool, sr: f32) -> Self {
        Self { dsp: if fm {Dsp::Fm(Box::new(calmbgm_fm::Engine::prepared(sr)))} else {Dsp::Core(Box::new(calmbgm_core::Engine::prepared(sr)))},
            sr,fm,base:Vec::new(),points:Vec::new(),gains:Vec::new(),next:0,next_gain:0,gain:1.,owners:Vec::with_capacity(4096),performance:(0,0.,false),ready:false,peak_active:0. }
    }
    fn valid(&self, s: Setting) -> bool {
        s.value.is_finite() && (s.value as f32).is_finite() && if self.fm { match s.scope {
            0=>s.index<60,1=>s.index/32<8&&s.index%32<22,2=>s.index<64&&(s.index/8<s.index%8||s.value==0.),3=>s.index<8,_=>false
        }} else { s.scope<=2 && s.index<if s.scope==0 {12} else {116} }
    }
    fn apply(&mut self, s: Setting) {
        let v=s.value as f32; match &mut self.dsp {
            Dsp::Core(e)=>e.param(s.scope,s.index as usize,v),
            Dsp::Fm(e)=>match s.scope {0=>e.param(s.index as usize,v),1=>e.op((s.index/32)as usize,(s.index%32)as usize,v),2=>e.route((s.index/8)as usize,(s.index%8)as usize,v),3=>e.carrier(s.index as usize,v),_=>{}}
        }
    }
    pub fn configure(&mut self, s: Setting) -> Result<()> {
        if !self.valid(s)||self.base.len()>=512||self.base.iter().any(|p|p.scope==s.scope&&p.index==s.index){return Err(Error::Contract);}
        self.apply(s);self.base.push(s);Ok(())
    }
    pub fn set_performance(&mut self, mode:u32,portamento:f32,always:bool)->Result<()> {
        if mode>2||!portamento.is_finite()||!(0. ..=3.).contains(&portamento){return Err(Error::Bounds);}
        self.performance=(mode,portamento,always);match &mut self.dsp {Dsp::Core(e)=>e.performance(mode,portamento,always),Dsp::Fm(e)=>e.performance(mode,portamento,always)};self.ready=true;Ok(())
    }
    pub fn point(&mut self,frame:u64,s:Setting,extra:f32)->Result<()> {
        if frame>MAX_FRAME||self.points.len()+self.gains.len()>=MAX_POINTS{return Err(Error::Bounds);}
        let special=match s.scope {4=>s.index<=2&&s.value.is_finite()&&(0. ..=3.).contains(&s.value)&&[0.,1.].contains(&extra)&&self.points.iter().filter(|p|p.setting.scope==4).count()<32,5=>s.value.is_finite()&&(0. ..=1.).contains(&s.value),6=>s.value==0.,_=>self.valid(s)};
        if !special{return Err(Error::Contract);}let list=if s.scope==5 {&mut self.gains}else{&mut self.points};
        if list.last().is_some_and(|p|p.frame>frame){return Err(Error::Frame);}list.push(Point{frame,setting:s,extra});Ok(())
    }
    pub fn conflict(&self,id:u32,owner:u32)->bool { id!=0&&self.owners.iter().any(|&(n,o)|n==id&&o!=owner) }
    pub fn note(&mut self,k:u32,id:u32,owner:u32,frame:u64,a:f32,b:f32)->Result<()> {
        if k==0&&!self.owners.iter().any(|&(n,_)|n==id) {if self.owners.len()==4096{return Err(Error::QueueFull);}self.owners.push((id,owner));}
        let ok=match &mut self.dsp {Dsp::Core(e)=>e.enqueue(k,id,frame as f64,a,b),Dsp::Fm(e)=>e.enqueue(k,id,frame as f64,a,b)!=0};
        if ok {Ok(())}else{Err(Error::QueueFull)}
    }
    pub fn cancel(&mut self,owner:u32) {
        for &(id,o) in &self.owners {if o==owner {match &mut self.dsp {Dsp::Core(e)=>e.cancel_note(id),Dsp::Fm(e)=>e.cancel_note(id)}}}
        self.owners.retain(|&(_,o)|o!=owner);
    }
    pub fn panic(&mut self) {match &mut self.dsp {Dsp::Core(e)=>e.panic(),Dsp::Fm(e)=>e.panic()};self.owners.clear();self.next=self.points.len();self.next_gain=self.gains.len();self.gain=1.;}
    pub fn reset(&mut self) {
        match &mut self.dsp {Dsp::Core(e)=>e.init(self.sr),Dsp::Fm(e)=>e.init(self.sr)};
        for i in 0..self.base.len(){self.apply(self.base[i]);}let (m,p,a)=self.performance;
        match &mut self.dsp {Dsp::Core(e)=>e.performance(m,p,a),Dsp::Fm(e)=>e.performance(m,p,a)};
        self.next=0;self.next_gain=0;self.gain=1.;self.owners.clear();self.peak_active=0.;
    }
    pub fn stat(&self,index:u32)->f64 {if index==7{return self.peak_active;}if index==6&&!self.fm{return 0.;}match &self.dsp {Dsp::Core(e)=>e.stat(index),Dsp::Fm(e)=>e.stat(index)}}
    pub fn latency_changes(&self)->bool {self.fm&&self.points.iter().filter(|p|p.setting.scope==0&&p.setting.index==4).any(|p|self.base.iter().find(|s|s.scope==0&&s.index==4).is_none_or(|s|s.value as f32!=p.setting.value as f32))}
    pub fn render(&mut self,frame:u64,out:&mut [[f32;2]])->Result<()> {
        let mut at=0;while at<out.len(){let now=frame+at as u64;
            while self.next<self.points.len()&&self.points[self.next].frame<=now {
                let p=self.points[self.next];self.next+=1;
                if p.setting.scope==4 {self.note(6,p.setting.index,0,now,p.setting.value as f32,p.extra)?;}else if p.setting.scope!=6 {self.apply(p.setting);}
            }
            let n=(out.len()-at).min(self.points.get(self.next).map_or(usize::MAX,|p|(p.frame-now)as usize));
            match &mut self.dsp {Dsp::Core(e)=>e.render(n),Dsp::Fm(e)=>e.render(n)};
            for i in 0..n {while self.next_gain<self.gains.len()&&self.gains[self.next_gain].frame<=now+i as u64 {self.gain=self.gains[self.next_gain].setting.value;self.next_gain+=1;}
                let (l,r)=match &self.dsp {Dsp::Core(e)=>(e.output(0)[i],e.output(1)[i]),Dsp::Fm(e)=>(e.output(0)[i],e.output(1)[i])};out[at+i]=[(l as f64*self.gain)as f32,(r as f64*self.gain)as f32];
            }
            self.peak_active=self.peak_active.max(self.stat(0));at+=n;
        }
        let dsp=&self.dsp;self.owners.retain(|&(id,_)|match dsp {Dsp::Core(e)=>e.has_note(id),Dsp::Fm(e)=>e.has_note(id)});Ok(())
    }
}
