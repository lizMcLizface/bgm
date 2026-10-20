//! A Prophet-5-inspired polysynth (Rev 3/Rev 4 panel). Per voice: Osc A (saw,
//! pulse; hard-synced to B) and Osc B (saw, triangle, pulse; low-frequency mode,
//! keyboard tracking off) → mixer with noise → resonant 4-pole low-pass → VCA,
//! with a filter ADSR and an amplifier ADSR. Poly-Mod sends the filter envelope
//! and Osc B (at audio rate) to Osc A's frequency and pulse width and to the
//! cutoff. Wheel-mod mixes the LFO (saw, triangle, square in any combination)
//! with noise, scaled by the initial amount plus the mod wheel. Unison stacks the
//! voices on one note (or on a stored chord) with key priority. The voice path
//! runs at twice the sample rate when sync or audio-rate Poly-Mod is on.
//! An original interpretation, not a circuit model; units for cutoff, envelope
//! and LFO times are estimates to be tuned by ear.
use crate::alloc::{choose, KeyStack, Slot};
use crate::dsp::*;

pub const VOICES: usize = 16;
pub const PARAMS: usize = 72;
const TICK: usize = 16;
const CHORD_NOTES: usize = 10;

pub mod id {
    pub const A_FREQ: usize = 0;
    pub const A_SAW: usize = 1;
    pub const A_PULSE: usize = 2;
    pub const A_PW: usize = 3;
    pub const SYNC: usize = 4;
    pub const B_FREQ: usize = 5;
    pub const B_FINE: usize = 6;
    pub const B_SAW: usize = 7;
    pub const B_TRI: usize = 8;
    pub const B_PULSE: usize = 9;
    pub const B_PW: usize = 10;
    pub const B_LOW: usize = 11;
    pub const B_KYBD: usize = 12;
    pub const GLIDE: usize = 13;
    pub const MIX_A: usize = 14;
    pub const MIX_B: usize = 15;
    pub const MIX_NOISE: usize = 16;
    pub const CUTOFF: usize = 17;
    pub const RES: usize = 18;
    pub const TRACK: usize = 19;
    pub const FILTER_REV: usize = 20;
    pub const F_ENV: usize = 21;
    pub const F_ATTACK: usize = 22;
    pub const F_DECAY: usize = 23;
    pub const F_SUSTAIN: usize = 24;
    pub const F_RELEASE: usize = 25;
    pub const A_ATTACK: usize = 26;
    pub const A_DECAY: usize = 27;
    pub const A_SUSTAIN: usize = 28;
    pub const A_RELEASE: usize = 29;
    pub const RELEASE: usize = 30;
    pub const PM_ENV: usize = 31;
    pub const PM_OSC_B: usize = 32;
    pub const PM_FREQ_A: usize = 33;
    pub const PM_PW_A: usize = 34;
    pub const PM_FILTER: usize = 35;
    pub const LFO_RATE: usize = 36;
    pub const LFO_AMOUNT: usize = 37;
    pub const LFO_SAW: usize = 38;
    pub const LFO_TRI: usize = 39;
    pub const LFO_SQUARE: usize = 40;
    pub const WHEEL_MIX: usize = 41;
    pub const WM_FREQ_A: usize = 42;
    pub const WM_FREQ_B: usize = 43;
    pub const WM_PW_A: usize = 44;
    pub const WM_PW_B: usize = 45;
    pub const WM_FILTER: usize = 46;
    pub const VINTAGE: usize = 47;
    pub const VEL_FILTER: usize = 48;
    pub const VEL_AMP: usize = 49;
    pub const AFTER_FILTER: usize = 50;
    pub const AFTER_AMP: usize = 51;
    pub const UNISON: usize = 52;
    pub const UNISON_VOICES: usize = 53;
    pub const UNISON_DETUNE: usize = 54;
    pub const PRIORITY: usize = 55;
    pub const BEND_RANGE: usize = 56;
    pub const VOLUME: usize = 57;
    pub const VOICES: usize = 58;
    pub const WIDTH: usize = 59;
    pub const OVERSAMPLE: usize = 60;
    pub const CHORD: usize = 61;
    /// Ten chord-memory notes from here: semitones above the key, negative = empty.
    pub const CHORD_NOTE: usize = 62;
}

const DEFAULTS: [(usize, f32); 34] = [
    (id::A_SAW, 1.), (id::A_PW, 0.5), (id::B_FINE, 7.), (id::B_SAW, 1.), (id::B_PW, 0.5), (id::B_KYBD, 1.),
    (id::MIX_A, 1.), (id::MIX_B, 0.8), (id::CUTOFF, 750.), (id::RES, 0.1), (id::TRACK, 1.), (id::FILTER_REV, 1.),
    (id::F_ENV, 0.35), (id::F_ATTACK, 0.005), (id::F_DECAY, 0.6), (id::F_SUSTAIN, 0.4), (id::F_RELEASE, 0.4),
    (id::A_ATTACK, 0.003), (id::A_DECAY, 0.8), (id::A_SUSTAIN, 0.9), (id::A_RELEASE, 0.35), (id::RELEASE, 1.),
    (id::LFO_RATE, 5.), (id::LFO_TRI, 1.), (id::VINTAGE, 0.25), (id::VEL_FILTER, 0.4), (id::VEL_AMP, 0.5),
    (id::UNISON_VOICES, 5.), (id::UNISON_DETUNE, 0.3), (id::PRIORITY, 1.), (id::BEND_RANGE, 2.), (id::VOLUME, 0.55),
    (id::VOICES, 5.), (id::WIDTH, 0.3),
];

/// Osc B in low-frequency mode: panel step (0–127, 2 per semitone) → Hz, measured
/// on a Rev 4 to step 90 and extrapolated above (Funkybot, 2026).
const LOW_HZ: [(f32, f32); 26] = [
    (0., 0.531), (10., 0.636), (14., 0.718), (22., 0.81), (24., 0.859), (30., 0.968), (36., 1.154), (42., 1.297),
    (48., 1.469), (52., 1.858), (54., 2.074), (58., 2.623), (60., 2.97), (62., 3.323), (66., 4.223), (72., 6.031),
    (78., 8.443), (80., 9.258), (82., 10.937), (84., 12.159), (90., 16.857), (96., 23.745), (102., 33.448),
    (108., 47.116), (114., 66.37), (120., 93.49),
];
fn low_hz(semitones: f32) -> f32 {
    let x = 2. * (semitones + 24.);
    let mut prev = LOW_HZ[0];
    if x <= prev.0 {
        return prev.1;
    }
    for &next in LOW_HZ.iter().skip(1) {
        if x <= next.0 {
            let f = (x - prev.0) / (next.0 - prev.0);
            return exp2(log2(prev.1) + f * (log2(next.1) - log2(prev.1)));
        }
        prev = next;
    }
    // past the table: keep the last segment's slope
    let (a, b) = (LOW_HZ[24], LOW_HZ[25]);
    exp2(log2(b.1) + (x - b.0) * (log2(b.1) - log2(a.1)) / (b.0 - a.0))
}

/// Resonance 0–1 → ladder feedback. The filter sings from about 0.87 up: the factory
/// set's "resonance" sounds (no oscillator, resonance at 120/127) rely on it. An estimate.
fn feedback(resonance: f32) -> f32 {
    4.6 * bound(resonance, 0., 1.)
}

/// What the per-sample loop needs, prepared when parameters change.
#[derive(Clone, Copy)]
struct Setup {
    os: usize,
    srv: f32,
    wa: Waves,
    wb: Waves,
    sync: bool,
    mix_a: f32,
    mix_b: f32,
    mix_n: f32,
    drive: f32,
    /// audio-rate Poly-Mod from Osc B: octaves of Osc A, pulse width, octaves of cutoff
    pm_freq: f32,
    pm_pw: f32,
    pm_cut: f32,
    f_attack: f32,
    f_decay: f32,
    f_sustain: f32,
    f_release: f32,
    a_attack: f32,
    a_decay: f32,
    a_sustain: f32,
    a_release: f32,
}
impl Setup {
    const ZERO: Self = Self {
        os: 1, srv: 48000., wa: Waves::NONE, wb: Waves::NONE, sync: false, mix_a: 0., mix_b: 0., mix_n: 0., drive: 0.5,
        pm_freq: 0., pm_pw: 0., pm_cut: 0., f_attack: 1., f_decay: 1., f_sustain: 0., f_release: 1., a_attack: 1.,
        a_decay: 1., a_sustain: 0., a_release: 1.,
    };
}

#[derive(Clone, Copy)]
struct Voice {
    onset: Onset,
    key: u32,
    note: f32,
    pitch: f32,
    velocity: f32,
    poly: f32,
    pressure: f32,
    down: bool,
    held: bool,
    active: bool,
    fresh: bool,
    stamp: u32,
    /// unison position −1…1 (0 in poly mode)
    offset: f32,
    rng: Rng,
    a: VcOsc,
    b: VcOsc,
    fenv: Adsr,
    aenv: Adsr,
    ladder: Ladder,
    dta: f32,
    dta_d: f32,
    dtb: f32,
    dtb_d: f32,
    pwa: f32,
    pwa_d: f32,
    pwb: f32,
    pwb_d: f32,
    cut: f32,
    cut_d: f32,
    g: f32,
    g_d: f32,
    gain: f32,
    gain_d: f32,
    k: f32,
    pan: (f32, f32),
    // vintage: fixed tolerances and a slow wander per voice
    tune_a: f32,
    tune_b: f32,
    trim: f32,
    time: f32,
    wander_a: Lfo,
    wander_b: Lfo,
    spread: f32,
}
impl Voice {
    const ZERO: Self = Self {
        onset: Onset::DONE,
        key: 0, note: 60., pitch: 60., velocity: 0., poly: 0., pressure: 0., down: false, held: false, active: false,
        fresh: true, stamp: 0, offset: 0., rng: Rng(1), a: VcOsc::ZERO, b: VcOsc::ZERO, fenv: Adsr::ZERO, aenv: Adsr::ZERO,
        ladder: Ladder::ZERO, dta: 0., dta_d: 0., dtb: 0., dtb_d: 0., pwa: 0.5, pwa_d: 0., pwb: 0.5, pwb_d: 0., cut: 10.,
        cut_d: 0., g: 0., g_d: 0., gain: 0., gain_d: 0., k: 0., pan: (1., 1.), tune_a: 0., tune_b: 0., trim: 0., time: 1.,
        wander_a: Lfo::new(1), wander_b: Lfo::new(2), spread: 0.,
    };
}

pub struct Prophet {
    sr: f32,
    pub p: [f32; PARAMS],
    dirty: bool,
    setup: Setup,
    voices: [Voice; VOICES],
    stamp: u32,
    until: usize,
    lfo: Lfo,
    noise: Rng,
    unison: bool,
    stack: KeyStack,
    playing: Option<(u32, f32)>,
    dec: [HalfBand; 2],
    bend_to: f32,
    bend: f32,
    pressure: f32,
    modulation: f32,
    modulation_s: f32,
    expression: f32,
    expression_s: f32,
    brightness: f32,
    soft: f32,
    pedal: bool,
    pub steals: u32,
}

impl Prophet {
    pub const fn new() -> Self {
        Self {
            sr: 48000., p: [0.; PARAMS], dirty: true, setup: Setup::ZERO, voices: [Voice::ZERO; VOICES], stamp: 0, until: 0,
            lfo: Lfo::new(0x3c6e_f372), noise: Rng(0x1b87_3593), unison: false, stack: KeyStack::EMPTY, playing: None,
            dec: [HalfBand::ZERO; 2], bend_to: 0., bend: 0., pressure: 0., modulation: 0., modulation_s: 0., expression: 1.,
            expression_s: 1., brightness: 0., soft: 0., pedal: false, steals: 0,
        }
    }

    pub fn init(&mut self, sr: f32) {
        *self = Self::new();
        self.sr = sr;
        for &(i, v) in DEFAULTS.iter() {
            self.p[i] = v;
        }
        for n in 0..CHORD_NOTES {
            self.p[id::CHORD_NOTE + n] = -1.;
        }
        let mut rng = Rng(0x2545_f491);
        for (n, v) in self.voices.iter_mut().enumerate() {
            let seed = (n as u32 + 1).wrapping_mul(0x9e37_79b9);
            v.rng = Rng(0x68e3_1da4 ^ seed);
            v.tune_a = rng.next();
            v.tune_b = rng.next();
            v.trim = rng.next();
            v.time = rng.next();
            v.wander_a = Lfo::new(0x0b4b_9f71 ^ seed);
            v.wander_b = Lfo::new(0x5f35_6495 ^ seed);
            v.spread = ((n as f32 * 0.618_034) % 1.) * 2. - 1.;
            v.a.phase = 0.5 + 0.5 * rng.next();
            v.b.phase = 0.5 + 0.5 * rng.next();
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

    fn poly_count(&self) -> usize {
        (self.p[id::VOICES].round() as usize).clamp(1, VOICES)
    }

    fn start(v: &mut Voice, key: u32, note: f32, velocity: f32, offset: f32, retrigger: bool, ringing: bool) {
        if !v.active {
            v.fresh = true;
            v.pressure = 0.;
            v.ladder = Ladder::ZERO;
            if ringing {
                v.ladder.ring();
            }
            v.pitch = note;
        }
        v.key = key;
        v.note = note;
        v.velocity = velocity;
        v.offset = offset;
        v.poly = 0.;
        v.down = true;
        v.held = false;
        if retrigger || !v.active {
            v.fenv.attack();
            v.aenv.attack();
        }
        if !v.active {
            v.onset.arm();
        }
        v.active = true;
    }

    fn release(v: &mut Voice) {
        v.down = false;
        v.held = false;
        v.fenv.release();
        v.aenv.release();
    }

    /// Unison: move every stacked voice to `key`/`note` (one per chord note when chord memory is on).
    fn unison_play(&mut self, key: u32, note: f32, velocity: f32, retrigger: bool) {
        let n = (self.p[id::UNISON_VOICES].round() as usize).clamp(1, self.poly_count());
        let mut chord = [0f32; CHORD_NOTES];
        let mut notes = 0;
        if self.p[id::CHORD] >= 0.5 {
            for i in 0..CHORD_NOTES {
                let c = self.p[id::CHORD_NOTE + i];
                if c >= 0. {
                    chord[notes] = c.round().min(60.);
                    notes += 1;
                }
            }
        }
        let ringing = feedback(self.p[id::RES]) >= 3.95;
        self.stamp = self.stamp.wrapping_add(1);
        // chord memory: one voice per stored note
        let count = if notes > 0 { notes.min(self.poly_count()) } else { n };
        for i in 0..count {
            let offset = if count > 1 { 2. * i as f32 / (count - 1) as f32 - 1. } else { 0. };
            let shift = if notes > 0 { chord[i] } else { 0. };
            let v = &mut self.voices[i];
            v.stamp = self.stamp;
            Self::start(v, key, (note + shift).min(127.), velocity, if notes > 0 { 0. } else { offset }, retrigger, ringing);
        }
        for v in self.voices[count..].iter_mut().filter(|v| v.down || v.held) {
            Self::release(v);
        }
        self.playing = Some((key, note));
    }

    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) {
        if !note.is_finite() {
            return;
        }
        if self.dirty {
            self.prepare();
        }
        let note = note.clamp(0., 127.);
        let velocity = bound(velocity, 0., 1.);
        if self.unison {
            let priority = bound(self.p[id::PRIORITY], 0., 5.).round() as u32;
            let first = self.stack.len == 0;
            self.stack.push(key, note);
            let pick = self.stack.pick(priority);
            if let Some((k, n)) = pick {
                if first || self.playing.map(|p| p.0) != Some(k) || self.voices[0].held {
                    let retrigger = first || matches!(priority, 2 | 3 | 5) || !self.voices[0].down;
                    self.unison_play(k, n, velocity, retrigger);
                }
            }
            return;
        }
        let n = self.poly_count();
        let mut slots = [Slot { active: false, down: false, held: false, note: 0., stamp: 0, level: 0. }; VOICES];
        for (slot, v) in slots.iter_mut().zip(self.voices.iter()) {
            *slot = Slot { active: v.active, down: v.down, held: v.held, note: v.note, stamp: v.stamp, level: v.aenv.value };
        }
        let index = choose(&slots[..n], note);
        if self.voices[index].active && self.voices[index].down && self.voices[index].note != note {
            self.steals += 1;
        }
        let ringing = feedback(self.p[id::RES]) >= 3.95;
        self.stamp = self.stamp.wrapping_add(1);
        let v = &mut self.voices[index];
        v.stamp = self.stamp;
        Self::start(v, key, note, velocity, 0., true, ringing);
    }

    pub fn note_off(&mut self, key: u32) {
        let pedal = self.pedal;
        if self.unison {
            self.stack.remove(key);
            let priority = bound(self.p[id::PRIORITY], 0., 5.).round() as u32;
            match self.stack.pick(priority) {
                Some((k, n)) if self.playing.map(|p| p.0) != Some(k) => {
                    let velocity = self.voices[0].velocity;
                    self.unison_play(k, n, velocity, matches!(priority, 2 | 3 | 5));
                }
                Some(_) => {}
                None => {
                    for v in self.voices.iter_mut().filter(|v| v.active && v.down) {
                        if pedal {
                            v.down = false;
                            v.held = true;
                        } else {
                            Self::release(v);
                        }
                    }
                    self.playing = None;
                }
            }
            return;
        }
        for v in self.voices.iter_mut().filter(|v| v.active && v.down && v.key == key) {
            if pedal {
                v.down = false;
                v.held = true;
            } else {
                Self::release(v);
            }
        }
    }

    pub fn poly_pressure(&mut self, key: u32, value: f32) {
        for v in self.voices.iter_mut().filter(|v| v.active && v.key == key) {
            v.poly = bound(value, 0., 1.);
        }
    }

    pub fn control(&mut self, which: u32, value: f32) {
        use crate::cs80::control::*;
        if !value.is_finite() {
            return;
        }
        match which {
            BEND => self.bend_to = value.clamp(-48., 48.),
            PRESSURE => self.pressure = value.clamp(0., 1.),
            MOD => self.modulation = value.clamp(0., 1.),
            EXPRESSION => self.expression = value.clamp(0., 1.),
            BRIGHTNESS => self.brightness = value.clamp(-1., 1.),
            SOFT => self.soft = value.clamp(0., 1.),
            SUSTAIN => {
                self.pedal = value >= 0.5;
                if !self.pedal {
                    for v in self.voices.iter_mut().filter(|v| v.active && v.held) {
                        Self::release(v);
                    }
                }
            }
            _ => {}
        }
    }

    pub fn panic(&mut self) {
        for v in self.voices.iter_mut() {
            v.active = false;
            v.down = false;
            v.held = false;
            v.fenv = Adsr::ZERO;
            v.aenv = Adsr::ZERO;
            v.ladder = Ladder::ZERO;
        }
        self.stack = KeyStack::EMPTY;
        self.playing = None;
        self.dec = [HalfBand::ZERO; 2];
        self.pedal = false;
    }

    fn prepare(&mut self) {
        let p = &self.p;
        let on = |i: usize| if p[i] >= 0.5 { 1. } else { 0. };
        let sync = p[id::SYNC] >= 0.5;
        let pm_b = bound(p[id::PM_OSC_B], 0., 1.);
        let audio_pm = pm_b > 0. && (p[id::PM_FREQ_A] >= 0.5 || p[id::PM_PW_A] >= 0.5 || p[id::PM_FILTER] >= 0.5);
        let os = match bound(p[id::OVERSAMPLE], 0., 2.).round() as u32 {
            0 => 1,
            2 => 2,
            _ => if sync || audio_pm { 2 } else { 1 },
        };
        if os != self.setup.os {
            self.dec = [HalfBand::ZERO; 2];
        }
        let srv = self.sr * os as f32;
        let release = p[id::RELEASE] >= 0.5;
        let fall = |i: usize| fall_coefficient(bound(p[i], 0.001, 120.), srv);
        let short = fall_coefficient(0.015, srv);
        let rev3 = p[id::FILTER_REV] >= 0.5;
        self.setup = Setup {
            os,
            srv,
            wa: Waves { saw: on(id::A_SAW), pulse: on(id::A_PULSE), tri: 0., sine: 0. },
            wb: Waves { saw: on(id::B_SAW), pulse: on(id::B_PULSE), tri: 0.5 * on(id::B_TRI), sine: 0. },
            sync,
            mix_a: bound(p[id::MIX_A], 0., 1.),
            mix_b: bound(p[id::MIX_B], 0., 1.),
            mix_n: bound(p[id::MIX_NOISE], 0., 1.),
            // the Rev 1/2 filter is driven a little harder
            drive: if rev3 { 0.5 } else { 0.62 },
            pm_freq: if p[id::PM_FREQ_A] >= 0.5 { 4. * pm_b * pm_b } else { 0. },
            pm_pw: if p[id::PM_PW_A] >= 0.5 { 0.45 * pm_b } else { 0. },
            pm_cut: if p[id::PM_FILTER] >= 0.5 { 4. * pm_b } else { 0. },
            f_attack: attack_coefficient(bound(p[id::F_ATTACK], 0.0005, 30.), srv),
            f_decay: fall(id::F_DECAY),
            f_sustain: bound(p[id::F_SUSTAIN], 0., 1.),
            f_release: if release { fall(id::F_RELEASE) } else { short },
            a_attack: attack_coefficient(bound(p[id::A_ATTACK], 0.0005, 30.), srv),
            a_decay: fall(id::A_DECAY),
            a_sustain: bound(p[id::A_SUSTAIN], 0., 1.),
            a_release: if release { fall(id::A_RELEASE) } else { short },
        };
        let unison = p[id::UNISON] >= 0.5;
        if unison != self.unison {
            self.unison = unison;
            for v in self.voices.iter_mut().filter(|v| v.down || v.held) {
                Self::release(v);
            }
            self.stack = KeyStack::EMPTY;
            self.playing = None;
        }
        self.dirty = false;
    }

    fn tick(&mut self) {
        if self.dirty {
            self.prepare();
        }
        let s = self.setup;
        let sr = self.sr;
        let srv = s.srv;
        let ts = TICK as f32 / sr;
        let rate = sr / TICK as f32;
        let p = self.p;
        let fast = smoothing(0.006, rate);
        self.bend += (self.bend_to - self.bend) * fast;
        self.expression_s += (self.expression - self.expression_s) * fast;
        self.modulation_s += (self.modulation - self.modulation_s) * fast;
        // wheel-mod: the LFO's selected shapes averaged, crossfaded with noise
        self.lfo.step(bound(p[id::LFO_RATE], 0.01, 50.) * ts, LFO_SAW_UP);
        let t = self.lfo.phase;
        let shapes = [(id::LFO_SAW, 2. * t - 1.), (id::LFO_TRI, 1. - 4. * (t - 0.5).abs()), (id::LFO_SQUARE, if t < 0.5 { 1. } else { -1. })];
        let (mut lfo, mut count) = (0., 0.);
        for (i, x) in shapes {
            if p[i] >= 0.5 {
                lfo += x;
                count += 1.;
            }
        }
        if count > 1. {
            lfo /= count;
        }
        let mix = bound(p[id::WHEEL_MIX], 0., 1.);
        let amount = (bound(p[id::LFO_AMOUNT], 0., 1.) + self.modulation_s).min(1.);
        let wheel = ((1. - mix) * lfo + mix * self.noise.next()) * amount;
        let on = |i: usize| p[i] >= 0.5;
        // depths are estimates: vibrato needs fine control, so pitch goes as the square
        let wm_pitch = 12. * wheel.abs() * wheel;
        let wm_a = if on(id::WM_FREQ_A) { wm_pitch } else { 0. };
        let wm_b = if on(id::WM_FREQ_B) { wm_pitch } else { 0. };
        let wm_pwa = if on(id::WM_PW_A) { 0.45 * wheel } else { 0. };
        let wm_pwb = if on(id::WM_PW_B) { 0.45 * wheel } else { 0. };
        let wm_cut = if on(id::WM_FILTER) { 4. * wheel } else { 0. };
        let pm_env = bound(p[id::PM_ENV], 0., 1.);
        let pm_env_freq = if on(id::PM_FREQ_A) { 60. * pm_env } else { 0. };
        let pm_env_pw = if on(id::PM_PW_A) { 0.45 * pm_env } else { 0. };
        let pm_env_cut = if on(id::PM_FILTER) { 6. * pm_env } else { 0. };
        // the host sends the bend in semitones, already scaled by its wheel range setting
        let bend = self.bend;
        let a_freq = bound(p[id::A_FREQ], -24., 24.);
        let b_freq = bound(p[id::B_FREQ], -24., 36.);
        let b_tune = b_freq.min(24.) + bound(p[id::B_FINE], 0., 110.) / 100.;
        let b_low = on(id::B_LOW).then(|| low_hz(b_freq));
        let b_kybd = on(id::B_KYBD);
        let pwa = 0.5 + 0.96 * (bound(p[id::A_PW], 0., 1.) - 0.5);
        let pwb = 0.5 + 0.96 * (bound(p[id::B_PW], 0., 1.) - 0.5);
        let glide = bound(p[id::GLIDE], 0., 10.);
        // the glide circuit slews at a constant rate (Rev 3 manual: at most 5 s for 5 octaves): `glide` is the
        // time in seconds to cover five octaves, so the step per control tick is 60 semitones / glide * ts
        let glide_step = if glide > 0. { 60. * ts / glide } else { f32::INFINITY };
        let detune = 0.25 * bound(p[id::UNISON_DETUNE], 0., 1.);
        let vintage = bound(p[id::VINTAGE], 0., 1.);
        let track = [0., 0.5, 1.][bound(p[id::TRACK], 0., 2.).round() as usize];
        let base = log2(bound(p[id::CUTOFF], 10., 30000.)) + wm_cut + 1.5 * self.brightness - self.soft;
        let env_oct = 10. * bound(p[id::F_ENV], 0., 1.);
        let (vel_f, vel_a) = (bound(p[id::VEL_FILTER], 0., 1.), bound(p[id::VEL_AMP], 0., 1.));
        let (after_f, after_a) = (bound(p[id::AFTER_FILTER], 0., 1.), bound(p[id::AFTER_AMP], 0., 1.));
        let k = feedback(p[id::RES]) * if p[id::FILTER_REV] >= 0.5 { 1. } else { 1.03 };
        let stereo = bound(p[id::WIDTH], 0., 1.);
        let volume = bound(p[id::VOLUME], 0., 1.);
        let master = volume * volume * self.expression_s * (1. - 0.35 * self.soft) * 0.5 * (1. + 0.3 * k);
        let press_k = smoothing(0.025, rate);
        let channel_pressure = self.pressure;
        let inv = 1. / (TICK * s.os) as f32;
        let wander_rate = 0.25 * ts;
        for v in self.voices.iter_mut().filter(|v| v.active) {
            v.pressure += (v.poly.max(channel_pressure) - v.pressure) * press_k;
            v.pitch += (v.note - v.pitch).clamp(-glide_step, glide_step);
            let drift_a = vintage * (0.08 * v.tune_a + 0.06 * v.wander_a.step(wander_rate, LFO_DRIFT));
            let drift_b = vintage * (0.08 * v.tune_b + 0.06 * v.wander_b.step(wander_rate * 1.3, LFO_DRIFT));
            let fe = v.fenv.value;
            let pitch = v.pitch + bend + detune * v.offset;
            let dta = note_hz(pitch + a_freq + wm_a + pm_env_freq * fe + drift_a) / srv;
            let b_note = if b_kybd { pitch } else { 60. };
            let dtb = match b_low {
                Some(hz) => hz * if b_kybd { exp2((pitch - 60.) / 12.) } else { 1. } / srv,
                None => note_hz(b_note + b_tune + wm_b + drift_b) / srv,
            };
            let dta = dta.min(0.45);
            let dtb = dtb.min(0.45);
            let pa = (pwa + wm_pwa + pm_env_pw * fe).clamp(0.02, 0.98);
            let pb = (pwb + wm_pwb).clamp(0.02, 0.98);
            let velocity_env = 1. - vel_f * (1. - v.velocity);
            // keyboard tracking counts up from the lowest key (C2 on the 5-octave keyboard), as the CV does
            let cut = base + track * (v.pitch - 36.) / 12. + (env_oct * velocity_env + pm_env_cut) * fe
                + after_f * 3. * v.pressure + 0.3 * vintage * v.trim;
            let hz = exp2(cut);
            let g = warp(hz, srv);
            let gain = master * (1. - vel_a * (1. - v.velocity)) * (1. - 0.5 * after_a + 0.5 * after_a * v.pressure) * (1. + 0.08 * vintage * v.trim);
            v.pan = pan(stereo * v.spread);
            v.k = k * (1. - ((hz - 0.3 * sr) / (0.15 * sr)).clamp(0., 1.));
            if v.fresh {
                v.fresh = false;
                v.dta = dta;
                v.dtb = dtb;
                v.pwa = pa;
                v.pwb = pb;
                v.cut = cut;
                v.g = g;
                v.gain = gain;
            }
            v.dta_d = (dta - v.dta) * inv;
            v.dtb_d = (dtb - v.dtb) * inv;
            v.pwa_d = (pa - v.pwa) * inv;
            v.pwb_d = (pb - v.pwb) * inv;
            v.cut_d = (cut - v.cut) * inv;
            v.g_d = (g - v.g) * inv;
            v.gain_d = (gain - v.gain) * inv;
        }
    }

    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let n = left.len();
        left.fill(0.);
        right.fill(0.);
        let vintage = bound(self.p[id::VINTAGE], 0., 1.);
        let mut at = 0;
        while at < n {
            if self.until == 0 {
                self.tick();
                self.until = TICK;
            }
            let m = self.until.min(n - at);
            let s = self.setup;
            let mut l2 = [0f32; 2 * TICK];
            let mut r2 = [0f32; 2 * TICK];
            let len = m * s.os;
            for v in self.voices.iter_mut().filter(|v| v.active) {
                if s.os == 2 {
                    render_voice(v, &s, vintage, &mut l2[..len], &mut r2[..len]);
                } else {
                    render_voice(v, &s, vintage, &mut left[at..at + m], &mut right[at..at + m]);
                }
                if v.aenv.stage == IDLE {
                    v.active = false;
                    v.down = false;
                    v.held = false;
                    v.fenv = Adsr::ZERO;
                }
            }
            if s.os == 2 {
                for j in 0..m {
                    left[at + j] = self.dec[0].tick(l2[2 * j], l2[2 * j + 1]);
                    right[at + j] = self.dec[1].tick(r2[2 * j], r2[2 * j + 1]);
                }
            }
            at += m;
            self.until -= m;
        }
    }
}

#[inline(always)]
fn render_voice(v: &mut Voice, s: &Setup, vintage: f32, left: &mut [f32], right: &mut [f32]) {
    let time = 1. + 0.15 * vintage * v.time;
    let scale = |c: f32| (c / time).min(1.);
    let (fa, fd, fr) = (scale(s.f_attack), scale(s.f_decay), scale(s.f_release));
    let (aa, ad, ar) = (scale(s.a_attack), scale(s.a_decay), scale(s.a_release));
    let (pl, pr) = v.pan;
    let audio_cut = s.pm_cut != 0.;
    for i in 0..left.len() {
        v.dta += v.dta_d;
        v.dtb += v.dtb_d;
        v.pwa += v.pwa_d;
        v.pwb += v.pwb_d;
        v.cut += v.cut_d;
        v.g += v.g_d;
        v.gain += v.gain_d;
        let (b, wrap) = v.b.step(v.dtb, v.pwb, &s.wb, 0.);
        let dta = if s.pm_freq != 0. { (v.dta * exp2(s.pm_freq * b)).min(0.45) } else { v.dta };
        let pwa = (v.pwa + s.pm_pw * b).clamp(0.02, 0.98);
        let (a, _) = v.a.step(dta, pwa, &s.wa, if s.sync { wrap } else { 0. });
        let noise = v.rng.next();
        let x = s.drive * (s.mix_a * a + s.mix_b * b + s.mix_n * noise);
        let g = if audio_cut { warp(exp2(v.cut + s.pm_cut * b), s.srv) } else { v.g };
        // a whisper of noise lets a fully resonant filter start singing on its own
        let y = v.ladder.tick(x + 1e-5 * noise, g, v.k);
        v.fenv.tick(fa, fd, s.f_sustain, fr);
        let e = v.aenv.tick(aa, ad, s.a_sustain, ar);
        let o = y * e * v.gain;
        let o = o * v.onset.tick();
        left[i] += o * pl;
        right[i] += o * pr;
    }
}
