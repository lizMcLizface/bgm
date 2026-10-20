//! Shared "space" effects after any model: a three-tap ensemble chorus and an
//! eight-line feedback-delay-network reverb. Original code; no third-party DSP.
//! Buffers live in a separate all-zero static so they stay out of the Wasm data segment.
use crate::dsp::*;

pub const CHORUS_LEN: usize = 8192;
pub const LINE_LEN: usize = 16384;
pub const DIFFUSER_LEN: usize = 2048;
pub const PRE_LEN: usize = 8192;
pub const BBD_LEN: usize = 4096;
const LINES: usize = 8;
// Mutually prime line lengths in samples at 48 kHz (about 30-75 ms).
const LENGTHS: [f32; LINES] = [1423., 1777., 1987., 2207., 2551., 2917., 3307., 3617.];
const DIFFUSERS: [f32; 4] = [142., 107., 379., 277.];

pub struct Buffers {
    chorus: [f32; CHORUS_LEN],
    lines: [[f32; LINE_LEN]; LINES],
    diffusers: [[f32; DIFFUSER_LEN]; 4],
    pre: [f32; PRE_LEN],
    pub bbd: [f32; BBD_LEN],
}
impl Buffers {
    pub const ZERO: Self = Self {
        chorus: [0.; CHORUS_LEN],
        lines: [[0.; LINE_LEN]; LINES],
        diffusers: [[0.; DIFFUSER_LEN]; 4],
        pre: [0.; PRE_LEN],
        bbd: [0.; BBD_LEN],
    };
}

// Host-level parameter ids (offset from the host's effect range).
pub const CHORUS_MIX: usize = 0;
pub const CHORUS_RATE: usize = 1;
pub const CHORUS_DEPTH: usize = 2;
pub const REVERB_MIX: usize = 3;
pub const REVERB_DECAY: usize = 4;
pub const REVERB_TONE: usize = 5;
pub const REVERB_SIZE: usize = 6;
pub const REVERB_PREDELAY: usize = 7;
pub const PARAMS: usize = 16;

#[inline]
fn read(buf: &[f32], write: usize, delay: f32, mask: usize) -> f32 {
    let d = delay.max(1.);
    let i = d.floor();
    let f = d - i;
    let a = buf[(write + mask + 1 - i as usize) & mask];
    let b = buf[(write + mask - i as usize) & mask];
    a + (b - a) * f
}

pub struct Space {
    sr: f32,
    pub params: [f32; PARAMS],
    // chorus
    cw: usize,
    cphase: f32,
    cfast: f32,
    cmix: f32,
    // reverb
    rw: usize,
    pw: usize,
    dw: [usize; 4],
    len: [f32; LINES],
    gain: [f32; LINES],
    damp: [f32; LINES],

    rmix: f32,
    rot: (f32, f32),
    asleep: bool,
    quiet: u32,
}

impl Space {
    pub const fn new() -> Self {
        Self {
            sr: 48000.,
            params: [0.; PARAMS],
            cw: 0,
            cphase: 0.,
            cfast: 0.,
            cmix: 0.,
            rw: 0,
            pw: 0,
            dw: [0; 4],
            len: [0.; LINES],
            gain: [0.; LINES],
            damp: [0.; LINES],

            rmix: 0.,
            rot: (1., 0.),
            asleep: true,
            quiet: 0,
        }
    }
    pub fn init(&mut self, sr: f32) {
        *self = Self::new();
        self.sr = sr;
        let defaults = [0., 0.6, 0.5, 0.25, 4., 6000., 0.6, 0.02];
        self.params[..defaults.len()].copy_from_slice(&defaults);
        self.len = self.targets();
    }
    pub fn set(&mut self, id: usize, value: f32) {
        if id < PARAMS && value.is_finite() {
            self.params[id] = value;
        }
    }
    pub fn clear(&mut self, buffers: &mut Buffers) {
        *buffers = Buffers::ZERO;
        self.asleep = true;
        self.quiet = 0;
    }
    fn targets(&self) -> [f32; LINES] {
        let scale = self.sr / 48000. * (0.55 + 0.9 * bound(self.params[REVERB_SIZE], 0., 1.));
        LENGTHS.map(|l| (l * scale).min(LINE_LEN as f32 - 8.))
    }

    pub fn render(&mut self, buffers: &mut Buffers, left: &mut [f32], right: &mut [f32]) {
        self.chorus(&mut buffers.chorus, left, right);
        self.reverb(buffers, left, right);
    }

    fn chorus(&mut self, buf: &mut [f32; CHORUS_LEN], left: &mut [f32], right: &mut [f32]) {
        let target = bound(self.params[CHORUS_MIX], 0., 1.);
        if target == 0. && self.cmix < 1e-4 {
            self.cmix = 0.;
            return;
        }
        let sr = self.sr;
        let rate = bound(self.params[CHORUS_RATE], 0.05, 8.) / sr;
        let depth = bound(self.params[CHORUS_DEPTH], 0., 1.);
        let base = 0.0075 * sr;
        let wide = depth * 0.0042 * sr;
        let fine = depth * 0.00025 * sr;
        let k = smoothing(0.03, sr);
        let mask = CHORUS_LEN - 1;
        for i in 0..left.len() {
            self.cmix += (target - self.cmix) * k;
            let x = 0.5 * (left[i] + right[i]);
            buf[self.cw] = x;
            self.cphase += rate;
            if self.cphase >= 1. {
                self.cphase -= 1.;
            }
            self.cfast += rate * 7.3;
            if self.cfast >= 1. {
                self.cfast -= 1.;
            }
            let mut taps = [0.; 3];
            for (n, tap) in taps.iter_mut().enumerate() {
                let offset = n as f32 / 3.;
                let d = base + wide * sin_turns(self.cphase + offset) + fine * sin_turns(self.cfast + offset);
                *tap = read(buf, self.cw, d, mask);
            }
            let wl = 0.62 * taps[0] + 0.38 * taps[1];
            let wr = 0.62 * taps[2] + 0.38 * taps[1];
            let dry = 1. - 0.4 * self.cmix;
            left[i] = left[i] * dry + wl * self.cmix;
            right[i] = right[i] * dry + wr * self.cmix;
            self.cw = (self.cw + 1) & mask;
        }
    }

    fn reverb(&mut self, b: &mut Buffers, left: &mut [f32], right: &mut [f32]) {
        let target = bound(self.params[REVERB_MIX], 0., 1.);
        let n = left.len();
        let loud = left.iter().chain(right.iter()).any(|x| x.abs() > 1e-6);
        let decay = bound(self.params[REVERB_DECAY], 0.2, 30.);
        if loud && target > 0. {
            self.asleep = false;
            self.quiet = 0;
        } else if !self.asleep {
            // Sleep once the tail is ~90 dB down and nothing new arrives.
            self.quiet += n as u32;
            if self.quiet as f32 > self.sr * (1.5 * decay + 0.5) {
                self.asleep = true;
            }
        }
        if self.asleep {
            self.rmix = target;
            return;
        }
        let sr = self.sr;
        let targets = self.targets();
        for (i, gain) in self.gain.iter_mut().enumerate() {
            *gain = exp2(-9.966 * targets[i] / (sr * decay));
        }
        let tone = bound(self.params[REVERB_TONE], 500., 18000.);
        let damp = 1. - (-TAU_F * tone / sr).exp();
        let pre = (bound(self.params[REVERB_PREDELAY], 0., 0.15) * sr).min(PRE_LEN as f32 - 2.);
        let dl = DIFFUSERS.map(|l| (l * sr / 48000.).min(DIFFUSER_LEN as f32 - 2.) as usize);
        let k = smoothing(0.03, sr);
        let slew = smoothing(0.25, sr);
        let (wc, ws) = {
            let w = TAU_F * 0.31 / sr;
            (1. - 0.5 * w * w, w)
        };
        let wobble = 5. * sr / 48000.;
        let lmask = LINE_LEN - 1;
        let pmask = PRE_LEN - 1;
        let dmask = DIFFUSER_LEN - 1;
        for i in 0..n {
            self.rmix += (target - self.rmix) * k;
            // pre-delay then four series all-pass diffusers
            b.pre[self.pw] = 0.5 * (left[i] + right[i]);
            let mut x = read(&b.pre, self.pw, pre.max(1.), pmask);
            self.pw = (self.pw + 1) & pmask;
            for (j, line) in b.diffusers.iter_mut().enumerate() {
                let w = self.dw[j];
                let d = line[(w + DIFFUSER_LEN - dl[j]) & dmask];
                let v = x + 0.62 * d;
                line[w] = v;
                x = d - 0.62 * v;
                self.dw[j] = (w + 1) & dmask;
            }
            // slow quadrature wobble breaks up metallic modes
            let (c, s) = self.rot;
            self.rot = (c * wc - s * ws, s * wc + c * ws);
            let mut y = [0.; LINES];
            let mut sum = 0.;
            for j in 0..LINES {
                self.len[j] += (targets[j] - self.len[j]) * slew;
                let m = if j & 1 == 0 { c } else { s } * wobble * if j % 3 == 0 { 1. } else { -0.6 };
                let raw = read(&b.lines[j], self.rw, self.len[j] + m, lmask);
                self.damp[j] += (raw - self.damp[j]) * damp;
                let v = self.damp[j] * self.gain[j];
                y[j] = v;
                sum += v;
            }
            let fold = sum * (2. / LINES as f32);
            for j in 0..LINES {
                let sign = if j & 1 == 0 { 1. } else { -1. };
                b.lines[j][self.rw] = y[j] - fold + x * sign * 0.35;
            }
            self.rw = (self.rw + 1) & lmask;
            let wl = y[0] - y[2] + y[4] - y[6] + 0.5 * (y[1] - y[5]);
            let wr = y[1] - y[3] + y[5] - y[7] + 0.5 * (y[2] - y[6]);
            let wet = 0.55 * self.rmix;
            left[i] += wl * wet;
            right[i] += wr * wet;
        }
        // keep the rotation on the unit circle
        let (c, s) = self.rot;
        let norm = 1. / (c * c + s * s).sqrt();
        self.rot = (c * norm, s * norm);
    }
}

const TAU_F: f32 = core::f32::consts::TAU;

/// Juno-style bucket-brigade chorus: one mono line, two taps swept in opposite
/// directions by a triangle LFO for stereo, band-limited wet path and a little
/// hiss. Modes: 0 off, 1 = I, 2 = II, 3 = I+II. Rates/depths approximate the
/// published Juno-60/106 figures; this is not a BBD circuit model.
pub struct Bbd {
    sr: f32,
    w: usize,
    phase: f32,
    rate: f32,
    depth: f32,
    mix: f32,
    lp: [[f32; 2]; 2],
    /// anti-aliasing filter ahead of the delay line
    pre: [f32; 2],
    rng: Rng,
}
const BBD_MODES: [(f32, f32); 4] = [(0.513, 0.00185), (0.513, 0.00185), (0.863, 0.00185), (9.75, 0.0002)];
impl Bbd {
    pub const fn new() -> Self {
        Self { sr: 48000., w: 0, phase: 0., rate: 0.513, depth: 0.00185, mix: 0., lp: [[0.; 2]; 2], pre: [0.; 2], rng: Rng(0x6d2b_79f5) }
    }
    pub fn init(&mut self, sr: f32) {
        *self = Self::new();
        self.sr = sr;
    }
    /// `noise` 0..1 scales the hiss.
    pub fn render(&mut self, buf: &mut [f32; BBD_LEN], left: &mut [f32], right: &mut [f32], mode: u32, noise: f32) {
        let mode = (mode as usize).min(3);
        let target = if mode == 0 { 0. } else { 1. };
        if target == 0. && self.mix < 1e-4 {
            self.mix = 0.;
            return;
        }
        let sr = self.sr;
        let (rate, depth) = BBD_MODES[mode];
        let k = smoothing(0.05, sr);
        let centre = 0.0035 * sr;
        // 12 dB/octave at about 10 kHz before the delay (anti-aliasing) and after it (reconstruction),
        // as measured on the original; the delay itself swings between about 1.5 and 5 ms
        let lp = 1. - (-core::f32::consts::TAU * 10000. / sr).exp();
        let hiss = bound(noise, 0., 1.) * 0.0004;
        let mask = BBD_LEN - 1;
        for i in 0..left.len() {
            self.mix += (target - self.mix) * k;
            self.rate += (rate - self.rate) * k;
            self.depth += (depth - self.depth) * k;
            let mut x = 0.5 * (left[i] + right[i]);
            for stage in self.pre.iter_mut() {
                *stage += (x - *stage) * lp;
                x = *stage;
            }
            buf[self.w] = x + hiss * self.rng.next();
            self.phase += self.rate / sr;
            if self.phase >= 1. {
                self.phase -= 1.;
            }
            let tri = 1. - 4. * (self.phase - 0.5).abs();
            let swing = self.depth * sr * tri;
            for (side, delay) in [centre + swing, centre - swing].into_iter().enumerate() {
                let mut y = read(buf, self.w, delay, mask);
                for stage in self.lp[side].iter_mut() {
                    *stage += (y - *stage) * lp;
                    y = *stage;
                }
            }
            let (wl, wr) = (self.lp[0][1], self.lp[1][1]);
            // dry + wet, scaled so engaging the chorus keeps roughly the same level
            let g = 1. - 0.3 * self.mix;
            left[i] = g * (left[i] + self.mix * wl);
            right[i] = g * (right[i] + self.mix * wr);
            self.w = (self.w + 1) & mask;
        }
    }
}
