//! Bass-line machine in the style of the TB-303: one oscillator (saw or square) into a
//! four-pole resonant low-pass that loses bass as the resonance rises, a decaying filter
//! envelope, an accent circuit that builds over consecutive accented notes, and a 16-step
//! sequencer with note, tie, accent, slide and octave per step. Original code.
use crate::dsp::*;
use crate::seq::{Seq, MAX_PATTERNS, MAX_STEPS};

pub const PARAMS: usize = 16;
const TUNE: usize = 0;
const CUTOFF: usize = 1;
const RESONANCE: usize = 2;
const ENV_MOD: usize = 3;
const DECAY: usize = 4;
const ACCENT: usize = 5;
const WAVE: usize = 6;
const VOLUME: usize = 7;
const DRIVE: usize = 8;
const SLIDE: usize = 9;
const TEMPO: usize = 10;
const SWING: usize = 11;

pub const REST: u8 = 0;
pub const NOTE: u8 = 1;
pub const TIE: u8 = 2;
pub const F_ACCENT: u8 = 1;
pub const F_SLIDE: u8 = 2;
pub const F_UP: u8 = 4;
pub const F_DOWN: u8 = 8;

#[derive(Clone, Copy)]
struct Step {
    kind: u8,
    note: u8,
    flags: u8,
}

pub struct Tb303 {
    sr: f32,
    pub seq: Seq,
    pat: [[Step; MAX_STEPS]; MAX_PATTERNS],
    p: [f32; PARAMS],
    ladder: Ladder,
    phase: f32,
    cur: f32,
    target: f32,
    gate: bool,
    gate_left: f64,
    amp: f32,
    /// The amplifier's own slow decay (about 1.2 s) while a note is held.
    vca: f32,
    fenv: f32,
    acc_cv: f32,
    accented: bool,
    slide_next: bool,
    live_key: Option<u32>,
    dc: DcBlock,
    pub steals: u32,
}

impl Tb303 {
    pub const fn new() -> Self {
        Self {
            sr: 48000.,
            seq: Seq::new(),
            pat: [[Step { kind: REST, note: 0, flags: 0 }; MAX_STEPS]; MAX_PATTERNS],
            p: [0.; PARAMS],
            ladder: Ladder::ZERO,
            phase: 0.,
            cur: 36.,
            target: 36.,
            gate: false,
            gate_left: -1.,
            amp: 0.,
            vca: 1.,
            fenv: 0.,
            acc_cv: 0.,
            accented: false,
            slide_next: false,
            live_key: None,
            dc: DcBlock::ZERO,
            steals: 0,
        }
    }
    pub fn init(&mut self, sr: f32) {
        *self = Self::new();
        self.sr = sr;
        self.seq.init(sr);
        self.p = [0., 600., 0.5, 0.6, 0.45, 0.5, 0., 0.7, 0.2, 0.012, 120., 0.5, 0., 0., 0., 0.];
        self.seq.bpm = 120.;
    }
    pub fn set(&mut self, i: usize, value: f32) {
        if i >= PARAMS {
            return;
        }
        let v = bound(value, -1000., 100000.);
        self.p[i] = v;
        match i {
            TEMPO => self.seq.bpm = v.clamp(30., 300.),
            SWING => self.seq.swing = v.clamp(0.5, 0.75),
            _ => {}
        }
    }
    pub fn active(&self) -> u32 {
        (self.gate || self.amp > 1e-3) as u32
    }
    fn begin(&mut self, note: f32, accent: bool, slide: bool, hold: Option<f64>) {
        let legato = slide && self.gate;
        self.target = note;
        if !legato {
            self.cur = note;
            self.fenv = 1.;
            self.vca = 1.;
            self.accented = accent;
            // consecutive accents charge the accent capacitor; plain notes let it leak
            self.acc_cv += if accent { (1. - self.acc_cv) * 0.5 } else { -self.acc_cv * 0.45 };
        } else if accent {
            self.accented = true;
            self.acc_cv += (1. - self.acc_cv) * 0.5;
        }
        self.gate = true;
        self.gate_left = hold.unwrap_or(-1.);
    }
    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) {
        let held = self.live_key.is_some();
        self.live_key = Some(key);
        self.begin(note, velocity > 0.85, held, None);
    }
    pub fn note_off(&mut self, key: u32) {
        if self.live_key == Some(key) {
            self.live_key = None;
            self.gate = false;
        }
    }
    pub fn poly_pressure(&mut self, _key: u32, _value: f32) {}
    pub fn control(&mut self, _which: u32, _value: f32) {}
    pub fn panic(&mut self) {
        self.gate = false;
        self.amp = 0.;
        self.fenv = 0.;
        self.live_key = None;
        self.seq.stop();
    }
    /// 1 sets a step (a = pattern * 16 + step, b = kind + 4 * note + 256 * flags), 7 clears a pattern.
    pub fn command(&mut self, cmd: u32, a: u32, b: f32) {
        if self.seq.command(cmd, a, b) {
            return;
        }
        match cmd {
            1 => {
                let (p, s) = ((a / 16) as usize, (a % 16) as usize);
                let code = b.max(0.) as u32;
                if p < MAX_PATTERNS {
                    self.pat[p][s] = Step { kind: ((code & 3) as u8).min(TIE), note: ((code >> 2) & 63).min(48) as u8, flags: (code >> 8) as u8 & 15 };
                }
            }
            7 => {
                if (a as usize) < MAX_PATTERNS {
                    self.pat[a as usize] = [Step { kind: REST, note: 0, flags: 0 }; MAX_STEPS];
                }
            }
            _ => {}
        }
    }
    fn fire(&mut self) {
        let (p, s) = self.seq.fire();
        let st = self.pat[p][s];
        let slid = self.slide_next;
        let step = self.seq.step_frames();
        match st.kind {
            NOTE | TIE if st.kind == NOTE || self.gate => {
                // a slide or a following tie keeps the gate open into the next step
                let next = self.pat[p][(s + 1) % self.seq.len_of(p)];
                let hold = if st.flags & F_SLIDE != 0 || next.kind == TIE { None } else { Some(step * 0.6) };
                if st.kind == NOTE {
                    let octave = if st.flags & F_UP != 0 { 12. } else if st.flags & F_DOWN != 0 { -12. } else { 0. };
                    self.begin(36. + st.note as f32 + octave, st.flags & F_ACCENT != 0, slid, hold);
                } else {
                    self.gate_left = hold.unwrap_or(-1.);
                }
                self.slide_next = st.flags & F_SLIDE != 0;
            }
            _ => {
                if self.live_key.is_none() {
                    self.gate = false;
                }
                self.slide_next = false;
            }
        }
    }
    fn mix(&mut self, left: &mut [f32], right: &mut [f32], from: usize, to: usize) {
        let sr = self.sr;
        let p = self.p;
        let glide = smoothing(p[SLIDE].max(0.002), sr);
        let vca_k = (-1. / (1.23 * sr)).exp();
        let attack = smoothing(0.003, sr);
        let release = smoothing(0.012, sr);
        let accent = p[ACCENT];
        let k_res = 3.85 * p[RESONANCE].clamp(0., 1.);
        for n in from..to {
            if self.gate_left > 0. {
                self.gate_left -= 1.;
                if self.gate_left <= 0. {
                    self.gate = false;
                    self.gate_left = -1.;
                }
            }
            self.cur += (self.target - self.cur) * glide;
            let hz = note_hz(self.cur + p[TUNE] / 100. * 1.0);
            let dt = hz / sr;
            self.phase += dt;
            if self.phase >= 1. {
                self.phase -= 1.;
            }
            let osc = if p[WAVE] >= 0.5 { pulse(self.phase, dt, 0.5) * 0.9 } else { -saw(self.phase, dt) };
            // filter envelope: decays at the Decay knob, or fast on accented notes
            let decay = if self.accented { 0.2 } else { p[DECAY].max(0.03) };
            self.fenv *= (-1. / (decay * sr)).exp();
            let boost = 1. + 0.9 * self.acc_cv * accent;
            let fc = (p[CUTOFF] * exp2(p[ENV_MOD] * 4.8 * self.fenv * boost)).clamp(30., 0.45 * sr);
            let y = self.ladder.tick(osc * 1.5, warp(fc, sr), k_res);
            let target = if self.gate { 1. } else { 0. };
            self.amp += (target - self.amp) * if self.gate { attack } else { release };
            let level = p[VOLUME] * p[VOLUME] * (1. + 0.9 * self.acc_cv * accent);
            let drive = 1. + p[DRIVE] * 6.;
            self.vca *= vca_k;
            let out = soft(y * self.amp * self.vca * level * drive) / (1. + p[DRIVE] * 1.2);
            let out = self.dc.tick(out, 1. - 40. / sr);
            left[n] = out;
            right[n] = out;
        }
    }
    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let n = left.len();
        let mut pos = 0;
        loop {
            let due = self.seq.due();
            let end = due.min(n).max(pos);
            self.mix(left, right, pos, end);
            pos = end;
            if due >= n {
                break;
            }
            self.fire();
        }
        self.seq.end_block(n);
    }
}
