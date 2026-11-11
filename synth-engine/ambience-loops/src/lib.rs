//! Actual wind/fire/vinyl loop preparation, before native Ambience host chains.
//! Original fixed material seeds, channel-major RNG, Float32 writes, equal-power
//! seam fold and default-referenced RMS normalization remain explicit.
use std::f64::consts::PI;
const TAU:f64=2.*PI;
const BLOCK:usize=2048;
#[cfg(feature="allocation-audit")]
mod allocation;
struct Rng(u32);
impl Rng {fn next(&mut self)->f64 {self.0=self.0.wrapping_add(0x6d2b79f5);let a=self.0;let mut t=(a^(a>>15)).wrapping_mul(a|1);t^=t.wrapping_add((t^(t>>7)).wrapping_mul(t|61));(t^(t>>14))as f64/4294967296.}}
#[derive(Default)]
struct Pink([f64;7]);
impl Pink {fn tick(&mut self,r:&mut Rng)->f64{let w=white(r);let b=&mut self.0;b[0]=0.99886*b[0]+w*0.0555179;b[1]=0.99332*b[1]+w*0.0750759;b[2]=0.969*b[2]+w*0.153852;b[3]=0.8665*b[3]+w*0.3104856;b[4]=0.55*b[4]+w*0.5329522;b[5]=-0.7616*b[5]-w*0.016898;let out=b[0]+b[1]+b[2]+b[3]+b[4]+b[5]+b[6]+w*0.5362;b[6]=w*0.115926;out*0.11}}
#[derive(Default)]
struct Brown(f64);
impl Brown {fn tick(&mut self,r:&mut Rng)->f64{self.0=(self.0+0.02*white(r))/1.02;self.0*3.5}}
struct Pole {a:f64,y:f64}
impl Pole {fn new(fc:f64,rate:f64)->Self{Self{a:1.-(-TAU*fc/rate).exp(),y:0.}}fn tick(&mut self,x:f64)->f64{self.y+=self.a*(x-self.y);self.y}fn high(&mut self,x:f64)->f64{x-self.tick(x)}}
struct Band {low:f64,band:f64,f:f64,rate:f64}
impl Band {fn new(rate:f64)->Self{Self{low:0.,band:0.,f:0.,rate}}fn cutoff(&mut self,fc:f64){self.f=2.*(PI*fc.min(self.rate/6.)/self.rate).sin();}fn tick(&mut self,x:f64)->f64{self.low+=self.f*self.band;let high=x-self.low-(1./1.4)*self.band;self.band+=self.f*high;self.band}}
fn white(r:&mut Rng)->f64{r.next()*2.-1.}
struct Curve {parts:[(f64,f64,f64);4],norm:f64,period:f64}
impl Curve {fn new(r:&mut Rng,period:f64,cycles:[f64;4],weights:[f64;4])->Self{let parts=std::array::from_fn(|i|(cycles[i],weights[i],r.next()*TAU));let norm=weights.iter().sum();Self{parts,norm,period}}fn at(&self,t:f64)->f64{self.parts.iter().fold(0.,|s,&(cycles,weight,phase)|s+weight*(TAU*cycles*t/self.period+phase).sin())/self.norm}}
fn burst(channel:&mut [f32],r:&mut Rng,at:usize,length:usize,amp:f64){let end=channel.len().min(at.saturating_add(length));let factor=(-4./(length.max(4)as f64)).exp();let mut level=amp;for i in at..end{channel[i]=(channel[i]as f64+level*white(r))as f32;level*=factor;}}
fn wind(rate:f64,p:[f64;2])->[Vec<f32>;2]{let n=(30.*rate).round()as usize;let mut r=Rng(4*7919+17);let pace=0.5+1.25*p[0];let cycles=[2.,5.,11.,17.].map(|c|(c*pace).round().max(1.));let gust=Curve::new(&mut r,29.,cycles,[1.,0.6,0.3,0.15]);let depth=0.2+0.5*p[1];let pitch=150.+200.*p[0];let sweep=500.+600.*p[0];std::array::from_fn(|ch|{let lag=if ch==0{0.}else{0.35};let mut out=vec![0.;n];let mut pink=Pink::default();let mut brown=Brown::default();let mut bp=Band::new(rate);let mut rumble=Pole::new(140.,rate);let(mut g,mut level)=(0.,0.);for i in 0..n{if i%32==0{g=(0.55+depth*gust.at(i as f64/rate-lag)).max(0.08);level=g.powf(1.5)*2.2;bp.cutoff(pitch+sweep*g*g);}out[i]=(bp.tick(pink.tick(&mut r))*level+rumble.tick(brown.tick(&mut r))*0.5*g)as f32;}out})}
fn fire(rate:f64,p:[f64;2])->[Vec<f32>;2]{let n=(24.*rate).round()as usize;let mut r=Rng(4*7919+17);let flicker=Curve::new(&mut r,23.,[3.,7.,13.,29.],[1.,0.7,0.5,0.3]);let mut crackles=[vec![0.;n],vec![0.;n]];let clusters=(n as f64/rate*7.*p[0]).round()as usize;for _ in 0..clusters{let start=(r.next()*n as f64).floor()as usize;let pops=1+(r.next()*6.).floor()as usize;let pan=0.5+(r.next()-0.5)*0.6;for _ in 0..pops{let at=start+(r.next()*rate*0.15).floor()as usize;let amp=0.05+0.6*r.next().powf(3.);let length=(rate*(0.0003+0.002*r.next())).round()as usize;burst(&mut crackles[0],&mut r,at,length,amp*(1.-pan)*2.);burst(&mut crackles[1],&mut r,at,length,amp*pan*2.);}}
 let snaps=(n as f64/rate*0.5*p[0]).round()as usize;for _ in 0..snaps{let at=(r.next()*n as f64).floor()as usize;let length=(rate*(0.003+0.004*r.next())).round()as usize;for c in &mut crackles{burst(c,&mut r,at,length,0.9);}}
 let roar_level=2.8*p[1];crackles.map(|crackle|{let mut out=vec![0.;n];let mut brown=Brown::default();let mut roar=Pole::new(220.,rate);let mut roar2=Pole::new(220.,rate);let mut hiss=Pole::new(4000.,rate);let mut click=Pole::new(700.,rate);let mut f=0.;for i in 0..n{if i%32==0{f=0.65+0.35*flicker.at(i as f64/rate);}out[i]=(roar2.tick(roar.tick(brown.tick(&mut r)))*roar_level*f+hiss.high(white(&mut r))*0.015*f+click.high(crackle[i]as f64))as f32;}out})}
fn vinyl(rate:f64,p:[f64;2])->[Vec<f32>;2]{let n=(19.*rate).round()as usize;let mut r=Rng(5*7919+17);let mut clicks=vec![0.;n];let amount=p[0]/0.4;let count=(n as f64/rate*28.*amount).round()as usize;for _ in 0..count{let at=(r.next()*n as f64).floor()as usize;let length=(rate*(0.0001+0.0004*r.next())).round()as usize;let amp=0.03+0.25*r.next().powf(4.);burst(&mut clicks,&mut r,at,length,amp);}let pops=(n as f64/rate*0.7*amount).round()as usize;for _ in 0..pops{let at=(r.next()*n as f64).floor()as usize;let length=(rate*(0.0006+0.001*r.next())).round()as usize;let amp=0.3+0.4*r.next();burst(&mut clicks,&mut r,at,length,amp);}let mut at=0.37;while at*rate<n as f64{burst(&mut clicks,&mut r,(at*rate).floor()as usize,(rate*0.0012).round()as usize,0.35);at+=1.8;}let hiss_level=0.08*(p[1]/0.4);std::array::from_fn(|_|{let mut out=vec![0.;n];let mut lp=Pole::new(5000.,rate);let mut hp=Pole::new(700.,rate);let mut warm=Pole::new(6000.,rate);for i in 0..n{out[i]=(hp.high(lp.tick(white(&mut r)))*hiss_level+warm.tick(clicks[i]as f64)*(0.9+0.2*r.next()))as f32;}out})}
fn loop_pcm(kind:u32,rate:f64,p:[f64;2])->[Vec<f32>;2]{let mut channels=match kind{0=>wind(rate,p),1=>fire(rate,p),_=>vinyl(rate,p)};let fade=rate.round()as usize;for data in &mut channels{let length=data.len()-fade;for i in 0..fade{let t=i as f64/fade as f64;data[i]=(data[i]as f64*(t*PI/2.).sin()+data[length+i]as f64*(t*PI/2.).cos())as f32;}data.truncate(length);}channels}
fn rms(channels:&[Vec<f32>;2])->f64{let mut sum=0.;let mut count=0usize;for c in channels{for &x in c{sum+=x as f64*x as f64;count+=1;}}let value=(sum/count as f64).sqrt();if value==0.{1.}else{value}}
pub struct Engine {pcm:[Vec<f32>;2],output:[[f32;BLOCK];2],cursor:usize,frame:u64,gain:f64,kind:u32,rate:f64,params:[f64;2]}
impl Engine {
 pub fn new(kind:u32,rate:f64,a:f64,b:f64)->Option<Box<Self>>{if kind>2||!rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||![a,b].iter().all(|v|v.is_finite()&&*v>=0.&&*v<=1.){return None;}let defaults=match kind{0=>[0.4,0.5],1=>[0.5,0.5],_=>[0.4,0.4]};let params=[(a*10.).round()/10.,(b*10.).round()/10.];let mut pcm=loop_pcm(kind,rate,params);let reference=if params==defaults{rms(&pcm)}else{rms(&loop_pcm(kind,rate,defaults))};let gain=[0.06,0.05,0.035][kind as usize]/reference;for c in &mut pcm{for x in c{*x=((*x as f64*gain).clamp(-0.95,0.95))as f32;}}Some(Box::new(Self{pcm,output:[[0.;BLOCK];2],cursor:0,frame:0,gain,kind,rate,params}))}
 pub fn render(&mut self,n:usize)->bool{if n>BLOCK||self.frame.checked_add(n as u64).is_none_or(|v|v>9007199254740991){return false;}for i in 0..n{for ch in 0..2{self.output[ch][i]=self.pcm[ch][self.cursor];}self.cursor+=1;if self.cursor==self.pcm[0].len(){self.cursor=0;}}self.frame+=n as u64;true}
 pub fn reset(&mut self){self.cursor=0;self.frame=0;self.output.fill([0.;BLOCK]);}
}
#[no_mangle]pub extern "C" fn ambience_loop_api()->u32{1}
#[no_mangle]pub extern "C" fn ambience_loop_new(kind:u32,rate:f64,a:f64,b:f64)->*mut Engine{Engine::new(kind,rate,a,b).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn ambience_loop_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn ambience_loop_len(p:&Engine)->usize{p.pcm[0].len()}
#[no_mangle]pub extern "C" fn ambience_loop_pcm(p:&Engine,ch:usize)->*const f32{p.pcm.get(ch).map(|c|c.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn ambience_loop_output(p:&Engine,ch:usize)->*const f32{p.output.get(ch).map(|c|c.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn ambience_loop_render(p:&mut Engine,n:usize)->u32{p.render(n)as u32}
#[no_mangle]pub extern "C" fn ambience_loop_reset(p:&mut Engine){p.reset();}
#[no_mangle]pub extern "C" fn ambience_loop_stat(p:&Engine,index:u32)->f64{match index{0=>p.frame as f64,1=>p.cursor as f64,2=>p.gain,3=>p.kind as f64,4=>p.rate,5=>p.params[0],6=>p.params[1],_=>0.}}
