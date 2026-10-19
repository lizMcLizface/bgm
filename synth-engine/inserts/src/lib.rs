//! Original fixed-storage instrument inserts. Shared by subtractive and FM hosts.
#![allow(static_mut_refs)]
#[path = "../../common/denormal.rs"]
mod denormal;
use std::f32::consts::PI;
const BLOCK: usize = 2048;
const DELAY: usize = 8192;
const PARAMS: usize = 24;
fn soft(x: f32) -> f32 {
    let x = x.clamp(-3., 3.);
    x * (27. + x * x) / (27. + 9. * x * x)
}
fn bound(x: f32, lo: f32, hi: f32) -> f32 {
    if x.is_finite() {
        x.clamp(lo, hi)
    } else {
        lo
    }
}
#[derive(Clone, Copy)]
struct Biquad {
    c: [f32; 5],
    x: [f32; 2],
    y: [f32; 2],
}
impl Biquad {
    const ZERO: Self = Self {
        c: [0.; 5],
        x: [0.; 2],
        y: [0.; 2],
    };
    fn tick(&mut self, x: f32) -> f32 {
        let c = self.c;
        let y =
            c[0] * x + c[1] * self.x[0] + c[2] * self.x[1] - c[3] * self.y[0] - c[4] * self.y[1];
        self.x = [x, self.x[0]];
        self.y = [y, self.y[0]];
        y
    }
    fn configure(&mut self, kind: usize, db: f32, hz: f32, q: f32, sr: f32) {
        // RBJ bilinear-transform EQ, shelves S=1. See W3C Audio EQ Cookbook.
        let a = 10_f32.powf(db / 40.);
        let w = 2. * PI * hz.min(sr * 0.4) / sr;
        let co = w.cos();
        let si = w.sin();
        let (b0, b1, b2, a0, a1, a2) = if kind == 1 {
            let alpha = si / (2. * q);
            (
                1. + alpha * a,
                -2. * co,
                1. - alpha * a,
                1. + alpha / a,
                -2. * co,
                1. - alpha / a,
            )
        } else {
            let t = si * (2. * a).sqrt();
            if kind == 0 {
                (
                    a * ((a + 1.) - (a - 1.) * co + t),
                    2. * a * ((a - 1.) - (a + 1.) * co),
                    a * ((a + 1.) - (a - 1.) * co - t),
                    (a + 1.) + (a - 1.) * co + t,
                    -2. * ((a - 1.) + (a + 1.) * co),
                    (a + 1.) + (a - 1.) * co - t,
                )
            } else {
                (
                    a * ((a + 1.) + (a - 1.) * co + t),
                    -2. * a * ((a - 1.) + (a + 1.) * co),
                    a * ((a + 1.) + (a - 1.) * co - t),
                    (a + 1.) - (a - 1.) * co + t,
                    2. * ((a - 1.) - (a + 1.) * co),
                    (a + 1.) - (a - 1.) * co - t,
                )
            }
        };
        self.c = [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
    }
}
struct Delay {
    data: [[f32; DELAY]; 2],
    position: usize,
    phase: f32,
}
impl Delay {
    const ZERO: Self = Self {
        data: [[0.; DELAY]; 2],
        position: 0,
        phase: 0.,
    };
    fn clear(&mut self) {
        self.data = [[0.; DELAY]; 2];
        self.position = 0;
        self.phase = 0.;
    }
    fn read(&self, ch: usize, delay: f32) -> f32 {
        let read = (self.position as f32 + DELAY as f32 - delay).rem_euclid(DELAY as f32);
        let i = read as usize;
        let f = read - i as f32;
        let b = &self.data[ch];
        -f * (f - 1.) * (f - 2.) / 6. * b[(i + DELAY - 1) % DELAY]
            + (f + 1.) * (f - 1.) * (f - 2.) / 2. * b[i]
            - (f + 1.) * f * (f - 2.) / 2. * b[(i + 1) % DELAY]
            + (f + 1.) * f * (f - 1.) / 6. * b[(i + 2) % DELAY]
    }
    fn tick(
        &mut self,
        input: [f32; 2],
        sr: f32,
        mix: f32,
        rate: f32,
        depth: f32,
        base: f32,
        feedback: f32,
        chorus: bool,
    ) -> [f32; 2] {
        let mut out = input;
        for ch in 0..2 {
            let modulation = (2. * PI * (self.phase + ch as f32 * 0.5)).sin();
            let delay = ((base + depth * modulation) * 0.001 * sr).clamp(2., DELAY as f32 - 3.);
            let delayed = self.read(ch, delay);
            self.data[ch][self.position] = denormal::clean((input[ch] + delayed * feedback).clamp(-8., 8.));
            let wet = mix * 0.5;
            let dry = 1. - wet;
            let gain = if chorus {
                1. / (dry * dry + wet * wet).sqrt()
            } else {
                1.
            };
            out[ch] = (input[ch] * dry + delayed * wet) * gain;
        }
        self.position = (self.position + 1) % DELAY;
        self.phase = (self.phase + rate / sr).fract();
        out
    }
}
struct Inserts {
    sr: f32,
    p: [f32; PARAMS],
    s: [f32; PARAMS],
    alpha: f32,
    wet: f32,
    frame: u64,
    peak: f32,
    eq: [[Biquad; 3]; 2],
    phaser: [[f32; 6]; 2],
    phaser_last: [f32; 2],
    phaser_phase: f32,
    phaser_g: [f32; 2],
    phaser_target: [f32; 2],
    flanger: Delay,
    chorus: Delay,
    active: [bool; 4],
    dc_in: [f32; 2],
    dc_out: [f32; 2],
    drive: f32,
    trim: f32,
}
impl Inserts {
    const fn new() -> Self {
        Self {
            sr: 0.,
            p: [0.; PARAMS],
            s: [0.; PARAMS],
            alpha: 0.,
            wet: 0.,
            frame: 0,
            peak: 0.,
            eq: [[Biquad::ZERO; 3]; 2],
            phaser: [[0.; 6]; 2],
            phaser_last: [0.; 2],
            phaser_phase: 0.,
            phaser_g: [0.; 2],
            phaser_target: [0.; 2],
            flanger: Delay::ZERO,
            chorus: Delay::ZERO,
            active: [false; 4],
            dc_in: [0.; 2],
            dc_out: [0.; 2],
            drive: 0.,
            trim: 0.,
        }
    }
    fn init(&mut self, sr: f32) {
        self.sr = bound(sr, 8000., 192000.);
        self.p = [
            0., 0., 6., 0., 180., 0., 1000., 0.7, 0., 6000., 0., 0.15, 1.5, 700., 0.2, 0., 0.12,
            1., 2., 0.35, 0., 0.35, 3.5, 0.,
        ];
        self.s = self.p;
        self.alpha = 1. - (-1. / (self.sr * 0.02)).exp();
        self.wet = 1.;
        self.frame = 0;
        self.clear();
        self.refresh();
    }
    fn clear(&mut self) {
        self.eq = [[Biquad::ZERO; 3]; 2];
        self.phaser = [[0.; 6]; 2];
        self.phaser_last = [0.; 2];
        self.phaser_phase = 0.;
        self.phaser_g = [0.; 2];
        self.phaser_target = [0.; 2];
        self.flanger.clear();
        self.chorus.clear();
        self.active = [false; 4];
        self.dc_in = [0.; 2];
        self.dc_out = [0.; 2];
        if self.sr > 0. {
            self.refresh();
        }
    }
    fn param(&mut self, i: usize, v: f32) {
        if i >= PARAMS || !v.is_finite() {
            return;
        }
        let (lo, hi) = match i {
            0 | 1 | 10 | 15 => (0., 1.),
            2 => (0., 24.),
            3 | 5 | 8 => (-12., 12.),
            4 => (60., 600.),
            6 => (200., 6000.),
            7 => (0.2, 4.),
            9 => (1500., 12000.),
            11 | 16 => (0.02, 5.),
            12 => (0., 3.),
            13 => (100., 4000.),
            14 => (-0.75, 0.75),
            17 => (0., 4.),
            18 => (0.3, 20.),
            19 => (-0.85, 0.85),
            20 => (0., 0.8),
            21 => (0.05, 10.),
            22 => (0., 8.),
            _ => (-18., 6.),
        };
        self.p[i] = v.clamp(lo, hi);
    }
    fn refresh(&mut self) {
        for ch in 0..2 {
            for band in 0..3 {
                let (gain, hz, q) = match band {
                    0 => (self.s[3], self.s[4], 0.7),
                    1 => (self.s[5], self.s[6], self.s[7]),
                    _ => (self.s[8], self.s[9], 0.7),
                };
                self.eq[ch][band].configure(band, gain, hz, q, self.sr);
            }
            let hz = (self.s[13]
                * 2_f32
                    .powf(self.s[12] * (2. * PI * (self.phaser_phase + ch as f32 * 0.25)).sin()))
            .clamp(30., self.sr * 0.4);
            let t = (PI * hz / self.sr).tan();
            self.phaser_target[ch] = (t - 1.) / (t + 1.);
        }
        self.drive = 10_f32.powf(self.s[2] / 20.);
        self.trim = 10_f32.powf(self.s[23] / 20.);
    }
    fn render(&mut self, n: usize) {
        denormal::flush(&mut self.dc_in);
        denormal::flush(&mut self.dc_out);
        denormal::flush(&mut self.phaser_last);
        for ch in 0..2 {
            denormal::flush(&mut self.phaser[ch]);
            for band in &mut self.eq[ch] { denormal::flush(&mut band.x); denormal::flush(&mut band.y); }
        }
        self.peak = 0.;
        if self.p[0] < 0.5
            && self.wet == 1.
            && [1, 3, 5, 8, 10, 15, 20, 23]
                .iter()
                .all(|&k| self.p[k] == 0. && self.s[k] == 0.)
        {
            if self.active.iter().any(|x| *x) {
                self.clear();
            }
            self.s = self.p;
            for i in 0..n.min(BLOCK) {
                for ch in 0..2 {
                    let x = unsafe { INPUT[ch][i] };
                    unsafe {
                        OUTPUT[ch][i] = x;
                    }
                    self.peak = self.peak.max(x.abs());
                }
            }
            self.frame += n.min(BLOCK) as u64;
            return;
        }
        let dc = (-2. * PI * 10. / self.sr).exp();
        for i in 0..n.min(BLOCK) {
            let input = unsafe { [INPUT[0][i], INPUT[1][i]] };
            for k in 1..PARAMS {
                let diff = self.p[k] - self.s[k];
                if diff.abs() < 1e-5 {
                    self.s[k] = self.p[k];
                } else {
                    self.s[k] += diff * self.alpha;
                }
            }
            let bypass = if self.p[0] >= 0.5 { 0. } else { 1. };
            self.wet += (bypass - self.wet) * self.alpha;
            if (bypass - self.wet).abs() < 1e-5 {
                self.wet = bypass;
            }
            if self.wet == 0. {
                if self.active.iter().any(|x| *x) {
                    self.clear();
                }
                unsafe {
                    OUTPUT[0][i] = input[0];
                    OUTPUT[1][i] = input[1];
                }
                self.peak = self.peak.max(input[0].abs()).max(input[1].abs());
                self.frame += 1;
                continue;
            }
            self.active[3] = true;
            if self.frame % 32 == 0 {
                self.refresh();
            }
            self.phaser_phase = (self.phaser_phase + self.s[11] / self.sr).fract();
            let mut out = input;
            if self.s[1] > 0. {
                for ch in 0..2 {
                    let shaped = soft(out[ch] * self.drive) / self.drive.sqrt();
                    let filtered = shaped - self.dc_in[ch] + dc * self.dc_out[ch];
                    self.dc_in[ch] = shaped;
                    self.dc_out[ch] = filtered;
                    out[ch] += (filtered - out[ch]) * self.s[1];
                }
            } else {
                self.dc_in = [0.; 2];
                self.dc_out = [0.; 2];
            }
            for band in 0..3 {
                if self.s[[3, 5, 8][band]] != 0. {
                    for ch in 0..2 {
                        out[ch] = self.eq[ch][band].tick(out[ch]);
                    }
                } else {
                    for ch in 0..2 {
                        self.eq[ch][band].x = [0.; 2];
                        self.eq[ch][band].y = [0.; 2];
                    }
                }
            }
            if self.s[10] > 1e-5 {
                self.active[0] = true;
                for ch in 0..2 {
                    self.phaser_g[ch] += (self.phaser_target[ch] - self.phaser_g[ch]) * self.alpha;
                    let g = self.phaser_g[ch];
                    let mut x = (out[ch] + self.phaser_last[ch] * self.s[14]).clamp(-8., 8.);
                    for stage in &mut self.phaser[ch] {
                        let y = g * x + *stage;
                        *stage = x - g * y;
                        x = y;
                    }
                    self.phaser_last[ch] = x.clamp(-8., 8.);
                    out[ch] = out[ch] * (1. - self.s[10] * 0.5) + x * self.s[10] * 0.5;
                }
            } else if self.active[0] {
                self.phaser = [[0.; 6]; 2];
                self.phaser_last = [0.; 2];
                self.active[0] = false;
            }
            if self.s[15] > 1e-5 {
                self.active[1] = true;
                out = self.flanger.tick(
                    out, self.sr, self.s[15], self.s[16], self.s[17], self.s[18], self.s[19], false,
                );
            } else if self.active[1] {
                self.flanger.clear();
                self.active[1] = false;
            }
            if self.s[20] > 1e-5 {
                self.active[2] = true;
                out = self.chorus.tick(
                    out, self.sr, self.s[20], self.s[21], self.s[22], 12., 0., true,
                );
            } else if self.active[2] {
                self.chorus.clear();
                self.active[2] = false;
            }
            for ch in 0..2 {
                let x = input[ch] + (out[ch] * self.trim - input[ch]) * self.wet;
                unsafe {
                    OUTPUT[ch][i] = x;
                }
                self.peak = self.peak.max(x.abs());
            }
            self.frame += 1;
        }
    }
}
static mut FX: Inserts = Inserts::new();
static mut INPUT: [[f32; BLOCK]; 2] = [[0.; BLOCK]; 2];
static mut OUTPUT: [[f32; BLOCK]; 2] = [[0.; BLOCK]; 2];
#[no_mangle]
pub extern "C" fn inserts_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn inserts_init(sr: f32) {
    unsafe {
        FX.init(sr);
    }
}
#[no_mangle]
pub extern "C" fn inserts_param(i: u32, v: f32) {
    unsafe {
        FX.param(i as usize, v);
    }
}
#[no_mangle]
pub extern "C" fn inserts_input(c: u32) -> *mut f32 {
    unsafe { INPUT[(c as usize).min(1)].as_mut_ptr() }
}
#[no_mangle]
pub extern "C" fn inserts_output(c: u32) -> *const f32 {
    unsafe { OUTPUT[(c as usize).min(1)].as_ptr() }
}
#[no_mangle]
pub extern "C" fn inserts_render(n: u32) {
    unsafe {
        FX.render(n as usize);
    }
}
#[no_mangle]
pub extern "C" fn inserts_clear() {
    unsafe {
        FX.clear();
    }
}
#[no_mangle]
pub extern "C" fn inserts_settle() {
    unsafe {
        FX.s = FX.p;
        FX.wet = if FX.p[0] >= 0.5 { 0. } else { 1. };
        FX.refresh();
    }
}
#[no_mangle]
pub extern "C" fn inserts_stat(i: u32) -> f64 {
    unsafe {
        match i {
            0 => FX.peak as f64,
            1 => FX.frame as f64,
            _ => 0.,
        }
    }
}
