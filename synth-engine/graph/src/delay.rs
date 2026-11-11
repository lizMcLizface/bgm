//! Bounded, explicitly configured stereo delay and preparation-time PDC state.
pub const MAX_FRAMES:usize=262144;
pub const MAX_TOTAL_FRAMES:usize=1048576;
pub struct Delay {buffer:Vec<[f32;2]>,position:usize}
impl Delay {
 pub fn new(frames:usize)->Option<Self>{if frames>MAX_FRAMES{return None;}Some(Self{buffer:vec![[0.;2];frames],position:0})}
 pub fn frames(&self)->usize{self.buffer.len()}
 pub fn tick(&mut self,input:[f32;2])->[f32;2]{if self.buffer.is_empty(){return input;}let out=self.buffer[self.position];self.buffer[self.position]=input;self.position=(self.position+1)%self.buffer.len();out}
 pub fn reset(&mut self){self.buffer.fill([0.;2]);self.position=0;}
}
