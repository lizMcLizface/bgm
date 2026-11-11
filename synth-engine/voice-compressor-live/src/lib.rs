//! Owned immediate VoiceCompressor host lifecycle; immutable capture stays separate.
#[cfg(feature = "allocation-audit")]
mod allocation;
#[allow(dead_code)]
mod gain;
#[allow(dead_code)]
mod target;
use calmbgm_native_compressor::{Engine, PARAMETERS};
const BLOCK: usize = 2048;
const COLD: [f64; 5] = [-24., 6., 12., 0.003, 0.25];
const BOUNDS: [(f64, f64); 5] = [(0., 1.), (1., 20.), (-18., 18.), (0.001, 1.), (0.01, 1.)];
const MAX_FRAME: f64 = 9007199254738944.;
pub struct Live {
    core: Box<Engine>,
    targets: [target::Timeline; 5],
    gain: gain::Gain,
    rate: f64,
    lifetime: u32,
    values: [f64; 5],
    mask: u8,
    ready: bool,
    started: bool,
    kernel_ready: bool,
    frame: u64,
    peak: f64,
    last_gain: f32,
    last_core: [f32; 2],
    commands: u64,
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
    core_output: [[f32; BLOCK]; 2],
}
impl Live {
    pub fn new(rate: f64, lifetime: u32) -> Option<Box<Self>> {
        if lifetime > 1 {
            return None;
        }
        let core = Engine::new(rate)?;
        Some(Box::new(Self {
            core,
            targets: std::array::from_fn(|i| {
                target::Timeline::new(PARAMETERS[i].0 as f32, PARAMETERS[i].1 as f32)
            }),
            gain: gain::Gain::new(rate),
            rate,
            lifetime,
            values: [0., 4., 0., 0.003, 0.25],
            mask: 0,
            ready: false,
            started: false,
            kernel_ready: false,
            frame: 0,
            peak: 0.,
            last_gain: 1.,
            last_core: [0.; 2],
            commands: 0,
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
            core_output: [[0.; BLOCK]; 2],
        }))
    }
    fn valid(index: usize, value: f64) -> bool {
        BOUNDS
            .get(index)
            .is_some_and(|&(lo, hi)| value.is_finite() && value >= lo && value <= hi)
    }
    fn frame_valid(frame: f64) -> bool {
        frame.is_finite()
            && frame >= 0.
            && frame <= MAX_FRAME
            && frame.fract() == 0.
            && frame % 128. == 0.
    }
    pub fn initial(&mut self, index: usize, value: f64) -> bool {
        if self.ready || !Self::valid(index, value) || self.mask & (1 << index) != 0 {
            return false;
        }
        self.values[index] = value;
        self.mask |= 1 << index;
        true
    }
    pub fn prepare(&mut self, frame: f64) -> bool {
        if self.ready || self.mask != 31 || !Self::frame_valid(frame) {
            return false;
        }
        self.frame = frame as u64;
        self.ready = true;
        if self.lifetime == 0 || self.active() {
            self.start()
        } else {
            true
        }
    }
    fn start(&mut self) -> bool {
        if self.kernel_ready {
            self.core.reset();
            for (i, value) in COLD.into_iter().enumerate() {
                if !self.core.param(i, value) {
                    return false;
                }
            }
        } else {
            for (i, value) in COLD.into_iter().enumerate() {
                if !self.core.initial(i, value) {
                    return false;
                }
            }
            if !self.core.prepare() {
                return false;
            }
            self.kernel_ready = true;
        }
        for (i, value) in COLD.into_iter().enumerate() {
            self.targets[i].restart(value);
        }
        self.gain.restart_live();
        self.started = true;
        self.last_gain = 1.;
        self.update(31)
    }
    fn update(&mut self, flags: u8) -> bool {
        if flags & 7 != 0 {
            let threshold = -self.values[0] * 36.;
            let ratio = self.values[1];
            let slope = 1. - 1. / ratio;
            let built_in = 0.6 * -threshold * slope;
            let typical = (-18. - threshold).max(0.) * slope;
            let db = -built_in + typical * 0.85 + self.values[2];
            let makeup = 10f64.powf(db / 20.);
            if !self.targets[0].target_now(self.frame, self.rate, threshold, 0.02)
                || !self.targets[2].target_now(self.frame, self.rate, ratio, 0.02)
                || !self.gain.target_now(self.frame, makeup)
            {
                return false;
            }
        }
        if flags & 8 != 0
            && !self.targets[3].target_now(self.frame, self.rate, self.values[3], 0.02)
        {
            return false;
        }
        if flags & 16 != 0
            && !self.targets[4].target_now(self.frame, self.rate, self.values[4], 0.02)
        {
            return false;
        }
        true
    }
    pub fn param(&mut self, index: usize, value: f64) -> bool {
        if !self.ready || self.frame % 128 != 0 || !Self::valid(index, value) {
            return false;
        }
        self.values[index] = value;
        let ok = if !self.started {
            if self.active() {
                self.start()
            } else {
                true
            }
        } else {
            self.update(1 << index)
        };
        if ok {
            self.commands += 1;
        }
        ok
    }
    pub fn active(&self) -> bool {
        self.values[0] > 0.
    }
    pub fn sync_frame(&mut self, frame: f64) -> bool {
        if !self.ready
            || self.frame % 128 != 0
            || !Self::frame_valid(frame)
            || frame < (self.frame as f64)
        {
            return false;
        }
        self.frame = frame as u64;
        true
    }
    pub fn begin_block(&mut self) {
        self.peak = 0.;
        self.core.begin_block();
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        if !self.ready {
            return [0.; 2];
        }
        let out = if self.active() {
            if self.frame % 128 == 0 {
                for i in 0..5 {
                    let value = self.targets[i].tick(self.frame, self.rate);
                    let ok = self.core.param(i, value as f64);
                    debug_assert!(ok);
                }
            }
            self.last_core = self.core.tick(input);
            self.last_gain = self.gain.tick(self.frame);
            [
                self.last_core[0] * self.last_gain,
                self.last_core[1] * self.last_gain,
            ]
        } else {
            self.last_core = [0.; 2];
            input
        };
        self.frame += 1;
        self.peak = self.peak.max(out[0].abs() as f64).max(out[1].abs() as f64);
        out
    }
    pub fn render(&mut self, n: usize, channels: usize) -> bool {
        if !self.ready || n > BLOCK || !(1..=2).contains(&channels) {
            return false;
        }
        self.begin_block();
        for i in 0..n {
            let out = self.tick([self.input[0][i], self.input[channels - 1][i]]);
            self.output[0][i] = out[0];
            self.output[1][i] = out[1];
            self.core_output[0][i] = self.last_core[0];
            self.core_output[1][i] = self.last_core[1];
        }
        true
    }
    pub fn reset(&mut self) -> bool {
        if !self.ready || self.frame % 128 != 0 {
            return false;
        }
        self.core.reset();
        self.started = false;
        for (i, value) in COLD.into_iter().enumerate() {
            self.targets[i].restart(value);
        }
        self.gain.restart_live();
        self.input.fill([0.; BLOCK]);
        self.output.fill([0.; BLOCK]);
        self.core_output.fill([0.; BLOCK]);
        self.last_core = [0.; 2];
        self.last_gain = 1.;
        self.peak = 0.;
        self.commands = 0;
        if self.lifetime == 0 || self.active() {
            self.start()
        } else {
            true
        }
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.peak,
            1 => self.frame as f64,
            2 => {
                if self.active() {
                    self.core.stat(2)
                } else {
                    0.
                }
            }
            3 => self.core.stat(3),
            4 => self.last_gain as f64,
            5 => self.core.stat(1),
            6 => self.active() as u32 as f64,
            7 => self.started as u32 as f64,
            8 => self.ready as u32 as f64,
            9 => (self.frame % 128) as f64,
            10 => self
                .targets
                .iter()
                .map(target::Timeline::len)
                .sum::<usize>() as f64,
            11 => self.gain.len() as f64,
            12 => self.core.stat(2),
            13 => self.commands as f64,
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn voice_comp_live_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn voice_comp_live_new(rate: f64, lifetime: u32) -> *mut Live {
    Live::new(rate, lifetime)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn voice_comp_live_free(p: *mut Live) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn voice_comp_live_initial(p: &mut Live, index: usize, value: f64) -> u32 {
    p.initial(index, value) as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_live_prepare(p: &mut Live, frame: f64) -> u32 {
    p.prepare(frame) as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_live_param(p: &mut Live, index: usize, value: f64) -> u32 {
    p.param(index, value) as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_live_sync(p: &mut Live, frame: f64) -> u32 {
    p.sync_frame(frame) as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_live_reset(p: &mut Live) -> u32 {
    p.reset() as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_live_render(p: &mut Live, n: usize, channels: usize) -> u32 {
    p.render(n, channels) as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_live_input(p: &mut Live, ch: usize) -> *mut f32 {
    p.input
        .get_mut(ch)
        .map(|a| a.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn voice_comp_live_output(p: &Live, ch: usize) -> *const f32 {
    p.output
        .get(ch)
        .map(|a| a.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn voice_comp_live_core_output(p: &Live, ch: usize) -> *const f32 {
    p.core_output
        .get(ch)
        .map(|a| a.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn voice_comp_live_value(p: &Live, index: usize) -> f64 {
    p.values.get(index).copied().unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn voice_comp_live_coefficient(p: &Live, index: usize) -> f64 {
    p.targets
        .get(index)
        .map(|a| a.current() as f64)
        .unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn voice_comp_live_stat(p: &Live, index: u32) -> f64 {
    p.stat(index)
}
