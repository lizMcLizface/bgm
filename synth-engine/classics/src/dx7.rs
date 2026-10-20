//! A DX7-style six-operator FM synthesizer.
//!
//! The DX7's measured behaviour comes from the MSFA project (Music Synthesizer for
//! Android, https://github.com/google/music-synthesizer-for-android, Copyright 2012
//! Google Inc., Apache License 2.0), whose integer pipeline this file ports to Rust:
//! the envelope generator and its level/rate tables, the pitch envelope, the LFO, the
//! exponential, sine and frequency look-ups, the 32 algorithms with the operator
//! kernels and two-sample averaged feedback, and the keyboard level/rate/velocity
//! scaling. Everything is computed in 64-sample blocks, as the original code does.
//! Added here: amplitude modulation, mod wheel and pressure into the LFO pitch depth,
//! pitch bend, master tune, operator switches, mono mode with portamento, polyphony
//! with voice stealing, and the sample-rate scaling of the envelope times.
//!
//! Parameters 0–155 are the DX7's own 156-byte voice layout (the unpacked "VCED" order,
//! operator 6 first, 21 values each), so a voice from a cartridge loads by index.
use crate::alloc::{choose, KeyStack, Slot};
use crate::dsp::*;

pub const PARAMS: usize = 176;
pub const VOICES: usize = 16;
const LG_N: u32 = 6;
const N: usize = 1 << LG_N;
/// A gain below this (about −89 dB) is not computed at all.
const LEVEL_THRESH: i32 = 1120;

pub mod id {
    pub const PITCH_EG: usize = 126;
    pub const ALGORITHM: usize = 134;
    pub const LFO_SPEED: usize = 137;
    pub const LFO_DELAY: usize = 138;
    pub const LFO_AMD: usize = 140;
    pub const LFO_SYNC: usize = 141;
    pub const LFO_WAVE: usize = 142;
    pub const LFO_PMS: usize = 143;
    pub const TRANSPOSE: usize = 144;
    pub const VOLUME: usize = 160;
    pub const MONO: usize = 161;
    pub const PORTAMENTO: usize = 162;
    pub const MOD_WHEEL: usize = 163;
    pub const PRESSURE: usize = 164;
    pub const TUNE: usize = 165;
    /// Operator on/off switches for OP1…OP6 from here.
    pub const OP_ON: usize = 166;
}

// ---------------------------------------------------------------- tables

struct Tables {
    exp2: [i32; 2048],
    sin: [i32; 2048],
    freq: [i32; 1025],
    /// 44.1 kHz / sample rate in Q24: the envelope speeds were calibrated at 44.1 kHz.
    sr_mul: i64,
}

impl Tables {
    const ZERO: Self = Self { exp2: [0; 2048], sin: [0; 2048], freq: [0; 1025], sr_mul: 1 << 24 };

    fn init(&mut self, sr: f64) {
        let inc = (1.0f64 / 1024.).exp2();
        let mut y = (1u64 << 30) as f64;
        for i in 0..1024 {
            self.exp2[2 * i + 1] = (y + 0.5).floor() as i32;
            y *= inc;
        }
        for i in 0..1023 {
            self.exp2[2 * i] = self.exp2[2 * i + 3] - self.exp2[2 * i + 1];
        }
        self.exp2[2046] = ((1i64 << 31) - self.exp2[2047] as i64) as i32;

        let dphase = 2. * core::f64::consts::PI / 1024.;
        let c = ((dphase.cos() * (1u64 << 30) as f64) + 0.5).floor() as i64;
        let s = ((dphase.sin() * (1u64 << 30) as f64) + 0.5).floor() as i64;
        let (mut u, mut v) = (1i64 << 30, 0i64);
        const R: i64 = 1 << 29;
        for i in 0..512 {
            self.sin[2 * i + 1] = ((v + 32) >> 6) as i32;
            self.sin[2 * (i + 512) + 1] = -(((v + 32) >> 6) as i32);
            let t = (u * s + v * c + R) >> 30;
            u = (u * c - v * s + R) >> 30;
            v = t;
        }
        for i in 0..1023 {
            self.sin[2 * i] = self.sin[2 * i + 3] - self.sin[2 * i + 1];
        }
        self.sin[2046] = -self.sin[2047];

        let mut y = (1u64 << (24 + 20)) as f64 / sr;
        for i in 0..1025 {
            self.freq[i] = (y + 0.5).floor().min(2147483647.) as i32;
            y *= inc;
        }
        self.sr_mul = ((44100.0 / sr) * (1u64 << 24) as f64) as i64;
    }

    /// 2^x for x in Q24, result Q24.
    #[inline]
    fn exp2(&self, x: i32) -> i32 {
        let low = x & ((1 << 14) - 1);
        let at = ((x >> 13) & (1023 << 1)) as usize;
        let (dy, y0) = (self.exp2[at] as i64, self.exp2[at + 1]);
        let y = y0 + ((dy * low as i64) >> 14) as i32;
        let shift = 6 - (x >> 24);
        if shift >= 32 {
            0
        } else if shift < 0 {
            y << (-shift).min(8)
        } else {
            y >> shift
        }
    }

    /// Sine of a phase in turns (Q24), result ±(1 << 24).
    #[inline]
    fn sin(&self, phase: i32) -> i32 {
        let low = phase & ((1 << 14) - 1);
        let at = ((phase >> 13) & (1023 << 1)) as usize;
        let (dy, y0) = (self.sin[at] as i64, self.sin[at + 1]);
        y0 + ((dy * low as i64) >> 14) as i32
    }

    /// Log frequency (Q24 octaves, 0 = 1 Hz) → phase increment per sample (Q24 turns).
    #[inline]
    fn freq(&self, logfreq: i32) -> i32 {
        let at = ((logfreq & 0xff_ffff) >> 14) as usize;
        let (y0, y1) = (self.freq[at], self.freq[at + 1]);
        let low = logfreq & ((1 << 14) - 1);
        let y = y0 + (((y1 - y0) as i64 * low as i64) >> 14) as i32;
        let shift = 20 - (logfreq >> 24);
        if shift >= 32 {
            0
        } else if shift < 0 {
            y << (-shift).min(8)
        } else {
            y >> shift
        }
    }
}

// ---------------------------------------------------------------- envelopes

const LEVEL_LUT: [i32; 20] = [0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46];

fn scale_out_level(l: i32) -> i32 {
    if l >= 20 { 28 + l } else { LEVEL_LUT[l.clamp(0, 19) as usize] }
}

/// The DX7 amplitude envelope: four rates and levels, in a Q24 log domain (2^24 = one doubling).
#[derive(Clone, Copy)]
struct Env {
    rates: [i32; 4],
    levels: [i32; 4],
    outlevel: i32,
    rate_scaling: i32,
    level: i32,
    target: i32,
    rising: bool,
    ix: usize,
    inc: i32,
    down: bool,
}

impl Env {
    const ZERO: Self = Self {
        rates: [0; 4], levels: [0; 4], outlevel: 0, rate_scaling: 0, level: 0, target: 0, rising: false, ix: 4, inc: 0, down: false,
    };

    fn init(&mut self, rates: [i32; 4], levels: [i32; 4], outlevel: i32, rate_scaling: i32, sr_mul: i64) {
        self.rates = rates;
        self.levels = levels;
        self.outlevel = outlevel;
        self.rate_scaling = rate_scaling;
        self.level = 0;
        self.down = true;
        self.advance(0, sr_mul);
    }

    fn advance(&mut self, ix: usize, sr_mul: i64) {
        self.ix = ix;
        if ix < 4 {
            let newlevel = self.levels[ix];
            let mut actual = scale_out_level(newlevel) >> 1;
            actual = (actual << 6) + self.outlevel - 4256;
            actual = actual.max(16);
            self.target = actual << 16;
            self.rising = self.target > self.level;
            let mut qrate = (self.rates[ix] * 41) >> 6;
            qrate += self.rate_scaling;
            qrate = qrate.min(63);
            let inc = (4 + (qrate & 3)) << (2 + LG_N as i32 + (qrate >> 2));
            self.inc = ((inc as i64 * sr_mul) >> 24) as i32;
        }
    }

    #[inline]
    fn sample(&mut self, sr_mul: i64) -> i32 {
        if self.ix < 3 || (self.ix < 4 && !self.down) {
            if self.rising {
                const JUMP: i32 = 1716;
                if self.level < (JUMP << 16) {
                    self.level = JUMP << 16;
                }
                self.level = self.level.wrapping_add((((17 << 24) - self.level) >> 24).wrapping_mul(self.inc));
                if self.level >= self.target {
                    self.level = self.target;
                    self.advance(self.ix + 1, sr_mul);
                }
            } else {
                self.level = self.level.wrapping_sub(self.inc);
                if self.level <= self.target {
                    self.level = self.target;
                    self.advance(self.ix + 1, sr_mul);
                }
            }
        }
        self.level
    }

    fn key_down(&mut self, down: bool, sr_mul: i64) {
        if self.down != down {
            self.down = down;
            self.advance(if down { 0 } else { 3 }, sr_mul);
        }
    }
}

const PITCH_RATE: [u8; 100] = [
    1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 16, 16, 17, 18, 18, 19, 20, 21, 22,
    23, 24, 25, 26, 27, 28, 30, 31, 33, 34, 36, 37, 38, 39, 41, 42, 44, 46, 47, 49, 51, 53, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72,
    74, 76, 79, 82, 85, 88, 91, 94, 98, 102, 106, 110, 115, 120, 125, 130, 135, 141, 147, 153, 159, 165, 171, 178, 185, 193, 202,
    211, 232, 243, 254, 255,
];
const PITCH_LEVEL: [i8; 100] = [
    -128, -116, -104, -95, -85, -76, -68, -61, -56, -52, -49, -46, -43, -41, -39, -37, -35, -33, -32, -31, -30, -29, -28, -27, -26,
    -25, -24, -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2,
    3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
    38, 40, 43, 46, 49, 53, 58, 65, 73, 82, 92, 103, 115, 127,
];

/// The pitch envelope: Q24 octaves, linear segments.
#[derive(Clone, Copy)]
struct PitchEnv {
    rates: [i32; 4],
    levels: [i32; 4],
    level: i32,
    target: i32,
    rising: bool,
    ix: usize,
    inc: i32,
    down: bool,
    unit: i32,
}

impl PitchEnv {
    const ZERO: Self = Self { rates: [0; 4], levels: [0; 4], level: 0, target: 0, rising: false, ix: 4, inc: 0, down: false, unit: 0 };

    fn set(&mut self, rates: [i32; 4], levels: [i32; 4], sr: f64) {
        self.unit = (N as f64 * (1u64 << 24) as f64 / (21.3 * sr) + 0.5) as i32;
        self.rates = rates;
        self.levels = levels;
        self.level = (PITCH_LEVEL[levels[3].clamp(0, 99) as usize] as i32) << 19;
        self.down = true;
        self.advance(0);
    }

    fn advance(&mut self, ix: usize) {
        self.ix = ix;
        if ix < 4 {
            self.target = (PITCH_LEVEL[self.levels[ix].clamp(0, 99) as usize] as i32) << 19;
            self.rising = self.target > self.level;
            self.inc = PITCH_RATE[self.rates[ix].clamp(0, 99) as usize] as i32 * self.unit;
        }
    }

    #[inline]
    fn sample(&mut self) -> i32 {
        if self.ix < 3 || (self.ix < 4 && !self.down) {
            if self.rising {
                self.level = self.level.wrapping_add(self.inc);
                if self.level >= self.target {
                    self.level = self.target;
                    self.advance(self.ix + 1);
                }
            } else {
                self.level = self.level.wrapping_sub(self.inc);
                if self.level <= self.target {
                    self.level = self.target;
                    self.advance(self.ix + 1);
                }
            }
        }
        self.level
    }

    fn key_up(&mut self) {
        if self.down {
            self.down = false;
            self.advance(3);
        }
    }
}

// ---------------------------------------------------------------- LFO

#[derive(Clone, Copy)]
struct DxLfo {
    phase: u32,
    delta: u32,
    waveform: i32,
    rand: u32,
    delay_state: u32,
    delay_inc: u32,
    delay_inc2: u32,
    sync: bool,
    unit: u32,
}

impl DxLfo {
    const ZERO: Self = Self { phase: 0, delta: 0, waveform: 0, rand: 0, delay_state: 0, delay_inc: 0, delay_inc2: 0, sync: false, unit: 0 };

    fn reset(&mut self, speed: i32, delay: i32, sync: i32, wave: i32, sr: f64) {
        self.unit = (N as f64 * 25190424. / sr + 0.5) as u32;
        let mut sr_ = if speed == 0 { 1 } else { (165 * speed) >> 6 };
        sr_ *= if sr_ < 160 { 11 } else { 11 + ((sr_ - 160) >> 4) };
        self.delta = self.unit.wrapping_mul(sr_ as u32);
        let a = 99 - delay;
        if a == 99 {
            self.delay_inc = !0;
            self.delay_inc2 = !0;
        } else {
            let mut a = (16 + (a & 15)) << (1 + (a >> 4));
            self.delay_inc = self.unit.wrapping_mul(a as u32);
            a &= 0xff80;
            a = a.max(0x80);
            self.delay_inc2 = self.unit.wrapping_mul(a as u32);
        }
        self.waveform = wave;
        self.sync = sync != 0;
    }

    /// 0…2^24 in Q24, advanced one block.
    fn sample(&mut self, t: &Tables) -> i32 {
        self.phase = self.phase.wrapping_add(self.delta);
        let p = self.phase;
        match self.waveform {
            0 => {
                let mut x = (p >> 7) as i32;
                x ^= -((p >> 31) as i32);
                x & ((1 << 24) - 1)
            }
            1 => ((!p ^ (1u32 << 31)) >> 8) as i32,
            2 => ((p ^ (1u32 << 31)) >> 8) as i32,
            3 => (((!p) >> 7) & (1 << 24)) as i32,
            4 => (1 << 23) + (t.sin((p >> 8) as i32) >> 1),
            5 => {
                if p < self.delta {
                    self.rand = (self.rand.wrapping_mul(179) + 17) & 0xff;
                }
                let x = (self.rand ^ 0x80) as i32;
                (x + 1) << 16
            }
            _ => 1 << 23,
        }
    }

    /// The delay ramp in Q24 (0 until the delay has passed, then 1).
    fn delay(&mut self) -> i32 {
        let delta = if self.delay_state < (1u32 << 31) { self.delay_inc } else { self.delay_inc2 };
        let d = self.delay_state.wrapping_add(delta);
        if d < self.delay_inc {
            return 1 << 24;
        }
        self.delay_state = d;
        if d < (1u32 << 31) { 0 } else { ((d >> 7) & ((1 << 24) - 1)) as i32 }
    }

    fn key_down(&mut self) {
        if self.sync {
            self.phase = (1u32 << 31) - 1;
        }
        self.delay_state = 0;
    }
}

// ---------------------------------------------------------------- algorithms and kernels

const OUT_BUS_ADD: u8 = 4;

/// Per operator (operator 6 first): bit 0–1 output bus (0 = the mix), bit 2 adds to the
/// bus, bits 4–5 the input bus, bits 6–7 feedback in/out.
const ALGORITHMS: [[u8; 6]; 32] = [
    [0xc1, 0x11, 0x11, 0x14, 0x01, 0x14], [0x01, 0x11, 0x11, 0x14, 0xc1, 0x14], [0xc1, 0x11, 0x14, 0x01, 0x11, 0x14],
    [0x41, 0x11, 0x94, 0x01, 0x11, 0x14], [0xc1, 0x14, 0x01, 0x14, 0x01, 0x14], [0x41, 0x94, 0x01, 0x14, 0x01, 0x14],
    [0xc1, 0x11, 0x05, 0x14, 0x01, 0x14], [0x01, 0x11, 0xc5, 0x14, 0x01, 0x14], [0x01, 0x11, 0x05, 0x14, 0xc1, 0x14],
    [0x01, 0x05, 0x14, 0xc1, 0x11, 0x14], [0xc1, 0x05, 0x14, 0x01, 0x11, 0x14], [0x01, 0x05, 0x05, 0x14, 0xc1, 0x14],
    [0xc1, 0x05, 0x05, 0x14, 0x01, 0x14], [0xc1, 0x05, 0x11, 0x14, 0x01, 0x14], [0x01, 0x05, 0x11, 0x14, 0xc1, 0x14],
    [0xc1, 0x11, 0x02, 0x25, 0x05, 0x14], [0x01, 0x11, 0x02, 0x25, 0xc5, 0x14], [0x01, 0x11, 0x11, 0xc5, 0x05, 0x14],
    [0xc1, 0x14, 0x14, 0x01, 0x11, 0x14], [0x01, 0x05, 0x14, 0xc1, 0x14, 0x14], [0x01, 0x14, 0x14, 0xc1, 0x14, 0x14],
    [0xc1, 0x14, 0x14, 0x14, 0x01, 0x14], [0xc1, 0x14, 0x14, 0x01, 0x14, 0x04], [0xc1, 0x14, 0x14, 0x14, 0x04, 0x04],
    [0xc1, 0x14, 0x14, 0x04, 0x04, 0x04], [0xc1, 0x05, 0x14, 0x01, 0x14, 0x04], [0x01, 0x05, 0x14, 0xc1, 0x14, 0x04],
    [0x04, 0xc1, 0x11, 0x14, 0x01, 0x14], [0xc1, 0x14, 0x01, 0x14, 0x04, 0x04], [0x04, 0xc1, 0x11, 0x14, 0x04, 0x04],
    [0xc1, 0x14, 0x04, 0x04, 0x04, 0x04], [0xc4, 0x04, 0x04, 0x04, 0x04, 0x04],
];

#[derive(Clone, Copy)]
struct Op {
    gain: [i32; 2],
    freq: i32,
    phase: i32,
}

/// One operator over a block: `input` (if any) phase-modulates it; `feedback` runs the
/// two-sample-averaged self-modulation. Adds to `out` or replaces it.
#[inline]
fn run_op(t: &Tables, out: &mut [i32; N], input: Option<&[i32; N]>, op: &Op, add: bool, feedback: Option<(&mut [i32; 2], i32)>) {
    let dgain = (op.gain[1] - op.gain[0] + (N as i32 >> 1)) >> LG_N;
    let mut gain = op.gain[0];
    let mut phase = op.phase;
    match (input, feedback) {
        (_, Some((fb, shift))) => {
            let (mut y0, mut y) = (fb[0], fb[1]);
            for o in out.iter_mut() {
                gain = gain.wrapping_add(dgain);
                let scaled = (y0 + y) >> (shift + 1);
                y0 = y;
                y = ((t.sin(phase.wrapping_add(scaled)) as i64 * gain as i64) >> 24) as i32;
                *o = if add { o.wrapping_add(y) } else { y };
                phase = phase.wrapping_add(op.freq);
            }
            fb[0] = y0;
            fb[1] = y;
        }
        (Some(inp), None) => {
            for (o, &m) in out.iter_mut().zip(inp.iter()) {
                gain = gain.wrapping_add(dgain);
                let y = ((t.sin(phase.wrapping_add(m)) as i64 * gain as i64) >> 24) as i32;
                *o = if add { o.wrapping_add(y) } else { y };
                phase = phase.wrapping_add(op.freq);
            }
        }
        (None, None) => {
            for o in out.iter_mut() {
                gain = gain.wrapping_add(dgain);
                let y = ((t.sin(phase) as i64 * gain as i64) >> 24) as i32;
                *o = if add { o.wrapping_add(y) } else { y };
                phase = phase.wrapping_add(op.freq);
            }
        }
    }
}

fn run_core(t: &Tables, out: &mut [i32; N], ops: &mut [Op; 6], algorithm: usize, fb: &mut [i32; 2], fb_shift: i32, buses: &mut [[i32; N]; 2]) {
    let alg = ALGORITHMS[algorithm.min(31)];
    let mut has = [true, false, false];
    for i in 0..6 {
        let flags = alg[i];
        let mut add = flags & OUT_BUS_ADD != 0;
        let (inbus, outbus) = (((flags >> 4) & 3) as usize, (flags & 3) as usize);
        let op = ops[i];
        if op.gain[0] >= LEVEL_THRESH || op.gain[1] >= LEVEL_THRESH {
            if !has[outbus] {
                add = false;
            }
            let input = if inbus != 0 && has[inbus] { Some(buses[inbus - 1]) } else { None };
            let feedback = if input.is_none() && flags & 0xc0 == 0xc0 && fb_shift < 16 { Some((&mut *fb, fb_shift)) } else { None };
            let target: &mut [i32; N] = if outbus == 0 { &mut *out } else { &mut buses[outbus - 1] };
            run_op(t, target, input.as_ref(), &op, add, feedback);
            has[outbus] = true;
        } else if !add {
            has[outbus] = false;
        }
        ops[i].phase = ops[i].phase.wrapping_add(op.freq << LG_N);
    }
}

// ---------------------------------------------------------------- note setup

const COARSE_MUL: [i32; 32] = [
    -16777216, 0, 16777216, 26591258, 33554432, 38955489, 43368474, 47099600, 50331648, 53182516, 55732705, 58039632, 60145690,
    62083076, 63876816, 65546747, 67108864, 68576247, 69959732, 71268397, 72509921, 73690858, 74816848, 75892776, 76922906,
    77910978, 78860292, 79773775, 80654032, 81503396, 82323963, 83117622,
];

fn midi_to_logfreq(note: i32) -> i32 {
    50857777 + ((1 << 24) / 12) * note
}

fn osc_freq(note: i32, fixed: bool, coarse: i32, fine: i32, detune: i32) -> i32 {
    if !fixed {
        let mut logfreq = midi_to_logfreq(note) + COARSE_MUL[(coarse & 31) as usize];
        if fine != 0 {
            logfreq += (24204406.323123 * (1. + 0.01 * fine as f64).ln() + 0.5).floor() as i32;
        }
        logfreq + 12606 * (detune - 7)
    } else {
        let logfreq = (4458616 * ((coarse & 3) * 100 + fine)) >> 3;
        logfreq + if detune > 7 { 13457 * (detune - 7) } else { 0 }
    }
}

const VELOCITY: [u8; 64] = [
    0, 70, 86, 97, 106, 114, 121, 126, 132, 138, 142, 148, 152, 156, 160, 163, 166, 170, 173, 174, 178, 181, 184, 186, 189, 190,
    194, 196, 198, 200, 202, 205, 206, 209, 211, 214, 216, 218, 220, 222, 224, 225, 227, 229, 230, 232, 233, 235, 237, 238, 240,
    241, 242, 243, 244, 246, 246, 248, 249, 250, 251, 252, 253, 254,
];

fn scale_velocity(velocity: i32, sensitivity: i32) -> i32 {
    let v = velocity.clamp(0, 127);
    let value = VELOCITY[(v >> 1) as usize] as i32 - 239;
    ((sensitivity * value + 7) >> 3) << 4
}

fn scale_rate(note: i32, sensitivity: i32) -> i32 {
    let x = (note / 3 - 7).clamp(0, 31);
    (sensitivity * x) >> 3
}

const EXP_SCALE: [u8; 33] = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 16, 19, 23, 27, 33, 39, 47, 56, 66, 80, 94, 110, 126, 142, 158, 174, 190, 206, 222,
    238, 250,
];

fn scale_curve(group: i32, depth: i32, curve: i32) -> i32 {
    let mut scale = if curve == 0 || curve == 3 {
        (group * depth * 329) >> 12
    } else {
        (EXP_SCALE[group.clamp(0, 32) as usize] as i32 * depth * 329) >> 15
    };
    if curve < 2 {
        scale = -scale;
    }
    scale
}

fn scale_level(note: i32, break_pt: i32, left_depth: i32, right_depth: i32, left_curve: i32, right_curve: i32) -> i32 {
    let offset = note - break_pt - 17;
    if offset >= 0 {
        scale_curve(offset / 3, right_depth, right_curve)
    } else {
        scale_curve((-offset) / 3, left_depth, left_curve)
    }
}

const PITCH_MOD_SENS: [i32; 8] = [0, 10, 20, 33, 55, 92, 153, 255];
/// Amplitude-modulation sensitivities (the share of the full depth), estimates.
const AMP_MOD_SENS: [f32; 4] = [0., 0.32, 0.55, 1.];
/// The deepest amplitude modulation, in doublings of amplitude (6 dB each): an estimate.
const AMP_MOD_DOUBLINGS: f32 = 6.;

#[derive(Clone, Copy)]
struct Voice {
    onset: Onset,
    key: u32,
    note: i32,
    velocity: i32,
    down: bool,
    held: bool,
    active: bool,
    stamp: u32,
    env: [Env; 6],
    ops: [Op; 6],
    pitch_env: PitchEnv,
    base: [i32; 6],
    fb: [i32; 2],
    fb_shift: i32,
    algorithm: usize,
    pmd: i32,
    pms: i32,
    ams: [f32; 6],
    on: [bool; 6],
    /// leftover glide in Q24 octaves, decaying to zero
    glide: i32,
    level: f32,
}

impl Voice {
    const ZERO: Self = Self {
        onset: Onset::DONE,
        key: 0, note: 60, velocity: 0, down: false, held: false, active: false, stamp: 0, env: [Env::ZERO; 6],
        ops: [Op { gain: [0, 0], freq: 0, phase: 0 }; 6], pitch_env: PitchEnv::ZERO, base: [0; 6], fb: [0; 2], fb_shift: 16,
        algorithm: 0, pmd: 0, pms: 0, ams: [0.; 6], on: [true; 6], glide: 0, level: 0.,
    };
}

pub struct Dx7 {
    sr: f32,
    pub p: [f32; PARAMS],
    dirty: bool,
    tables: Tables,
    voices: [Voice; VOICES],
    stamp: u32,
    lfo: DxLfo,
    lfo_val: i32,
    lfo_delay: i32,
    amd: f32,
    blk: [f32; N],
    pos: usize,
    mono_keys: KeyStack,
    bend_to: f32,
    bend: f32,
    wheel: f32,
    wheel_s: f32,
    pressure: f32,
    pressure_s: f32,
    expression: f32,
    expression_s: f32,
    pedal: bool,
    pub steals: u32,
}

impl Dx7 {
    pub const fn new() -> Self {
        Self {
            sr: 48000., p: [0.; PARAMS], dirty: true, tables: Tables::ZERO, voices: [Voice::ZERO; VOICES], stamp: 0, lfo: DxLfo::ZERO,
            lfo_val: 1 << 23, lfo_delay: 1 << 24, amd: 0., blk: [0.; N], pos: N, mono_keys: KeyStack::EMPTY, bend_to: 0., bend: 0.,
            wheel: 0., wheel_s: 0., pressure: 0., pressure_s: 0., expression: 1., expression_s: 1., pedal: false, steals: 0,
        }
    }

    pub fn init(&mut self, sr: f32) {
        *self = Self::new();
        self.sr = sr;
        self.tables.init(sr as f64);
        // a plain organ-ish default: operator 1 alone, algorithm 32
        for op in 0..6 {
            let b = 21 * op;
            for (i, v) in [99., 99., 99., 99., 99., 99., 99., 0.].iter().enumerate() {
                self.p[b + i] = *v;
            }
            self.p[b + 16] = if op == 5 { 99. } else { 0. };
            self.p[b + 18] = 1.;
            self.p[b + 20] = 7.;
            self.p[b + 10] = 0.;
            self.p[b + 8] = 39.;
            self.p[b + 15] = 2.;
        }
        for (i, v) in [99., 99., 99., 99., 50., 50., 50., 50.].iter().enumerate() {
            self.p[id::PITCH_EG + i] = *v;
        }
        self.p[id::ALGORITHM] = 31.;
        self.p[id::LFO_SPEED] = 35.;
        self.p[id::LFO_PMS] = 3.;
        self.p[id::TRANSPOSE] = 24.;
        self.p[id::VOLUME] = 0.6;
        self.p[id::MOD_WHEEL] = 50.;
        for k in 0..6 {
            self.p[id::OP_ON + k] = 1.;
        }
    }

    pub fn set(&mut self, i: usize, value: f32) {
        if i < PARAMS && value.is_finite() {
            self.p[i] = value;
            self.dirty = true;
        }
    }

    pub fn active(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }

    fn patch(&self, i: usize) -> i32 {
        self.p[i].round() as i32
    }

    fn mono(&self) -> bool {
        self.p[id::MONO] >= 0.5
    }

    fn prepare(&mut self) {
        let (speed, delay, sync, wave) = (self.patch(id::LFO_SPEED), self.patch(id::LFO_DELAY), self.patch(id::LFO_SYNC), self.patch(id::LFO_WAVE));
        self.lfo.reset(speed.clamp(0, 99), delay.clamp(0, 99), sync, wave.clamp(0, 5), self.sr as f64);
        self.amd = bound(self.p[id::LFO_AMD], 0., 99.) / 99.;
        self.dirty = false;
    }

    /// Sets a voice up for a note from the current panel (the DX7 reads its voice at note-on).
    fn init_voice(&mut self, index: usize, key: u32, note: i32, velocity: i32) {
        let sr_mul = self.tables.sr_mul;
        let transpose = self.patch(id::TRANSPOSE).clamp(0, 48) - 24;
        let midi = (note + transpose).clamp(0, 127);
        let mut p = [0i32; 156];
        for (i, slot) in p.iter_mut().enumerate() {
            *slot = self.p[i].round() as i32;
        }
        let sr = self.sr as f64;
        let (stamp, glide) = (self.stamp, self.voices[index].glide);
        let v = &mut self.voices[index];
        for op in 0..6 {
            let b = op * 21;
            let rates = [p[b], p[b + 1], p[b + 2], p[b + 3]];
            let levels = [p[b + 4], p[b + 5], p[b + 6], p[b + 7]];
            let mut outlevel = scale_out_level(p[b + 16].clamp(0, 99));
            outlevel += scale_level(midi, p[b + 8], p[b + 9], p[b + 10], p[b + 11], p[b + 12]);
            outlevel = outlevel.min(127);
            outlevel <<= 5;
            outlevel += scale_velocity(velocity, p[b + 15]);
            outlevel = outlevel.max(0);
            v.env[op].init(rates, levels, outlevel, scale_rate(midi, p[b + 13]), sr_mul);
            v.base[op] = osc_freq(midi, p[b + 17] != 0, p[b + 18], p[b + 19], p[b + 20]);
            v.ops[op].phase = 0;
            v.ops[op].gain[1] = 0;
            v.ams[op] = AMP_MOD_SENS[p[b + 14].clamp(0, 3) as usize];
            v.on[op] = self.p[id::OP_ON + (5 - op)] >= 0.5;
        }
        let r = [p[126], p[127], p[128], p[129]];
        let l = [p[130], p[131], p[132], p[133]];
        v.pitch_env.set(r, l, sr);
        v.algorithm = p[134].clamp(0, 31) as usize;
        let feedback = p[135].clamp(0, 7);
        v.fb_shift = if feedback != 0 { 8 - feedback } else { 16 };
        v.fb = [0; 2];
        v.pmd = (p[139].clamp(0, 99) * 165) >> 6;
        v.pms = PITCH_MOD_SENS[(p[143] & 7) as usize];
        v.key = key;
        v.note = note;
        v.velocity = velocity;
        v.down = true;
        v.held = false;
        if !v.active {
            v.onset.arm();
        }
        v.active = true;
        v.stamp = stamp;
        v.glide = glide;
        v.level = 1.;
        self.lfo.key_down();
    }

    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) {
        if !note.is_finite() {
            return;
        }
        if self.dirty {
            self.prepare();
        }
        let note = note.round().clamp(0., 127.) as i32;
        let velocity = (bound(velocity, 0., 1.) * 127.).round() as i32;
        self.stamp = self.stamp.wrapping_add(1);
        if self.mono() {
            let held = self.voices[0].active && self.voices[0].down;
            self.mono_keys.push(key, note as f32);
            let porta = bound(self.p[id::PORTAMENTO], 0., 99.);
            if held && porta > 0. {
                // legato glide: the pitch moves, the envelopes carry on
                self.move_mono(key, note);
            } else {
                let old = self.voices[0].note;
                let was = self.voices[0].active;
                self.voices[0].glide = if was && porta > 0. { (old - note) * ((1 << 24) / 12) } else { 0 };
                self.init_voice(0, key, note, velocity);
            }
            let sr_mul = self.tables.sr_mul;
            for v in self.voices[1..].iter_mut().filter(|v| v.active && v.down) {
                Self::release(v, sr_mul);
            }
            return;
        }
        let n = VOICES;
        let mut slots = [Slot { active: false, down: false, held: false, note: 0., stamp: 0, level: 0. }; VOICES];
        for (slot, v) in slots.iter_mut().zip(self.voices.iter()) {
            *slot = Slot { active: v.active, down: v.down, held: v.held, note: v.note as f32, stamp: v.stamp, level: v.level };
        }
        let index = choose(&slots[..n], note as f32);
        if self.voices[index].active && self.voices[index].down && self.voices[index].note != note {
            self.steals += 1;
        }
        self.voices[index].glide = 0;
        self.init_voice(index, key, note, velocity);
    }

    /// Mono: re-pitch voice 0 to `note` with a glide, without restarting the envelopes.
    fn move_mono(&mut self, key: u32, note: i32) {
        let transpose = self.patch(id::TRANSPOSE).clamp(0, 48) - 24;
        let midi = (note + transpose).clamp(0, 127);
        let (old, mut fixed) = (self.voices[0].note, [false; 6]);
        for (op, f) in fixed.iter_mut().enumerate() {
            *f = self.p[op * 21 + 17] >= 0.5;
        }
        let mut base = [0i32; 6];
        for (op, b) in base.iter_mut().enumerate() {
            let o = op * 21;
            *b = osc_freq(midi, fixed[op], self.patch(o + 18), self.patch(o + 19), self.patch(o + 20));
        }
        let v = &mut self.voices[0];
        v.glide += (old - note) * ((1 << 24) / 12);
        v.base = base;
        v.key = key;
        v.note = note;
    }

    pub fn note_off(&mut self, key: u32) {
        let sr_mul = self.tables.sr_mul;
        if self.mono() {
            self.mono_keys.remove(key);
            if let Some((k, n)) = self.mono_keys.pick(1) {
                if self.voices[0].key != k && self.voices[0].down {
                    self.move_mono(k, n as i32);
                }
                return;
            }
        }
        let pedal = self.pedal;
        for v in self.voices.iter_mut().filter(|v| v.active && v.down && v.key == key) {
            if pedal {
                v.down = false;
                v.held = true;
            } else {
                Self::release(v, sr_mul);
            }
        }
    }

    fn release(v: &mut Voice, sr_mul: i64) {
        v.down = false;
        v.held = false;
        for e in v.env.iter_mut() {
            e.key_down(false, sr_mul);
        }
        v.pitch_env.key_up();
    }

    pub fn poly_pressure(&mut self, _key: u32, _value: f32) {}

    pub fn control(&mut self, which: u32, value: f32) {
        use crate::cs80::control::*;
        if !value.is_finite() {
            return;
        }
        let sr_mul = self.tables.sr_mul;
        match which {
            BEND => self.bend_to = value.clamp(-48., 48.),
            PRESSURE => self.pressure = value.clamp(0., 1.),
            MOD => self.wheel = value.clamp(0., 1.),
            EXPRESSION => self.expression = value.clamp(0., 1.),
            SUSTAIN => {
                self.pedal = value >= 0.5;
                if !self.pedal {
                    for v in self.voices.iter_mut().filter(|v| v.active && v.held) {
                        Self::release(v, sr_mul);
                    }
                }
            }
            _ => {}
        }
    }

    pub fn panic(&mut self) {
        for v in self.voices.iter_mut() {
            *v = Voice::ZERO;
        }
        self.mono_keys = KeyStack::EMPTY;
        self.blk = [0.; N];
        self.pos = N;
        self.pedal = false;
    }

    /// Renders the next 64-sample block of every voice into `blk`.
    fn block(&mut self) {
        if self.dirty {
            self.prepare();
        }
        let sr_rate = self.sr / N as f32;
        let fast = smoothing(0.006, sr_rate);
        self.bend += (self.bend_to - self.bend) * fast;
        self.wheel_s += (self.wheel - self.wheel_s) * fast;
        self.pressure_s += (self.pressure - self.pressure_s) * smoothing(0.02, sr_rate);
        self.expression_s += (self.expression - self.expression_s) * fast;
        self.lfo_val = self.lfo.sample(&self.tables);
        self.lfo_delay = self.lfo.delay();
        let t = &self.tables;
        let sr_mul = t.sr_mul;
        // LFO pitch depth: the voice's own PMD plus the mod wheel and pressure routes
        let ext = (bound(self.p[id::MOD_WHEEL], 0., 99.) * self.wheel_s + bound(self.p[id::PRESSURE], 0., 99.) * self.pressure_s) * 165. / 64.;
        let bend_q = (self.bend / 12. * (1 << 24) as f32) as i32;
        let tune_q = (bound(self.p[id::TUNE], -100., 100.) / 1200. * (1 << 24) as f32) as i32;
        let porta = bound(self.p[id::PORTAMENTO], 0., 99.);
        // portamento: the leftover pitch interval closes at a steady rate, one octave in up to ~3 s
        let glide_step = if porta > 0. { ((1 << 24) as f32 * N as f32 / (self.sr * (0.015 + 3. * (porta / 99.).powi(2)))) as i32 } else { i32::MAX };
        let amd = self.amd;
        let lfo_inv = ((1 << 24) - self.lfo_val) as f32 / (1 << 24) as f32;
        let gain = bound(self.p[id::VOLUME], 0., 1.);
        let master = gain * gain * self.expression_s * (0.7 / (1u64 << 27) as f32);
        let mut acc = [0f32; N];
        let mut buses = [[0i32; N]; 2];
        for v in self.voices.iter_mut().filter(|v| v.active) {
            let mut pitchmod = v.pitch_env.sample() + bend_q + tune_q + v.glide;
            v.glide = if v.glide > glide_step { v.glide - glide_step } else if v.glide < -glide_step { v.glide + glide_step } else { 0 };
            let depth = (v.pmd as f32 + ext).min(255.) as i64;
            let pmd = depth * self.lfo_delay as i64;
            let senslfo = v.pms as i64 * (self.lfo_val as i64 - (1 << 23));
            pitchmod += ((pmd * senslfo) >> 39) as i32;
            for op in 0..6 {
                v.ops[op].gain[0] = v.ops[op].gain[1];
                let mut level = v.env[op].sample(sr_mul);
                if v.ams[op] > 0. {
                    level -= (AMP_MOD_DOUBLINGS * amd * v.ams[op] * lfo_inv * (1 << 24) as f32) as i32;
                }
                let g = if v.on[op] { t.exp2(level - (14 << 24)) } else { 0 };
                v.ops[op].freq = t.freq(v.base[op] + pitchmod);
                v.ops[op].gain[1] = g;
            }
            let mut out = [0i32; N];
            run_core(t, &mut out, &mut v.ops, v.algorithm, &mut v.fb, v.fb_shift, &mut buses);
            for (a, &o) in acc.iter_mut().zip(out.iter()) {
                *a += o as f32 * master * v.onset.tick();
            }
            // the voice is finished once it is released and every carrier has faded out
            let alg = ALGORITHMS[v.algorithm];
            let mut loudest = 0;
            for op in 0..6 {
                if alg[op] & 3 == 0 {
                    loudest = loudest.max(v.ops[op].gain[1]);
                }
            }
            v.level = loudest as f32 / (1u64 << 25) as f32;
            if !v.down && !v.held && loudest < LEVEL_THRESH {
                v.active = false;
            }
        }
        self.blk = acc;
        self.pos = 0;
    }

    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let n = left.len();
        let mut at = 0;
        while at < n {
            if self.pos >= N {
                self.block();
            }
            let m = (N - self.pos).min(n - at);
            left[at..at + m].copy_from_slice(&self.blk[self.pos..self.pos + m]);
            at += m;
            self.pos += m;
        }
        right.copy_from_slice(left);
    }
}
