//! Static same-rate, unnormalized mono/stereo convolution. Worker-only initial
//! execution policy: no claim that the large FFT/FDL boundary is callback-safe.
//! A direct128 head and scheduled nonuniform tails add zero adapter delay.
mod fft;
#[cfg(feature="allocation-audit")]mod allocation;
use fft::{Complex,Plan};
pub const MAX_IR:usize=327680;
pub const MAX_LONG_IR:usize=2097152;
const LONG_TAIL:usize=65536;
pub const BLOCK:usize=2048;
const HEAD:usize=128;
const TAIL:usize=8192;
struct Group {
 block:usize,partitions:usize,input_channels:usize,ir_channels:usize,output_channels:usize,
 half_spectrum:bool,plan:Plan,h:Vec<Complex>,x:Vec<Complex>,scratch:Vec<Complex>,input:Vec<f32>,ready:Vec<f64>,overlap:Vec<f64>,phase:usize,blocks:u64,forward:u64,inverse:u64,
}
impl Group {
 fn new(block:usize,offset:usize,ir:&[Vec<f32>],input_channels:usize,half_spectrum:bool)->Self {
  let n=2*block;let bins=if half_spectrum{block+1}else{n};let length=ir[0].len();let partitions=(length-offset).div_ceil(block);let ir_channels=ir.len();let output_channels=input_channels.max(ir_channels);let plan=Plan::new(n);
  let mut h=vec![Complex::default();ir_channels*partitions*bins];let mut scratch=vec![Complex::default();n];
  for ch in 0..ir_channels{for part in 0..partitions{scratch.fill(Complex::default());let begin=offset+part*block;let count=block.min(length-begin);for i in 0..count{scratch[i].re=ir[ch][begin+i]as f64;}plan.transform(&mut scratch,false);let at=(ch*partitions+part)*bins;h[at..at+bins].copy_from_slice(&scratch[..bins]);}}
  Self{block,partitions,input_channels,ir_channels,output_channels,half_spectrum,plan,h,x:vec![Complex::default();input_channels*partitions*bins],scratch,input:vec![0.;input_channels*block],ready:vec![0.;output_channels*block],overlap:vec![0.;output_channels*block],phase:0,blocks:0,forward:0,inverse:0}
 }
 fn tick(&mut self,input:[f32;2])->[f64;2]{
  let mut output=[0.;2];for(ch,out)in output.iter_mut().enumerate().take(self.output_channels){*out=self.ready[ch*self.block+self.phase];}
  for ch in 0..self.input_channels{self.input[ch*self.block+self.phase]=input[ch];}self.phase+=1;
  if self.phase==self.block{self.compute();self.phase=0;}output
 }
 fn compute(&mut self){
  let n=2*self.block;let bins=if self.half_spectrum{self.block+1}else{n};let slot=(self.blocks%self.partitions as u64)as usize;
  for ch in 0..self.input_channels{self.scratch.fill(Complex::default());for i in 0..self.block{self.scratch[i].re=self.input[ch*self.block+i]as f64;}self.plan.transform(&mut self.scratch,false);let at=(ch*self.partitions+slot)*bins;self.x[at..at+bins].copy_from_slice(&self.scratch[..bins]);self.forward+=1;}
  for ch in 0..self.output_channels{
   self.scratch.fill(Complex::default());let input_ch=if self.input_channels==1{0}else{ch};let ir_ch=if self.ir_channels==1{0}else{ch};
   for part in 0..self.partitions{if part as u64>self.blocks{break;}let past=(slot+self.partitions-part)%self.partitions;let x_at=(input_ch*self.partitions+past)*bins;let h_at=(ir_ch*self.partitions+part)*bins;for k in 0..bins{let x=self.x[x_at+k];let h=self.h[h_at+k];self.scratch[k].re+=x.re*h.re-x.im*h.im;self.scratch[k].im+=x.re*h.im+x.im*h.re;}}
   if self.half_spectrum{for k in 1..self.block{let value=self.scratch[k];self.scratch[n-k]=Complex{re:value.re,im:-value.im};}}
   self.plan.transform(&mut self.scratch,true);self.inverse+=1;
   for i in 0..self.block{let at=ch*self.block+i;self.ready[at]=self.scratch[i].re+self.overlap[at];self.overlap[at]=self.scratch[self.block+i].re;}
  }self.blocks+=1;
 }
 fn reset(&mut self){self.x.fill(Complex::default());self.scratch.fill(Complex::default());self.input.fill(0.);self.ready.fill(0.);self.overlap.fill(0.);self.phase=0;self.blocks=0;self.forward=0;self.inverse=0;}
 fn bytes(&self)->usize{self.plan.bytes()+(self.h.len()+self.x.len()+self.scratch.len())*std::mem::size_of::<Complex>()+self.input.len()*4+(self.ready.len()+self.overlap.len())*8}
}
pub struct Engine {
 long:bool,rate:f64,input_channels:usize,ir_channels:usize,output_channels:usize,ir:Vec<Vec<f32>>,head:Vec<f32>,history:Vec<f32>,cursor:usize,groups:Vec<Group>,prepared:bool,frame:u64,peak:f32,rejected:u64,input:[[f32;BLOCK];2],output:[[f32;BLOCK];2],
}
impl Engine {
 pub fn new(rate:f64,input_channels:usize,ir_channels:usize,length:usize)->Option<Box<Self>>{Self::new_profile(rate,input_channels,ir_channels,length,false)}
 pub fn new_profile(rate:f64,input_channels:usize,ir_channels:usize,length:usize,long:bool)->Option<Box<Self>>{
  if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&input_channels)||!(1..=2).contains(&ir_channels)||!(1..=if long{MAX_LONG_IR}else{MAX_IR}).contains(&length){return None;}
  Some(Box::new(Self{long,rate,input_channels,ir_channels,output_channels:input_channels.max(ir_channels),ir:(0..ir_channels).map(|_|vec![0.;length]).collect(),head:Vec::new(),history:vec![0.;input_channels*HEAD],cursor:0,groups:Vec::new(),prepared:false,frame:0,peak:0.,rejected:0,input:[[0.;BLOCK];2],output:[[0.;BLOCK];2]}))
 }
 pub fn prepare(&mut self)->bool{
  if self.prepared||self.ir.iter().flatten().any(|v|!v.is_finite()){return false;}
  let length=self.ir[0].len();let head_len=HEAD.min(length);let head=(0..self.ir_channels).flat_map(|ch|self.ir[ch][..head_len].iter().copied()).collect();let tail=if self.long{LONG_TAIL}else{TAIL};let mut groups=Vec::with_capacity(10);let mut block=HEAD;
  while block<tail&&block<length{let short:Vec<Vec<f32>>=self.ir.iter().map(|ch|ch[..length.min(2*block)].to_vec()).collect();groups.push(Group::new(block,block,&short,self.input_channels,self.long));block*=2;}
  if length>tail{groups.push(Group::new(tail,tail,&self.ir,self.input_channels,self.long));}
  self.head=head;self.groups=groups;self.prepared=true;true
 }
 pub fn tick(&mut self,input:[f32;2])->[f32;2]{
  for ch in 0..self.input_channels{self.history[ch*HEAD+self.cursor]=input[ch];}let mut sum=[0.;2];let head_len=HEAD.min(self.ir[0].len());
  for(ch,out)in sum.iter_mut().enumerate().take(self.output_channels){let input_ch=if self.input_channels==1{0}else{ch};let ir_ch=if self.ir_channels==1{0}else{ch};for k in 0..head_len{*out+=self.history[input_ch*HEAD+((self.cursor+HEAD-k)&(HEAD-1))]as f64*self.head[ir_ch*head_len+k]as f64;}}
  self.cursor=(self.cursor+1)&(HEAD-1);for group in &mut self.groups{let value=group.tick(input);for ch in 0..self.output_channels{sum[ch]+=value[ch];}}
  self.frame+=1;[sum[0]as f32,sum[1]as f32]
 }
 pub fn render(&mut self,n:usize)->bool{
  if !self.prepared||n>BLOCK||self.frame.checked_add(n as u64).is_none_or(|v|v>9007199254740991){return false;}
  if (0..self.input_channels).any(|ch|self.input[ch][..n].iter().any(|x|!x.is_finite())){self.rejected+=1;return false;}
  self.peak=0.;for i in 0..n{let value=self.tick([self.input[0][i],self.input[1][i]]);for ch in 0..2{self.output[ch][i]=value[ch];self.peak=self.peak.max(value[ch].abs());}}true
 }
 /// Chromium AudioBus speaker downmix: ordered half-left then half-right.
 /// This is explicit post-colour routing, not an implicit source-channel change.
 pub fn render_stereo_to_mono(&mut self,n:usize)->bool{
  if self.input_channels!=1||!self.prepared||n>BLOCK||self.frame.checked_add(n as u64).is_none_or(|v|v>9007199254740991){return false;}
  if self.input.iter().any(|ch|ch[..n].iter().any(|x|!x.is_finite())){self.rejected+=1;return false;}
  for i in 0..n{let left=self.input[0][i]*0.5;self.input[0][i]=self.input[1][i].mul_add(0.5,left);}
  self.render(n)
 }
 pub fn reset(&mut self){self.history.fill(0.);for group in &mut self.groups{group.reset();}self.cursor=0;self.frame=0;self.peak=0.;self.rejected=0;self.input.fill([0.;BLOCK]);self.output.fill([0.;BLOCK]);}
 fn bytes(&self)->usize{std::mem::size_of::<Self>()+self.ir_channels*self.ir[0].len()*4+self.head.len()*4+self.history.len()*4+self.groups.iter().map(Group::bytes).sum::<usize>()}
}
#[no_mangle]pub extern "C" fn convolver_api()->u32{1}
#[no_mangle]pub extern "C" fn convolver_new(rate:f64,input_channels:u32,ir_channels:u32,length:usize)->*mut Engine{Engine::new(rate,input_channels as usize,ir_channels as usize,length).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub extern "C" fn convolver_new_long(rate:f64,input_channels:u32,ir_channels:u32,length:usize)->*mut Engine{Engine::new_profile(rate,input_channels as usize,ir_channels as usize,length,true).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn convolver_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn convolver_ir(p:&mut Engine,ch:usize)->*mut f32{if p.prepared{return std::ptr::null_mut();}p.ir.get_mut(ch).map(|c|c.as_mut_ptr()).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub extern "C" fn convolver_prepare(p:&mut Engine)->u32{p.prepare()as u32}
#[no_mangle]pub extern "C" fn convolver_input(p:&mut Engine,ch:usize)->*mut f32{p.input.get_mut(ch).map(|c|c.as_mut_ptr()).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub extern "C" fn convolver_output(p:&Engine,ch:usize)->*const f32{p.output.get(ch).map(|c|c.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn convolver_render(p:&mut Engine,n:usize)->u32{p.render(n)as u32}
#[no_mangle]pub extern "C" fn convolver_render_stereo_to_mono(p:&mut Engine,n:usize)->u32{p.render_stereo_to_mono(n)as u32}
#[no_mangle]pub extern "C" fn convolver_reset(p:&mut Engine){p.reset();}
#[no_mangle]pub extern "C" fn convolver_stat(p:&Engine,index:u32)->f64{match index{0=>p.frame as f64,1=>p.peak as f64,2=>0.,3=>p.ir[0].len()as f64,4=>p.input_channels as f64,5=>p.ir_channels as f64,6=>p.output_channels as f64,7=>p.bytes()as f64,8=>p.groups.len()as f64,9=>p.groups.iter().map(|g|g.block*2).max().unwrap_or(0)as f64,10=>p.groups.iter().map(|g|g.forward).sum::<u64>()as f64,11=>p.groups.iter().map(|g|g.inverse).sum::<u64>()as f64,12=>p.rejected as f64,13=>p.rate,14=>p.prepared as u32 as f64,15=>p.long as u32 as f64,16=>(if p.long{LONG_TAIL}else{TAIL})as f64,17=>p.groups.iter().map(|g|g.partitions).sum::<usize>()as f64,_=>0.}}
