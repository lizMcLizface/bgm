//! Off-thread preparation of actual sampled-room transforms and PianoPlayer's
//! seeded room. Decoding and sample-rate conversion remain host boundaries.
//! Normalization follows Chromium calibration and an explicit portable logical
//! aligned AVX8 Float32 energy profile. Native FFT-scale rounding is verified
//! separately; this emits Float32 time-domain coefficients, not a new convolver.
pub const MAX_FRAMES:usize=2097152;
pub struct Preparation {rate:f64,source:u32,input:Vec<Vec<f32>>,output:Vec<Vec<f32>>,prepared:bool,trim_end:usize,trim_len:usize,trim_identity:bool,capped:bool,decayed:bool,decay_key:f64,gain:f32,power:f32}
impl Preparation {
 pub fn new(rate:f64,channels:usize,length:usize)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels)||!(1..=MAX_FRAMES).contains(&length){return None;}Some(Box::new(Self{rate,source:0,input:(0..channels).map(|_|vec![0.;length]).collect(),output:Vec::new(),prepared:false,trim_end:length,trim_len:length,trim_identity:true,capped:false,decayed:false,decay_key:0.,gain:1.,power:0.}))}
 pub fn piano(rate:f64)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate){return None;}let length=(rate*2.4).round()as usize;let mut p=Self::new(rate,2,length)?;p.source=1;for c in 0..2{let mut seed=1234+c as u32*77;let mut low=0.;for i in 0..length{seed=seed.wrapping_mul(1664525).wrapping_add(1013904223);let t=i as f64/length as f64;let white=seed as f64/2147483648.-1.;low+=(white-low)*(0.6-0.5*t);p.input[c][i]=(low*(1.-t).powf(3.2)*(i as f64/(rate*0.004)).min(1.))as f32;}}Some(p)}
 fn energy8(data:&[f32])->f32{let bulk=data.len()/8*8;let mut lanes=[0f32;8];for chunk in data[..bulk].chunks_exact(8){for i in 0..8{lanes[i]+=chunk[i]*chunk[i];}}let mut sum=0f32;for value in lanes{sum+=value;}let mut at=bulk;if data.len()-at>=4{let mut sse=0f32;for value in &data[at..at+4]{sse+=*value**value;}sum+=sse;at+=4;}let mut scalar=0f32;for value in &data[at..]{scalar+=*value**value;}sum+scalar}
 fn normalization(channels:&[Vec<f32>],rate:f64)->(f32,f32){let mut power=0f32;for channel in channels{power+=Self::energy8(channel);}power=(power/((channels.len()*channels[0].len())as f32)).sqrt();if !power.is_finite()||power<0.000125f32{power=0.000125f32;}let mut scale=(1f32/power)*10f32.powf(-58f32*0.05f32);scale*=44100f32/rate as f32;(scale,power)}
 pub fn prepare(&mut self,mode:u32,decay:f64,normalize:u32)->bool{
  if self.prepared||mode>2||normalize>1||!decay.is_finite()||decay!=0.&&!(0.3..=120.).contains(&decay)||self.source==1&&(mode!=0||decay!=0.)||self.input.iter().flatten().any(|x|!x.is_finite()){return false;}
  let original_len=self.input[0].len();let mut length=original_len;let mut end=original_len;let mut identity=true;let mut capped=false;
  if mode!=0{
   let mut total=0f64;for channel in &self.input{for &x in channel{total+=x as f64*x as f64;}}let mut remaining=total;for i in 0..original_len{if remaining<total*1e-6{end=i;break;}for channel in &self.input{remaining-=channel[i]as f64*channel[i]as f64;}}
   length=original_len.min(end+(0.05*self.rate).round()as usize);let cap=((if mode==2{2.}else{3.})*self.rate).round()as usize;capped=length>cap;if capped{length=cap;end=cap-(0.8*self.rate).round()as usize;}
   identity=!capped&&length as f64>=original_len as f64-self.rate*0.1;if identity{length=original_len;}
  }
  let mut channels:Vec<Vec<f32>>=self.input.iter().map(|channel|channel[..length].to_vec()).collect();
  if !identity{for channel in &mut channels{for i in end..length{channel[i]=(channel[i]as f64*((length-i)as f64/(length-end)as f64))as f32;}}}
  if mode==2&&channels.len()>1{let mono=(0..length).map(|i|channels.iter().map(|c|c[i]as f64).sum::<f64>()/channels.len()as f64).map(|x|x as f32).collect();channels=vec![mono];}
  let decayed=decay!=0.&&decay<(length as f64/self.rate);let decay_key=if decay==0.{0.}else{(decay*10.).round()/10.};if decayed{let k=-6.91/(decay_key*self.rate);for channel in &mut channels{for(i,x)in channel.iter_mut().enumerate(){*x=(*x as f64*(k*i as f64).exp())as f32;}}}
  let(gain,power)=if normalize!=0{Self::normalization(&channels,self.rate)}else{(1.,0.)};if normalize!=0{for channel in &mut channels{for x in channel{*x=(*x*gain)as f32;}}}
  if channels.iter().flatten().any(|x|!x.is_finite()){return false;}self.output=channels;self.trim_end=end;self.trim_len=length;self.trim_identity=identity;self.capped=capped;self.decayed=decayed;self.decay_key=decay_key;self.gain=gain;self.power=power;self.prepared=true;true
 }
}
#[no_mangle]pub extern "C" fn room_prep_api()->u32{1}
#[no_mangle]pub extern "C" fn room_prep_new(rate:f64,channels:usize,length:usize)->*mut Preparation{Preparation::new(rate,channels,length).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub extern "C" fn room_prep_piano(rate:f64)->*mut Preparation{Preparation::piano(rate).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn room_prep_free(p:*mut Preparation){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn room_prep_input(p:&mut Preparation,ch:usize)->*mut f32{if p.prepared||p.source!=0{return std::ptr::null_mut();}p.input.get_mut(ch).map(|c|c.as_mut_ptr()).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub extern "C" fn room_prep_prepare(p:&mut Preparation,mode:u32,decay:f64,normalize:u32)->u32{p.prepare(mode,decay,normalize)as u32}
#[no_mangle]pub extern "C" fn room_prep_output(p:&Preparation,ch:usize)->*const f32{p.output.get(ch).map(|c|c.as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub extern "C" fn room_prep_stat(p:&Preparation,index:u32)->f64{match index{0=>p.input[0].len()as f64,1=>p.output.first().map(Vec::len).unwrap_or(0)as f64,2=>p.input.len()as f64,3=>p.output.len()as f64,4=>p.trim_end as f64,5=>p.trim_identity as u32 as f64,6=>p.capped as u32 as f64,7=>p.decayed as u32 as f64,8=>p.decay_key,9=>p.gain as f64,10=>p.power as f64,11=>p.prepared as u32 as f64,12=>p.source as f64,13=>p.rate,_=>0.}}
