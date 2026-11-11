//! Native Tape lowpass profile: Q.value0.5 is a dB resonance control, f64
//! normalized coefficients, Float32 output/history, native128 denormal flush.
use std::f64::consts::PI;
pub struct Lowpass {
    rate: f64,
    frequency: f32,
    coefficients: [f64; 5],
    x1: [f64; 2],
    x2: [f64; 2],
    y1: [f64; 2],
    y2: [f64; 2],
}
impl Lowpass {
    pub fn new(rate: f64) -> Self {
        Self {
            rate,
            frequency: f32::NAN,
            coefficients: [0.; 5],
            x1: [0.; 2],
            x2: [0.; 2],
            y1: [0.; 2],
            y2: [0.; 2],
        }
    }
    pub fn reset(&mut self) {
        self.frequency = f32::NAN;
        self.x1 = [0.; 2];
        self.x2 = [0.; 2];
        self.y1 = [0.; 2];
        self.y2 = [0.; 2];
    }
    pub fn tick(&mut self, input: [f32; 2], frequency: f32, frame: u64) -> [f32; 2] {
        let frequency = frequency.clamp(0., (self.rate * 0.5) as f32);
        if frequency != self.frequency {
            self.frequency = frequency;
            let cutoff = frequency as f64 / (self.rate * 0.5);
            self.coefficients = if cutoff >= 1. {
                [1., 0., 0., 0., 0.]
            } else if cutoff <= 0. {
                [0.; 5]
            } else {
                // The pinned native pow10 helper uses Float32 exp for Q dB.
                let resonance = (((0.5f64 / 20.) * std::f64::consts::LN_10) as f32).exp() as f64;
                let theta = PI * cutoff;
                let alpha = theta.sin() / (2. * resonance);
                let cosine = theta.cos();
                let beta = (1. - cosine) / 2.;
                let norm = 1. + alpha;
                [
                    beta / norm,
                    2. * beta / norm,
                    beta / norm,
                    -2. * cosine / norm,
                    (1. - alpha) / norm,
                ]
            };
        }
        let c = self.coefficients;
        let mut out = [0.; 2];
        for ch in 0..2 {
            let x = input[ch] as f64;
            let y = (c[0] * x + c[1] * self.x1[ch] + c[2] * self.x2[ch]
                - c[3] * self.y1[ch]
                - c[4] * self.y2[ch]) as f32;
            out[ch] = y;
            self.x2[ch] = self.x1[ch];
            self.x1[ch] = x;
            self.y2[ch] = self.y1[ch];
            self.y1[ch] = y as f64;
        }
        if frame % 128 == 127 {
            for state in [&mut self.x1, &mut self.x2, &mut self.y1, &mut self.y2] {
                for value in state {
                    if value.abs() < f32::MIN_POSITIVE as f64 {
                        *value = 0.;
                    }
                }
            }
        }
        out
    }
}
