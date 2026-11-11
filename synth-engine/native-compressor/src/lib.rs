//! Owned explicit-profile native DynamicsCompressor node kernel.
//! No existing Web Audio route/default or other compressor implementation is
//! replaced. The actual native32/128 clocks and lookahead remain explicit.
#[cfg(feature = "allocation-audit")]
mod allocation;
mod kernel;
mod math_profile;
pub const BLOCK: usize = 2048;
pub const PARAMETERS: [(f64, f64); 5] = [(-100., 0.), (0., 40.), (1., 20.), (0., 1.), (0., 1.)];
pub struct Engine {
    kernel: kernel::Kernel,
    parameters: [f64; 5],
    mask: u8,
    prepared: bool,
    frame: u64,
    peak: f64,
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
}
impl Engine {
    pub fn new(rate: f64) -> Option<Box<Self>> {
        if !rate.is_finite() || rate.fract() != 0. || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        Some(Box::new(Self {
            kernel: kernel::Kernel::new(rate as f32),
            parameters: [-24., 30., 12., 0.003, 0.25],
            mask: 0,
            prepared: false,
            frame: 0,
            peak: 0.,
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
        }))
    }
    fn valid(index: usize, value: f64) -> bool {
        PARAMETERS
            .get(index)
            .is_some_and(|(a, b)| value.is_finite() && value >= *a && value <= *b)
    }
    pub fn initial(&mut self, index: usize, value: f64) -> bool {
        if self.prepared || !Self::valid(index, value) || self.mask & (1 << index) != 0 {
            return false;
        }
        self.parameters[index] = value;
        self.mask |= 1 << index;
        true
    }
    pub fn prepare(&mut self) -> bool {
        if self.prepared || self.mask != 31 {
            return false;
        }
        self.kernel.begin_quantum(self.parameters.map(|v| v as f32));
        self.prepared = true;
        true
    }
    pub fn param(&mut self, index: usize, value: f64) -> bool {
        if !self.prepared || self.frame % 128 != 0 || !Self::valid(index, value) {
            return false;
        }
        self.parameters[index] = value;
        true
    }
    pub fn parameters(&self) -> [f64; 5] {
        self.parameters
    }
    pub fn input_mut(&mut self, ch: usize) -> Option<&mut [f32; BLOCK]> {
        self.input.get_mut(ch)
    }
    pub fn output(&self, ch: usize) -> Option<&[f32; BLOCK]> {
        self.output.get(ch)
    }
    pub fn begin_block(&mut self) {
        self.peak = 0.;
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        if !self.prepared {
            return [0.; 2];
        }
        if self.frame % 128 == 0 {
            self.kernel.begin_quantum(self.parameters.map(|v| v as f32));
        }
        let out = self.kernel.tick(input, self.frame);
        self.frame += 1;
        self.peak = self.peak.max(out[0].abs() as f64).max(out[1].abs() as f64);
        out
    }
    pub fn render(&mut self, n: usize, channels: usize) -> bool {
        if !self.prepared || n > BLOCK || !(1..=2).contains(&channels) {
            return false;
        }
        self.begin_block();
        for i in 0..n {
            let out = self.tick([self.input[0][i], self.input[channels - 1][i]]);
            self.output[0][i] = out[0];
            self.output[1][i] = out[1];
        }
        true
    }
    pub fn reset(&mut self) {
        self.kernel.reset();
        self.frame = 0;
        self.peak = 0.;
        self.input.fill([0.; BLOCK]);
        self.output.fill([0.; BLOCK]);
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.peak,
            1 => self.frame as f64,
            2 => self.kernel.latency() as f64,
            3 => {
                if self.frame == 0 {
                    0.
                } else {
                    self.kernel.reduction() as f64
                }
            }
            4 => 1.625,
            5 => (self.frame % 32) as f64,
            6 => (self.frame % 128) as f64,
            7 => self.prepared as u32 as f64,
            8..=13 => self.kernel.curve_stat(index - 8) as f64,
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn native_comp_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn native_comp_new(rate: f64) -> *mut Engine {
    Engine::new(rate)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn native_comp_free(p: *mut Engine) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn native_comp_initial(p: &mut Engine, i: usize, v: f64) -> u32 {
    p.initial(i, v) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_prepare(p: &mut Engine) -> u32 {
    p.prepare() as u32
}
#[no_mangle]
pub extern "C" fn native_comp_param(p: &mut Engine, i: usize, v: f64) -> u32 {
    p.param(i, v) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_value(p: &Engine, i: usize) -> f64 {
    p.parameters().get(i).copied().unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn native_comp_input(p: &mut Engine, ch: usize) -> *mut f32 {
    p.input_mut(ch)
        .map(|v| v.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn native_comp_output(p: &Engine, ch: usize) -> *const f32 {
    p.output(ch).map(|v| v.as_ptr()).unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn native_comp_render(p: &mut Engine, n: usize, ch: usize) -> u32 {
    p.render(n, ch) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_reset(p: &mut Engine) {
    p.reset();
}
#[no_mangle]
pub extern "C" fn native_comp_stat(p: &Engine, i: u32) -> f64 {
    p.stat(i)
}
