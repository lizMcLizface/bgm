//! Isolated accepted Tape FIR arithmetic; immutable externally prepared curve read by reference.
use std::f64::consts::{PI,TAU};
const TAPS:usize=128;
pub struct Shaper {
    input: [[f32; TAPS]; 2],
    even: [[f32; TAPS]; 2],
    odd: [[f32; TAPS]; 2],
    up: [f32; TAPS],
    down: [f32; TAPS],
    at: usize,
}
impl Shaper {
    pub fn new() -> Self {
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
        Self {
            input: [[0.; TAPS]; 2],
            even: [[0.; TAPS]; 2],
            odd: [[0.; TAPS]; 2],
            up,
            down,
            at: 0,
        }
    }
    fn shape(&self, x: f32, curve: &[f32;2049]) -> f32 {
        let v = ((x + 1.) * 1024.).clamp(0., 2048.);
        let index = v as usize;
        if index >= 2048 {
            return curve[2048];
        }
        let fraction = v - index as f32;
        curve[index] + fraction * (curve[index + 1] - curve[index])
    }
    pub fn tick(&mut self, input: [f32; 2], curve: &[f32;2049]) -> [f32; 2] {
        let mut out = [0.; 2];
        let at = self.at;
        for ch in 0..2 {
            self.input[ch][at] = input[ch];
            let even = self.shape(self.input[ch][(at + 64) % TAPS],curve);
            let mut odd = 0f32;
            for k in (0..TAPS).rev() {
                odd += self.input[ch][(at + TAPS - k) % TAPS] * self.up[k];
            }
            let odd = self.shape(odd,curve);
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
