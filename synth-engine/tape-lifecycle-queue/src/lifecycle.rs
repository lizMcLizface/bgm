//! Portable Tape lifetime authority. Tail eligibility NEVER retires an output.
//! Explicit canonical host retirement/activation events have a monotonic epoch.
#[path="../../rack-native/src/tail.rs"] mod tail;
const MAX_FRAME:f64=1099511627648.;const INVALID:u32=u32::MAX;
#[derive(Clone,Copy)]
pub struct Lifecycle{rate:f64,last_frame:Option<u64>,edit_frame:Option<u64>,pending:bool,frame:u64,demand:bool,input_active:Option<bool>,silent:[bool;3],mode:[u32;3],outputs:u32,epoch:u32,last_non_silent:[f64;3],tail:[f64;3],latency:[f64;3],body:[u64;3],params:[u64;3],unpulled:u64,calls:u64,rejected:u64,last_tone:f64,retirements:u64,activations:u64}
fn canonical(f:f64)->bool{f.is_finite()&&f>=0.&&f<=MAX_FRAME&&f.fract()==0.&&f%128.==0.}
fn boolean(v:f64)->Option<bool>{if v==0.{Some(false)}else if v==1.{Some(true)}else{None}}
fn coefficients(rate:f64,frequency:f64)->[f64;5]{let f=frequency.clamp(0.,rate*0.5)/(rate*0.5);if f>=1.{return[1.,0.,0.,0.,0.];}if f<=0.{return[0.;5];}let resonance=(((0.5f64/20.)*std::f64::consts::LN_10)as f32).exp()as f64;let theta=std::f64::consts::PI*f;let alpha=theta.sin()/(2.*resonance);let cosine=theta.cos();let beta=(1.-cosine)/2.;let norm=1.+alpha;[beta/norm,2.*beta/norm,beta/norm,-2.*cosine/norm,(1.-alpha)/norm]}
impl Lifecycle{
 pub fn new(rate:f64)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate){return None;}Some(Box::new(Self{rate,last_frame:None,edit_frame:None,pending:false,frame:0,demand:false,input_active:None,silent:[true;3],mode:[0;3],outputs:7,epoch:1,last_non_silent:[0.;3],tail:[0.,f64::INFINITY,0.02],latency:[128./rate,0.,0.],body:[0;3],params:[0;3],unpulled:0,calls:0,rejected:0,last_tone:f64::NAN,retirements:0,activations:0}))}
 fn reject(&mut self)->u32{self.rejected+=1;INVALID}
 fn propagates(&self,i:usize,frame:f64)->bool{self.last_non_silent[i]+self.latency[i]+self.tail[i]<frame/self.rate}
 fn admissible_edit(&self,frame:f64)->bool{!self.pending&&canonical(frame)&&self.last_frame.is_none_or(|last|frame>=last as f64+128.)&&self.edit_frame.is_none_or(|f|frame==f as f64)}
 pub fn eligible(&self,frame:f64)->u32{if !canonical(frame){return INVALID;}let mut mask=0;for i in 0..3{if self.propagates(i,frame)&&(i!=0||self.input_active==Some(false)){mask|=1<<i;}}mask}
 pub fn retire(&mut self,frame:f64,remaining:u32,epoch:u32)->bool{
  if !self.admissible_edit(frame)||epoch!=self.epoch||![0,4,6,7].contains(&remaining)||remaining&self.outputs!=remaining{self.reject();return false;}
  let removed=self.outputs&!remaining;
  for i in 0..3{if removed&(1<<i)!=0&&(!self.propagates(i,frame)||(i==0&&self.input_active!=Some(false))||(i>0&&remaining&(1<<(i-1))!=0)){self.reject();return false;}}
  self.outputs=remaining;self.edit_frame=Some(frame as u64);if removed!=0{self.retirements+=1;}true
 }
 pub fn activate(&mut self,frame:f64,epoch:u32)->bool{if !self.admissible_edit(frame)||epoch<=self.epoch{self.reject();return false;}self.outputs=7;self.epoch=epoch;self.input_active=Some(true);self.edit_frame=Some(frame as u64);self.activations+=1;true}
 pub fn begin(&mut self,frame:f64,input_silent:bool,input_active:bool,demand:bool)->u32{
  if self.pending||!input_active&&!input_silent||!canonical(frame)||self.last_frame.is_some_and(|last|frame<last as f64+128.)||self.edit_frame.is_some_and(|f|frame!=f as f64)||demand&&input_active&&self.outputs!=7{return self.reject();}
  self.frame=frame as u64;self.demand=demand;self.input_active=Some(input_active);self.silent[0]=input_silent;
  let pulled2=demand&&self.outputs&4!=0;let pulled1=pulled2&&self.outputs&2!=0;let pulled0=pulled1&&self.outputs&1!=0;let pulled=[pulled0,pulled1,pulled2];
  for i in 0..3{if i>0{self.silent[i]=self.mode[i-1]!=2;}self.mode[i]=if !pulled[i]{0}else if self.silent[i]&&self.propagates(i,frame){1}else{2};}
  let mut mask=0;for i in 0..3{mask|=self.mode[i]<<(2*i);}if pulled2{for i in 3..11{mask|=2<<(2*i);}}self.pending=true;self.edit_frame=None;mask
 }
 pub fn finish(&mut self,tone:f64)->bool{if !self.pending||!tone.is_finite()||tone<0.||tone>self.rate*0.5||tone!=tone as f32 as f64{self.rejected+=1;return false;}if self.demand&&self.outputs&4!=0{for i in 0..3{if self.mode[i]!=0&&!self.silent[i]{self.last_non_silent[i]=(self.frame+128)as f64/self.rate;}if self.mode[i]==2{self.body[i]+=128;}else if self.mode[i]==1{self.params[i]+=128;}}if self.mode[1]==2{self.tail[1]=tail::tail_frame(coefficients(self.rate,tone),30.*self.rate)/self.rate;self.last_tone=tone;}}else{self.unpulled+=128;}self.pending=false;self.last_frame=Some(self.frame);self.calls+=1;true}
}
#[no_mangle]pub extern "C" fn tape_lifecycle_api()->u32{1}
#[no_mangle]pub extern "C" fn tape_lifecycle_new(rate:f64)->*mut Lifecycle{Lifecycle::new(rate).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn tape_lifecycle_free(p:*mut Lifecycle){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn tape_lifecycle_begin(p:&mut Lifecycle,frame:f64,silent:f64,active:f64,demand:f64)->u32{let(Some(s),Some(a),Some(d))=(boolean(silent),boolean(active),boolean(demand))else{return p.reject();};p.begin(frame,s,a,d)}
#[no_mangle]pub extern "C" fn tape_lifecycle_finish(p:&mut Lifecycle,tone:f64)->u32{p.finish(tone)as u32}
#[no_mangle]pub extern "C" fn tape_lifecycle_retire(p:&mut Lifecycle,frame:f64,remaining:u32,epoch:u32)->u32{p.retire(frame,remaining,epoch)as u32}
#[no_mangle]pub extern "C" fn tape_lifecycle_activate(p:&mut Lifecycle,frame:f64,epoch:u32)->u32{p.activate(frame,epoch)as u32}
#[no_mangle]pub extern "C" fn tape_lifecycle_eligible(p:&Lifecycle,frame:f64)->u32{p.eligible(frame)}
#[no_mangle]pub extern "C" fn tape_lifecycle_stat(p:&Lifecycle,key:u32)->f64{match key{0=>p.frame as f64,1=>p.calls as f64,2=>p.rejected as f64,3=>p.pending as u32 as f64,4=>p.unpulled as f64,5=>p.last_tone,6..=8=>p.last_non_silent[(key-6)as usize],9..=11=>p.tail[(key-9)as usize],12..=14=>p.body[(key-12)as usize]as f64,15..=17=>p.params[(key-15)as usize]as f64,18..=20=>p.mode[(key-18)as usize]as f64,21=>p.outputs as f64,22=>p.epoch as f64,23=>p.edit_frame.map_or(-1.,|f|f as f64),24=>p.retirements as f64,25=>p.activations as f64,_=>f64::NAN}}
