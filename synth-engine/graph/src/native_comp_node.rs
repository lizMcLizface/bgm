//! Native streaming controls and immutable captured timelines are distinct modes.
//! The source-owned32/128 clocks remain inside the verified kernels; no adapter
//! buffering, new gain law or second envelope smoothing is introduced here.
enum Kernel {
    Stream(Box<calmbgm_native_compressor::Engine>),
    Capture(Box<calmbgm_native_compressor_automation::Automation>),
}
pub struct Adapter { kernel: Kernel, mask:u8, prepared:bool }
impl Adapter {
    pub fn new(rate:f64,capture:bool)->Option<Box<Self>> {
        let kernel=if capture {Kernel::Capture(calmbgm_native_compressor_automation::Automation::new(rate)?)} else {Kernel::Stream(calmbgm_native_compressor::Engine::new(rate)?)};
        Some(Box::new(Self{kernel,mask:0,prepared:false}))
    }
    pub fn initial(&mut self,index:usize,value:f64)->bool {
        if self.prepared || index>=5 || self.mask&(1<<index)!=0 {return false;}
        let ok=match &mut self.kernel{Kernel::Stream(k)=>k.initial(index,value),Kernel::Capture(k)=>k.initial(index,value)};
        if ok {self.mask|=1<<index;} ok
    }
    pub fn event(&mut self,index:usize,kind:u32,seconds:f64,value:f64,tau:f64)->bool {
        if self.prepared{return false;} match &mut self.kernel{Kernel::Capture(k)=>k.event(index,kind,seconds,value,tau),_=>false}
    }
    pub fn valid_param(&self,index:usize,value:f64)->bool {
        matches!(&self.kernel,Kernel::Stream(_)) && calmbgm_native_compressor::PARAMETERS.get(index).is_some_and(|&(lo,hi)|value.is_finite()&&value>=lo&&value<=hi)
    }
    pub fn can_prepare(&self)->bool{!self.prepared&&self.mask==31}
    pub fn prepare(&mut self)->bool {
        if !self.can_prepare(){return false;} let ok=match &mut self.kernel{Kernel::Stream(k)=>k.prepare(),Kernel::Capture(k)=>k.prepare()};self.prepared=ok;ok
    }
    pub fn param(&mut self,index:usize,value:f64)->bool {match &mut self.kernel{Kernel::Stream(k)=>k.param(index,value),_=>false}}
    pub fn value(&self,index:usize)->f64 {if index>=5{return f64::NAN;} match &self.kernel{Kernel::Stream(k)=>k.parameters()[index],Kernel::Capture(k)=>k.value(index)}}
    pub fn coefficient(&self,index:usize)->f64 {if index>=5{return f64::NAN;} match &self.kernel{Kernel::Stream(k)=>k.parameters()[index]as f32 as f64,Kernel::Capture(k)=>k.coefficient(index)}}
    pub fn parameters(&self)->[f64;5]{std::array::from_fn(|i|self.value(i))}
    pub fn latency(&self)->f64{self.raw_stat(2)}
    fn raw_stat(&self,index:u32)->f64{match &self.kernel{Kernel::Stream(k)=>k.stat(index),Kernel::Capture(k)=>k.stat(index)}}
    pub fn stat(&self,index:u32)->f64{match index{16=>self.latency(),17=>self.raw_stat(6),18=>self.raw_stat(1),19=>self.prepared as u32 as f64,20=>self.raw_stat(3),21=>self.raw_stat(5),22=>self.raw_stat(4),30..=34=>self.coefficient((index-30)as usize),36..=40=>self.value((index-36)as usize),_=>self.raw_stat(index)}}
    pub fn begin_block(&mut self){match &mut self.kernel{Kernel::Stream(k)=>k.begin_block(),Kernel::Capture(k)=>k.begin_block()}}
    pub fn tick(&mut self,input:[f32;2])->[f32;2]{match &mut self.kernel{Kernel::Stream(k)=>k.tick(input),Kernel::Capture(k)=>k.tick(input)}}
    pub fn reset(&mut self){match &mut self.kernel{Kernel::Stream(k)=>k.reset(),Kernel::Capture(k)=>k.reset()}}
}
