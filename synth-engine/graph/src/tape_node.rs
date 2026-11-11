//! Full Tape owns its source-defined clocks and prepared immutable curve bank.
//! Only exact-integer graph controls are imported here. Native prebooked-seconds
//! automation is a separate standalone contract, not inferred from graph events.
pub struct Adapter {
    kernel: Box<calmbgm_tape_fx::tape::Engine>,
    drives: Vec<f64>,
    mask: u8,
    prepared: bool,
}
impl Adapter {
    pub fn new(rate: f64) -> Option<Box<Self>> {
        Some(Box::new(Self { kernel: calmbgm_tape_fx::tape::Engine::new(rate)?, drives: Vec::with_capacity(32), mask: 0, prepared: false }))
    }
    pub fn drive(&mut self,value:f64)->bool {
        if self.prepared || !self.kernel.prepare_drive(value) { return false; }
        self.drives.push(value); true
    }
    pub fn initial(&mut self,index:usize,value:f64)->bool {
        if self.prepared || !self.kernel.initial(index,value) { return false; }
        self.mask |= 1<<index; true
    }
    pub fn valid_param(&self,index:usize,value:f64)->bool {
        calmbgm_tape_fx::tape::PARAMETERS.get(index).is_some_and(|&(lo,hi)| value.is_finite() && value>=lo && value<=hi)
            && (index!=3 || self.drives.contains(&value))
    }
    pub fn can_prepare(&self)->bool { !self.prepared && self.mask==31 && self.drives.contains(&self.parameters()[3]) }
    pub fn prepare(&mut self)->bool { if !self.can_prepare() || !self.kernel.prepare() { return false; } self.prepared=true; true }
    pub fn param(&mut self,index:usize,value:f64)->bool { self.valid_param(index,value) && self.kernel.param(index,value) }
    pub fn parameters(&self)->[f64;5] { self.kernel.parameters() }
    pub fn tick(&mut self,input:[f32;2])->[f32;2] { self.kernel.tick(input) }
    pub fn begin_block(&mut self) { self.kernel.begin_block(); }
    pub fn reset(&mut self) { self.kernel.reset(); }
    pub fn stat(&self,index:u32)->f64 { match index {16=>128.,17=>self.kernel.stat(1)%128.,18=>self.kernel.stat(1),19=>self.prepared as u32 as f64,_=>self.kernel.stat(index)} }
}
