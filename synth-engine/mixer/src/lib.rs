//! Owned stereo desk strip, master matrix and master fader primitives.
//! Host topology, aux effect kernels and final limiter stay explicit boundaries.
use std::f64::consts::{FRAC_PI_2, PI};
#[cfg(target_arch = "wasm32")]
mod abi;
#[cfg(all(target_arch = "wasm32", feature = "allocation-audit"))]
mod allocation_audit;
pub const TAU_SECONDS: f64 = 0.012;
pub const MAX_EVENTS: usize = 512;
pub const MAX_FRAME: u64 = (1u64 << 53) - 1;
/// Deterministic AudioParam boundary measured against Chromium's native nodes.
/// Requested parameter authority remains f64; this is the rendered curve profile.
pub const AUTOMATION_PROFILE: &str = "webaudio-f32-128-target-v1";
const TARGET_THRESHOLD: f32 = 0.00004539992976248485;

#[derive(Clone, Copy)]
struct Smooth {
    value: f32,
    previous: f32,
    target: f64,
    coefficients: [f32; 4],
    cache: [f32; 4],
    cache_at: usize,
    cache_length: usize,
    frame: u64,
    start: u64,
    rate: f64,
    active: bool,
}
impl Smooth {
    fn new(value: f64, rate: f64) -> Self {
        // Native AudioParams store Float32 values and evaluate target curves in
        // four-sample groups. This algebra expands four scalar exponential steps.
        let tau = TAU_SECONDS as f32 as f64;
        let a = (1. - (-1. / (tau * rate)).exp()) as f32;
        Self {
            value: value as f32,
            previous: value as f32,
            target: value,
            coefficients: [a, a * (2. - a), a * ((a - 3.) * a + 3.), a * (a * ((4. - a) * a - 6.) + 4.)],
            cache: [0.; 4], cache_at: 0, cache_length: 0,
            frame: 0, start: 0, rate, active: false,
        }
    }
    fn set(&mut self, value: f64, settle: bool) {
        self.target = value;
        self.cache_at = 0;
        self.cache_length = 0;
        self.start = self.frame;
        if settle {
            self.value = value as f32;
            self.previous = self.value;
            self.active = false;
        } else {
            // A new native target begins at the last computed curve value.
            self.value = self.previous;
            self.active = self.value != value as f32;
        }
    }
    fn tick(&mut self) -> f64 {
        let target = self.target as f32;
        let value = if !self.active {self.value} else {
            if self.cache_at == self.cache_length {
                if self.frame % 128 == 0 && self.frame != self.start {
                    self.value = self.previous + (target - self.previous) * self.coefficients[0];
                }
                // Native target convergence is tested at a canonical callback
                // boundary (or a newly started target), not on every sample.
                let boundary = self.frame % 128 == 0 || self.frame == self.start;
                let threshold = TARGET_THRESHOLD;
                let elapsed = self.frame as f64 / self.rate;
                let start = self.start as f64 / self.rate;
                if boundary && (elapsed > start + 10. * (TAU_SECONDS as f32 as f64)
                    || target == 0. && self.value.abs() < threshold
                    || target != 0. && (target - self.value).abs() < threshold * self.value.abs()) {
                    self.value = target;
                    self.active = false;
                } else {
                    self.cache_length = 4.min(128 - self.frame as usize % 128);
                    self.cache_at = 0;
                    if self.cache_length == 4 {
                        let delta = target - self.value;
                        self.cache[0] = self.value;
                        self.cache[1] = self.value + delta * self.coefficients[0];
                        self.cache[2] = self.value + delta * self.coefficients[1];
                        self.cache[3] = self.value + delta * self.coefficients[2];
                        self.value += delta * self.coefficients[3];
                    } else {
                        for i in 0..self.cache_length {
                            self.cache[i] = self.value;
                            self.value += (target - self.value) * self.coefficients[0];
                        }
                    }
                }
            }
            if self.active {let value=self.cache[self.cache_at];self.cache_at+=1;value} else {self.value}
        };
        self.previous = value;
        self.frame += 1;
        value as f64
    }
}

#[derive(Clone, Copy)]
struct Coeff([f64; 5]);
// Native Biquad's dB conversion is a Float32 exp boundary, separate from the
// f64 requested parameter ledger and the message-based limiter ceiling.
fn filter_pow10(value: f64) -> f64 {
    ((value * std::f64::consts::LN_10) as f32).exp() as f64
}
impl Coeff {
    fn gain(gain: f64) -> Self {
        Self([gain, 0., 0., 0., 0.])
    }
    fn new(kind: usize, frequency: f64, gain: f64, rate: f64) -> Self {
        let frequency = frequency.clamp(0., rate * 0.5);
        // Exact degenerate transfer functions avoid marginal endpoint poles.
        if frequency == 0. || frequency == rate * 0.5 {
            return Self::gain(match kind {
                0 => {
                    if frequency == 0. {
                        1.
                    } else {
                        0.
                    }
                }
                1 => {
                    if frequency == 0. {
                        0.
                    } else {
                        1.
                    }
                }
                2 => {
                    if frequency == 0. {
                        1.
                    } else {
                        filter_pow10(gain / 40.).powi(2)
                    }
                }
                4 => {
                    if frequency == 0. {
                        filter_pow10(gain / 40.).powi(2)
                    } else {
                        1.
                    }
                }
                _ => 1.,
            });
        }
        let w = PI * (frequency / (rate * 0.5));
        let (sin, cos) = w.sin_cos();
        let a = filter_pow10(gain / 40.);
        let alpha = if kind <= 1 {
            sin / (2. * filter_pow10((0.707f32 as f64) / 20.))
        } else {
            sin / (2. * (0.7f32 as f64))
        };
        let shelf_alpha = 0.5 * sin * 2f64.sqrt();
        let shelf = 2. * a.sqrt() * shelf_alpha;
        let c = match kind {
            0 => [
                (1. + cos) / 2.,
                -(1. + cos),
                (1. + cos) / 2.,
                1. + alpha,
                -2. * cos,
                1. - alpha,
            ],
            1 => [
                (1. - cos) / 2.,
                1. - cos,
                (1. - cos) / 2.,
                1. + alpha,
                -2. * cos,
                1. - alpha,
            ],
            2 => [
                a * ((a + 1.) - (a - 1.) * cos + shelf),
                2. * a * ((a - 1.) - (a + 1.) * cos),
                a * ((a + 1.) - (a - 1.) * cos - shelf),
                (a + 1.) + (a - 1.) * cos + shelf,
                -2. * ((a - 1.) + (a + 1.) * cos),
                (a + 1.) + (a - 1.) * cos - shelf,
            ],
            3 => [
                1. + alpha * a,
                -2. * cos,
                1. - alpha * a,
                1. + alpha / a,
                -2. * cos,
                1. - alpha / a,
            ],
            _ => [
                a * ((a + 1.) + (a - 1.) * cos + shelf),
                -2. * a * ((a - 1.) + (a + 1.) * cos),
                a * ((a + 1.) + (a - 1.) * cos - shelf),
                (a + 1.) - (a - 1.) * cos + shelf,
                2. * ((a - 1.) - (a + 1.) * cos),
                (a + 1.) - (a - 1.) * cos - shelf,
            ],
        };
        let inverse = 1. / c[3];
        Self([
            c[0] * inverse,
            c[1] * inverse,
            c[2] * inverse,
            c[4] * inverse,
            c[5] * inverse,
        ])
    }
}
#[derive(Clone, Copy, Default)]
struct History {
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}
impl History {
    fn tick(&mut self, x: f32, c: Coeff) -> f32 {
        let [b0, b1, b2, a1, a2] = c.0;
        let x = x as f64;
        // Native Biquad stores the rounded Float32 output in its double history.
        let y = (b0 * x + b1 * self.x1 + b2 * self.x2 - a1 * self.y1 - a2 * self.y2) as f32;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y as f64;
        y
    }
}

/// Web Audio StereoPannerNode stereo-input law; mono input uses a separate law.
pub fn stereo_pan(input: [f32; 2], pan: f64) -> [f32; 2] {
    let p = pan.clamp(-1., 1.);
    let x = if p <= 0. { p + 1. } else { p };
    let (right, left) = (x * FRAC_PI_2).sin_cos();
    if p <= 0. {
        [
            (input[0] as f64 + input[1] as f64 * left) as f32,
            (input[1] as f64 * right) as f32,
        ]
    } else {
        [
            (input[0] as f64 * left) as f32,
            (input[1] as f64 + input[0] as f64 * right) as f32,
        ]
    }
}
fn mul(x: [f32; 2], gain: f64) -> [f32; 2] {
    x.map(|v| (v as f64 * gain) as f32)
}

/// Codes: trim gain, HP Hz, LP Hz, low/mid/high dB, stereo pan, output gain.
pub struct Strip {
    rate: f64,
    values: [Smooth; 8],
    history: [[History; 2]; 5],
    last: [(f64, f64); 5],
    coefficients: [Coeff; 5],
}
impl Strip {
    pub fn new(rate: f64) -> Self {
        Self {
            rate,
            values: [1., 350., 350., 0., 0., 0., 0., 1.].map(|v| Smooth::new(v, rate)),
            history: [[History::default(); 2]; 5],
            last: [(f64::NAN, f64::NAN); 5],
            coefficients: [Coeff::gain(1.); 5],
        }
    }
    pub fn valid(&self, parameter: usize, value: f64) -> bool {
        value.is_finite()
            && match parameter {
                0 => (0. ..=64.).contains(&value),
                1 | 2 => (0. ..=self.rate * 0.5).contains(&value),
                3..=5 => (-12. ..=12.).contains(&value),
                6 => (-1. ..=1.).contains(&value),
                7 => (0. ..=4.).contains(&value),
                _ => false,
            }
    }
    pub fn set(&mut self, parameter: usize, value: f64, settle: bool) -> bool {
        if !self.valid(parameter, value) {
            return false;
        }
        self.values[parameter].set(value, settle);
        true
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        let p = self.values.each_mut().map(Smooth::tick);
        let mut out = mul(input, p[0]);
        for (kind, (frequency, gain)) in [
            (p[1], 0.),
            (p[2], 0.),
            (200., p[3]),
            (1000., p[4]),
            (5000., p[5]),
        ]
        .into_iter()
        .enumerate()
        {
            if self.last[kind] != (frequency, gain) {
                self.coefficients[kind] = Coeff::new(kind, frequency, gain, self.rate);
                self.last[kind] = (frequency, gain);
            }
            for channel in 0..2 {
                out[channel] =
                    self.history[kind][channel].tick(out[channel], self.coefficients[kind]);
            }
        }
        mul(stereo_pan(out, p[6]), p[7])
    }
    pub fn reset(&mut self) {
        *self = Self::new(self.rate);
    }
}

/// Pre-master-insert matrix and stereo balance. Codes: width 0..2, pan -1..1.
pub struct Matrix {
    rate: f64,
    diagonal: Smooth,
    cross: Smooth,
    pan: Smooth,
}
impl Matrix {
    pub fn new(rate: f64) -> Self {
        Self {
            rate,
            diagonal: Smooth::new(1., rate),
            cross: Smooth::new(1., rate),
            pan: Smooth::new(0., rate),
        }
    }
    pub fn valid(&self, parameter: usize, value: f64) -> bool {
        value.is_finite()
            && match parameter {
                0 => (0. ..=2.).contains(&value),
                1 => (-1. ..=1.).contains(&value),
                _ => false,
            }
    }
    pub fn set(&mut self, parameter: usize, value: f64, settle: bool) -> bool {
        if !self.valid(parameter, value) {
            return false;
        }
        if parameter == 0 {
            self.diagonal.set((1. + value) / 2., settle);
            self.cross.set((1. - value) / 2., settle);
        } else {
            self.pan.set(value, settle);
        }
        true
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        let d = self.diagonal.tick();
        let c = self.cross.tick();
        // Individual native GainNode outputs round before ChannelMerger sums.
        let out = [
            ((input[0] as f64 * d) as f32 + (input[1] as f64 * c) as f32),
            ((input[0] as f64 * c) as f32 + (input[1] as f64 * d) as f32),
        ];
        stereo_pan(out, self.pan.tick())
    }
    pub fn reset(&mut self) {
        *self = Self::new(self.rate);
    }
}
/// Post-master-insert level/dim, before the external desk limiter.
pub struct Fader {
    rate: f64,
    level: Smooth,
}
impl Fader {
    pub fn new(rate: f64) -> Self {
        Self {
            rate,
            level: Smooth::new(1., rate),
        }
    }
    pub fn valid(&self, parameter: usize, value: f64) -> bool {
        parameter == 0 && value.is_finite() && (0. ..=4.).contains(&value)
    }
    pub fn set(&mut self, parameter: usize, value: f64, settle: bool) -> bool {
        if !self.valid(parameter, value) {
            return false;
        }
        self.level.set(value, settle);
        true
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        mul(input, self.level.tick())
    }
    pub fn reset(&mut self) {
        *self = Self::new(self.rate);
    }
}

/// Original desk's stereo-linked sample-peak ceiling limiter. Fixed 3ms delay
/// remains active in bypass; gain recovery is 80ms. This is not true-peak DSP.
pub struct Limiter {
    left: Vec<f32>,
    right: Vec<f32>,
    at: usize,
    gain: f64,
    ceiling: f64,
    enabled: bool,
    release: f64,
}
impl Limiter {
    pub fn new(rate: f64) -> Self {
        let length = (rate * 0.003).ceil() as usize;
        Self {
            left: vec![0.; length],
            right: vec![0.; length],
            at: 0,
            gain: 1.,
            ceiling: 10f64.powf(-1.8 / 20.),
            enabled: true,
            release: 1. - (-1. / (rate * 0.08)).exp(),
        }
    }
    pub fn valid(&self, parameter: usize, value: f64) -> bool {
        value.is_finite()
            && match parameter {
                0 => value == 0. || value == 1.,
                1 => (0.05..=1.).contains(&value),
                _ => false,
            }
    }
    pub fn set(&mut self, parameter: usize, value: f64, _settle: bool) -> bool {
        if !self.valid(parameter, value) {
            return false;
        }
        if parameter == 0 {
            self.enabled = value != 0.;
        } else {
            self.ceiling = value;
        }
        true
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        let input = input.map(|v| if v.is_finite() { v } else { 0. });
        let old = [self.left[self.at], self.right[self.at]];
        self.left[self.at] = input[0];
        self.right[self.at] = input[1];
        let peak = input[0]
            .abs()
            .max(input[1].abs())
            .max(old[0].abs())
            .max(old[1].abs()) as f64;
        let target = if self.enabled {
            (self.ceiling / peak.max(1e-12)).min(1.)
        } else {
            1.
        };
        self.gain = if target < self.gain {
            target
        } else {
            target.min(self.gain + (1. - self.gain) * self.release)
        };
        self.at += 1;
        if self.at == self.left.len() {
            self.at = 0;
        }
        mul(old, self.gain)
    }
    pub fn latency_frames(&self) -> usize {
        self.left.len()
    }
    pub fn gain(&self) -> f64 {
        self.gain
    }
    pub fn reset(&mut self) {
        self.left.fill(0.);
        self.right.fill(0.);
        self.at = 0;
        self.gain = 1.;
        self.ceiling = 10f64.powf(-1.8 / 20.);
        self.enabled = true;
    }
}

pub enum Processor {
    Strip(Strip),
    Matrix(Matrix),
    Fader(Fader),
    Limiter(Limiter),
}
impl Processor {
    pub fn new(kind: u32, rate: f64) -> Option<Self> {
        if !rate.is_finite() || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        Some(match kind {
            0 => Self::Strip(Strip::new(rate)),
            1 => Self::Matrix(Matrix::new(rate)),
            2 => Self::Fader(Fader::new(rate)),
            3 => Self::Limiter(Limiter::new(rate)),
            _ => return None,
        })
    }
    pub fn valid(&self, parameter: usize, value: f64) -> bool {
        match self {
            Self::Strip(p) => p.valid(parameter, value),
            Self::Matrix(p) => p.valid(parameter, value),
            Self::Fader(p) => p.valid(parameter, value),
            Self::Limiter(p) => p.valid(parameter, value),
        }
    }
    pub fn set(&mut self, parameter: usize, value: f64, settle: bool) -> bool {
        match self {
            Self::Strip(p) => p.set(parameter, value, settle),
            Self::Matrix(p) => p.set(parameter, value, settle),
            Self::Fader(p) => p.set(parameter, value, settle),
            Self::Limiter(p) => p.set(parameter, value, settle),
        }
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        match self {
            Self::Strip(p) => p.tick(input),
            Self::Matrix(p) => p.tick(input),
            Self::Fader(p) => p.tick(input),
            Self::Limiter(p) => p.tick(input),
        }
    }
    pub fn reset(&mut self) {
        match self {
            Self::Strip(p) => p.reset(),
            Self::Matrix(p) => p.reset(),
            Self::Fader(p) => p.reset(),
            Self::Limiter(p) => p.reset(),
        }
    }
    pub fn latency_frames(&self) -> usize {
        if let Self::Limiter(p) = self {
            p.latency_frames()
        } else {
            0
        }
    }
    pub fn reduction_gain(&self) -> f64 {
        if let Self::Limiter(p) = self {
            p.gain()
        } else {
            1.
        }
    }
}

#[path="../../common/native_target.rs"] mod native_target;
pub mod wander;
