#[path="../../fdn-room-live/src/timeline.rs"]mod timeline;
const Q:usize=128;const N:usize=44100;const COMMANDS:usize=32;
static BASIS:&[u8;N*16]=include_bytes!("../basis.f64le");
#[inline]fn basis(i:usize,k:usize)->f64{let a=i*16+k*8;f64::from_le_bytes(BASIS[a..a+8].try_into().unwrap())}
#[inline]fn cell(i:usize,drive:f64)->f32{((3.+drive)*basis(i,0)/(std::f64::consts::PI+drive*basis(i,1)))as f32}
#[inline]fn shape(x:f32,drive:f64)->f32{let virtual_index=((x+1.)*((N-1)as f32*0.5)).clamp(0.,(N-1)as f32);let at=virtual_index as usize;let next=(at+1).min(N-1);let f=virtual_index-at as f32;let lo=cell(at,drive);let hi=cell(next,drive);let delta=hi-lo;let scaled=f*delta;scaled+lo}
#[derive(Clone,Copy)]struct Command{kind:usize,value:f64,author:u64,seconds:f64}
const EMPTY:Command=Command{kind:0,value:0.,author:0,seconds:0.};
pub struct Engine{rate:f64,channels:usize,drive:f64,ready:bool,frame:u64,origin:u64,lanes:[timeline::LiveTimeline;2],targets:[f64;2],queue:[Command;COMMANDS],queued:usize,last_author:u64,input:[[f32;Q];2],output:[[f32;Q];2],wet:[[f32;Q];2],calls:u64,rendered:u64,unpulled:u64,applied:u64,assignments:u64,rejected:u64,peak:f64,initial_steps:usize}
fn index(v:f64,max:usize)->Option<usize>{if v.is_finite()&&v>=0.&&v.fract()==0.&&v<=max as f64{Some(v as usize)}else{None}}
fn canonical(v:f64)->bool{v.is_finite()&&v>=0.&&v<=1099511627648.&&v%128.==0.}
fn finite(v:f64)->bool{v.is_finite()&&(v as f32).is_finite()}
fn drive(v:f64)->bool{v.is_finite()&&(0. ..=30.).contains(&v)}
impl Engine{
 fn new(rate:f64,channels:usize)->Option<Box<Self>>{if !rate.is_finite()||rate.fract()!=0.||!(8000. ..=192000.).contains(&rate)||!(1..=2).contains(&channels){return None;}Some(Box::new(Self{rate,channels,drive:0.,ready:false,frame:0,origin:0,lanes:std::array::from_fn(|_|timeline::LiveTimeline::new(1.,257,rate)),targets:[1.;2],queue:[EMPTY;COMMANDS],queued:0,last_author:0,input:[[0.;Q];2],output:[[0.;Q];2],wet:[[0.;Q];2],calls:0,rendered:0,unpulled:0,applied:0,assignments:2,rejected:0,peak:0.,initial_steps:0}))}
 fn reject(&mut self)->bool{self.rejected+=1;false}
 fn time(&self,author:f64,seconds:f64)->bool{canonical(author)&&seconds.is_finite()&&seconds==author/self.rate}
 fn initial(&mut self,kind:usize,value:f64,author:f64,seconds:f64)->bool{if self.ready||!self.time(author,seconds)||author<self.last_author as f64||self.initial_steps>=128||kind<2&&(!finite(value)||!self.lanes[kind].available_at(1,author))||kind==2&&!drive(value){return self.reject();}if self.initial_steps==0&&(kind!=0||value!=1.)||self.initial_steps==1&&(kind!=1||value!=0.){return self.reject();}if kind<2{self.lanes[kind].prune_for_insert(author);assert!(self.lanes[kind].add_seconds(seconds,0,value,0.));self.targets[kind]=value;}else{self.drive=value;self.assignments+=1;}self.last_author=author as u64;self.initial_steps+=1;true}
 fn prepare(&mut self,origin:f64)->bool{if self.ready||!canonical(origin)||origin<self.last_author as f64||self.initial_steps<2{return self.reject();}self.frame=origin as u64;self.origin=self.frame;self.ready=true;true}
 fn sync(&mut self,frame:f64)->bool{if !self.ready||!canonical(frame)||frame<self.frame as f64||frame>1099511627648.||self.queued!=0{return self.reject();}self.frame=frame as u64;true}
 fn enqueue(&mut self,c:Command)->bool{if !self.ready||self.queued>=COMMANDS||!self.time(c.author as f64,c.seconds)||c.author<self.last_author||c.author<self.origin||c.author>self.frame||c.kind<2&&(!finite(c.value)||!self.lanes[c.kind].available_at(self.queue[..self.queued].iter().filter(|e|e.kind==c.kind).count()+1,self.frame as f64))||c.kind==2&&!drive(c.value){return self.reject();}self.last_author=c.author;self.queue[self.queued]=c;self.queued+=1;true}
 fn commit(&mut self)->bool{if !self.ready{return self.reject();}for lane in 0..2{let n=self.queue[..self.queued].iter().filter(|c|c.kind==lane).count();if !self.lanes[lane].available_at(n,self.frame as f64){return self.reject();}}for i in 0..self.queued{let c=self.queue[i];if c.kind<2{self.lanes[c.kind].prune_for_insert(self.frame as f64);assert!(self.lanes[c.kind].add_seconds(c.seconds,0,c.value,0.));self.targets[c.kind]=c.value;}else{self.drive=c.value;self.assignments+=1;}self.applied+=1;}self.queued=0;true}
 fn render(&mut self,channels:usize,pulled:bool)->bool{if !self.ready||self.queued!=0||self.frame+128>1099511627648||channels>2||channels!=0&&channels!=self.channels||!pulled&&channels!=0||(0..channels).any(|c|self.input[c].iter().any(|v|!v.is_finite())){return self.reject();}self.output.fill([0.;Q]);self.wet.fill([0.;Q]);self.peak=0.;if pulled{for lane in &mut self.lanes{lane.prepare(self.frame,self.rate);}for c in 0..self.channels{for i in 0..Q{let input=if channels>0{self.input[c][i]}else{0.};let shaped=shape(input,self.drive);let dry=input*self.lanes[0].output[i];let wet=shaped*self.lanes[1].output[i];let y=dry+wet;if !y.is_finite(){return self.reject();}self.wet[c][i]=shaped;self.output[c][i]=y;self.peak=self.peak.max(y.abs()as f64);}}self.rendered+=128;}else{self.unpulled+=128;}self.frame+=128;self.calls+=1;true}
}
#[no_mangle]pub extern "C" fn distortion_cells_api()->u32{1}
#[no_mangle]pub extern "C" fn distortion_cells_new(rate:f64,channels:f64)->*mut Engine{index(channels,2).and_then(|n|Engine::new(rate,n)).map(Box::into_raw).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn distortion_cells_free(p:*mut Engine){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub extern "C" fn distortion_cells_initial(p:&mut Engine,kind:f64,value:f64,author:f64,seconds:f64)->u32{index(kind,2).is_some_and(|kind|p.initial(kind,value,author,seconds))as u32}
#[no_mangle]pub extern "C" fn distortion_cells_prepare(p:&mut Engine,origin:f64)->u32{p.prepare(origin)as u32}
#[no_mangle]pub extern "C" fn distortion_cells_sync(p:&mut Engine,frame:f64)->u32{p.sync(frame)as u32}
#[no_mangle]pub extern "C" fn distortion_cells_enqueue(p:&mut Engine,kind:f64,value:f64,author:f64,seconds:f64)->u32{if !p.time(author,seconds){return p.reject()as u32;}index(kind,2).is_some_and(|kind|p.enqueue(Command{kind,value,author:author as u64,seconds}))as u32}
#[no_mangle]pub extern "C" fn distortion_cells_commit(p:&mut Engine)->u32{p.commit()as u32}
#[no_mangle]pub extern "C" fn distortion_cells_render(p:&mut Engine,c:f64,pulled:f64)->u32{match(index(c,2),index(pulled,1)){(Some(c),Some(v))=>p.render(c,v==1)as u32,_=>p.reject()as u32}}
#[no_mangle]pub extern "C" fn distortion_cells_input(p:&mut Engine,c:u32)->*mut f32{p.input.get_mut(c as usize).map_or(std::ptr::null_mut(),|v|v.as_mut_ptr())}
#[no_mangle]pub extern "C" fn distortion_cells_output(p:&Engine,c:u32)->*const f32{p.output.get(c as usize).map_or(std::ptr::null(),|v|v.as_ptr())}
#[no_mangle]pub extern "C" fn distortion_cells_wet(p:&Engine,c:u32)->*const f32{p.wet.get(c as usize).map_or(std::ptr::null(),|v|v.as_ptr())}
#[no_mangle]pub extern "C" fn distortion_cells_stat(p:&Engine,i:u32)->f64{match i{0=>p.frame as f64,1=>p.peak,2=>p.calls as f64,3=>p.rendered as f64,4=>p.unpulled as f64,5=>p.applied as f64,6=>p.rejected as f64,7=>p.drive,8=>p.queued as f64,9=>p.assignments as f64,10=>p.ready as u32 as f64,11=>p.origin as f64,12=>p.targets[0],13=>p.targets[1],14=>p.initial_steps as f64,_=>f64::NAN}}
#[no_mangle]pub extern "C" fn distortion_cells_capacity(p:&Engine,lane:f64,count:f64)->u32{match(index(lane,2),index(count,32)){(Some(lane),Some(n))=>(p.ready&&p.queued+n<=COMMANDS&&(lane==2||p.lanes[lane].available_at(n+p.queue[..p.queued].iter().filter(|c|c.kind==lane).count(),p.frame as f64)))as u32,_=>0}}
#[no_mangle]pub extern "C" fn distortion_cells_cell(i:f64,gain:f64)->f32{match index(i,N-1){Some(i)if drive(gain)=>cell(i,gain),_=>f32::NAN}}
#[no_mangle]pub extern "C" fn distortion_cells_shape(input:f32,gain:f64)->f32{if input.is_finite()&&drive(gain){shape(input,gain)}else{f32::NAN}}
