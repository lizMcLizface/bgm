//! Additive original live native pull/control clock. Captured Engine is unchanged.
//! Caller supplies actual canonical demand, logical source layout and five
//! Biquad Process-versus-ProcessOnlyAudioParams flags; PCM zero is not a flag.
use super::{Engine,LANES};
const MAX_FRAME:f64=9007199254738944.;
pub struct Live{core:Box<Engine>,prepared:bool,origin:u64,seconds:f64,values:[f64;LANES],max_channels:usize,calls:u64,processed:u64,skipped:u64,rejected:u64,commands:u64,filter_mask:u32,activity:[super::tail::Activity;5],params_only:[u64;5],unpulled:[u64;5],parameter_mask:u32}
fn canonical(frame:f64)->bool{frame.is_finite()&&frame>=0.&&frame<=MAX_FRAME&&frame.fract()==0.&&frame%128.==0.}
impl Live{
 pub fn new(kind:usize,rate:f64,max_channels:usize)->Option<Box<Self>>{let core=Engine::new(kind,rate,max_channels)?;let values=core.initial;Some(Box::new(Self{core,prepared:false,origin:0,seconds:0.,values,max_channels,calls:0,processed:0,skipped:0,rejected:0,commands:0,filter_mask:31,activity:[super::tail::Activity::default();5],params_only:[0;5],unpulled:[0;5],parameter_mask:31}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 pub fn initial(&mut self,index:usize,value:f64)->bool{if self.prepared||!self.core.initial(index,value){return self.reject();}self.values=self.core.initial;true}
 pub fn prepare(&mut self,frame:f64,seconds:f64)->bool{if self.prepared||!canonical(frame)||!seconds.is_finite()||seconds<0.||(seconds*self.core.rate-frame).abs()>4.*f64::EPSILON*frame.abs().max(1.)||self.core.mask!=(1<<Engine::count(self.core.kind))-1{return self.reject();}if !self.core.book(seconds,self.values,true){return self.reject();}self.core.mode=self.core.projected(self.values).1;self.core.ready=true;self.core.frame=frame as u64;self.origin=frame as u64;self.seconds=seconds;self.prepared=true;true}
 pub fn sync(&mut self,frame:f64)->bool{if !self.prepared||!canonical(frame)||self.core.frame%128!=0||frame<self.core.frame as f64{return self.reject();}self.skipped+=frame as u64-self.core.frame;self.core.frame=frame as u64;true}
 pub fn patch(&mut self,seconds:f64,frame:f64,values:[f64;LANES],initial:bool)->bool{
  if !self.prepared||!canonical(frame)||frame!=self.core.frame as f64||!seconds.is_finite()||seconds<0.||(seconds*self.core.rate-frame).abs()>4.*f64::EPSILON*frame.abs().max(1.)||!Engine::valid(self.core.kind,&values){return self.reject();}
  let(projected,mode)=self.core.projected(values);if projected.iter().enumerate().any(|(i,v)|v.is_some()&&!self.core.lanes[i].available_at(1,frame)){return self.reject();}
  for(i,v)in projected.into_iter().enumerate(){if let Some(v)=v{self.core.lanes[i].prune_for_insert(frame);assert!(self.core.lanes[i].add(seconds*self.core.rate,if initial{0}else{2},v,if initial{0.}else{0.02*self.core.rate}));}}
  if self.core.kind==2&&mode!=self.core.mode{self.core.filters[4].clear();}self.core.mode=mode;self.values=values;self.commands+=1;true
 }
 pub fn render(&mut self,channels:usize,filter_mask:u32)->bool{self.render_masks(channels,filter_mask,31)}
 pub fn render_masks(&mut self,channels:usize,filter_mask:u32,parameter_mask:u32)->bool{
  if !self.prepared||self.core.frame%128!=0||self.core.frame+128>MAX_FRAME as u64||channels>self.max_channels||filter_mask>31||parameter_mask>31||filter_mask&!parameter_mask!=0||(self.core.kind!=2&&filter_mask!=31)||(0..channels).any(|c|self.core.input[c][..128].iter().any(|v|!v.is_finite())){return self.reject();}
  let layout=channels.max(1);if layout!=self.core.channels{self.core.channels=layout;for b in &mut self.core.filters{*b=super::biquad::Biquad::default();}}
  if channels==0&&self.core.kind!=2{self.core.output[0][..128].fill(0.);self.core.output[1][..128].fill(0.);self.core.peak=0.;self.core.frame+=128;self.calls+=1;self.parameter_mask=0;return true;}
  let u=&mut self.core;let base=u.frame;u.peak=0.;u.constant=!u.lanes[0].accurate(base);for c in 0..u.lanes_count(){if u.kind==2&&parameter_mask&(1<<c.min(4))==0{continue;}u.lanes[c].prepare(base,u.rate);u.curves[c]=u.lanes[c].output;}
  for i in 0..128{let f=base+i as u64;let input=[if channels>0{u.input[0][i]}else{0.},if channels==2{u.input[1][i]}else{0.}];let output=match u.kind{
   1=>{let same=u.curves[0][i];let cross=u.curves[1][i];[input[0]*same+input[1]*cross,input[1]*same+input[0]*cross]},
   2=>{let mut x=input;for b in 0..5{if filter_mask&(1<<b)==0{x=[0.;2];continue;}let kind=if b<2{1}else if b<4{0}else{u.mode};let q=if b==4{u.curves[5][i]}else{0.707f32};let gain=if b==4{u.curves[6][i]}else{0.};x=u.filters[b].sample(x,layout,kind,u.curves[b][i]as f64,q as f64,gain as f64,u.rate);}x},
   _=>{let carrier=u.sine.tick(u.curves[0][i],f,u.constant,!u.constant);let wet=u.curves[1][i];let dry=u.curves[2][i];[(input[0]*carrier)*wet+input[0]*dry,(input[1]*carrier)*wet+input[1]*dry]}};
   for ch in 0..2{if !output[ch].is_finite(){self.rejected+=1;return false;}u.output[ch][i]=output[ch];u.peak=u.peak.max(output[ch].abs()as f64);}
  }for b in &mut u.filters{b.end_quantum();}u.frame+=128;self.calls+=1;self.processed+=128;self.filter_mask=filter_mask;self.parameter_mask=parameter_mask;true
 }
 pub fn render_activity(&mut self,channels:usize,silent:bool)->bool{if self.core.kind!=2&&silent!=(channels==0){return self.reject();}if self.core.kind!=2{return self.render(channels,31);}if !self.prepared||self.core.frame%128!=0||channels>self.max_channels{return self.reject();}let frame=self.core.frame;let mut input_silent=silent;let mut connected=channels>0;let mut flags=[false;5];let mut mask=0;let mut pulls=0;for b in 0..5{flags[b]=input_silent;let process=self.activity[b].process(input_silent,frame,self.core.rate);let pulled=connected||process;if process{mask|=1<<b;}if pulled{pulls|=1<<b;}connected=pulled;input_silent=!process;}if !self.render_masks(channels,mask,pulls){return false;}for b in 0..5{let process=mask&(1<<b)!=0;let pulled=pulls&(1<<b)!=0;if !pulled{self.unpulled[b]+=1;}else if !process{self.params_only[b]+=1;}if pulled{let tail=if process{Some(self.core.filters[b].tail_frame(30.*self.core.rate))}else{None};self.activity[b].finish(flags[b],frame,self.core.rate,tail);}}true}
 pub fn restart(&mut self,frame:f64,seconds:f64)->bool{if !self.prepared||!canonical(frame)||!seconds.is_finite()||seconds<0.||(seconds*self.core.rate-frame).abs()>4.*f64::EPSILON*frame.abs().max(1.){return self.reject();}let u=&mut self.core;for i in 0..LANES{u.lanes[i].reset(Engine::intrinsic(u.kind,i));}u.filters=[super::biquad::Biquad::default();5];u.sine.reset();u.input.fill([0.;super::BLOCK]);u.output.fill([0.;super::BLOCK]);u.peak=0.;u.frame=frame as u64;u.initial=self.values;u.channels=self.max_channels;assert!(u.book(seconds,self.values,true));u.mode=u.projected(self.values).1;self.origin=frame as u64;self.seconds=seconds;self.calls=0;self.processed=0;self.skipped=0;self.activity=[super::tail::Activity::default();5];self.params_only=[0;5];self.unpulled=[0;5];self.parameter_mask=31;true}
}
#[no_mangle]pub extern "C" fn rack_native_live_api()->u32{1}
#[no_mangle]pub extern "C" fn rack_native_live_new(kind:f64,rate:f64,channels:f64)->*mut Live{let(Some(kind),Some(channels))=(super::index(kind,3),super::index(channels,2))else{return std::ptr::null_mut();};Live::new(kind,rate,channels).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn rack_native_live_free(p:*mut Live){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn rack_native_live_initial(p:&mut Live,index:f64,value:f64)->u32{super::index(index,6).is_some_and(|i|p.initial(i,value))as u32}
#[no_mangle]pub extern "C" fn rack_native_live_prepare(p:&mut Live,frame:f64,seconds:f64)->u32{p.prepare(frame,seconds)as u32}
#[no_mangle]pub extern "C" fn rack_native_live_sync(p:&mut Live,frame:f64)->u32{p.sync(frame)as u32}
#[no_mangle]pub extern "C" fn rack_native_live_patch(p:&mut Live,seconds:f64,frame:f64,initial:f64,a:f64,b:f64,c:f64,d:f64,e:f64,f:f64,g:f64)->u32{if initial!=0.&&initial!=1.{return 0;}p.patch(seconds,frame,[a,b,c,d,e,f,g],initial==1.)as u32}
#[no_mangle]pub extern "C" fn rack_native_live_render(p:&mut Live,channels:f64,mask:f64)->u32{let(Some(channels),Some(mask))=(super::index(channels,2),super::index(mask,31))else{return 0;};p.render(channels,mask as u32)as u32}
#[no_mangle]pub extern "C" fn rack_native_live_restart(p:&mut Live,frame:f64,seconds:f64)->u32{p.restart(frame,seconds)as u32}
#[no_mangle]pub extern "C" fn rack_native_live_input(p:&mut Live,ch:f64)->*mut f32{let Some(c)=super::index(ch,1)else{return std::ptr::null_mut();};p.core.input[c].as_mut_ptr()}
#[no_mangle]pub extern "C" fn rack_native_live_output(p:&Live,ch:f64)->*const f32{let Some(c)=super::index(ch,1)else{return std::ptr::null();};p.core.output[c].as_ptr()}
#[no_mangle]pub extern "C" fn rack_native_live_value(p:&Live,index:f64)->f64{super::index(index,6).map_or(f64::NAN,|i|p.values[i])}
#[no_mangle]pub extern "C" fn rack_native_live_stat(p:&Live,index:f64)->f64{let Some(i)=super::index(index,12)else{return f64::NAN;};match i{0=>p.core.frame as f64,1=>p.core.peak,2=>p.core.sine.phase(),3=>if p.core.kind==1{2.}else{p.core.channels as f64},4=>p.core.mode as f64,5=>p.calls as f64,6=>p.processed as f64,7=>p.skipped as f64,8=>p.rejected as f64,9=>p.commands as f64,10=>p.filter_mask as f64,11=>p.origin as f64,12=>p.parameter_mask as f64,_=>f64::NAN}}

#[no_mangle]pub extern "C" fn rack_native_live_render_activity(p:&mut Live,channels:f64,silent:f64)->u32{let Some(channels)=super::index(channels,2)else{return 0;};if silent!=0.&&silent!=1.{return 0;}p.render_activity(channels,silent==1.)as u32}
#[no_mangle]pub extern "C" fn rack_native_live_tail(p:&Live,index:f64,field:f64)->f64{let(Some(i),Some(f))=(super::index(index,4),super::index(field,3))else{return f64::NAN;};match f{0=>p.activity[i].tail_time,1=>p.activity[i].last_non_silent_time,2=>p.params_only[i]as f64,3=>p.unpulled[i]as f64,_=>f64::NAN}}
#[no_mangle]pub extern "C" fn rack_native_live_tail_formula(a:f64,b:f64,c:f64,d:f64,e:f64,max:f64)->f64{if !max.is_finite()||max<2.||max>5760000.{return f64::NAN;}super::tail::tail_frame([a,b,c,d,e],max)}

#[no_mangle]pub extern "C" fn rack_native_live_render_masks(p:&mut Live,channels:f64,audio:f64,parameters:f64)->u32{let(Some(c),Some(a),Some(b))=(super::index(channels,2),super::index(audio,31),super::index(parameters,31))else{return 0;};p.render_masks(c,a as u32,b as u32)as u32}
#[no_mangle]pub extern "C" fn rack_native_live_curve_value(p:&Live,lane:f64,sample:f64)->f64{let(Some(l),Some(i))=(super::index(lane,6),super::index(sample,127))else{return f64::NAN;};p.core.lanes[l].output[i]as f64}
