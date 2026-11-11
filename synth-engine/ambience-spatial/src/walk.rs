//! Original seeded WalkPath state. Fixed storage; future knots preserve the
//! period at the time they were booked. No source silence inferred from PCM.
const TAU:f64=std::f64::consts::TAU;
#[derive(Clone,Copy)]pub struct Walk{state:u32,pub draws:u64,index:u64,last:f64,values:[f64;128],decay:f64}
impl Walk{
 pub fn new(seed:u32,period:f64)->Self{let mut w=Self{state:seed,draws:0,index:0,last:0.,values:[0.;128],decay:0.};w.set_period(period);w.last=w.normal(0.4);w.values[0]=w.last;w}
 fn random(&mut self)->f64{self.state=self.state.wrapping_add(0x6d2b79f5);let mut t=(self.state^(self.state>>15)).wrapping_mul(self.state|1);t^=t.wrapping_add((t^(t>>7)).wrapping_mul(t|61));self.draws+=1;((t^(t>>14))as f64)/4294967296.}
 fn normal(&mut self,sd:f64)->f64{if sd==0.{return 0.;}let u=self.random().max(1e-12);let z=(-2.*u.ln()).sqrt()*(TAU*self.random()).cos();z.clamp(-3.,3.)*sd}
 pub fn set_period(&mut self,period:f64){self.decay=(-2./(period/4.).max(2.)).exp();}
 pub fn knot(&mut self,index:u64)->f64{while self.index<index{let x=self.last*self.decay+self.normal(0.4*(1.-self.decay*self.decay).sqrt());let y=(((x+1.)%4.)+4.)%4.;self.last=(if y<=2.{y}else{4.-y})-1.;self.index+=1;self.values[self.index as usize%128]=self.last;}self.values[index as usize%128]}
 pub fn at(&mut self,seconds:f64)->f64{let x=seconds.max(0.)/2.;let i=x.floor()as u64;let a=self.knot(i);let b=self.knot(i+1);let f=x-i as f64;a*(1.-f)+b*f}
}
