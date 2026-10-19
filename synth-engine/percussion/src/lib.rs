//! Original percussion DSP. Model 0 ports the current kit's recipes; model 1
//! is an 808-inspired kit; model 2 is soft modal hand percussion. No samples or dependencies.
//! A fixed voice pool and bounded timestamp heap replace future audio nodes.
#![allow(static_mut_refs)]
use std::{cmp::Ordering, collections::BinaryHeap, f32::consts::PI};
const VOICES: usize = 64;
const EVENTS: usize = 8192;
const BLOCK: usize = 128;
const TABLE: usize = 4096;
const SWISH: [f32;33] = [0.000000000,0.030686902,0.086169503,0.156399791,0.236733376,0.323653165,0.414103073,0.505286698,0.594603558,0.679638621,0.758175197,0.828218107,0.888020556,0.936110876,0.971316819,0.992785792,1.000000000,0.992785792,0.971316819,0.936110876,0.888020556,0.828218107,0.758175197,0.679638621,0.594603558,0.505286698,0.414103073,0.323653165,0.236733376,0.156399791,0.086169503,0.030686902,0.000000000];
const GAINS: [f32;14] = [1.3,2.6,1.4,1.45,2.2,1.1,1.1,2.2,1.6,1.7,2.,1.5,1.2,2.];
const PANS: [f32;14] = [0.,-0.1,0.3,-0.25,0.2,-0.15,0.15,0.05,-0.3,0.25,-0.2,0.,0.,0.2];
fn clean(x:f32, fallback:f32)->f32 {if x.is_finite(){x}else{fallback}}
fn zap(x:f32)->f32 {if x.abs()<1e-20{0.}else{x}}

#[derive(Clone,Copy,Default)]
struct Filter { b:[f32;3], a:[f32;2], z:[f32;2] }
impl Filter {
 fn set(&mut self,kind:u8,hz:f32,q:f32,sr:f32){
  if kind==0 {self.b=[1.,0.,0.];self.a=[0.,0.];return;}
  let w=2.*PI*hz.clamp(10.,sr*0.49)/sr;
  let (s,c)=w.sin_cos();
  // Web Audio LP/HP use Q in dB; BP uses a linear Q.
  let alpha=s/(2.*if kind==3{q.max(0.01)}else{10f32.powf(q/20.)});
  let inv=1./(1.+alpha);
  self.b=match kind {1=>[(1.-c)*0.5,1.-c,(1.-c)*0.5],2=>[(1.+c)*0.5,-1.-c,(1.+c)*0.5],_=>[alpha,0.,-alpha]}.map(|v|v*inv);
  self.a=[-2.*c*inv,(1.-alpha)*inv];
 }
 fn tick(&mut self,x:f32)->f32 {let y=self.b[0]*x+self.z[0];self.z[0]=zap(self.b[1]*x-self.a[0]*y+self.z[1]);self.z[1]=zap(self.b[2]*x-self.a[1]*y);y}
}
#[derive(Clone,Copy,Default)]
struct Osc {phase:f32,step:f32,ratio:f32,end:f32,ramp:u32,wave:u8,band:usize,gain:f32}
impl Osc {
 fn new(hz:f32,to:f32,ramp:f32,wave:u8,sr:f32)->Self {
  let frames=(ramp*sr).round() as u32;
  let band=((hz.max(to)*2./sr*TABLE as f32).max(1.).log2().ceil() as usize).min(11);
  Self{phase:0.,step:hz/sr,end:to/sr,ramp:frames,ratio:if frames>0{(to/hz).powf(1./frames as f32)}else{1.},wave,band,gain:1.}
 }
 fn tick(&mut self,tables:&[Vec<f32>;3])->f32 {
  let table=&tables[self.wave as usize];let offset=if self.wave==0{0}else{self.band*(TABLE+1)};
  let x=self.phase*TABLE as f32;let i=x as usize;let f=x-i as f32;
  let out=table[offset+i]+(table[offset+i+1]-table[offset+i])*f;
  self.phase+=self.step;self.phase-=self.phase.floor();
  if self.ramp>0 {self.ramp-=1;self.step=if self.ramp==0{self.end}else{self.step*self.ratio};}
  out*self.gain
 }
}
#[derive(Clone,Copy,Default)]
struct Part {
 oscillators:[Osc;6],count:usize,noise:f32,noise_stop:u32,osc_stop:u32,
 filters:[Filter;2],peak:f32,attack:u32,end:u32,stop:u32,env:f32,mul:f32,
 shape:u8,clap_tail_mul:f32,
 sweep_kind:u8,sweep_q:f32,sweep_from:f32,sweep_to:f32,sweep_end:u32,sweep_exp:bool,
}
impl Part {
 fn new(peak:f32,attack:f32,decay:f32,stop:f32,sr:f32)->Self {
  let a=(attack*sr).round().max(1.) as u32;let d=(decay*sr).round().max(1.) as u32;
  Self{peak,attack:a,end:a+d,stop:(stop*sr).round() as u32,mul:(0.0001/peak.max(0.0001)).powf(1./d as f32),..Self::default()}
 }
 fn osc(&mut self,hz:f32,to:f32,ramp:f32,wave:u8,sr:f32){self.oscillators[self.count]=Osc::new(hz,to,ramp,wave,sr);self.count+=1;self.osc_stop=self.stop;}
 fn filter(&mut self,i:usize,kind:u8,hz:f32,q:f32,sr:f32){self.filters[i].set(kind,hz,q,sr);}
 fn tick(&mut self,age:u32,noise:f32,tables:&[Vec<f32>;3],sr:f32)->f32 {
  if age>=self.stop{return 0.;}
  if self.sweep_kind!=0 && age%16==0 {
   let t=(age as f32/self.sweep_end.max(1) as f32).min(1.);
   let hz=if self.sweep_exp{self.sweep_from*(self.sweep_to/self.sweep_from).powf(t)}else{self.sweep_from+(self.sweep_to-self.sweep_from)*t};
   self.filters[0].set(self.sweep_kind,hz,self.sweep_q,sr);
  }
  let mut x=if age<self.noise_stop{noise*self.noise}else{0.};
  if age<self.osc_stop{for osc in &mut self.oscillators[..self.count]{x+=osc.tick(tables);}}
  for f in &mut self.filters{x=f.tick(x);}
  let env=match self.shape {
   1=> { // The current swish's 33-point raised-sine automation curve.
    let t=(age as f32/self.end as f32*32.).min(32.);let i=t.floor();let f=t-i;
    let a=SWISH[i as usize];let b=SWISH[(i as usize+1).min(32)];
    self.peak*(a+(b-a)*f)
   },
   2=> {
    let s=age as f32/sr;
    if s<0.031 {let burst=(s/0.011).floor().min(2.);let local=s-burst*0.011;self.peak*0.15f32.powf((local/0.009).min(1.))}
    else {if age==(0.031*sr).ceil() as u32{self.env=self.peak*0.8;}else{self.env*=self.clap_tail_mul;}self.env.max(0.0001)}
   },
   _=> {if age<=self.attack{self.env=self.peak*age as f32/self.attack as f32;}else if age<=self.end{self.env*=self.mul;}else{self.env=0.0001;}self.env},
  };
  x*env
 }
}
#[derive(Clone,Copy,Default)]
struct Voice {parts:[Part;6],count:usize,age:u32,stop:u32,drum:usize,noise_offset:f64,serial:u64,fade:u32,fade_total:u32,swish:f32}
impl Voice {
 fn add(&mut self,p:Part){self.stop=self.stop.max(p.stop);self.parts[self.count]=p;self.count+=1;}
 fn fade(&mut self,n:u32){if self.fade==0||self.fade>n{self.fade=n;self.fade_total=n;}}
}
#[derive(Clone,Copy)]
struct Event {frame:u64,serial:u64,drum:usize,velocity:f32,vary:f32,duration:f32,tone:f32,decay:f32,hit:u32,model:u32,stop:bool}
impl PartialEq for Event{fn eq(&self,o:&Self)->bool{self.frame==o.frame&&self.serial==o.serial}}
impl Eq for Event{}
impl Ord for Event{fn cmp(&self,o:&Self)->Ordering{o.frame.cmp(&self.frame).then(o.serial.cmp(&self.serial))}}
impl PartialOrd for Event{fn partial_cmp(&self,o:&Self)->Option<Ordering>{Some(self.cmp(o))}}

struct Engine {
 sr:f32,frame:u64,voices:Vec<Voice>,queue:BinaryHeap<Event>,noise:Vec<f32>,tables:[Vec<f32>;3],
 levels:[f32;14],targets:[f32;14],tones:[f32;14],decays:[f32;14],voice_preset:u32,smooth:f32,pan:[[f32;2];14],serial:u64,steals:u32,dropped:u32,late:u32,peak_active:u32,
 // A short output residual prevents a discontinuity when the fixed pool steals.
 residual:[f32;2],last:[f32;2],residual_left:u32,
}
impl Engine {
 fn new(sr:f32)->Self {
  let mut state=0x2545f491u32;let noise=(0..(sr*2.).round() as usize).map(|_|{state^=state<<13;state^=state>>17;state^=state<<5;((state as f64/4294967296.)*2.-1.) as f32}).collect();
  let tables=std::array::from_fn(|wave|{
   let bands=if wave==0{1}else{12};let mut values=vec![0.;bands*(TABLE+1)];
   for band in 0..bands {let harmonics=(TABLE>>band).min(255);for i in 0..=TABLE {
    let p=2.*PI*i as f32/TABLE as f32;
    values[band*(TABLE+1)+i]=if wave==0{p.sin()}else{
     let mut y=0.;for n in (1..harmonics.max(2)).step_by(2){let k=n as f32;y+=(p*k).sin()*if wave==1{if n%4==1{1.}else{-1.}}else{1.}/if wave==1{k*k}else{k};}
     y*if wave==1{8./(PI*PI)}else{4./PI}
    };
   }}
   // Web Audio normalizes its square PeriodicWave once against the full
   // harmonic table, keeping that gain for the band-limited tables.
   if wave==2 {let peak=values[..TABLE+1].iter().fold(0f32,|a,v|a.max(v.abs()));for v in &mut values{*v/=peak;}}
   values
  });
  Self{sr,frame:0,voices:vec![Voice::default();VOICES],queue:BinaryHeap::with_capacity(EVENTS),noise,tables,levels:[1.;14],targets:[1.;14],tones:[0.;14],decays:[1.;14],voice_preset:0,smooth:1.-(-1./(0.02*sr)).exp(),pan:std::array::from_fn(|i|{let a=(PANS[i]+1.)*PI*0.25;[a.cos(),a.sin()]}),serial:0,steals:0,dropped:0,late:0,peak_active:0,residual:[0.;2],last:[0.;2],residual_left:0}
 }
 fn push(&mut self,mut e:Event)->bool {
  if self.queue.len()==EVENTS {
   self.dropped+=1;
   if !e.stop{return false;}
   // A stop must never be lost to a full hit queue. Replace the farthest
   // event, explicitly counted as dropped; retain the fixed allocation.
   let serial=self.queue.iter().max_by_key(|x|(x.frame,x.serial)).unwrap().serial;
   self.queue.retain(|x|x.serial!=serial);
  }
  if e.frame<self.frame{e.frame=self.frame;self.late+=1;}
  self.serial+=1;e.serial=self.serial;self.queue.push(e);true
 }
 fn start(&mut self,mut e:Event){
  if e.stop {for v in &mut self.voices{if v.count>0{v.fade((self.sr*0.02) as u32);}}return;}
  if self.voice_preset>0 {
   // Queued events stay semantic hit data; a new kit changes only attacks
   // which have not sounded yet, without rebuilding or shortening the queue.
   let slot=match e.drum{12=>0,11=>1,13=>4,n=>n};
   e.drum=match (self.voice_preset,slot){(2,0)=>12,(2,1)|(3,1)=>11,(2,4)=>13,(_,n)=>n};
   e.model=match self.voice_preset{3=>1,4=>2,_=>0};
   e.tone=self.tones[e.drum];e.decay=self.decays[e.drum];
   if self.targets[e.drum]<=0.{return;}
  }
  if e.velocity<=0.{return;}
  // Closed metallic hats choke the open metallic hat, with a 6 ms fade.
  if e.model==1&&(e.drum==4||e.drum==13){for v in &mut self.voices{if v.drum==5&&v.count>0{v.fade((self.sr*0.006) as u32);}}}
  let index=self.voices.iter().position(|v|v.count==0).unwrap_or_else(||{
   self.steals+=1;self.voices.iter().enumerate().min_by_key(|(_,v)|v.serial).unwrap().0
  });
  if self.voices[index].count>0 {
   // Capture this voice's current contribution, rather than jumping its output.
   let old=&mut self.voices[index];let n=self.noise[(old.noise_offset as usize+old.age as usize)%self.noise.len()];
   let mut value=0.;for p in &mut old.parts[..old.count]{value+=p.tick(old.age,n,&self.tables,self.sr);}
   for ch in 0..2{self.residual[ch]+=value*self.levels[old.drum]*self.pan[old.drum][ch];}self.residual_left=64;
  }
  self.voices[index]=recipe(e,self.sr);self.peak_active=self.peak_active.max(self.voices.iter().filter(|v|v.count>0).count() as u32);
 }
 fn tick(&mut self)->[f32;2]{
  while self.queue.peek().is_some_and(|e|e.frame<=self.frame){let e=self.queue.pop().unwrap();self.start(e);}
  for i in 0..14{self.levels[i]+=(self.targets[i]-self.levels[i])*self.smooth;}
  let mut out=[0.;2];
  for v in &mut self.voices {
   if v.count==0{continue;}
   let offset=v.noise_offset+v.age as f64;let ni=offset as usize%self.noise.len();let f=(offset-offset.floor()) as f32;
   let n=self.noise[ni]+(self.noise[(ni+1)%self.noise.len()]-self.noise[ni])*f;
   let mut value=0.;for p in &mut v.parts[..v.count]{value+=p.tick(v.age,n,&self.tables,self.sr);}
   let gain=self.levels[v.drum]*if v.fade>0{v.fade as f32/v.fade_total as f32}else{1.};
   if v.swish!=0. { // Mono panner followed by the kit's stereo panner.
    let pan=v.swish*(2.*(v.age as f32/v.parts[0].end as f32).min(1.)-1.);let a=(pan+1.)*PI*0.25;
    let (l,r)=(value*a.cos(),value*a.sin());let p=PANS[v.drum];
    if p<=0. {let a=(p+1.)*PI*0.5;out[0]+=(l+r*a.cos())*gain;out[1]+=r*a.sin()*gain;}
    else {let a=p*PI*0.5;out[0]+=l*a.cos()*gain;out[1]+=(r+l*a.sin())*gain;}
   }else{out[0]+=value*gain*self.pan[v.drum][0];out[1]+=value*gain*self.pan[v.drum][1];}
   v.age+=1;if v.fade>0{v.fade-=1;if v.fade==0{v.count=0;}}
   if v.age>=v.stop{v.count=0;}
  }
  if self.residual_left>0{for ch in 0..2{out[ch]+=self.residual[ch]*self.residual_left as f32/64.;}self.residual_left-=1;if self.residual_left==0{self.residual=[0.;2];}}
  self.frame+=1;self.last=out;out
 }
}
fn tone(v:&mut Voice,hz:f32,to:f32,ramp:f32,wave:u8,peak:f32,attack:f32,decay:f32,stop:f32,sr:f32){let mut p=Part::new(peak,attack,decay,stop,sr);p.osc(hz,to,ramp,wave,sr);for f in &mut p.filters{f.set(0,0.,0.,sr);}v.add(p);}
fn noise(v:&mut Voice,kind:u8,hz:f32,q:f32,peak:f32,attack:f32,decay:f32,stop:f32,sr:f32){let mut p=Part::new(peak,attack,decay,stop,sr);p.noise=1.;p.noise_stop=p.stop;p.filter(0,kind,hz,q,sr);p.filter(1,0,0.,0.,sr);v.add(p);}
fn recipe(e:Event,sr:f32)->Voice {
 let mut v=Voice{drum:e.drum,serial:e.serial,noise_offset:((e.hit as f64*0.137)%1.4)*sr as f64,..Voice::default()};
 let x=e.vary;let bright=2f32.powf(e.tone);let long=e.decay;let a=e.velocity*GAINS[e.drum];
 if e.model==1 {classic(&mut v,e,a,bright,long,sr);return v;}
 if e.model==2 {hand(&mut v,e,bright,long,sr);return v;}
 match e.drum {
  0|12=>{let punch=e.drum==12;let p=bright.powf(0.4)*(1.+if punch{0.06}else{0.08}*x);let d=if punch{0.24*long}else{0.34*long*(1.+0.15*x)};
   tone(&mut v,if punch{190.}else{120.}*p,if punch{52.}else{48.}*p,if punch{0.05}else{0.08},0,if punch{0.95}else{0.9}*a,if punch{0.002}else{0.004},d,d+0.05,sr);
   noise(&mut v,if punch{2}else{1},if punch{2500.}else{1200.}*bright,1.,if punch{0.22}else{0.12}*a,0.001,if punch{0.012}else{0.02},if punch{0.02}else{0.03},sr);
  },
  1=>{let d=0.18*long*(1.+0.25*x);noise(&mut v,3,3000.*bright*2f32.powf(0.35*x),0.7,0.35*a,0.004,d,d+0.05,sr);let f=190.*bright.powf(0.3)*(1.+0.05*x);tone(&mut v,f,f,0.,1,0.12*a,0.002,0.08*long,0.08*long+0.05,sr);},
  2|4=>{let shaker=e.drum==2;let d=if shaker{0.06*long*(1.+0.3*x)}else{0.045*long*(1.+0.4*x)};
   noise(&mut v,2,(if shaker{5000.}else{7000.}*bright*2f32.powf(if shaker{0.3}else{0.25}*x)).min(16000.),1.,if shaker{0.2}else{0.13}*a,if shaker{0.012*(1.+0.5*x)}else{0.001},d,d+if shaker{0.04}else{0.03},sr);
  },
  3=>{let p=bright.powf(0.5)*(1.+0.03*x);for (f,g) in [(1100.,0.28),(1750.,0.1)]{tone(&mut v,f*p,f*p,0.,0,g*a,0.001,0.05*long,0.05*long+0.04,sr);}},
  5=>{let d=(e.duration*0.95).clamp(0.3,4.)*long;let dir=if x>=0.{1.}else{-1.};noise(&mut v,3,2600.*bright*(1.-0.1*dir),0.35,0.12*a,0.001,d,d+0.05,sr);
   let p=&mut v.parts[0];p.shape=1;p.end=(d*sr).round() as u32;p.filter(1,1,(6000.*bright).min(16000.),1.,sr);p.sweep_kind=3;p.sweep_q=0.35;p.sweep_from=2600.*bright*(1.-0.1*dir);p.sweep_to=2600.*bright*(1.+0.1*dir);p.sweep_end=p.end;v.swish=0.35*dir;
  },
  6=>{let f=105.*bright.powf(0.3)*2f32.powf(0.5*x);let d=0.32*long;tone(&mut v,1.5*f,f,0.05,0,0.75*a,0.004,d,d+0.05,sr);noise(&mut v,1,900.*bright,1.,0.1*a,0.001,0.03,0.05,sr);},
  7=>{let d=0.13*long*(1.+0.2*x);noise(&mut v,3,1400.*bright*2f32.powf(0.25*x),0.9,0.3*a,0.001,d,d+0.08,sr);let p=&mut v.parts[0];p.shape=2;p.clap_tail_mul=(0.0001/(p.peak*0.8).max(0.0001)).powf(1./(d*sr));},
  8|9=>{let crash=e.drum==9;let d=if crash{2.2}else{0.7}*long*(1.+0.2*x);noise(&mut v,3,(if crash{6500.}else{7500.}*bright*2f32.powf(0.2*x)).min(15000.),if crash{0.5}else{0.6},if crash{0.1}else{0.09}*a,if crash{0.012}else{0.002},d,d+if crash{0.1}else{0.05},sr);
   if crash{let p=&mut v.parts[0];p.sweep_kind=3;p.sweep_q=0.5;p.sweep_from=(6500.*bright*2f32.powf(0.2*x)).min(15000.);p.sweep_to=(3500.*bright).min(15000.);p.sweep_end=(d*sr) as u32;p.sweep_exp=true;}
   let frequencies=if crash{&[2300.,3410.,4870.,6260.][..]}else{&[3150.,4420.,5890.][..]};for f in frequencies{let hz=f*bright.powf(0.3)*(1.+0.02*x);tone(&mut v,hz,hz,0.,0,if crash{0.01}else{0.012}*a,if crash{0.01}else{0.002},d*if crash{0.7}else{0.8},d+if crash{0.1}else{0.05},sr);}
  },
  10=>{let p=bright.powf(0.5)*2f32.powf(0.15*x);let d=0.9*long;for (ratio,g,l) in [(1.,0.1,1.),(1.504,0.06,0.7),(2.46,0.04,0.45),(3.62,0.02,0.3)]{let f=1650.*ratio*p;tone(&mut v,f,f,0.,0,g*a,0.001,d*l,d*l+0.05,sr);}noise(&mut v,2,(6000.*bright).min(16000.),1.,0.04*a,0.001,0.03,0.05,sr);},
  11=>{let p=bright.powf(0.3)*(1.+0.05*x);tone(&mut v,260.*p,175.*p,0.05,1,0.32*a,0.001,0.09*long,0.09*long+0.05,sr);let d=0.17*long*(1.+0.2*x);noise(&mut v,2,(1800.*bright*2f32.powf(0.25*x)).min(12000.),1.,0.32*a,0.001,d,d+0.05,sr);},
  13=>{let d=0.06*long*(1.+0.4*x);noise(&mut v,2,(8500.*bright*2f32.powf(0.2*x)).min(16000.),1.,0.1*a,0.001,d,d+0.05,sr);let p=&mut v.parts[0];p.noise_stop=((d+0.03)*sr).round() as u32;for f in [2000.,3010.,4530.,5740.]{p.osc(f*bright.powf(0.3),f*bright.powf(0.3),0.,2,sr);}},
  _=>{},
 }v
}
fn classic(v:&mut Voice,e:Event,a:f32,b:f32,l:f32,sr:f32){
 let pitch=b.powf(0.35)*(1.+0.025*e.vary);
 match e.drum {
  0|12=>{let punch=e.drum==12;let d=if punch{0.38}else{0.85}*l;tone(v,if punch{175.}else{135.}*pitch,if punch{53.}else{49.}*pitch,0.045,0,0.9*a,0.002,d,d+0.03,sr);noise(v,1,1500.*b,1.,0.045*a,0.001,0.012,0.025,sr);},
  1|11=>{let d=if e.drum==1{0.18}else{0.25}*l;for (f,g) in [(180.,0.19),(330.,0.09)]{tone(v,f*pitch,f*pitch,0.,0,g*a,0.001,0.12*l,0.12*l+0.02,sr);}noise(v,2,1500.*b,0.,0.24*a,0.002,d,d+0.03,sr);},
  3=>{for (f,g) in [(480.,0.18),(800.,0.12),(1200.,0.06)]{tone(v,f*pitch,f*pitch,0.,0,g*a,0.001,0.045*l,0.045*l+0.02,sr);}},
  6=>{let f=115.*pitch*2f32.powf(0.5*e.vary);tone(v,f*1.25,f,0.04,0,0.7*a,0.002,0.45*l,0.45*l+0.03,sr);noise(v,1,1100.*b,0.,0.05*a,0.001,0.07*l,0.07*l+0.02,sr);},
  10=>{let mut p=Part::new(0.18*a,0.002,0.42*l,0.42*l+0.03,sr);p.filter(0,3,1500.*b,0.7,sr);p.filter(1,1,6500.*b,0.,sr);for f in [540.,800.]{p.osc(f*pitch,f*pitch,0.,2,sr);}v.add(p);},
  7=>{noise(v,3,1200.*b,0.7,0.32*a,0.001,0.22*l,0.22*l+0.08,sr);let p=&mut v.parts[0];p.shape=2;p.clap_tail_mul=(0.0001/(p.peak*0.8).max(0.0001)).powf(1./(0.22*l*sr));},
  2=>{noise(v,2,5500.*b,0.,0.18*a,0.006,0.07*l,0.07*l+0.02,sr);},
  _=>{ // Six free-running inharmonic square tones into a metallic BP/HP path.
   let d=match e.drum{5=>0.6,8=>0.85,9=>1.8,13=>0.08,_=>0.055}*l;
   let gain=match e.drum{5=>0.055,8=>0.05,9=>0.045,_=>0.055};
   let mut p=Part::new(gain*a,0.001,d,d+0.03,sr);p.filter(0,3,8500.*b,0.7,sr);p.filter(1,2,5000.*b,0.,sr);
   for (i,f) in [205.3,304.4,369.6,522.7,540.5,800.].iter().enumerate(){p.osc(f*b.powf(0.2),f*b.powf(0.2),0.,2,sr);p.oscillators[i].phase=((e.hit as f32*0.173+i as f32*0.137)%1.).abs();}
   v.add(p);
  }
 }
}
// Modal membranes and wood, with a quiet noise contact rather than a hard
// impulse. Calibrate this independent palette against the heard energy of
// the felt roles; its shorter modal bodies otherwise disappear in an ensemble.
// These are source gains, before the existing whole-kit balance and expression.
const HAND_GAINS:[f32;11]=[2.4,1.15,2.5,1.8,1.8,3.,2.4,2.5,3.,3.,3.];
fn hand(v:&mut Voice,e:Event,b:f32,l:f32,sr:f32){
 let pitch=b.powf(0.22)*(1.+0.025*e.vary);
 let drum=match e.drum{12=>0,11=>1,13=>4,n=>n};
 let vel=e.velocity*HAND_GAINS[drum];
 match drum {
  0|1|6=>{
   let (f,d,g)=match drum{0=>(155.,0.29,0.53),1=>(215.,0.105,0.44),_=>(320.,0.16,0.42)};
   let d=d*l*(1.+0.08*e.vary);
   for (ratio,level,decay) in [(1.,1.,1.),(1.593,0.3,0.55),(2.136,0.11,0.32)]{
    tone(v,f*ratio*pitch*1.04,f*ratio*pitch,0.018,0,g*vel*level,0.003,d*decay,d*decay+0.035,sr);
   }
   noise(v,1,if drum==1{2200.}else{1400.}*b,0.,0.035*vel,0.002,0.018,0.04,sr);
  },
  3|10=>{
   let f=if drum==3{620.}else{1120.}*pitch;let d=if drum==3{0.065}else{0.045}*l;
   for (ratio,g,tail) in [(1.,0.3,1.),(1.48,0.1,0.55)]{tone(v,f*ratio,f*ratio,0.,0,g*vel,0.002,d*tail,d*tail+0.025,sr);}
   noise(v,1,2400.*b,0.,0.025*vel,0.001,0.012,0.025,sr);
  },
  2|8=>{
   let cabasa=drum==8;let d=if cabasa{0.12}else{0.065}*l;
   noise(v,3,if cabasa{2700.}else{4200.}*b,0.65,if cabasa{0.23}else{0.27}*vel,if cabasa{0.009}else{0.007},d,d+0.04,sr);
   v.parts[0].filter(1,1,(7000.*b).min(15000.),0.,sr);
  },
  4|5=>{
   let d=if drum==4{0.15}else{0.42}*l;
   // Inharmonic sine clusters avoid the hard square-wave attack of the 808.
   let mut p=Part::new(if drum==4{0.04}else{0.032}*vel,if drum==4{0.004}else{0.012},d,d+0.04,sr);
   for f in [1860.,2470.,3320.,4190.,5170.,6030.]{p.osc(f*b.powf(0.18),f*b.powf(0.18),0.,0,sr);}
   p.filter(0,1,(5800.*b).min(16000.),0.,sr);p.filter(1,0,0.,0.,sr);v.add(p);
   noise(v,3,3500.*b,0.6,0.055*vel,0.005,d*0.65,d+0.04,sr);
  },
  7=>{
   noise(v,3,1300.*b,0.65,0.35*vel,0.003,0.11*l,0.11*l+0.07,sr);
   let p=&mut v.parts[0];p.shape=2;p.clap_tail_mul=(0.0001/(p.peak*0.8).max(0.0001)).powf(1./(0.11*l*sr));p.filter(1,1,(4000.*b).min(16000.),0.,sr);
  },
  9=>{
   let d=(e.duration*0.95).clamp(0.45,2.5)*l;
   noise(v,3,2400.*b,0.45,0.15*vel,0.01,d,d+0.04,sr);
   let p=&mut v.parts[0];p.shape=1;p.end=(d*sr).round() as u32;p.filter(1,1,(5500.*b).min(16000.),0.,sr);
  },
  _=>{},
 }
}
static mut ENGINE:Option<Box<Engine>>=None;
static mut OUTPUT:[f32;BLOCK*2]=[0.;BLOCK*2];
#[no_mangle]pub extern "C" fn init(rate:f32){unsafe{ENGINE=Some(Box::new(Engine::new(clean(rate,48000.).clamp(8000.,192000.))));}}
#[no_mangle]pub extern "C" fn output_ptr()->*const f32{unsafe{OUTPUT.as_ptr()}}
#[no_mangle]pub extern "C" fn set_frame(frame:f64){unsafe{if let Some(e)=ENGINE.as_mut(){if frame.is_finite()&&frame>=e.frame as f64{e.frame=frame as u64;}}}}
#[no_mangle]pub extern "C" fn level(drum:u32,value:f32){unsafe{if let Some(e)=ENGINE.as_mut(){if drum<14{e.targets[drum as usize]=clean(value,0.).clamp(0.,2.);}}}}
#[no_mangle]pub extern "C" fn voice_preset(value:u32){unsafe{if let Some(e)=ENGINE.as_mut(){e.voice_preset=value.min(4);}}}
#[no_mangle]pub extern "C" fn tone_param(drum:u32,value:f32){unsafe{if let Some(e)=ENGINE.as_mut(){if drum<14{e.tones[drum as usize]=clean(value,0.).clamp(-1.,1.);}}}}
#[no_mangle]pub extern "C" fn decay_param(drum:u32,value:f32){unsafe{if let Some(e)=ENGINE.as_mut(){if drum<14{e.decays[drum as usize]=clean(value,1.).clamp(0.5,2.);}}}}
#[no_mangle]pub extern "C" fn hit(drum:u32,frame:f64,duration:f32,velocity:f32,vary:f32,tone:f32,decay:f32,hit:u32,model:u32)->u32{
 unsafe{if let Some(e)=ENGINE.as_mut(){if drum>=14||!frame.is_finite()||frame<0.||frame>9007199254740991.{return 0;}
  return e.push(Event{frame:frame as u64,serial:0,drum:drum as usize,velocity:clean(velocity,0.).clamp(0.,1.),vary:clean(vary,0.).clamp(-1.,1.),duration:clean(duration,0.25).clamp(0.,30.),tone:clean(tone,0.).clamp(-1.,1.),decay:clean(decay,1.).clamp(0.5,2.),hit,model:model.min(2),stop:false}) as u32;
 }}0
}
#[no_mangle]pub extern "C" fn silence(frame:f64){unsafe{if let Some(e)=ENGINE.as_mut(){if !frame.is_finite(){return;}let at=(frame.max(e.frame as f64)) as u64;
 e.queue.retain(|event|event.frame<at);e.push(Event{frame:at,serial:0,drum:0,velocity:0.,vary:0.,duration:0.,tone:0.,decay:1.,hit:0,model:0,stop:true});
}}}
#[no_mangle]pub extern "C" fn clear(){unsafe{if let Some(e)=ENGINE.as_mut(){e.queue.clear();e.voices.fill(Voice::default());e.residual=[0.;2];e.residual_left=0;}}}
#[no_mangle]pub extern "C" fn process(frames:u32){unsafe{if let Some(e)=ENGINE.as_mut(){for i in 0..(frames as usize).min(BLOCK){let out=e.tick();OUTPUT[i]=out[0];OUTPUT[BLOCK+i]=out[1];}}}}
#[no_mangle]pub extern "C" fn stat(which:u32)->f64{unsafe{if let Some(e)=ENGINE.as_ref(){return match which{0=>e.voices.iter().filter(|v|v.count>0).count() as f64,1=>e.queue.len() as f64,2=>e.steals as f64,3=>e.dropped as f64,4=>e.late as f64,5=>e.frame as f64,6=>e.peak_active as f64,_=>0.};}}0.}
