//! Preallocated immutable Float32 curve leases. No render allocation or reclamation.
pub const SLOTS:usize=32;pub const POINTS:usize=2049;pub const CHUNK:usize=1024;
pub struct Curve{pub data:[f32;POINTS],pub generation:u32,pub state:u8,pub written:usize,pub references:u32,pub drive:f64}
pub struct Curves{pub slots:Vec<Curve>,pub active:Option<usize>,pub service:u64,pub service_started:bool,pub copied:usize,pub max_copied:usize,pub total_copied:u64}
impl Curves{
 pub fn new()->Self{let mut slots=Vec::with_capacity(SLOTS);for _ in 0..SLOTS{slots.push(Curve{data:[0.;POINTS],generation:0,state:0,written:0,references:0,drive:0.});}Self{slots,active:None,service:0,service_started:false,copied:0,max_copied:0,total_copied:0}}
 pub fn matches(&self,slot:usize,generation:u32)->bool{self.slots.get(slot).is_some_and(|c|c.state!=0&&c.generation==generation)}
 pub fn reserve(&mut self,slot:usize,generation:u32,drive:f64)->bool{let Some(c)=self.slots.get_mut(slot)else{return false;};if c.state!=0||generation<=c.generation||!drive.is_finite()||!(0. ..=1.).contains(&drive){return false;}c.generation=generation;c.drive=drive;c.state=1;c.written=0;c.references=0;true}
 pub fn begin_service(&mut self,ordinal:u64)->bool{if self.service_started&&ordinal!=self.service+1{return false;}if !self.service_started&&ordinal!=0{return false;}self.service_started=true;self.service=ordinal;self.copied=0;true}
 pub fn upload(&mut self,slot:usize,generation:u32,offset:usize,input:&[f32])->bool{if !self.service_started||input.is_empty()||input.len()>CHUNK||self.copied+input.len()>CHUNK||!self.matches(slot,generation){return false;}let c=&mut self.slots[slot];if c.state!=1||offset!=c.written||offset+input.len()>POINTS||input.iter().any(|v|!v.is_finite()||v.abs()>2.){return false;}c.data[offset..offset+input.len()].copy_from_slice(input);c.written+=input.len();self.copied+=input.len();self.max_copied=self.max_copied.max(self.copied);self.total_copied+=input.len()as u64;true}
 pub fn seal(&mut self,slot:usize,generation:u32)->bool{if !self.matches(slot,generation){return false;}let c=&mut self.slots[slot];if c.state!=1||c.written!=POINTS||c.data[1024]!=0.{return false;}c.state=2;true}
 pub fn ready(&self,slot:usize,generation:u32)->bool{self.matches(slot,generation)&&self.slots[slot].state>=2}
 pub fn reference(&mut self,slot:usize,generation:u32)->bool{if !self.matches(slot,generation){return false;}self.slots[slot].references+=1;true}
 pub fn unreference(&mut self,slot:usize){assert!(self.slots[slot].references>0);self.slots[slot].references-=1;}
 pub fn activate(&mut self,slot:usize,generation:u32)->bool{if !self.ready(slot,generation){return false;}if let Some(old)=self.active{self.slots[old].state=2;}self.active=Some(slot);self.slots[slot].state=3;true}
 pub fn release(&mut self,slot:usize,generation:u32)->bool{if !self.matches(slot,generation)||self.active==Some(slot)||self.slots[slot].references!=0{return false;}self.slots[slot].state=0;true}
}
