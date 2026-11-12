//! Feature-gated resource SPI. The accepted default finite build excludes this module.
use super::*;
pub struct LivePhaseBank{data:Vec<f32>,scratch:[f32;1024],written:usize,sealed:bool}
impl LivePhaseBank{pub fn new(rate:f64)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate){return None;}let n=crate::native_sine::Sine::size(rate);Some(Box::new(Self{data:vec![0.;n],scratch:[0.;1024],written:0,sealed:false}))}pub fn size(&self)->usize{self.data.len()}pub fn scratch(&mut self)->&mut[f32;1024]{&mut self.scratch}pub fn write(&mut self,offset:usize,n:usize)->bool{if self.sealed||offset!=self.written||n==0||n>1024||offset+n>self.data.len()||self.scratch[..n].iter().any(|v|!v.is_finite()||v.abs()>2.){return false;}self.data[offset..offset+n].copy_from_slice(&self.scratch[..n]);self.scratch[..n].copy_from_slice(&self.data[offset..offset+n]);self.written+=n;true}pub fn seal(&mut self)->bool{if self.written!=self.data.len()||self.sealed{return false;}self.sealed=true;true}pub fn abort(&mut self){self.written=0;self.sealed=false;}pub fn ready(&self)->bool{self.sealed}}
pub struct LiveWalkBank{points:[[f64;2];256],scratch:[f64;512],first:u64,min:usize,max:usize,written:usize,initial:f64,period_before:f64,period_after:f64,offset:f64,at:f64,kind:u32,sealed:bool}
impl LiveWalkBank{pub fn new()->Box<Self>{Box::new(Self{points:[[0.;2];256],scratch:[0.;512],first:0,min:0,max:0,written:0,initial:0.,period_before:180.,period_after:180.,offset:0.,at:0.,kind:0,sealed:false})}pub fn begin(&mut self,kind:u32,first:u64,min:usize,max:usize,initial:f64,period_before:f64,period_after:f64,offset:f64,at:f64)->bool{if !matches!(kind,1|2)||min>max||max>256||first>100_000_000||!initial.is_finite()||initial.abs()>1.||![period_before,period_after].iter().all(|v|v.is_finite()&&(15. ..=900.).contains(v))||!offset.is_finite()||!(0. ..=1_000_000.).contains(&offset)||!at.is_finite()||at<0.||at>MAX_FRAME/8000.||kind==1&&first!=(offset/2.).floor()as u64+1||kind==2&&min!=max{return false;}self.first=first;self.min=min;self.max=max;self.initial=initial;self.period_before=period_before;self.period_after=period_after;self.offset=offset;self.at=at;self.kind=kind;self.written=0;self.sealed=false;true}pub fn scratch(&mut self)->&mut[f64;512]{&mut self.scratch}pub fn write(&mut self,offset:usize,n:usize)->bool{if self.sealed||self.kind==0||offset!=self.written||n==0||n>256||offset+n>self.max{return false;}for i in 0..n{if self.scratch[2*i]!=(self.first+offset as u64+i as u64)as f64||!self.scratch[2*i+1].is_finite()||self.scratch[2*i+1].abs()>1.{return false;}}for i in 0..n{self.points[offset+i]=[self.scratch[2*i],self.scratch[2*i+1]];}self.written+=n;true}pub fn seal(&mut self)->bool{if self.sealed||self.kind==0||self.written!=self.max{return false;}self.sealed=true;true}pub fn abort(&mut self){self.kind=0;self.sealed=false;self.written=0;}fn first_count(&self,birth:f64)->Option<usize>{if !self.sealed||self.kind!=1{return None;}let mut n=0;while n<self.max&&birth+self.points[n][0]*2.-self.offset<=birth+90.{n+=1;}if n<self.min||birth+(self.first+n as u64)as f64*2.-self.offset<=birth+90.{None}else{Some(n)}}}


fn time(rate:f64,seconds:f64)->bool{seconds.is_finite()&&seconds>=0.&&seconds*rate<=MAX_FRAME}
impl Engine {
 /// Cold allocation only; host must call before the context's first callback.
 pub fn live_enable(&mut self)->bool{
  if self.ready||!self.raw.is_empty(){return self.reject();}
  self.total.live_cold();for l in &mut self.layers{l.wave.live_cold();}self.total.live_enabled=true;
  self.live_begin(0.,self.offset)
 }
 /// A lease reset retains all tables and lane capacity; no RNG or FFT work.
 pub fn live_begin(&mut self,frame:f64,offset:f64)->bool{
  if !self.total.live_enabled||!self.total.live_has_bank()||!canonical(frame)||!offset.is_finite()||!(0. ..=1_000_000.).contains(&offset){return self.reject();}
  self.offset=offset;self.live_observed=frame;self.origin=frame as u64;self.frame=frame as u64;self.raw.clear();self.head=0;self.calls=0;self.rejected=0;self.peak=0.;self.bed.reset(1.);self.total.live_clear(offset);
  for l in &mut self.layers{for(i,lane)in l.lanes.iter_mut().enumerate(){lane.reset(if i<3{350.}else if i<=6{1.}else{0.});}l.filters=[Biquad::default();3];l.channels=2;l.initial=Shape::home();l.current=Shape::home();l.wave.live_clear(offset);}
  for s in &mut self.sources{s.owner=0;s.initial_owner=0;s.enabled=false;s.fade.reset(1.);}self.input.fill([[0.;Q];2]);self.layer_output.fill([[0.;Q];2]);self.output.fill([0.;Q]);self.controls.fill([0.;Q]);self.ready=true;true
 }
 fn live_wave(&self,target:usize)->&Wave{if target==6{&self.total}else{&self.layers[target].wave}}
 fn live_wave_mut(&mut self,target:usize)->&mut Wave{if target==6{&mut self.total}else{&mut self.layers[target].wave}}
 /// Publishes a cold-prepared table by pointer swap, and an optional first walk.
 /// All payload/lane checks precede mutation. Shape follows native constructor defaults.
 pub fn live_create(&mut self,target:usize,birth:f64,mode:u32,period:f64,shape:[f64;5],phase:&mut LivePhaseBank,walk:Option<&mut LiveWalkBank>)->bool{self.live_create_recipe(target,birth,mode,period,shape,self.offset,phase,walk)}
 /// Captured constructor offset belongs to this wave, never the whole bed.
 pub fn live_create_recipe(&mut self,target:usize,birth:f64,mode:u32,period:f64,shape:[f64;5],offset:f64,phase:&mut LivePhaseBank,walk:Option<&mut LiveWalkBank>)->bool{
  let Some(shape)=Shape::new(shape)else{return self.reject();};
  if !offset.is_finite()||!(0. ..=1_000_000.).contains(&offset)||target>6||!self.total.live_enabled||!time(self.rate,birth)||birth<self.origin as f64/self.rate||mode>1||!period.is_finite()||!(15. ..=900.).contains(&period)||!phase.ready(){return self.reject();}
  let wave=self.live_wave(target);if wave.live_created||phase.size()!=wave.live_table_size()||!wave.frequency.available(1)||!wave.depth.available(1){return self.reject();}
  let count=if mode==1{let Some(w)=walk.as_ref()else{return self.reject();};let Some(n)=w.first_count(birth)else{return self.reject();};if w.offset!=offset||w.period_before!=period||!wave.live_can_first(n){return self.reject();}n}else{if walk.is_some(){return self.reject();}0};
  if target<6&&self.layers[target].lanes.iter().any(|l|!l.available(2)){return self.reject();}
  let wave=self.live_wave_mut(target);wave.live_captured_offset(offset);wave.live_phase(period,birth,&mut phase.data);phase.abort();
  if let Some(w)=walk{wave.live_first(birth,w.initial,&w.points[..count],birth);w.abort();}
  assert!(wave.set_mode(mode,birth));
  if target<6{let rate=self.rate;let l=&mut self.layers[target];l.birth=birth;l.mode=mode;l.period=period;l.initial=shape;l.current=shape;l.lanes[8].intrinsic(0.);assert!(l.lanes[8].add_seconds(birth,0,0.,0.));assert!(l.shape(rate,shape,birth,0.));}true
 }
 pub fn live_first(&mut self,target:usize,birth:f64,bank:&mut LiveWalkBank)->Option<usize>{
  if target>6||!self.total.live_enabled||!time(self.rate,birth){self.reject();return None;}
  let w=self.live_wave(target);let Some(n)=bank.first_count(birth)else{self.reject();return None;};
  if !w.live_created||w.live_walk_created||bank.offset!=w.live_offset()||bank.period_before!=w.period||!w.live_can_first(n){self.reject();return None;}
  self.live_wave_mut(target).live_first(birth,bank.initial,&bank.points[..n],birth);bank.abort();Some(n)
 }
 pub fn live_refill(&mut self,target:usize,bank:&mut LiveWalkBank)->bool{self.live_refill_at(self.frame as f64,target,bank)}
 pub fn live_refill_at(&mut self,observed:f64,target:usize,bank:&mut LiveWalkBank)->bool{
  if !canonical(observed)||observed<self.live_observed||target>6||!self.total.live_enabled||!bank.sealed||bank.kind!=2||bank.min!=bank.max{return self.reject();}
  let w=self.live_wave(target);let mut n=0;while n<bank.max&&w.live_birth()+bank.points[n][0]*2.-w.live_offset()<=bank.at+90.{n+=1;}
  if bank.offset!=w.live_offset()||bank.period_before!=w.period||bank.period_after!=w.period||bank.first!=w.live_next()||bank.at<w.live_birth()||n!=bank.max||w.live_birth()+(bank.first+n as u64)as f64*2.-w.live_offset()<=bank.at+90.||!w.live_can_refill(n,observed){return self.reject();}
  self.live_wave_mut(target).live_refill(&bank.points[..n],bank.at,observed);bank.abort();self.live_observed=observed;true
 }
 pub fn live_bind(&mut self,slot:usize,layer:usize,owner:u32)->bool{
  if !self.total.live_enabled||slot>=SOURCES||layer>=LAYERS||owner==0||!self.layers[layer].wave.live_created||self.sources[slot].enabled{return self.reject();}
  let s=&mut self.sources[slot];s.owner=owner;s.layer=layer;s.enabled=true;s.fade.reset(1.);true
 }
 /// Immediate receipt-time application, retaining original authored event seconds.
 /// Resource preparation/refills are separate; no render-time random seeking exists.
 pub fn live_command(&mut self,op:u32,target:usize,owner:u32,at:f64,tau:f64,args:[f64;6])->bool{self.live_command_at(self.frame as f64,op,target,owner,at,tau,args)}
 pub fn live_command_at(&mut self,observed:f64,op:u32,target:usize,owner:u32,at:f64,tau:f64,args:[f64;6])->bool{
  if !canonical(observed)||observed<self.live_observed||!self.total.live_enabled||!time(self.rate,at)||!tau.is_finite()||!(0. ..=480.).contains(&tau)||args.iter().any(|v|!v.is_finite())||op>7||op==6||(op!=4&&op!=7&&owner!=0)||matches!(op,2|3|7)&&target!=0{return self.reject();}
  let frame=observed;let room=match op{
   0|5=>target<6&&self.layers[target].wave.live_created&&(op!=0||Shape::new([args[0],args[1],args[2],args[3],args[4]]).is_some())&&self.layers[target].lanes.iter().all(|l|l.available_at(if op==5{2}else{1},frame)),
   1=>target<7&&args[0].fract()==0.&&(0. ..=1.).contains(&args[0])&&(15. ..=900.).contains(&args[1])&&(0. ..=if target==6{0.5}else{0.8}).contains(&args[2])&&(args[3]==0.||args[3]==1.)&&self.live_wave(target).live_created&&(args[0]==0.||self.live_wave(target).live_walk_created)&&self.live_wave(target).live_settings_room(frame),
   2|3=>self.total.live_created&&self.bed.available_at(1,frame),
   4=>target<SOURCES&&owner!=0&&self.sources[target].enabled&&self.sources[target].owner==owner&&args[0].fract()==0.&&(0. ..=3.).contains(&args[0])&&(0. ..=1.).contains(&args[1])&&self.sources[target].fade.available_at(1,frame),
   7=>owner!=0,_=>false};if !room{return self.reject();}
  match op{0|5=>for l in &mut self.layers[target].lanes{l.prune_for_insert(frame);},1=>self.live_wave_mut(target).live_prune_settings(frame),2|3=>self.bed.prune_for_insert(frame),4=>self.sources[target].fade.prune_for_insert(frame),_=>{}}
  assert!(self.apply(Command{observed:self.frame,op,target,owner,at,tau,args,cancelled:false}));self.live_observed=observed;true
 }
 pub fn live_render(&mut self,sa:u32,sp:u32,la:u32,lp:u32,fa:u32,fp:u32,bed:u32)->bool{
  if !self.total.live_enabled||bed>0&&!self.total.live_created||(0..6).any(|i|lp&(1<<i)!=0&&!self.layers[i].wave.live_created){return self.reject();}self.render(sa,sp,la,lp,fa,fp,bed)
 }
}
#[no_mangle]pub extern "C" fn ambience_spatial_live_api()->u32{1}
#[no_mangle]pub extern "C" fn ambience_spatial_live_enable(p:&mut Engine)->u32{p.live_enable()as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_begin(p:&mut Engine,frame:f64,offset:f64)->u32{p.live_begin(frame,offset)as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_phase_new(rate:f64)->*mut LivePhaseBank{LivePhaseBank::new(rate).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn ambience_spatial_live_phase_free(p:*mut LivePhaseBank){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn ambience_spatial_live_phase_scratch(p:&mut LivePhaseBank)->*mut f32{p.scratch.as_mut_ptr()}
#[no_mangle]pub extern "C" fn ambience_spatial_live_phase_write(p:&mut LivePhaseBank,offset:f64,n:f64)->u32{let(Some(o),Some(n))=(integer(offset,16384),integer(n,1024))else{return 0;};p.write(o,n)as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_phase_seal(p:&mut LivePhaseBank)->u32{p.seal()as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_phase_abort(p:&mut LivePhaseBank){p.abort();}
#[no_mangle]pub extern "C" fn ambience_spatial_live_walk_new()->*mut LiveWalkBank{Box::into_raw(LiveWalkBank::new())}
#[no_mangle]pub unsafe extern "C" fn ambience_spatial_live_walk_free(p:*mut LiveWalkBank){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn ambience_spatial_live_walk_scratch(p:&mut LiveWalkBank)->*mut f64{p.scratch.as_mut_ptr()}
#[no_mangle]pub extern "C" fn ambience_spatial_live_walk_begin(p:&mut LiveWalkBank,kind:f64,first:f64,min:f64,max:f64,initial:f64,before:f64,after:f64,offset:f64,at:f64)->u32{let(Some(k),Some(f),Some(lo),Some(hi))=(integer(kind,2),integer(first,100_000_000),integer(min,256),integer(max,256))else{return 0;};p.begin(k as u32,f as u64,lo,hi,initial,before,after,offset,at)as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_walk_write(p:&mut LiveWalkBank,offset:f64,n:f64)->u32{let(Some(o),Some(n))=(integer(offset,256),integer(n,256))else{return 0;};p.write(o,n)as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_walk_seal(p:&mut LiveWalkBank)->u32{p.seal()as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_walk_abort(p:&mut LiveWalkBank){p.abort();}
#[no_mangle]pub unsafe extern "C" fn ambience_spatial_live_create(p:&mut Engine,target:f64,birth:f64,mode:f64,period:f64,d:f64,s:f64,w:f64,pan:f64,level:f64,phase:&mut LivePhaseBank,walk:*mut LiveWalkBank)->u32{let(Some(t),Some(m))=(integer(target,6),integer(mode,1))else{return 0;};p.live_create(t,birth,m as u32,period,[d,s,w,pan,level],phase,walk.as_mut())as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_first(p:&mut Engine,target:f64,birth:f64,bank:&mut LiveWalkBank)->f64{integer(target,6).and_then(|t|p.live_first(t,birth,bank)).map_or(-1.,|n|n as f64)}
#[no_mangle]pub extern "C" fn ambience_spatial_live_refill(p:&mut Engine,target:f64,bank:&mut LiveWalkBank)->u32{integer(target,6).is_some_and(|t|p.live_refill(t,bank))as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_bind(p:&mut Engine,slot:f64,layer:f64,owner:u32)->u32{let(Some(s),Some(l))=(integer(slot,18),integer(layer,5))else{return 0;};p.live_bind(s,l,owner)as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_command(p:&mut Engine,op:f64,target:f64,owner:u32,at:f64,tau:f64,a:f64,b:f64,c:f64,d:f64,e:f64,f:f64)->u32{let(Some(op),Some(target))=(integer(op,7),integer(target,18))else{return 0;};p.live_command(op as u32,target,owner,at,tau,[a,b,c,d,e,f])as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_render(p:&mut Engine,sa:u32,sp:u32,la:u32,lp:u32,fa:u32,fp:u32,bed:u32)->u32{p.live_render(sa,sp,la,lp,fa,fp,bed)as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_created(p:&Engine)->u32{(0..7).fold(0,|m,i|m|((p.live_wave(i).live_created as u32)<<i))}

#[no_mangle]pub extern "C" fn ambience_spatial_live_walk_count(p:&LiveWalkBank,birth:f64)->f64{if !birth.is_finite()||birth<0.||birth>MAX_FRAME/8000.{return -1.;}p.first_count(birth).map_or(-1.,|n|n as f64)}

#[no_mangle]pub extern "C" fn ambience_spatial_live_command_at(p:&mut Engine,observed:f64,op:f64,target:f64,owner:u32,at:f64,tau:f64,a:f64,b:f64,c:f64,d:f64,e:f64,f:f64)->u32{let(Some(op),Some(target))=(integer(op,7),integer(target,18))else{return 0;};p.live_command_at(observed,op as u32,target,owner,at,tau,[a,b,c,d,e,f])as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_refill_at(p:&mut Engine,observed:f64,target:f64,bank:&mut LiveWalkBank)->u32{integer(target,6).is_some_and(|t|p.live_refill_at(observed,t,bank))as u32}
#[no_mangle]pub extern "C" fn ambience_spatial_live_observed(p:&Engine)->f64{if p.total.live_enabled{p.live_observed}else{f64::NAN}}

impl Engine {
 /// First-walk publication and the original setMode/setPeriod/depth edit form
 /// one admission transaction. Invalid settings never consume the staged walk.
 pub fn live_activate_walk(&mut self,observed:f64,target:usize,birth:f64,period:f64,depth:f64,tau:f64,property:bool,bank:&mut LiveWalkBank)->Option<usize>{
  if !canonical(observed)||observed<self.live_observed||target>6||!self.total.live_enabled||!time(self.rate,birth)||!period.is_finite()||!(15. ..=900.).contains(&period)||!depth.is_finite()||!(0. ..=if target==6{0.5}else{0.8}).contains(&depth)||!tau.is_finite()||!(0. ..=480.).contains(&tau){self.reject();return None;}
  let w=self.live_wave(target);if !w.live_created||w.live_walk_created||!w.live_settings_room(observed){self.reject();return None;}
  // Validate every first-resource predicate before pruning or publication.
  let Some(n)=bank.first_count(birth)else{self.reject();return None;};if bank.offset!=w.live_offset()||bank.period_before!=w.period||bank.period_after!=period||!w.live_can_first(n){self.reject();return None;}
  let count=self.live_first(target,birth,bank).expect("preflighted first resource");
  assert!(self.live_command_at(observed,1,target,0,birth,tau,[1.,period,depth,property as u32 as f64,0.,0.]));Some(count)
 }
}
#[no_mangle]pub extern "C" fn ambience_spatial_live_activate_walk(p:&mut Engine,observed:f64,target:f64,birth:f64,period:f64,depth:f64,tau:f64,property:f64,bank:&mut LiveWalkBank)->f64{let(Some(t),Some(property))=(integer(target,6),integer(property,1))else{return -1.;};p.live_activate_walk(observed,t,birth,period,depth,tau,property!=0,bank).map_or(-1.,|n|n as f64)}

impl LiveWalkBank {
 /// Read actual retained knot fields back into transfer scratch. Incoming scratch
 /// is not an authority for receiver identity after a write.
 pub fn read(&mut self,offset:usize,n:usize)->bool{if n==0||n>256||offset.checked_add(n).is_none_or(|end|end>self.written){return false;}for i in 0..n{self.scratch[2*i]=self.points[offset+i][0];self.scratch[2*i+1]=self.points[offset+i][1];}true}
}
#[no_mangle]pub extern "C" fn ambience_spatial_live_walk_read(p:&mut LiveWalkBank,offset:f64,n:f64)->u32{let(Some(o),Some(n))=(integer(offset,256),integer(n,256))else{return 0;};p.read(o,n)as u32}

// Additive successor ABI: reads do not evaluate automation or alter DSP clocks.
impl Engine {
 pub fn live_level_intrinsic(&self,layer:usize)->f64{if layer>=6||!self.total.live_enabled||!self.layers[layer].wave.live_created{f64::NAN}else{self.layers[layer].lanes[8].current() as f64}}
 pub fn live_captured_offset(&self,target:usize)->f64{if target>6||!self.total.live_enabled{f64::NAN}else{self.live_wave(target).live_offset()}}
}
#[no_mangle]pub extern "C" fn ambience_spatial_live_create_recipe(p:&mut Engine,target:f64,birth:f64,mode:f64,period:f64,offset:f64,d:f64,s:f64,w:f64,pan:f64,level:f64,phase:&mut LivePhaseBank,walk:*mut LiveWalkBank)->u32{let(Some(t),Some(m))=(integer(target,6),integer(mode,1))else{return 0;};unsafe{p.live_create_recipe(t,birth,m as u32,period,[d,s,w,pan,level],offset,phase,walk.as_mut())as u32}}
#[no_mangle]pub extern "C" fn ambience_spatial_live_level_intrinsic(p:&Engine,layer:f64)->f64{integer(layer,5).map_or(f64::NAN,|l|p.live_level_intrinsic(l))}
#[no_mangle]pub extern "C" fn ambience_spatial_live_wave_offset(p:&Engine,target:f64)->f64{integer(target,6).map_or(f64::NAN,|t|p.live_captured_offset(t))}
