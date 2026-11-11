use crate::engine::Engine;
use crate::control::Control;
#[no_mangle]pub extern "C" fn piano_live_api()->u32{1}
#[no_mangle]pub extern "C" fn piano_live_new(sr:f64,voices:u32)->*mut Engine{Engine::new(sr,voices as usize).map(|e|Box::into_raw(Box::new(e))).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn piano_live_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn piano_live_buffer_new(n:u32)->*mut Vec<f64>{if n>2_000_000{return std::ptr::null_mut();}Box::into_raw(Box::new(vec![0.;n as usize]))}
#[no_mangle]pub unsafe extern "C" fn piano_live_buffer_ptr(p:*mut Vec<f64>)->*mut f64{p.as_mut().map(|p|p.as_mut_ptr()).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn piano_live_buffer_free(p:*mut Vec<f64>){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub unsafe extern "C" fn piano_live_has_bank(p:*const Engine,key:u32)->u32{p.as_ref().is_some_and(|e|e.has_bank(key)) as u32}
#[no_mangle]pub unsafe extern "C" fn piano_live_bank(p:*mut Engine,key:u32,frequency:f64,strike:*const Vec<f64>,body:*const Vec<f64>)->u32{match(p.as_mut(),strike.as_ref(),body.as_ref()){(Some(e),Some(a),Some(b))=>e.bank(key,frequency,a.iter().map(|v|*v as f32).collect(),b.iter().map(|v|*v as f32).collect()) as u32,_=>0}}
struct Read<'a>{data:&'a[f64],at:usize}
impl<'a> Read<'a>{fn count(&mut self,max:usize)->Option<usize>{let n=self.number()?;(n>=0.&&n.fract()==0.&&n<=max as f64).then_some(n as usize)}fn number(&mut self)->Option<f64>{let n=*self.data.get(self.at)?;self.at+=1;n.is_finite().then_some(n)}fn done(&self)->bool{self.at==self.data.len()}}
#[no_mangle]pub unsafe extern "C" fn piano_live_schedule(p:*mut Engine,key:u32,id:u32,owner:u32,slot:u32,onset:f64,fade:f64,pitch:f64,pitch_tau:f64,connected:u32,breath:f64,formant:f64,duration:f64,data:*const Vec<f64>)->u32{
 let(Some(e),Some(data))=(p.as_mut(),data.as_ref())else{return 0;};if connected>1||data.len()>8192{return 0;}
 let parse=||->Option<_>{let mut r=Read{data,at:0};let n=r.count(256)?;let mut gain=Vec::with_capacity(n);for _ in 0..n{gain.push((r.number()?,r.number()?));}let n=r.count(128)?;let mut filter=Vec::with_capacity(n);for _ in 0..n{filter.push((r.count(2)? as u32,r.number()?,r.number()?,r.number()?));}let n=r.count(128)?;let mut curve=Vec::with_capacity(n);for _ in 0..n{curve.push((r.number()?,r.number()?));}r.done().then_some((gain,filter,curve))};
 let Some((gain,filter,curve))=parse()else{return 0;};e.schedule(key,id,owner,slot as usize,onset,if fade== -1.{None}else{Some(fade)},&gain,&filter,pitch,pitch_tau,curve,connected!=0,breath,formant,duration) as u32
}
#[no_mangle]pub unsafe extern "C" fn piano_live_parameter(p:*mut Engine,slot:u32,axis:u32,value:f64,at:f64,tau:f64)->u32{p.as_mut().is_some_and(|e|e.parameter(slot as usize,axis,value,at,tau)) as u32}
#[no_mangle]pub unsafe extern "C" fn piano_live_awake(p:*mut Engine,slot:u32,awake:u32)->u32{if awake>1{return 0;}p.as_mut().is_some_and(|e|e.awake(slot as usize,awake!=0)) as u32}
#[no_mangle]pub unsafe extern "C" fn piano_live_pitch_connected(p:*mut Engine,slot:u32,on:u32)->u32{let Some(e)=p.as_mut()else{return 0;};if slot as usize>=e.slots.len()||on>1{return 0;}e.pitch_connected(slot as usize,on!=0);1}
#[no_mangle]pub unsafe extern "C" fn piano_live_release(p:*mut Engine,slot:u32,time:f64,seconds:f64,shape:u32,exponent:f64,offset:f64,filter_tau:f64)->u32{p.as_mut().is_some_and(|e|e.release(slot as usize,time,seconds,shape,exponent,offset,filter_tau)) as u32}
#[no_mangle]pub unsafe extern "C" fn piano_live_stop_slot(p:*mut Engine,slot:u32,time:f64)->u32{p.as_mut().is_some_and(|e|e.stop_slot(slot as usize,time)) as u32}
#[no_mangle]pub unsafe extern "C" fn piano_live_silence(p:*mut Engine,time:f64)->u32{p.as_mut().is_some_and(|e|e.silence(time)) as u32}
#[no_mangle]pub unsafe extern "C" fn piano_live_cancel(p:*mut Engine,owner:u32){if let Some(e)=p.as_mut(){e.cancel(owner);}}
#[no_mangle]pub unsafe extern "C" fn piano_live_reset(p:*mut Engine){if let Some(e)=p.as_mut(){e.reset();}}
#[no_mangle]pub unsafe extern "C" fn piano_live_controls(p:*mut Engine,origin:f64,data:*const Vec<f64>)->u32{
 let(Some(e),Some(data))=(p.as_mut(),data.as_ref())else{return 0;};if data.len()>2048{return 0;}
 let parse=||->Option<_>{let mut r=Read{data,at:0};let n=r.count(4)?;let mut controls=Vec::with_capacity(n);for _ in 0..n{let axis=r.count(1)? as u32;let kind=r.count(1)? as u32;let phase=r.number()?;let frequency=r.number()?;let initial=r.number()?;let target=r.number()?;let tau=r.number()?;let delay=r.number()?;let n=r.count(128)?;let mut points=Vec::with_capacity(n);for _ in 0..n{points.push((r.number()?,r.number()?));}controls.push((Control{axis,kind,phase,frequency,initial,target,tau,points},delay));}r.done().then_some(controls)};
 let Some(c)=parse()else{return 0;};e.controls(origin,c) as u32
}
#[no_mangle]pub unsafe extern "C" fn piano_live_render(p:*mut Engine,frame:f64)->u32{let Some(e)=p.as_mut()else{return 0;};if !frame.is_finite()||frame<0.||frame.fract()!=0.||frame>9007199254740864.{return 0;}e.render(frame as u64) as u32}
#[no_mangle]pub unsafe extern "C" fn piano_live_output(p:*const Engine)->*const f32{p.as_ref().map(|p|p.output.as_ptr() as *const f32).unwrap_or(std::ptr::null())}
#[no_mangle]pub unsafe extern "C" fn piano_live_stat(p:*const Engine,index:u32)->f64{p.as_ref().map(|p|p.stat(index)).unwrap_or(f64::NAN)}
#[no_mangle]pub unsafe extern "C" fn piano_live_slot_value(p:*const Engine,slot:u32,field:u32,time:f64)->f64{let Some(s)=p.as_ref().and_then(|e|e.slots.get(slot as usize))else{return f64::NAN;};if !time.is_finite()||time<0.{return f64::NAN;}match field{0=>s.gain_value_at(time) as f64,1=>s.last_detune as f64,2=>s.frequency.at(time),3=>s.q.at(time),4=>s.filter_gain.at(time),5=>s.volume.at(time),6=>s.gain.at(time),_=>f64::NAN}}
#[no_mangle]pub extern "C" fn piano_live_shape(t:f64,kind:u32,exponent:f64)->f64{if !t.is_finite()||!(0. ..=1.).contains(&t)||kind>11||!exponent.is_finite()||!(0.1..=4.).contains(&exponent){return f64::NAN;}crate::envelope::shape(t,kind,exponent)}
#[no_mangle]pub extern "C" fn piano_live_source_frame(frame:f64)->f64{if !frame.is_finite()||frame<0.{return f64::NAN;}crate::engine::source_frame(frame) as f64}

#[no_mangle]pub unsafe extern "C" fn piano_live_air_ptr(p:*const Engine)->*const f32{p.as_ref().map(|p|p.air.samples().as_ptr()).unwrap_or(std::ptr::null())}
#[no_mangle]pub unsafe extern "C" fn piano_live_air_len(p:*const Engine)->u32{p.as_ref().map(|p|p.air.samples().len() as u32).unwrap_or(0)}
