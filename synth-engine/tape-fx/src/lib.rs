//! Explicit Chromium 2x profile prototype for the native Tape WaveShaper.
//! Original algorithm sources are pinned in CHROMIUM_PROFILE.json; notices in
//! CHROMIUM_NOTICES.txt apply to the derived resampler/curve implementation.
//! This primitive is not a substitute full Tape effect or a default backend.
use std::f64::consts::{PI, TAU};
#[cfg(feature = "allocation-audit")]
mod allocation;
mod delay;
mod oscillator;
pub mod tape;
mod target;
mod tone;
pub const BLOCK: usize = 2048;
pub const PROFILE: &str = "chromium-2x-e14de735-v1";
const TAPS: usize = 128;

/// Stateful polyphase form of the pinned Chromium UpSampler -> curve ->
/// DownSampler chain. History is causal and shared by no other instance.
pub struct Shaper {
    input: [[f32; TAPS]; 2],
    even: [[f32; TAPS]; 2],
    odd: [[f32; TAPS]; 2],
    up: [f32; TAPS],
    down: [f32; TAPS],
    curve: [f32; 2049],
    at: usize,
}
impl Shaper {
    pub fn new(drive: f64, linear: bool) -> Option<Self> {
        if !drive.is_finite() || !(0. ..=1.).contains(&drive) {
            return None;
        }
        let mut up = [0.; TAPS];
        let mut down = [0.; TAPS];
        for i in 0..TAPS {
            let s = PI * (i as f64 - 64. + 0.5);
            let x = (i as f64 + 0.5) / 128.;
            let window = 0.42 - 0.5 * (TAU * x).cos() + 0.08 * (2. * TAU * x).cos();
            up[i] = (s.sin() / s * window) as f32;
            let j = 2 * i + 1;
            let s = 0.5 * PI * (j as f64 - 128.);
            let x = j as f64 / 256.;
            let window = 0.42 - 0.5 * (TAU * x).cos() + 0.08 * (2. * TAU * x).cos();
            down[i] = (0.5 * s.sin() / s * window) as f32;
        }
        let k = 1. + drive * 5.;
        let gain = (1. + 0.15 * (k - 1.)) / k;
        let mut curve = [0.; 2049];
        for (i, v) in curve.iter_mut().enumerate() {
            let x = i as f64 / 1024. - 1.;
            *v = if linear {
                x as f32
            } else {
                ((k * x).tanh() * gain) as f32
            };
        }
        Some(Self {
            input: [[0.; TAPS]; 2],
            even: [[0.; TAPS]; 2],
            odd: [[0.; TAPS]; 2],
            up,
            down,
            curve,
            at: 0,
        })
    }
    fn shape(&self, x: f32) -> f32 {
        let v = ((x + 1.) * 1024.).clamp(0., 2048.);
        let index = v as usize;
        if index >= 2048 {
            return self.curve[2048];
        }
        let fraction = v - index as f32;
        self.curve[index] + fraction * (self.curve[index + 1] - self.curve[index])
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        let mut out = [0.; 2];
        let at = self.at;
        for ch in 0..2 {
            self.input[ch][at] = input[ch];
            let even = self.shape(self.input[ch][(at + 64) % TAPS]);
            let mut odd = 0f32;
            for k in (0..TAPS).rev() {
                odd += self.input[ch][(at + TAPS - k) % TAPS] * self.up[k];
            }
            let odd = self.shape(odd);
            // The reduced half-band convolution uses the previous odd sample;
            // don't overwrite the oldest history until it has been consumed.
            let mut sum = 0f32;
            for k in (0..TAPS).rev() {
                sum += self.odd[ch][(at + TAPS - 1 - k) % TAPS] * self.down[k];
            }
            self.even[ch][at] = even;
            out[ch] = sum + 0.5 * self.even[ch][(at + 64) % TAPS];
            self.odd[ch][at] = odd;
        }
        self.at = (at + 1) % TAPS;
        out
    }
    pub fn reset(&mut self) {
        self.input.fill([0.; TAPS]);
        self.even.fill([0.; TAPS]);
        self.odd.fill([0.; TAPS]);
        self.at = 0;
    }
}
pub struct ShaperEngine {
    shaper: Shaper,
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
    frame: u64,
    peak: f64,
}
impl ShaperEngine {
    pub fn new(rate: f64, drive: f64, linear: bool) -> Option<Box<Self>> {
        if !rate.is_finite() || rate.fract() != 0. || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        Some(Box::new(Self {
            shaper: Shaper::new(drive, linear)?,
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
            frame: 0,
            peak: 0.,
        }))
    }
    pub fn render(&mut self, n: usize, channels: usize) -> bool {
        if n > BLOCK || !(1..=2).contains(&channels) {
            return false;
        }
        self.peak = 0.;
        for i in 0..n {
            let out = self
                .shaper
                .tick([self.input[0][i], self.input[channels - 1][i]]);
            for ch in 0..2 {
                self.output[ch][i] = out[ch];
                self.peak = self.peak.max(out[ch].abs() as f64);
            }
        }
        self.frame += n as u64;
        true
    }
    pub fn reset(&mut self) {
        self.shaper.reset();
        self.input.fill([0.; BLOCK]);
        self.output.fill([0.; BLOCK]);
        self.frame = 0;
        self.peak = 0.;
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.peak,
            1 => self.frame as f64,
            2 => 128.,
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn tape_shaper_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn tape_shaper_new(rate: f64, drive: f64, linear: u32) -> *mut ShaperEngine {
    if linear > 1 {
        return std::ptr::null_mut();
    }
    ShaperEngine::new(rate, drive, linear != 0)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn tape_shaper_free(p: *mut ShaperEngine) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn tape_shaper_input(p: &mut ShaperEngine, ch: usize) -> *mut f32 {
    p.input
        .get_mut(ch)
        .map(|v| v.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn tape_shaper_output(p: &ShaperEngine, ch: usize) -> *const f32 {
    p.output
        .get(ch)
        .map(|v| v.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn tape_shaper_render(p: &mut ShaperEngine, n: usize, channels: usize) -> u32 {
    p.render(n, channels) as u32
}
#[no_mangle]
pub extern "C" fn tape_shaper_reset(p: &mut ShaperEngine) {
    p.reset();
}
#[no_mangle]
pub extern "C" fn tape_shaper_stat(p: &ShaperEngine, index: u32) -> f64 {
    p.stat(index)
}
