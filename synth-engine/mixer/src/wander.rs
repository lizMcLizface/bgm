//! Original RoleWander pan/level stage and bounded owned slow-signal state.
//! Oscillator phase freezes only when disconnected by mode; zero depth stays pulled.
use crate::native_target::Gain;
use std::f64::consts::TAU;
const BLOCK:usize=2048; const BUSES:usize=5; const EVENTS:usize=64;
#[derive(Clone,Copy)]
pub struct Settings{mode:u32,on:bool,period:f64,min:f64,max:f64,volume:f64}
impl Settings{
 fn parse(mode:u32,on:u32,period:f64,min:f64,max:f64,volume:f64)->Option<Self>{
  if mode>1||on>1||![period,min,max,volume].iter().all(|v|v.is_finite())||!(15. ..=300.).contains(&period)||!(-1. ..=1.).contains(&min)||!(-1. ..=1.).contains(&max)||min>max||!(0. ..=0.6).contains(&volume){return None;}
  Some(Self{mode,on:on!=0,period,min,max,volume})
 }
 fn home()->Self{Self{mode:0,on:true,period:60.,min:-0.6,max:0.6,volume:0.12}}
}
fn fraction(v:f64)->f64{v-v.floor()}
fn period(base:f64,slot:usize)->f64{base*(0.85+0.3*fraction(slot as f64*0.381966+0.43))}
#[derive(Clone,Copy)]
struct Walk{state:u32,draws:u64,last:f64,last_index:u64,values:[f64;128],decay:f64,bootstrap:f64,offset:f64,birth:u64,initial_index:u64,initial:f32,refill:f64,offline:bool}
impl Walk{
 fn random(&mut self)->f64{self.state=self.state.wrapping_add(0x6d2b79f5);let mut t=(self.state^(self.state>>15)).wrapping_mul(self.state|1);t^=t.wrapping_add((t^(t>>7)).wrapping_mul(t|61));self.draws+=1;((t^(t>>14))as f64)/4294967296.}
 fn normal(&mut self,sd:f64)->f64{if sd==0.{return 0.;}let u=self.random().max(1e-12);let z=(-2.*u.ln()).sqrt()*(TAU*self.random()).cos();z.clamp(-3.,3.)*sd}
 fn set_period(&mut self,p:f64){self.decay=(-2./(p/4.).max(2.)).exp();}
 fn ensure(&mut self,index:u64){let d=if self.offline{self.bootstrap}else{self.decay};let sigma=0.4*(1.-d*d).sqrt();while self.last_index<index{let x=self.last*d+self.normal(sigma);let y=(((x+1.)%4.)+4.)%4.;self.last=(if y<=2.{y}else{4.-y})-1.;self.last_index+=1;self.values[self.last_index as usize%128]=self.last;}}
 fn new(seed:u32,p:f64,offset:f64,birth:u64,offline:bool)->Self{
  let decay=(-2./(p/4.).max(2.)).exp();let mut w=Self{state:seed,draws:0,last:0.,last_index:0,values:[0.;128],decay,bootstrap:decay,offset,birth,initial_index:(offset/2.).floor()as u64,initial:0.,refill:15.,offline};
  w.last=w.normal(0.4);w.values[0]=w.last;w.ensure(w.initial_index+1);let f=offset/2.-w.initial_index as f64;w.initial=(w.values[w.initial_index as usize%128]*(1.-f)+w.values[(w.initial_index+1)as usize%128]*f)as f32;
  if !offline{w.ensure(((offset+90.)/2.).floor()as u64);}w
 }
 fn at(&mut self,frame:u64,rate:f64)->f32{
  let t=(frame-self.birth)as f64/rate;
  if !self.offline&&t>=self.refill{while t>=self.refill{self.ensure(((self.offset+self.refill+90.)/2.).floor()as u64);self.refill+=15.;}}
  let x=(self.offset+t)/2.;let index=x.floor()as u64;self.ensure(index+1);
  let b=self.values[(index+1)as usize%128]as f32;
  if index==self.initial_index{let duration=2.*(index+1)as f64-self.offset;let f=if duration>0.{t/duration}else{0.};(self.initial as f64+(b-self.initial)as f64*f)as f32}
  else{let a=self.values[index as usize%128]as f32;(a as f64+(b-a)as f64*(x-index as f64))as f32}
 }
}
struct Sine{table:Vec<f32>,index:f64,scale:f32}
impl Sine{
 fn new(rate:f64,phase:f64)->Self{let size=if rate<=24000.{2048}else if rate<=88200.{4096}else{16384};let a=(TAU*fraction(phase)).sin()as f32;let b=(TAU*fraction(phase)).cos()as f32;let table=(0..size).map(|i|{let t=TAU*i as f64/size as f64;(a as f64*t.cos()+b as f64*t.sin())as f32}).collect();Self{table,index:0.,scale:size as f32/rate as f32}}
 fn sample(&self,index:isize)->f64{self.table[index as usize&(self.table.len()-1)]as f64}
 fn tick(&mut self,frequency:f32)->f32{let a=self.index as isize;let t=self.index-a as f64;let t2=t*t;let weights=[t*(t2-1.)*(t-2.)/24.,-t*(t-1.)*(t2-4.)/6.,(t2-1.)*(t2-4.)/4.,-t*(t+1.)*(t2-4.)/6.,t*(t2-1.)*(t+2.)/24.];let mut out=0.;for i in 0..5{out+=weights[i]*self.sample(a+i as isize-2);}self.index+=(frequency*self.scale)as f64;if self.index>=self.table.len()as f64{self.index-=self.table.len()as f64;}out as f32}
}
struct Wave{mode:u32,period:f64,sine:Sine,walk:Option<Walk>}
impl Wave{
 fn new(rate:f64,phase:f64)->Self{Self{mode:0,period:60.,sine:Sine::new(rate,phase),walk:None}}
 fn apply(&mut self,mode:u32,p:f64,prepared:Option<Walk>){if self.walk.is_none(){self.walk=prepared;}self.mode=mode;self.period=p;if let Some(w)=&mut self.walk{w.set_period(p);}}
 fn tick(&mut self,frame:u64,rate:f64)->f32{let walk=self.walk.as_mut().map(|w|w.at(frame,rate));if self.mode==0{self.sine.tick((1./self.period)as f32)}else{walk.unwrap_or(0.)}}
 fn reset(&mut self){self.mode=0;self.period=60.;self.sine.index=0.;self.walk=None;}
}
#[derive(Clone,Copy)]struct Event{frame:u64,settings:Settings,walks:Option<[Walk;2]>}
pub struct Engine{
 rate:f64,role:usize,buses:usize,offset:f64,smooth:bool,offline:bool,base:Settings,current:Settings,frame:u64,ready:bool,failed:bool,rejected:u64,peak:f64,
 wave:[Wave;2],gain:[Gain;3],raw:Vec<(u64,Settings)>,captured:Vec<Event>,events:Vec<Event>,head:usize,initial_walks:Option<[Walk;2]>,
 input:[[[f32;BLOCK];2];BUSES],output:[[[f32;BLOCK];2];BUSES],controls:[[f32;BLOCK];2],
}
impl Engine{
 pub fn new(rate:f64,role:usize,buses:usize,offset:f64,smooth:bool,offline:bool)->Option<Box<Self>>{
  if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||role>=6||!(1..=BUSES).contains(&buses)||!offset.is_finite()||!(0. ..=1_000_000.).contains(&offset){return None;}
  let wave=std::array::from_fn(|kind|Wave::new(rate,fraction((role*4+kind)as f64*0.618034+0.17)+offset/60.));
  Some(Box::new(Self{rate,role,buses,offset,smooth,offline,base:Settings::home(),current:Settings::home(),frame:0,ready:false,failed:false,rejected:0,peak:0.,wave,gain:std::array::from_fn(|_|Gain::prepared(rate,0.,0.4).unwrap()),raw:Vec::with_capacity(EVENTS),captured:Vec::with_capacity(EVENTS),events:Vec::with_capacity(EVENTS),head:0,initial_walks:None,input:[[[0.;BLOCK];2];BUSES],output:[[[0.;BLOCK];2];BUSES],controls:[[0.;BLOCK];2]}))
 }
 fn walks(&self,previous:Settings,birth:u64,constructor:bool)->[Walk;2]{std::array::from_fn(|kind|Walk::new(7919+(self.role*4+kind)as u32*131,if constructor{60.}else{period(previous.period,self.role*4+kind)},self.offset,birth,self.offline))}
 fn apply(&mut self,e:Event){self.current=e.settings;for k in 0..2{self.wave[k].apply(e.settings.mode,period(e.settings.period,self.role*4+k),e.walks.map(|v|v[k]));}let c=e.settings;let targets=[if c.on{(c.min+c.max)/2.}else{0.},if c.on{(c.max-c.min)/2.}else{0.},if c.on{c.volume}else{0.}];for(i,value)in targets.into_iter().enumerate(){if self.smooth{let ok=self.gain[i].schedule(e.frame as f64/self.rate,value,e.frame);debug_assert!(ok);}else{self.gain[i].force(value);}}}
 fn prepare(&mut self)->bool{if self.ready{return false;}self.initial_walks=if self.base.mode==1{Some(self.walks(self.base,0,true))}else{None};let mut seen=self.base.mode==1;let mut previous=self.base;for &(frame,settings) in &self.raw{let walks=if settings.mode==1&&!seen{seen=true;Some(self.walks(previous,frame,false))}else{None};self.captured.push(Event{frame,settings,walks});previous=settings;}self.events.extend_from_slice(&self.captured);self.ready=true;self.apply(Event{frame:0,settings:self.base,walks:self.initial_walks});true}
 fn enqueue(&mut self,frame:u64,settings:Settings)->bool{
  if !self.ready||frame%128!=0||frame<self.frame.div_ceil(128)*128||frame>9007199254740864{self.rejected+=1;return false;}
  let replace=self.events.last().is_some_and(|e|e.frame==frame)&&self.events.len()>self.head;let end=self.events.len()-usize::from(replace);
  if self.events.get(end.wrapping_sub(1)).is_some_and(|e|e.frame>frame)||end-self.head>=EVENTS{self.rejected+=1;return false;}
  let previous=self.events.get(end.wrapping_sub(1)).map_or(self.current,|e|e.settings);let seen=self.wave[0].walk.is_some()||self.events[self.head..end].iter().any(|e|e.settings.mode==1);
  let walks=if settings.mode==1&&!seen{Some(self.walks(previous,frame,false))}else{None};let event=Event{frame,settings,walks};
  if replace{*self.events.last_mut().unwrap()=event;}else{if self.head>0{self.events.drain(..self.head);self.head=0;}self.events.push(event);}true
 }
 fn render(&mut self,n:usize,mono_mask:u32)->bool{
  if !self.ready||self.failed||n>BLOCK||mono_mask>=(1<<self.buses)||self.frame+n as u64>9007199254740864{return false;}
  if (0..self.buses).any(|b|(0..if mono_mask&(1<<b)==0{2}else{1}).any(|c|self.input[b][c][..n].iter().any(|x|!x.is_finite()))){return false;}
  self.peak=0.;for i in 0..n{while self.head<self.events.len()&&self.events[self.head].frame<=self.frame{let e=self.events[self.head];self.head+=1;self.apply(e);}let pan_wave=self.wave[0].tick(self.frame,self.rate);let volume_wave=self.wave[1].tick(self.frame,self.rate);let pan=self.gain[0].tick(self.frame)+pan_wave*self.gain[1].tick(self.frame);let gain=1f32+volume_wave*self.gain[2].tick(self.frame);self.controls[0][i]=gain;self.controls[1][i]=pan;let sides=[balance(-1.,pan),balance(1.,pan)];for b in 0..self.buses{for c in 0..2{let input=if c==1&&mono_mask&(1<<b)!=0{0.}else{self.input[b][c][i]};let out=(input*gain)*sides[c];if !out.is_finite(){self.failed=true;return false;}self.output[b][c][i]=out;self.peak=self.peak.max(out.abs()as f64);}}self.frame+=1;}true
 }
 fn reset(&mut self){self.frame=0;self.failed=false;self.rejected=0;self.peak=0.;self.head=0;self.events.clear();self.events.extend_from_slice(&self.captured);for w in &mut self.wave{w.reset();}for g in &mut self.gain{g.force(0.);}self.input.fill([[0.;BLOCK];2]);self.output.fill([[0.;BLOCK];2]);self.controls.fill([0.;BLOCK]);self.apply(Event{frame:0,settings:self.base,walks:self.initial_walks});}
}
fn balance(side:f32,p:f32)->f32{let position=((p+1.)*1024.).clamp(0.,2048.);let index=position as usize;if index>=2048{return 1.-(side*1f32).max(0.);}let a=1.-(side*(index as f32/1024.-1.)).max(0.);let b=1.-(side*((index+1)as f32/1024.-1.)).max(0.);a+(position-index as f32)*(b-a)}
#[no_mangle]pub extern "C" fn wander_api()->u32{1}
#[no_mangle]pub extern "C" fn wander_new(rate:f64,role:usize,buses:usize,offset:f64,smooth:u32,offline:u32)->*mut Engine{if smooth>1||offline>1{return std::ptr::null_mut();}Engine::new(rate,role,buses,offset,smooth!=0,offline!=0).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn wander_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn wander_initial(p:&mut Engine,mode:u32,on:u32,period:f64,min:f64,max:f64,volume:f64)->u32{let Some(s)=Settings::parse(mode,on,period,min,max,volume)else{return 0;};if p.ready||!p.raw.is_empty(){return 0;}p.base=s;1}
#[no_mangle]pub extern "C" fn wander_event(p:&mut Engine,frame:f64,mode:u32,on:u32,period:f64,min:f64,max:f64,volume:f64)->u32{let Some(settings)=Settings::parse(mode,on,period,min,max,volume)else{return 0;};if !frame.is_finite()||frame<0.||frame.fract()!=0.||frame>9007199254740864.||frame as u64%128!=0{return 0;}let f=frame as u64;if p.ready{return p.enqueue(f,settings)as u32;}if p.raw.len()>=EVENTS||p.raw.last().is_some_and(|e|e.0>f){return 0;}if p.raw.last().is_some_and(|e|e.0==f){p.raw.last_mut().unwrap().1=settings;}else{p.raw.push((f,settings));}1}
#[no_mangle]pub extern "C" fn wander_prepare(p:&mut Engine)->u32{p.prepare()as u32}
#[no_mangle]pub extern "C" fn wander_input(p:&mut Engine,b:usize,c:usize)->*mut f32{if b>=p.buses{return std::ptr::null_mut();}p.input[b].get_mut(c).map(|v|v.as_mut_ptr()).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub extern "C" fn wander_output(p:&Engine,b:usize,c:usize)->*const f32{if b>=p.buses{return std::ptr::null();}p.output[b].get(c).map(|v|v.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn wander_control(p:&Engine,c:usize)->*const f32{p.controls.get(c).map(|v|v.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn wander_render(p:&mut Engine,n:usize,mono_mask:u32)->u32{p.render(n,mono_mask)as u32}
#[no_mangle]pub extern "C" fn wander_reset(p:&mut Engine){p.reset();}
#[no_mangle]pub extern "C" fn wander_stat(p:&Engine,i:usize)->f64{match i{0=>p.frame as f64,1=>p.peak,2=>p.rejected as f64,3=>p.events.len().saturating_sub(p.head)as f64,4=>p.failed as u32 as f64,5=>p.wave[0].walk.map_or(0.,|w|w.draws as f64),6=>p.wave[1].walk.map_or(0.,|w|w.draws as f64),7=>p.wave[0].sine.index/p.wave[0].sine.table.len()as f64,8=>p.wave[1].sine.index/p.wave[1].sine.table.len()as f64,_=>0.}}
