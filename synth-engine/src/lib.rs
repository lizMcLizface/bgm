//! Standalone, allocation-free subtractive DSP prototype. No third-party DSP code.
#![allow(static_mut_refs)]
use std::f32::consts::PI;
#[path = "../common/headroom.rs"]
mod headroom;
#[path = "../common/colour.rs"]
mod colour;
#[path = "../common/notes.rs"]
mod notes;
const VOICES: usize = 32;
const UNISON: usize = 4;
const PARAMS: usize = 100;
const QUEUE: usize = 4096;
const BLOCK: usize = 2048;
const LUT: usize = 2048;
const DELAY: usize = 8192;
fn bound(v: f32, lo: f32, hi: f32) -> f32 {
    if v.is_finite() {
        v.clamp(lo, hi)
    } else {
        lo
    }
}
fn soft(x: f32) -> f32 {
    let x = x.clamp(-3., 3.);
    x * (27. + x * x) / (27. + 9. * x * x)
}
fn random(state: &mut u32) -> f32 {
    *state ^= *state << 13;
    *state ^= *state >> 17;
    *state ^= *state << 5;
    (*state as f64 / u32::MAX as f64) as f32 * 2. - 1.
}
fn blep(t: f32, dt: f32) -> f32 {
    if t < dt {
        let x = t / dt;
        x + x - x * x - 1.
    } else if t > 1. - dt {
        let x = (t - 1.) / dt;
        x * x + x + x + 1.
    } else {
        0.
    }
}
// Normalized additive shapes from the original instrument library. Each
// table removes harmonics above its band limit; adjacent limits crossfade.
// Construction is outside the callback; playback is two table interpolations.
static mut ADDITIVE: [[[f32; LUT + 1]; 16]; 6] = [[[0.; LUT + 1]; 16]; 6];
static mut ADDITIVE_READY: bool = false;
fn init_additive() {
    unsafe {
        if ADDITIVE_READY {
            return;
        }
        let mut amps = [[0.; 16]; 6];
        amps[0][..8].copy_from_slice(&[1., 0.8, 0.6, 0.5, 0., 0.3, 0., 0.25]);
        amps[1][..11].copy_from_slice(&[1., 0., 0.5, 0., 0.3, 0., 0.18, 0., 0.1, 0., 0.05]);
        amps[2][..12].copy_from_slice(&[
            1., 0.7, 0.9, 0.5, 0.3, 0.25, 0.15, 0.2, 0.18, 0.1, 0.06, 0.04,
        ]);
        amps[3][0] = 1.;
        amps[3][3] = 0.35;
        amps[3][8] = 0.2;
        amps[3][12] = 0.1;
        for h in 0..16 {
            amps[4][h] = (if h % 2 == 1 { 0.7 } else { 1. }) / ((h + 1) as f32).powf(1.3);
        }
        for h in 0..16 {
            if h % 2 == 0 {
                amps[5][h] = (if h % 4 == 0 { 1. } else { -1. }) / ((h + 1) * (h + 1)) as f32;
            }
        }
        for k in 0..6 {
            let mut peak: f32 = 0.;
            for i in 0..=LUT {
                let t = i as f32 / LUT as f32;
                let mut value = 0.;
                for h in 0..16 {
                    value += amps[k][h] * (2. * PI * t * (h + 1) as f32).sin();
                    ADDITIVE[k][h][i] = value;
                }
                peak = peak.max(value.abs());
            }
            for h in 0..16 {
                for i in 0..=LUT {
                    ADDITIVE[k][h][i] /= peak.max(1e-6);
                }
            }
        }
        ADDITIVE_READY = true;
    }
}
fn additive_wave(kind: usize, t: f32, dt: f32) -> f32 {
    // Fade the last partial in below Nyquist, avoiding a discontinuous
    // spectrum while notes glide across table boundaries.
    let limit = (0.45 / dt.max(0.000001)).clamp(1., 17.) - 1.;
    let limit = if limit >= 16. { 16. } else { limit };
    let low = limit.floor() as usize;
    let blend = limit - low as f32;
    let x = t * LUT as f32;
    let i = x as usize;
    let f = x - i as f32;
    unsafe {
        let lookup = |n: usize| {
            let table = &ADDITIVE[kind][n.min(15)];
            table[i] + (table[i + 1] - table[i]) * f
        };
        if low >= 16 {
            return lookup(15);
        }
        let a = if low == 0 { 0. } else { lookup(low - 1) };
        a + (lookup(low) - a) * blend
    }
}
fn wave(kind: u32, t: f32, dt: f32, pw: f32, sine: &[f32; LUT + 1]) -> f32 {
    match kind {
        1 => {
            let x = t * LUT as f32;
            let i = x as usize;
            sine[i] + (sine[i + 1] - sine[i]) * (x - i as f32)
        }
        2 => 1. - 4. * (t - 0.5).abs(),
        3 => 2. * t - 1. - blep(t, dt),
        4 => (if t < pw { 1. } else { -1. }) + blep(t, dt) - blep((t - pw + 1.).fract(), dt),
        5..=10 => additive_wave((kind - 5) as usize, t, dt),
        _ => 0.,
    }
}
fn raw_wave(kind: u32, t: f32, pw: f32, sine: &[f32; LUT + 1]) -> f32 {
    match kind {
        3 => 2. * t - 1.,
        4 => {
            if t < pw {
                1.
            } else {
                -1.
            }
        }
        _ => wave(kind, t, 0.000001, pw, sine),
    }
}
// A step between this sample and the next has two polynomial residuals.
// Place them in time, using the raw jump, rather than smoothing the jump twice.
fn step_residual(time: f32, jump: f32, current: &mut f32, next: &mut f32) {
    *current += jump * 0.5 * (1. - time).powi(2);
    *next -= jump * 0.5 * time * time;
}
fn segment_edges(
    kind: u32,
    phase: f32,
    step: f32,
    start: f32,
    end: f32,
    width_start: f32,
    width_end: f32,
    current: &mut f32,
    next: &mut f32,
) {
    let duration = end - start;
    if duration <= 0. {
        return;
    }
    if kind == 3 || kind == 4 {
        let wrap = (1. - phase) / step;
        if wrap > 0. && wrap <= duration {
            step_residual(
                start + wrap,
                if kind == 3 { -2. } else { 2. },
                current,
                next,
            );
        }
    }
    if kind == 4 {
        let relative = step - (width_end - width_start) / duration;
        if relative.abs() > 0.0000001 {
            // Both directions matter: a moving duty edge can overtake phase.
            // A segment can contain a wrap and a second duty crossing.
            for cycle in 0..=1 {
                let crossing = (cycle as f32 + width_start - phase) / relative;
                if crossing > 0. && crossing <= duration {
                    step_residual(start + crossing, -2. * relative.signum(), current, next);
                }
            }
        }
    }
}
#[derive(Clone, Copy)]
struct Env {
    value: f32,
    linear: f32,
    total: u32,
    stage: u8,
    left: u32,
    release_start: f32,
    release_total: u32,
}
impl Env {
    const ZERO: Self = Self {
        value: 0.,
        linear: 0.,
        total: 1,
        stage: 0,
        left: 0,
        release_start: 0.,
        release_total: 1,
    };
    fn trigger(&mut self) {
        *self = Self {
            stage: 1,
            ..Self::ZERO
        };
    }
    fn trigger_amp(&mut self, p: &[f32; PARAMS], sr: f32) {
        self.trigger();
        if p[99] >= 0.5 && p[17] == 0. {
            self.value = 1.;
            self.linear = 1.;
            self.stage = 2;
            self.left = (p[18] * sr).max(1.) as u32;
            self.total = self.left;
            if p[18] == 0. {
                self.value = p[19];
                self.linear = p[19];
                self.stage = 3;
            }
        }
    }
    fn off(&mut self, seconds: f32, sr: f32) {
        if self.stage > 0 && self.stage != 4 {
            self.stage = 4;
            self.left = (seconds * sr).max(1.) as u32;
            self.release_total = self.left;
            self.release_start = self.value;
        }
    }
    fn next(&mut self, p: &[f32; PARAMS], offset: usize, curves: usize, sr: f32) -> f32 {
        match self.stage {
            1 => {
                self.linear += (p[offset] * sr).max(1.).recip();
                self.value = if p[curves] == 1. {
                    self.linear
                } else {
                    self.linear.clamp(0., 1.).powf(p[curves])
                };
                if self.linear >= 1. {
                    self.value = 1.;
                    self.linear = 1.;
                    self.stage = 2;
                    self.left = (p[offset + 1] * sr).max(1.) as u32;
                    self.total = self.left;
                }
            }
            2 => {
                self.linear += (p[offset + 2] - self.linear) / (self.left.max(1) as f32);
                self.left = self.left.saturating_sub(1);
                let fraction = 1. - self.left as f32 / self.total.max(1) as f32;
                self.value = if p[curves + 1] == 1. {
                    self.linear
                } else {
                    1. + (p[offset + 2] - 1.) * fraction.powf(p[curves + 1])
                };
                if self.left == 0 {
                    self.stage = 3;
                    self.value = p[offset + 2];
                }
            }
            3 => {
                self.value += (p[offset + 2] - self.value) * 0.002;
            }
            4 => {
                self.left = self.left.saturating_sub(1);
                let fraction = self.left as f32 / self.release_total as f32;
                self.value = if offset == 17 && p[99] >= 0.5 {
                    self.release_start * (1. - (1. - fraction).powf(p[curves + 2]))
                } else if p[curves + 2] == 2. {
                    self.release_start * fraction * fraction
                } else {
                    self.release_start * fraction.powf(p[curves + 2])
                };
                if self.left == 0 {
                    *self = Self::ZERO;
                }
            }
            _ => {}
        }
        self.value
    }
}
#[derive(Clone, Copy)]
struct Filter {
    ic1: f32,
    ic2: f32,
}
impl Filter {
    const ZERO: Self = Self { ic1: 0., ic2: 0. };
    // Topology-preserving state variable filter. g is calculated at control rate.
    fn tick(&mut self, x: f32, g: f32, k: f32, mode: u32) -> f32 {
        let a1 = 1. / (1. + g * (g + k));
        let v1 = a1 * (self.ic1 + g * (x - self.ic2));
        let v2 = self.ic2 + g * v1;
        self.ic1 = (2. * v1 - self.ic1).clamp(-16., 16.);
        self.ic2 = (2. * v2 - self.ic2).clamp(-16., 16.);
        match mode {
            2 => v1,
            3 => x - k * v1 - v2,
            _ => v2,
        }
    }
}
#[derive(Clone, Copy)]
struct Lane {
    phase: [f32; 3],
    dt: [f32; 2],
    lp: Filter,
    lp2: Filter,
    hp: Filter,
    g: f32,
    target_g: f32,
    ladder: [f32; 4],
    sync_tail: f32,
    previous_width: f32,
}
impl Lane {
    const ZERO: Self = Self {
        phase: [0.; 3],
        dt: [0.005; 2],
        lp: Filter::ZERO,
        lp2: Filter::ZERO,
        hp: Filter::ZERO,
        g: 0.05,
        target_g: 0.05,
        ladder: [0.; 4],
        sync_tail: 0.,
        previous_width: 0.5,
    };
}
fn damping(resonance: f32, modern: bool) -> f32 {
    if modern {
        1.4142135 - resonance * (1.4142135 - 0.15)
    } else {
        2. - resonance * 1.85
    }
}
fn lowpass_tick(
    lane: &mut Lane,
    x: f32,
    g: f32,
    resonance: f32,
    kind: u32,
    ladder: bool,
    modern: bool,
) -> f32 {
    if ladder {
        let g = g / (1. + g);
        let g2 = g * g;
        let g3 = g2 * g;
        let g4 = g2 * g2;
        let feedback = resonance * 3.8;
        let state = (1. - g)
            * (g3 * lane.ladder[0] + g2 * lane.ladder[1] + g * lane.ladder[2] + lane.ladder[3]);
        let mut signal = soft((x - feedback * state) / (1. + feedback * g4));
        for z in &mut lane.ladder {
            let v = (signal - *z) * g;
            signal = v + *z;
            *z = (signal + v).clamp(-8., 8.);
        }
        // Partial DC compensation retains bass as feedback increases, without
        // claiming a flat gain or the response of a particular analogue chip.
        return signal * if modern { 1. + feedback * 0.75 } else { 1. };
    }
    if modern && kind == 1 {
        // Fourth-order Butterworth pole damping at zero resonance. Resonance
        // scales both dampings without squaring a single stage's Q control.
        let scale = 1. - resonance * 0.7;
        let first = lane.lp.tick(x, g, 1.847759 * scale, 0);
        return lane.lp2.tick(first, g, 0.76536685 * scale, 0);
    }
    let mut result = lane.lp.tick(x, g, damping(resonance, modern), kind);
    if kind == 1 {
        result = lane.lp2.tick(result, g, damping(resonance, modern), 0);
    }
    result
}

struct Chorus {
    buffer: [[f32; DELAY]; 2],
    position: usize,
    phase: f32,
    amount: f32,
    rate: f32,
    depth: f32,
    amount_alpha: f32,
    motion_alpha: f32,
}
impl Chorus {
    const ZERO: Self = Self {
        buffer: [[0.; DELAY]; 2],
        position: 0,
        phase: 0.,
        amount: 0.,
        rate: 0.3,
        depth: 3.,
        amount_alpha: 0.,
        motion_alpha: 0.,
    };
    fn configure(&mut self, sr: f32) {
        self.amount_alpha = 1. - (-1. / (sr * 0.008)).exp();
        self.motion_alpha = 1. - (-1. / (sr * 0.04)).exp();
    }
    fn reset(&mut self, sr: f32) {
        self.buffer = [[0.; DELAY]; 2];
        self.position = 0;
        self.phase = 0.;
        self.amount = 0.;
        self.rate = 0.3;
        self.depth = 3.;
        self.configure(sr);
    }
    fn tick(
        &mut self,
        input: [f32; 2],
        amount: f32,
        rate: f32,
        depth: f32,
        sr: f32,
        sine: &[f32; LUT + 1],
        modern: bool,
    ) -> ([f32; 2], [f32; 2]) {
        let (amount, rate, depth) = if modern {
            self.amount += (amount - self.amount) * self.amount_alpha;
            self.rate += (rate - self.rate) * self.motion_alpha;
            self.depth += (depth - self.depth) * self.motion_alpha;
            (self.amount, self.rate, self.depth)
        } else {
            (amount, rate, depth)
        };
        self.phase = (self.phase + rate / sr).fract();
        let mut output = input;
        let mut wet = [0.; 2];
        let dry_gain = 1. - amount * 0.5;
        let wet_gain = amount * 0.5;
        // Unit power for decorrelated dry/wet material. Coherent tones and
        // mono folding still have comb response; this is not a loudness AGC.
        let gain = if modern {
            (dry_gain * dry_gain + wet_gain * wet_gain).sqrt().recip()
        } else {
            1.
        };
        for ch in 0..2 {
            self.buffer[ch][self.position] = input[ch];
            if amount > 0.000001 || !modern {
                let modulation = wave(
                    1,
                    (self.phase + ch as f32 * if modern { 0.5 } else { 0.25 }).fract(),
                    0.01,
                    0.5,
                    sine,
                );
                let delay = (0.012 + depth * 0.001 * modulation) * sr;
                let read = (self.position as f32 + DELAY as f32 - delay).rem_euclid(DELAY as f32);
                let i = read as usize;
                let f = read - i as f32;
                let b = &self.buffer[ch];
                let delayed = if modern {
                    // Four-point third-order Lagrange fractional delay.
                    let a = b[(i + DELAY - 1) % DELAY];
                    let c = b[(i + 1) % DELAY];
                    let d = b[(i + 2) % DELAY];
                    -f * (f - 1.) * (f - 2.) / 6. * a + (f + 1.) * (f - 1.) * (f - 2.) / 2. * b[i]
                        - (f + 1.) * f * (f - 2.) / 2. * c
                        + (f + 1.) * f * (f - 1.) / 6. * d
                } else {
                    b[i] * (1. - f) + b[(i + 1) % DELAY] * f
                };
                wet[ch] = delayed;
                output[ch] = (input[ch] * dry_gain + delayed * wet_gain) * gain;
            }
        }
        self.position = (self.position + 1) % DELAY;
        (output, wet)
    }
}
#[derive(Clone, Copy)]
struct Motion {
    rng: u32,
    phase: f32,
    from: f32,
    to: f32,
}
impl Motion {
    const ZERO: Self = Self {
        rng: 1,
        phase: 0.,
        from: 0.,
        to: 0.,
    };
    fn seeded(id: u32, layer: usize) -> Self {
        let mut rng =
            (id.wrapping_mul(2654435761) ^ (layer as u32 + 1).wrapping_mul(2246822519)).max(1);
        let to = random(&mut rng);
        Self {
            rng,
            to,
            ..Self::ZERO
        }
    }
    fn next(&mut self, rate: f32, sr: f32) -> f32 {
        self.phase += rate / sr;
        if self.phase >= 1. {
            self.phase -= 1.;
            self.from = self.to;
            self.to = random(&mut self.rng);
        }
        let t = self.phase * self.phase * (3. - 2. * self.phase);
        self.from + (self.to - self.from) * t
    }
}
#[derive(Clone, Copy)]
struct Voice {
    id: u32,
    midi: f32,
    hz: f32,
    target_midi: f32,
    glide_left: u32,
    velocity: f32,
    pressure: f32,
    velocity_target: f32,
    pressure_target: f32,
    gate: bool,
    active: bool,
    age: u64,
    rng: u32,
    drift: f32,
    amp: [Env; 2],
    filter_env: [Env; 2],
    mod_env: [Env; 2],
    motion: [Motion; 2],
    modulation: [[f32; 5]; 2],
    lanes: [[Lane; UNISON]; 2],
    last: [f32; 2],
    tail: [f32; 2],
    fade: u32,
}
impl Voice {
    const ZERO: Self = Self {
        id: 0,
        midi: 60.,
        hz: 261.6256,
        target_midi: 60.,
        glide_left: 0,
        velocity: 0.,
        pressure: 0.,
        velocity_target: 0.,
        pressure_target: 0.,
        gate: false,
        active: false,
        age: 0,
        rng: 1,
        drift: 0.,
        amp: [Env::ZERO; 2],
        filter_env: [Env::ZERO; 2],
        mod_env: [Env::ZERO; 2],
        motion: [Motion::ZERO; 2],
        modulation: [[0.; 5]; 2],
        lanes: [[Lane::ZERO; UNISON]; 2],
        last: [0.; 2],
        tail: [0.; 2],
        fade: 0,
    };
}
#[derive(Clone, Copy)]
struct Event {
    frame: u64,
    kind: u32,
    id: u32,
    a: f32,
    b: f32,
}
impl Event {
    const ZERO: Self = Self {
        frame: 0,
        kind: 0,
        id: 0,
        a: 0.,
        b: 0.,
    };
}
struct Engine {
    note_mode: u32,
    portamento: f32,
    always_glide: bool,
    mono_seen: bool,
    notes: notes::Notes,

    sr: f32,
    modern_edges: bool,
    modern_filters: bool,
    modern_chorus: bool,
    cutoff_alpha: f32,
    modulation_alpha: f32,
    frame: u64,
    global: [f32; 12],
    p: [[f32; PARAMS]; 2],
    sine: [f32; LUT + 1],
    voices: [Voice; VOICES],
    queue: [Event; QUEUE],
    head: usize,
    len: usize,
    rng: u32,
    steals: u32,
    dropped: u32,
    late: u32,
    peak: f32,
    blocks: u64,
    lfo_phase: [[f32; 2]; 2],
    lfo_hold: [[f32; 2]; 2],
    ratios: [[f32; 2]; 2],
    hp_g: [f32; 2],
    bend: f32,
    chorus: Chorus,
    headroom: headroom::Headroom,
    dc_in: [f32; 2],
    dc_out: [f32; 2],
    pedal: bool,
}
impl Engine {
    const fn new() -> Self {
        Self {
            note_mode: 0,
            portamento: 0.,
            always_glide: false,
            mono_seen: false,
            notes: notes::Notes::new(),
            sr: 48000.,
            modern_edges: true,
            modern_filters: true,
            modern_chorus: true,
            cutoff_alpha: 0.08,
            modulation_alpha: 0.,
            frame: 0,
            global: [0.; 12],
            p: [[0.; PARAMS]; 2],
            sine: [0.; LUT + 1],
            voices: [Voice::ZERO; VOICES],
            queue: [Event::ZERO; QUEUE],
            head: 0,
            len: 0,
            rng: 0x1a2b3c4d,
            steals: 0,
            dropped: 0,
            late: 0,
            peak: 0.,
            blocks: 0,
            lfo_phase: [[0.; 2]; 2],
            lfo_hold: [[0.; 2]; 2],
            ratios: [[1.; 2]; 2],
            hp_g: [0.; 2],
            bend: 0.,
            chorus: Chorus::ZERO,
            headroom: headroom::Headroom::new(),
            dc_in: [0.; 2],
            dc_out: [0.; 2],
            pedal: false,
        }
    }
    fn init(&mut self, sr: f32) {
        self.note_mode = 0;
        self.portamento = 0.;
        self.always_glide = false;
        self.mono_seen = false;
        self.notes.clear();
        self.sr = bound(sr, 8000., 192000.);
        self.headroom.init(self.sr);
        self.modern_edges = true;
        self.modern_filters = true;
        self.modern_chorus = true;
        self.cutoff_alpha = 1. - (-1. / (self.sr * 0.00025)).exp();
        self.modulation_alpha = 1. - (-1. / (self.sr * 0.005)).exp();
        self.frame = 0;
        self.rng = 0x1a2b3c4d;
        self.voices = [Voice::ZERO; VOICES];
        unsafe {
            COLOURS = [[colour::Colour::ZERO; 2]; VOICES];
        }
        self.head = 0;
        self.len = 0;
        self.steals = 0;
        self.dropped = 0;
        self.late = 0;
        self.blocks = 0;
        self.global = [0., 8., 1., 8., 0.28, 0., 0., 0., 0., 0.3, 3., 0.65];
        for i in 0..=LUT {
            self.sine[i] = (i as f32 * 2. * PI / LUT as f32).sin();
        }
        init_additive();
        self.lfo_phase = [[0.; 2]; 2];
        self.lfo_hold = [[0.; 2]; 2];
        self.chorus.reset(self.sr);
        self.dc_in = [0.; 2];
        self.dc_out = [0.; 2];
        self.bend = 0.;
        self.pedal = false;
        for layer in 0..2 {
            self.p[layer] = [0.; PARAMS];
            let defaults = [
                (0, 3.),
                (1, 4.),
                (2, 0.65),
                (3, 0.35),
                (6, 0.5),
                (9, 1800.),
                (10, 0.2),
                (11, 1.),
                (12, 20.),
                (14, 2.),
                (15, 0.5),
                (16, 1.),
                (17, 0.03),
                (18, 0.3),
                (19, 0.65),
                (20, 0.7),
                (21, 0.03),
                (22, 0.4),
                (23, 0.2),
                (24, 0.7),
                (25, 4.5),
                (29, 3.),
                (30, 1.),
                (35, 0.15),
                (39, 0.2),
                (41, 2.),
                (42, 1.),
                (53, 1.),
                (59, 1.),
                (60, 1.),
                (61, 2.),
                (62, 1.),
                (63, 1.),
                (64, 2.),
                (65, 1.5),
                (66, 2.),
                (67, 0.5),
                (68, 2.),
                (69, 1.),
                (70, 1.),
                (71, 2.),
                (72, 0.15),
            ];
            for (index, value) in defaults {
                self.p[layer][index] = value;
            }
            self.p[layer][86..99].copy_from_slice(&colour::DEFAULTS);
            self.refresh(layer);
        }
    }
    fn refresh(&mut self, l: usize) {
        let p = &self.p[l];
        self.ratios[l] = [
            (p[43] / 12.).exp2(),
            ((p[43] + p[4]) / 12. + p[5] / 1200. - if p[52] >= 0.5 { 7. } else { 0. }).exp2(),
        ];
        self.hp_g[l] = (PI * p[12].min(self.sr * 0.4) / self.sr).tan();
    }
    fn param(&mut self, scope: u32, index: usize, value: f32) {
        if !value.is_finite() {
            return;
        }
        if scope == 0 {
            let ranges = [
                (0., 3.),
                (1., 32.),
                (1., 4.),
                (0., 40.),
                (0., 0.8),
                (-12., 12.),
                (0., 1.),
                (0., 1.),
                (0., 0.8),
                (0.05, 2.),
                (0., 8.),
                (0., 1.),
            ];
            if index < 12 {
                self.global[index] = value.clamp(ranges[index].0, ranges[index].1);
            }
        } else if scope <= 2 && index < PARAMS {
            let (lo, hi) = match index {
                0 | 1 => (0., 10.),
                2 | 3 | 7 | 8 | 10 | 13 | 15 | 19 | 23 | 30 | 38 | 42 => (0., 1.),
                4 | 43 => (-24., 24.),
                5 => (-50., 50.),
                6 => (0.05, 0.95),
                9 => (20., 18000.),
                11 => (0., 3.),
                12 => (10., 5000.),
                14 => (-6., 6.),
                16 | 27 | 37 | 41 => (0., 4.),
                17 | 18 | 20 => (0., 8.),
                21 | 22 | 24 => (0.002, 8.),
                25 | 35 => (0.01, 20.),
                26 | 36 => (0., 100.),
                28 | 33 => (0., 0.4),
                29 => (0., 20.),
                31 => (-0.9, 0.9),
                32 => (0., 1.),
                34 => (-12., 12.),
                39 => (0., 3.),
                40 => (-0.4, 0.4),
                44 => (0., 4.),
                45 => (0., 5.),
                49 => (0., 3.),
                50 | 51 => (-0.4, 0.4),
                56 => (0., 100.),
                59..=64 | 69..=71 => (0.25, 4.),
                65 | 66 | 68 => (0.002, 12.),
                72 => (0.01, 2.),
                73 => (0., 20.),
                74..=85 => match (index - 74) % 3 {
                    0 => (0., 10.),
                    1 => (0., 5.),
                    _ => (-1., 1.),
                },
                86..=98 => colour::range(index - 86),
                _ => (0., 1.),
            };
            let l = scope as usize - 1;
            let discrete =
                ((74..=85).contains(&index) && (index - 74) % 3 != 2) || index == 94 || index == 99;
            self.p[l][index] = if discrete {
                value.round().clamp(lo, hi)
            } else {
                value.clamp(lo, hi)
            };
            self.refresh(l);
        }
    }
    fn enqueue(&mut self, kind: u32, id: u32, frame: f64, a: f32, b: f32) -> bool {
        if !frame.is_finite() || frame < 0. || !a.is_finite() || !b.is_finite() {
            return false;
        }
        if self.len == QUEUE && self.head > 0 {
            self.queue.copy_within(self.head..self.len, 0);
            self.len -= self.head;
            self.head = 0;
        }
        if self.len == QUEUE {
            self.dropped += 1;
            return false;
        }
        let frame = frame as u64;
        if frame < self.frame {
            self.late += 1;
        }
        let event = Event {
            frame: frame.max(self.frame),
            kind,
            id,
            a,
            b,
        };
        let mut at = self.len;
        while at > self.head && self.queue[at - 1].frame > event.frame {
            self.queue[at] = self.queue[at - 1];
            at -= 1;
        }
        self.queue[at] = event;
        self.len += 1;
        true
    }
    fn release_voice(&mut self, i: usize) {
        self.voices[i].gate = false;
        if !self.pedal {
            for l in 0..2 {
                self.voices[i].amp[l].off(self.p[l][20], self.sr);
                self.voices[i].filter_env[l].off(self.p[l][24], self.sr);
                self.voices[i].mod_env[l].off(self.p[l][68], self.sr);
            }
        }
    }
    fn event(&mut self, mut e: Event) {
        // Event 6 is an additive, sample-timed note-behavior configuration.
        if e.kind == 6 {
            let mode = e.id.min(2);
            if mode != self.note_mode {
                self.voices = [Voice::ZERO; VOICES];
                self.notes.clear();
                self.mono_seen = false;
                self.pedal = false;
            }
            self.note_mode = mode;
            self.portamento = e.a.clamp(0., 3.);
            self.always_glide = e.b >= 0.5;
            return;
        }
        if self.note_mode != 0 && e.kind <= 2 {
            match self.notes.event(e.kind, e.id, e.a, e.b) {
                notes::Action::None => return,
                notes::Action::Release => {
                    self.release_voice(0);
                    return;
                }
                notes::Action::Select(key) => {
                    if !self.voices[0].active {
                        e = Event {
                            kind: 0,
                            id: key.id,
                            a: key.midi,
                            b: key.velocity,
                            ..e
                        };
                    } else {
                        let v = &mut self.voices[0];
                        let overlap = v.gate;
                        let seconds = if overlap || self.always_glide {
                            self.portamento
                        } else {
                            0.
                        };
                        // A legato voice is already sounding: never add a
                        // second copy of its last sample over the continuing tone.
                        v.id = key.id;
                        v.gate = true;
                        v.velocity_target = key.velocity;
                        v.pressure_target = 0.;

                        v.target_midi = key.midi;
                        v.glide_left = (seconds * self.sr) as u32;
                        if v.glide_left == 0 {
                            v.midi = key.midi;
                            v.hz = 440. * ((v.midi - 69.) / 12.).exp2();
                        }
                        if self.note_mode == 1 || !overlap {
                            v.velocity = v.velocity_target;
                            v.pressure = v.pressure_target;
                            v.age = self.frame;
                            v.tail = v.last;
                            v.fade = 64;
                            for l in 0..2 {
                                v.amp[l].trigger_amp(&self.p[l], self.sr);
                                v.filter_env[l].trigger();
                                v.mod_env[l].trigger();
                            }
                        }
                        return;
                    }
                }
            }
        }
        if self.note_mode != 0 && e.kind == 5 {
            self.notes.retune(e.id, e.a.clamp(0., 127.));
        }
        match e.kind {
            0 => {
                if e.id == 0 {
                    return;
                }
                if let Some(i) = self.voices.iter().position(|v| v.active && v.id == e.id) {
                    self.release_voice(i);
                }
                let cap = if self.note_mode == 0 {
                    self.global[1] as usize
                } else {
                    1
                };
                let index = (0..cap)
                    .find(|&i| !self.voices[i].active)
                    .unwrap_or_else(|| {
                        self.steals += 1;
                        (0..cap)
                            .min_by(|&a, &b| {
                                let va = &self.voices[a];
                                let vb = &self.voices[b];
                                let score = |v: &Voice| {
                                    if !v.gate {
                                        v.amp[0].value
                                    } else {
                                        2. + v.amp[0].value
                                    }
                                };
                                score(va)
                                    .partial_cmp(&score(vb))
                                    .unwrap()
                                    .then(va.age.cmp(&vb.age))
                            })
                            .unwrap_or(0)
                    });
                let tail = self.voices[index].last;
                let mut v = Voice::ZERO;
                v.id = e.id;
                v.midi = bound(e.a, 0., 127.);
                v.target_midi = v.midi;
                v.hz = 440. * ((v.midi - 69.) / 12.).exp2();
                v.velocity = bound(e.b, 0., 1.);
                v.velocity_target = v.velocity;
                v.active = true;
                v.gate = true;
                v.age = self.frame;
                v.rng = self.rng ^ (e.id.wrapping_mul(747796405));
                if v.rng == 0 {
                    v.rng = 1;
                }
                v.drift = random(&mut v.rng);
                v.tail = tail;
                v.fade = 64;
                for l in 0..2 {
                    v.amp[l].trigger_amp(&self.p[l], self.sr);
                    v.filter_env[l].trigger();
                    v.mod_env[l].trigger();
                    v.motion[l] = Motion::seeded(e.id, l);
                    unsafe {
                        COLOURS[index][l].init(
                            self.sr,
                            e.id.wrapping_mul(2654435761) ^ l as u32,
                            &self.p[l][86..99],
                        );
                    }
                    for u in 0..UNISON {
                        v.lanes[l][u].phase = [
                            ((random(&mut v.rng) + 1.) * 0.5).fract(),
                            ((random(&mut v.rng) + 1.) * 0.5).fract(),
                            0.,
                        ];
                        if self.global[0] as u32 == 3 {
                            v.lanes[l][u].phase[2] = v.lanes[l][u].phase[0] * 0.5;
                        }
                    }
                }
                if self.note_mode != 0 {
                    if self.mono_seen && self.always_glide && self.portamento > 0. {
                        v.midi = self.voices[0].midi;
                        v.hz = 440. * ((v.midi - 69.) / 12.).exp2();
                        v.glide_left = (self.portamento * self.sr) as u32;
                    }
                    self.mono_seen = true;
                }
                self.voices[index] = v;
            }
            1 => {
                for i in 0..VOICES {
                    if self.voices[i].active && self.voices[i].id == e.id {
                        self.release_voice(i);
                    }
                }
            }
            2 => {
                let on = e.a >= 0.5;
                let was = self.pedal;
                self.pedal = on;
                if was && !on {
                    for i in 0..VOICES {
                        if self.voices[i].active && !self.voices[i].gate {
                            self.release_voice(i);
                        }
                    }
                }
            }
            3 => {
                for v in &mut self.voices {
                    if e.id == 0 || v.id == e.id {
                        v.pressure = bound(e.a, 0., 1.);
                        v.pressure_target = v.pressure;
                    }
                }
            }
            4 => self.panic(),
            5 => {
                for v in &mut self.voices {
                    if v.active && v.id == e.id {
                        v.target_midi = bound(e.a, 0., 127.);
                        v.glide_left = (bound(e.b, 0., 8.) * self.sr) as u32;
                        if v.glide_left == 0 {
                            v.midi = v.target_midi;
                            v.hz = 440. * ((v.midi - 69.) / 12.).exp2();
                        }
                    }
                }
            }
            _ => {}
        }
    }
    fn panic(&mut self) {
        self.notes.clear();
        self.mono_seen = false;
        self.headroom.clear();
        self.voices = [Voice::ZERO; VOICES];
        unsafe {
            COLOURS = [[colour::Colour::ZERO; 2]; VOICES];
        }
        self.len = 0;
        self.head = 0;
        self.pedal = false;
        self.chorus.buffer = [[0.; DELAY]; 2];
        self.dc_in = [0.; 2];
        self.dc_out = [0.; 2];
    }
    fn render(&mut self, n: usize) {
        let n = n.min(BLOCK);
        let mode = self.global[0] as u32;
        let layers = if mode == 2 { 2 } else { 1 };
        let unison = self.global[2] as usize;
        let routes: [bool; 2] = std::array::from_fn(|l| {
            (0..4).any(|slot| {
                let at = 74 + slot * 3;
                self.p[l][at] > 0. && self.p[l][at + 1] > 0. && self.p[l][at + 2] != 0.
            })
        });
        let motion_enabled: [bool; 2] = std::array::from_fn(|l| {
            self.p[l][73] > 0.
                || (0..4).any(|slot| {
                    let at = 74 + slot * 3;
                    self.p[l][at] == 10. && self.p[l][at + 1] > 0. && self.p[l][at + 2] != 0.
                })
        });
        let dc_r = (-2. * PI * 15. / self.sr).exp();
        self.peak = 0.;
        for sample in 0..n {
            while self.head < self.len && self.queue[self.head].frame <= self.frame {
                let e = self.queue[self.head];
                self.head += 1;
                self.event(e);
            }
            self.bend += (self.global[5] - self.bend) * 0.002;
            let control = self.frame % 16 == 0;
            let mut lfos = [[0.; 2]; 2];
            for l in 0..layers {
                for k in 0..2 {
                    let rate = self.p[l][if k == 0 { 25 } else { 35 }];
                    let phase = self.lfo_phase[l][k];
                    let shape = if k == 0 { self.p[l][44] as u32 } else { 0 };
                    lfos[l][k] = match shape {
                        1 => 1. - 4. * (phase - 0.5).abs(),
                        2 => {
                            if phase < 0.5 {
                                1.
                            } else {
                                -1.
                            }
                        }
                        3 => 2. * phase - 1.,
                        4 => self.lfo_hold[l][k],
                        _ => wave(1, phase, 0.01, 0.5, &self.sine),
                    };
                    let next = phase + rate / self.sr;
                    if next >= 1. {
                        self.lfo_hold[l][k] = random(&mut self.rng);
                    }
                    self.lfo_phase[l][k] = next.fract();
                }
            }
            let mut out = [0.; 2];
            for (voice_index, v) in self.voices.iter_mut().enumerate() {
                if !v.active {
                    continue;
                }
                // Only handoffs set different targets; ordinary/polyphonic
                // voices keep their sample-identical path. Five-ms slew avoids
                // a replacement amplitude/filter step when key velocity changes.
                if v.velocity != v.velocity_target {
                    v.velocity += (v.velocity_target - v.velocity) * self.modulation_alpha;
                    if (v.velocity_target - v.velocity).abs() < 1e-6 {
                        v.velocity = v.velocity_target;
                    }
                }
                if v.pressure != v.pressure_target {
                    v.pressure += (v.pressure_target - v.pressure) * self.modulation_alpha;
                    if (v.pressure_target - v.pressure).abs() < 1e-6 {
                        v.pressure = v.pressure_target;
                    }
                }
                if v.glide_left > 0 {
                    v.midi += (v.target_midi - v.midi) / v.glide_left as f32;
                    v.glide_left -= 1;
                    if control || v.glide_left == 0 {
                        v.hz = 440. * ((v.midi - 69.) / 12.).exp2();
                    }
                }
                let mut voice_out = [0.; 2];
                let mut alive = false;
                for l in 0..layers {
                    let p = &self.p[l];
                    let colour = unsafe { &mut COLOURS[voice_index][l] };
                    let coloured = colour::enabled(&p[86..99]) || colour.engaged();
                    let mut layer_out = [0.; 2];
                    let mut noise_gain = [0.; 2];
                    let amp = v.amp[l].next(p, 17, 59, self.sr);
                    let fe = if mode == 3 {
                        amp
                    } else {
                        v.filter_env[l].next(p, 21, 62, self.sr)
                    };
                    let me = v.mod_env[l].next(p, 65, 69, self.sr);
                    alive |= v.amp[l].stage > 0;
                    let age = (self.frame - v.age) as f32 / self.sr;
                    let fade_lfo = if p[45] > 0.001 {
                        (age / p[45]).min(1.)
                    } else {
                        1.
                    };
                    let pressure = v.pressure.max(self.global[7]);
                    let update = control || self.frame == v.age;
                    let motion = if motion_enabled[l] {
                        v.motion[l].next(p[72], self.sr)
                    } else {
                        0.
                    };
                    let mut target = [0.; 5];
                    if routes[l] {
                        for slot in 0..4 {
                            let at = 74 + slot * 3;
                            let destination = p[at + 1] as usize;
                            if destination == 0 || p[at] == 0. || p[at + 2] == 0. {
                                continue;
                            }
                            let source = match p[at] as u32 {
                                1 => lfos[l][0] * fade_lfo,
                                2 => lfos[l][1],
                                3 => me,
                                4 => amp,
                                5 => fe,
                                6 => v.velocity,
                                7 => ((v.midi - 60.) / 36.).clamp(-1., 1.),
                                8 => pressure,
                                9 => self.global[6],
                                10 => motion,
                                _ => 0.,
                            };
                            target[destination - 1] += source * p[at + 2];
                        }
                    }
                    for k in 0..5 {
                        if target[k] != 0. || v.modulation[l][k] != 0. {
                            v.modulation[l][k] += (target[k].clamp(-1., 1.) - v.modulation[l][k])
                                * self.modulation_alpha;
                            if v.modulation[l][k].abs() < 1e-12 {
                                v.modulation[l][k] = 0.;
                            }
                        }
                    }
                    let modulation = v.modulation[l];
                    let lfo_pitch = (lfos[l][0] * (p[26] + self.global[6] * 35.) * fade_lfo
                        + lfos[l][1] * p[36])
                        / 1200.;
                    let env_pitch = fe * p[34] / 12.;
                    let drift = if mode == 3 {
                        0.
                    } else {
                        p[29] * v.drift / 1200.
                    };
                    let pitch = if update {
                        (self.bend / 12.
                            + env_pitch
                            + drift
                            + lfo_pitch
                            + pressure * p[56] / 1200.
                            + (motion * p[73] + modulation[0] * 100.) / 1200.)
                            .exp2()
                    } else {
                        0.
                    };
                    let pwm = (p[6] + lfos[l][0] * p[28] + fe * p[40] + modulation[2] * 0.4)
                        .clamp(0.05, 0.95);
                    let vel = 1. - p[42] + p[42] * v.velocity;
                    for u in 0..unison {
                        let lane = &mut v.lanes[l][u];
                        // Frequency/cutoff evaluated every 16 samples, interpolated cutoff per sample.
                        if update {
                            let position = if unison > 1 {
                                u as f32 / (unison - 1) as f32 * 2. - 1.
                            } else {
                                0.
                            };
                            let detune = (position * self.global[3] / 1200.).exp2();
                            let base = v.hz * pitch * detune;
                            lane.dt = [
                                (base * self.ratios[l][0] / self.sr).clamp(0.000001, 0.45),
                                ((if p[53] >= 0.5 {
                                    if p[99] >= 0.5 {
                                        v.hz * pitch
                                    } else {
                                        base
                                    }
                                } else {
                                    440. * pitch * detune
                                }) * self.ratios[l][1]
                                    / self.sr
                                    / if p[54] >= 0.5 { env_pitch.exp2() } else { 1. })
                                .clamp(0.000001, 0.45),
                            ];
                            let oct = fe * p[14]
                                + lfos[l][0] * p[27]
                                + lfos[l][1] * p[37]
                                + pressure * p[41]
                                + p[16] * (v.velocity - 0.5)
                                + p[15] * (v.midi - 60.) / 12.
                                + modulation[1] * 4.;
                            let hz = (p[9] * oct.exp2()).clamp(15., self.sr * 0.4);
                            lane.target_g = (PI * hz / self.sr).tan();
                        }
                        let [dt_a, dt_b] = lane.dt;
                        let b_phase = if mode == 3 {
                            lane.phase[0]
                        } else {
                            lane.phase[1]
                        };
                        let raw_b = wave(
                            p[1] as u32,
                            b_phase,
                            if mode == 3 { dt_a } else { dt_b },
                            (pwm + p[51]).clamp(0.05, 0.95),
                            &self.sine,
                        );
                        let pwm_a = (pwm + p[50] + raw_b * p[33]).clamp(0.05, 0.95);
                        let a_step = (dt_a * (1. + raw_b * p[32])).clamp(0.000001, 0.45);
                        let sync = mode != 3 && p[48] >= 0.5;
                        let moving_pulse = p[0] == 4.
                            && (p[33] > 0. || p[28] > 0. || p[40] != 0. || modulation[2] != 0.);
                        let mut a;
                        if !self.modern_edges {
                            // Retained solely for reproducible lab A/B comparisons.
                            a = wave(p[0] as u32, lane.phase[0], dt_a, pwm_a, &self.sine)
                                + lane.sync_tail;
                            lane.sync_tail = 0.;
                            if sync && lane.phase[1] + dt_b >= 1. {
                                let fraction = ((1. - lane.phase[1]) / dt_b).clamp(0., 1.);
                                let before = (lane.phase[0] + a_step * fraction).fract();
                                let jump = wave(p[0] as u32, 0., a_step, pwm_a, &self.sine)
                                    - wave(p[0] as u32, before, a_step, pwm_a, &self.sine);
                                a += jump * 0.5 * (1. - fraction).powi(2);
                                lane.sync_tail = -jump * 0.5 * fraction * fraction;
                                lane.phase[0] = (a_step * (1. - fraction)).fract();
                            } else {
                                lane.phase[0] = (lane.phase[0] + a_step).fract();
                            }
                        } else if sync || moving_pulse {
                            let kind = p[0] as u32;
                            a = raw_wave(kind, lane.phase[0], pwm_a, &self.sine) + lane.sync_tail;
                            lane.sync_tail = 0.;
                            let sync_time = if sync && lane.phase[1] + dt_b >= 1. {
                                ((1. - lane.phase[1]) / dt_b).clamp(0., 1.)
                            } else {
                                2.
                            };
                            let audio_pwm = kind == 4 && p[33] > 0.;
                            let predicted = (2. * pwm_a - lane.previous_width).clamp(0.05, 0.95);
                            let b_step = if mode == 3 { dt_a } else { dt_b };
                            // Skip edge tracing when no wrap/reset/duty crossing
                            // can occur. LUT sine/triangle slope bounds are valid
                            // throughout the interval; discontinuous B shapes
                            // use their full range instead.
                            let width_bound = if audio_pwm {
                                p[33]
                                    * match p[1] as u32 {
                                        0 => 0.,
                                        1 => (2. * PI * b_step).min(2.),
                                        2 => (4. * b_step).min(2.),
                                        _ => 2.,
                                    }
                            } else {
                                (predicted - pwm_a).abs()
                            };
                            let no_duty = kind != 4
                                || lane.phase[0] + a_step < (pwm_a - width_bound).max(0.05)
                                || lane.phase[0] > (pwm_a + width_bound).min(0.95);
                            if sync_time > 1. && lane.phase[0] + a_step < 1. && no_duty {
                                lane.phase[0] += a_step;
                            } else {
                                let mut widths = [pwm_a, (pwm_a + predicted) * 0.5, predicted];
                                if audio_pwm {
                                    for i in 1..=2 {
                                        let b = wave(
                                            p[1] as u32,
                                            (b_phase + b_step * i as f32 * 0.5).fract(),
                                            b_step,
                                            (pwm + p[51]).clamp(0.05, 0.95),
                                            &self.sine,
                                        );
                                        widths[i] = (pwm + p[50] + b * p[33]).clamp(0.05, 0.95);
                                    }
                                }
                                let segments = if audio_pwm { 2 } else { 1 };
                                for segment in 0..segments {
                                    let start = segment as f32 / segments as f32;
                                    let end = (segment + 1) as f32 / segments as f32;
                                    let left = widths[segment * 2 / segments];
                                    let right = widths[(segment + 1) * 2 / segments];
                                    if sync_time > start && sync_time <= end {
                                        let width = left
                                            + (right - left) * (sync_time - start) / (end - start);
                                        segment_edges(
                                            kind,
                                            lane.phase[0],
                                            a_step,
                                            start,
                                            sync_time,
                                            left,
                                            width,
                                            &mut a,
                                            &mut lane.sync_tail,
                                        );
                                        let before =
                                            (lane.phase[0] + a_step * (sync_time - start)).fract();
                                        let jump = raw_wave(kind, 0., width, &self.sine)
                                            - raw_wave(kind, before, width, &self.sine);
                                        step_residual(sync_time, jump, &mut a, &mut lane.sync_tail);
                                        segment_edges(
                                            kind,
                                            0.,
                                            a_step,
                                            sync_time,
                                            end,
                                            width,
                                            right,
                                            &mut a,
                                            &mut lane.sync_tail,
                                        );
                                        lane.phase[0] = (a_step * (end - sync_time)).fract();
                                    } else {
                                        segment_edges(
                                            kind,
                                            lane.phase[0],
                                            a_step,
                                            start,
                                            end,
                                            left,
                                            right,
                                            &mut a,
                                            &mut lane.sync_tail,
                                        );
                                        lane.phase[0] =
                                            (lane.phase[0] + a_step * (end - start)).fract();
                                    }
                                }
                            }
                        } else {
                            a = wave(p[0] as u32, lane.phase[0], a_step, pwm_a, &self.sine)
                                + lane.sync_tail;
                            lane.sync_tail = 0.;
                            lane.phase[0] = (lane.phase[0] + a_step).fract();
                        }
                        lane.previous_width = pwm_a;
                        let sub = wave(4, lane.phase[2], dt_a * 0.5, 0.5, &self.sine);
                        let noise = if p[8] > 0. {
                            random(&mut v.rng) * p[8] * 0.3
                        } else {
                            0.
                        };
                        let oscillator_mix = if p[99] >= 0.5 {
                            // Legacy unison multiplied the main oscillator
                            // only; oscillator B was one independent voice.
                            let n = unison as f32;
                            a * p[2] * n / (1. + (n - 1.) * 0.2)
                                + if u == 0 { raw_b * p[3] * n } else { 0. }
                        } else {
                            a * p[2] + raw_b * p[3]
                        };
                        let x = ((oscillator_mix * (1. - p[57]) + a * raw_b * p[57])
                            + sub * p[7]
                            + noise)
                            * 0.5;
                        lane.phase[1] = (lane.phase[1] + dt_b).fract();
                        lane.phase[2] = (lane.phase[2] + dt_a * 0.5).fract();
                        lane.g += (lane.target_g - lane.g)
                            * if self.modern_filters {
                                self.cutoff_alpha
                            } else {
                                0.08
                            };
                        let filter_g = if mode != 3 && p[49] > 0. {
                            (lane.g * (raw_b * p[49]).exp2()).clamp(0.00001, 3.)
                        } else {
                            lane.g
                        };
                        let high =
                            lane.hp
                                .tick(x, self.hp_g[l], damping(p[13], self.modern_filters), 3);
                        let driven = if p[99] >= 0.5 && p[39] == 0. {
                            high
                        } else {
                            soft(high * (1. + p[39]))
                        };
                        let kind = if mode == 2 { 0 } else { p[11] as u32 };
                        let mut filtered = lowpass_tick(
                            lane,
                            driven,
                            filter_g,
                            p[10],
                            kind,
                            p[58] >= 0.5 && mode != 2,
                            self.modern_filters,
                        );
                        // Web Audio's band-pass has unity centre gain;
                        // the SVF's unscaled band output has gain Q instead.
                        if p[99] >= 0.5 && kind == 2 {
                            filtered *= damping(p[10], self.modern_filters);
                        }
                        let amp = amp
                            * vel
                            * p[30]
                            * (1. - p[38] * (lfos[l][1] + 1.) * 0.5)
                            * (1. - p[55] + p[55] * pressure)
                            * (1. + modulation[3]);
                        let position = if unison > 1 {
                            u as f32 / (unison - 1) as f32 * 2. - 1.
                        } else {
                            0.
                        };
                        let pan = (p[31] + position * self.global[11] * 0.8 + modulation[4])
                            .clamp(-1., 1.);
                        // The oscillator mixer reserves 6 dB before the driven
                        // filters. Restore that level after filtering, rather
                        // than unintentionally attenuating every held voice.
                        let signal = filtered * amp * 2. / unison as f32;
                        if coloured {
                            layer_out[0] += signal * (1. - pan) * 0.5;
                            layer_out[1] += signal * (1. + pan) * 0.5;
                            noise_gain[0] += amp * (1. - pan) * 0.5 / unison as f32;
                            noise_gain[1] += amp * (1. + pan) * 0.5 / unison as f32;
                        } else {
                            voice_out[0] += signal * (1. - pan) * 0.5;
                            voice_out[1] += signal * (1. + pan) * 0.5;
                        }
                    }
                    if coloured {
                        let output =
                            colour.tick(layer_out, noise_gain, pressure, &p[86..99], self.sr);
                        voice_out[0] += output[0];
                        voice_out[1] += output[1];
                        alive |= colour.ringing();
                    }
                }
                if v.fade > 0 {
                    let t = v.fade as f32 / 64.;
                    voice_out[0] += v.tail[0] * t;
                    voice_out[1] += v.tail[1] * t;
                    v.fade -= 1;
                }
                v.last = voice_out;
                out[0] += voice_out[0];
                out[1] += voice_out[1];
                if !alive && v.fade == 0 {
                    v.active = false;
                }
            }
            let (mixed, _) = self.chorus.tick(
                out,
                self.global[8],
                self.global[9],
                self.global[10],
                self.sr,
                &self.sine,
                self.modern_chorus,
            );
            let mut clean = [0.; 2];
            for ch in 0..2 {
                let x = mixed[ch] * self.global[4];
                let dc = x - self.dc_in[ch] + dc_r * self.dc_out[ch];
                self.dc_in[ch] = x;
                self.dc_out[ch] = dc;
                clean[ch] = dc * 0.98;
            }
            let protected = self.headroom.tick(clean);
            for ch in 0..2 {
                let y = protected[ch];
                self.peak = self.peak.max(y.abs());
                unsafe {
                    if ch == 0 {
                        LEFT[sample] = y;
                    } else {
                        RIGHT[sample] = y;
                    }
                }
            }
            self.frame += 1;
        }
        if self.head == self.len {
            self.head = 0;
            self.len = 0;
        }
        self.blocks += 1;
    }
}
static mut ENGINE: Engine = Engine::new();
static mut COLOURS: [[colour::Colour; 2]; VOICES] = [[colour::Colour::ZERO; 2]; VOICES];
static mut LEFT: [f32; BLOCK] = [0.; BLOCK];
static mut RIGHT: [f32; BLOCK] = [0.; BLOCK];
static mut PROBE_INPUT: [[f32; BLOCK]; 2] = [[0.; BLOCK]; 2];
static mut PROBE_LANE: Lane = Lane::ZERO;
static mut PROBE_PARAMS: [f32; 5] = [0.; 5];
static mut COLOUR_PROBE: colour::Colour = colour::Colour::ZERO;
static mut COLOUR_PARAMS: [f32; colour::COUNT] = colour::DEFAULTS;
static mut COLOUR_SR: f32 = 48000.;
static mut COLOUR_SEED: u32 = 1;
#[no_mangle]
pub extern "C" fn engine_colour_probe_init(sr: f32, seed: u32) {
    unsafe {
        COLOUR_SR = bound(sr, 8000., 192000.);
        COLOUR_SEED = seed;
        COLOUR_PARAMS = colour::DEFAULTS;
        COLOUR_PROBE.init(COLOUR_SR, COLOUR_SEED, &COLOUR_PARAMS);
    }
}
#[no_mangle]
pub extern "C" fn engine_colour_probe_param(i: u32, v: f32) {
    let i = i as usize;
    if i < colour::COUNT && v.is_finite() {
        let (lo, hi) = colour::range(i);
        unsafe {
            COLOUR_PARAMS[i] = if i == 8 {
                v.round().clamp(lo, hi)
            } else {
                v.clamp(lo, hi)
            };
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_colour_probe_settle() {
    unsafe {
        COLOUR_PROBE.init(COLOUR_SR, COLOUR_SEED, &COLOUR_PARAMS);
    }
}
#[no_mangle]
pub extern "C" fn engine_colour_probe_process(frames: u32, left: f32, right: f32, pressure: f32) {
    unsafe {
        for i in 0..(frames as usize).min(BLOCK) {
            let output = COLOUR_PROBE.tick(
                [PROBE_INPUT[0][i], PROBE_INPUT[1][i]],
                [bound(left, 0., 4.), bound(right, 0., 4.)],
                bound(pressure, 0., 1.),
                &COLOUR_PARAMS,
                COLOUR_SR,
            );
            LEFT[i] = output[0];
            RIGHT[i] = output[1];
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn engine_init(sr: f32) {
    unsafe {
        ENGINE.init(sr);
    }
}
// Offline laboratory comparison hook; not a musical patch parameter. The live
// worklet never calls it and therefore always uses the refined edge handling.
#[no_mangle]
pub extern "C" fn engine_edge_mode(modern: u32) {
    unsafe {
        ENGINE.modern_edges = modern != 0;
    }
}
// Independent offline comparisons leave the other refinements enabled.
#[no_mangle]
pub extern "C" fn engine_tone_mode(filters: u32, chorus: u32) {
    unsafe {
        ENGINE.modern_filters = filters != 0;
        ENGINE.modern_chorus = chorus != 0;
    }
}
#[no_mangle]
pub extern "C" fn engine_probe_input(channel: u32) -> *mut f32 {
    unsafe { PROBE_INPUT[(channel as usize).min(1)].as_mut_ptr() }
}
#[no_mangle]
pub extern "C" fn engine_filter_probe_init(
    sr: f32,
    cutoff: f32,
    resonance: f32,
    kind: u32,
    family: u32,
    modern: u32,
) {
    let sr = bound(sr, 8000., 192000.);
    unsafe {
        PROBE_LANE = Lane::ZERO;
        PROBE_PARAMS = [
            (PI * bound(cutoff, 15., sr * 0.4) / sr).tan(),
            bound(resonance, 0., 1.),
            kind.min(3) as f32,
            family.min(1) as f32,
            if modern != 0 { 1. } else { 0. },
        ];
    }
}
#[no_mangle]
pub extern "C" fn engine_filter_probe_process(frames: u32) {
    unsafe {
        let [g, res, kind, family, modern] = PROBE_PARAMS;
        for i in 0..(frames as usize).min(BLOCK) {
            let y = lowpass_tick(
                &mut PROBE_LANE,
                PROBE_INPUT[0][i],
                g,
                res,
                kind as u32,
                family >= 0.5,
                modern >= 0.5,
            );
            LEFT[i] = y;
            RIGHT[i] = y;
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_chorus_probe_init(
    sr: f32,
    amount: f32,
    rate: f32,
    depth: f32,
    phase: f32,
    modern: u32,
) {
    unsafe {
        ENGINE.init(sr);
        ENGINE.modern_chorus = modern != 0;
        ENGINE.global[8] = bound(amount, 0., 0.8);
        ENGINE.global[9] = bound(rate, 0., 2.);
        ENGINE.global[10] = bound(depth, 0., 8.);
        ENGINE.chorus.phase = bound(phase, 0., 1.).fract();
        // Measurement starts from settled controls. Live creation/edits retain
        // their normal smoothing and are tested through the regular renderer.
        ENGINE.chorus.amount = ENGINE.global[8];
        ENGINE.chorus.rate = ENGINE.global[9];
        ENGINE.chorus.depth = ENGINE.global[10];
    }
}
#[no_mangle]
pub extern "C" fn engine_chorus_probe_process(frames: u32, wet_only: u32) {
    unsafe {
        for i in 0..(frames as usize).min(BLOCK) {
            let (mixed, wet) = ENGINE.chorus.tick(
                [PROBE_INPUT[0][i], PROBE_INPUT[1][i]],
                ENGINE.global[8],
                ENGINE.global[9],
                ENGINE.global[10],
                ENGINE.sr,
                &ENGINE.sine,
                ENGINE.modern_chorus,
            );
            let out = if wet_only != 0 { wet } else { mixed };
            LEFT[i] = out[0];
            RIGHT[i] = out[1];
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_set_frame(frame: f64) {
    if frame.is_finite() && frame >= 0. {
        unsafe {
            ENGINE.frame = frame as u64;
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_param(scope: u32, index: u32, value: f32) {
    unsafe {
        ENGINE.param(scope, index as usize, value);
    }
}
#[no_mangle]
pub extern "C" fn engine_event(kind: u32, id: u32, frame: f64, a: f32, b: f32) -> u32 {
    unsafe { ENGINE.enqueue(kind, id, frame, a, b) as u32 }
}
#[no_mangle]
pub extern "C" fn engine_panic() {
    unsafe {
        ENGINE.panic();
    }
}
#[no_mangle]
pub extern "C" fn engine_render(frames: u32) {
    unsafe {
        ENGINE.render(frames as usize);
    }
}
#[no_mangle]
pub extern "C" fn engine_left() -> *const f32 {
    unsafe { LEFT.as_ptr() }
}
#[no_mangle]
pub extern "C" fn engine_right() -> *const f32 {
    unsafe { RIGHT.as_ptr() }
}
#[no_mangle]
pub extern "C" fn engine_stat(index: u32) -> f64 {
    unsafe {
        match index {
            0 => ENGINE.voices.iter().filter(|v| v.active).count() as f64,
            1 => ENGINE.steals as f64,
            2 => ENGINE.dropped as f64,
            3 => ENGINE.late as f64,
            4 => ENGINE.frame as f64,
            5 => ENGINE.peak as f64,
            6 => ENGINE.global[1] as f64,
            7 => ENGINE.sr as f64,
            _ => ENGINE.blocks as f64,
        }
    }
}
