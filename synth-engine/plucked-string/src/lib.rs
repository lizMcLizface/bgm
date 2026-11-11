//! Exact generator Karplus–Strong note preparation. The original source is
//! pluckedString.js + stringBody.js. Preparation allocates off the callback;
//! bounded playback only copies the owned prepared Float32 material.
use std::f64::consts::PI;
const MAX_BLOCK: usize = 2048;
#[derive(Clone, Copy)]
pub struct Settings {
    pub decay: f64,
    pub damping: f64,
    pub position: f64,
    pub body: f64,
    pub resonance: f64,
    pub body_type: u32,
    pub seed: u32,
    pub softness: f64,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            decay: 2.,
            damping: 0.5,
            position: 0.2,
            body: 0.25,
            resonance: 0.,
            body_type: 0,
            seed: 1,
            softness: 0.,
        }
    }
}
fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    if x.is_finite() {
        x.max(lo).min(hi)
    } else {
        lo
    }
}
#[derive(Clone, Copy, Default)]
struct Mode {
    weight: f64,
    c: f64,
    r2: f64,
    b: f64,
    y1: f64,
    y2: f64,
}
const PROFILES: [[[f64; 3]; 3]; 4] = [
    [[110., 0.09, 0.48], [210., 0.065, 0.34], [430., 0.04, 0.18]],
    [[180., 0.1, 0.4], [440., 0.07, 0.35], [860., 0.045, 0.25]],
    [[70., 0.11, 0.5], [125., 0.08, 0.32], [250., 0.05, 0.18]],
    [
        [480., 0.07, 0.45],
        [1150., 0.045, 0.35],
        [2400., 0.025, 0.2],
    ],
];
pub fn prepare(rate: f64, frequency: f64, settings: Settings) -> Vec<f32> {
    let sr = clamp(rate, 8000., 192000.);
    let freq = clamp(frequency, 10., sr / 6.);
    let decay = clamp(settings.decay, 0.15, 5.);
    let damping = clamp(settings.damping, 0., 1.);
    let position = clamp(settings.position, 0.05, 0.45);
    let body = clamp(settings.body, 0., 1.);
    let resonance = clamp(settings.resonance, 0., 1.);
    let softness = clamp(settings.softness, 0., 1.);
    let duration = (decay * 1.25).max(0.35).min(6.);
    let mut out = vec![0f32; (sr * duration).ceil() as usize];
    let theta = 2. * PI * freq / sr;
    let mix = 0.12 + damping * 0.36;
    let filter_delay = (mix * theta.sin()).atan2(1. - mix + mix * theta.cos()) / theta;
    let delay = sr / freq - filter_delay;
    let n = (delay.floor() as usize).max(2);
    let fraction = delay - n as f64;
    let q = (fraction * theta / 2.).tan() / (theta / 2.).tan();
    let a = (1. - q) / (1. + q);
    let magnitude = (1. - mix + mix * theta.cos()).hypot(mix * theta.sin());
    let feedback = 0.9997f64.min((-1000f64.ln() / (freq * decay)).exp() / magnitude);
    let mut ring = vec![0f64; n];
    let mut noise = vec![0f64; n];
    let mut seed = if settings.seed == 0 { 1 } else { settings.seed };
    for value in &mut noise {
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        *value = seed as f64 / 2147483648. - 1.;
    }
    let pick = (position * n as f64).round().max(1.) as usize;
    for i in 0..n {
        let phase = i as f64 / n as f64;
        let displacement = if phase < position {
            phase / position
        } else {
            (1. - phase) / (1. - position)
        } - 0.5;
        ring[i] = displacement + 0.06 * (1. - 0.9 * softness) * (noise[i] - noise[(i + pick) % n]);
    }
    if softness > 0. {
        let cutoff = (freq * 2.5).max(450. + 8000. * (1. - softness).powi(2));
        let pole = (-2. * PI * (sr * 0.4).min(cutoff) / sr).exp();
        let alpha = 1. - pole;
        for reverse in [false, true] {
            let mut state = 0.;
            for k in 0..n {
                state = alpha * ring[if reverse { n - 1 - k } else { k }] + pole * state;
            }
            state /= 1. - pole.powf(n as f64);
            for k in 0..n {
                let i = if reverse { n - 1 - k } else { k };
                state = alpha * ring[i] + pole * state;
                ring[i] = state;
            }
        }
    }
    let start = if softness > 0. { ring[n - 1] } else { 0. };
    let mut cursor = 0;
    let mut previous = ring[n - 1];
    let (mut ap_x, mut ap_y, mut last, mut dc, mut peak) = (start, start, 0., 0., 0f64);
    let dc_pole = (-2. * PI * 10. / sr).exp();
    let r = (-1. / (sr * 0.045)).exp();
    let c = 2. * r * (2. * PI * 185. / sr).cos();
    let (mut b1, mut b2) = (0., 0.);
    let mut modes = [Mode::default(); 3];
    if resonance > 0. {
        for (m, p) in modes.iter_mut().zip(
            PROFILES[if settings.body_type < 4 {
                settings.body_type as usize
            } else {
                0
            }],
        ) {
            let f = (sr * 0.4).min(p[0]);
            let r = (-1. / (sr * p[1])).exp();
            *m = Mode {
                weight: p[2],
                c: 2. * r * (2. * PI * f / sr).cos(),
                r2: r * r,
                b: (1. - r * r) / 2.,
                ..Mode::default()
            };
        }
    }
    let (mut body_x1, mut body_x2) = (0., 0.);
    let length = out.len();
    for (i, value) in out.iter_mut().enumerate() {
        let x = ring[cursor];
        let low = (1. - mix) * x + mix * previous;
        previous = x;
        let allpass = if fraction < 1e-9 {
            low
        } else {
            a * low + ap_x - a * ap_y
        };
        ap_x = low;
        ap_y = allpass;
        ring[cursor] = allpass * feedback;
        cursor = (cursor + 1) % n;
        let resonant = (1. - r) * x + c * b1 - r * r * b2;
        b2 = b1;
        b1 = resonant;
        let mut colour = 0.;
        if resonance > 0. {
            for m in &mut modes {
                let y = m.b * (x - body_x2) + m.c * m.y1 - m.r2 * m.y2;
                m.y2 = m.y1;
                m.y1 = y;
                colour += m.weight * y;
            }
        }
        body_x2 = body_x1;
        body_x1 = x;
        let raw = if resonance > 0. {
            x + body * ((1. - resonance) * 0.35 * resonant + resonance * 0.7 * colour)
        } else {
            x + body * 0.35 * resonant
        };
        dc = raw - last + dc_pole * dc;
        last = raw;
        let edge = 1f64
            .min(i as f64 / (sr * (0.0015 + softness * 0.004)))
            .min((length - 1 - i) as f64 / (sr * 0.02));
        *value = (dc * edge.max(0.)) as f32;
        peak = peak.max(value.abs() as f64);
    }
    if peak > 0. {
        let scale = 0.7 / peak;
        for value in &mut out {
            *value = (*value as f64 * scale) as f32;
        }
    }
    out
}
pub struct Engine {
    pub samples: Vec<f32>,
    output: [[f32; MAX_BLOCK]; 2],
    cursor: u64,
}
impl Engine {
    pub fn new(rate: f64, frequency: f64, settings: Settings) -> Box<Self> {
        Box::new(Self {
            samples: prepare(rate, frequency, settings),
            output: [[0.; MAX_BLOCK]; 2],
            cursor: 0,
        })
    }
    pub fn render(&mut self, frames: usize) -> bool {
        if frames > MAX_BLOCK {
            return false;
        }
        for i in 0..frames {
            let frame = self.cursor.saturating_add(i as u64);
            let value = if frame < self.samples.len() as u64 {
                self.samples[frame as usize]
            } else {
                0.
            };
            self.output[0][i] = value;
            self.output[1][i] = value;
        }
        self.cursor = self.cursor.saturating_add(frames as u64);
        true
    }
    pub fn reset(&mut self) {
        self.cursor = 0;
        self.output.fill([0.; MAX_BLOCK]);
    }
    pub fn output(&self, ch: usize) -> &[f32] {
        &self.output[ch.min(1)]
    }
}
#[no_mangle]
pub extern "C" fn string_owned_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn string_owned_new(
    rate: f64,
    frequency: f64,
    decay: f64,
    damping: f64,
    position: f64,
    body: f64,
    resonance: f64,
    body_type: u32,
    seed: u32,
    softness: f64,
) -> *mut Engine {
    if !rate.is_finite()
        || !(8000. ..=192000.).contains(&rate)
        || !frequency.is_finite()
        || !(10. ..=rate / 6.).contains(&frequency)
        || body_type > 3
        || ![decay, damping, position, body, resonance, softness]
            .iter()
            .all(|v| v.is_finite())
        || !(0.15..=5.).contains(&decay)
        || !(0.05..=0.45).contains(&position)
        || ![damping, body, resonance, softness]
            .iter()
            .all(|v| (0. ..=1.).contains(v))
    {
        return std::ptr::null_mut();
    }
    Box::into_raw(Engine::new(
        rate,
        frequency,
        Settings {
            decay,
            damping,
            position,
            body,
            resonance,
            body_type,
            seed,
            softness,
        },
    ))
}
#[no_mangle]
pub unsafe extern "C" fn string_owned_free(p: *mut Engine) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub unsafe extern "C" fn string_owned_samples(p: *const Engine) -> *const f32 {
    p.as_ref().map_or(std::ptr::null(), |p| p.samples.as_ptr())
}
#[no_mangle]
pub unsafe extern "C" fn string_owned_len(p: *const Engine) -> u32 {
    p.as_ref().map_or(0, |p| p.samples.len() as u32)
}
#[no_mangle]
pub unsafe extern "C" fn string_owned_output(p: *const Engine, ch: u32) -> *const f32 {
    p.as_ref()
        .map_or(std::ptr::null(), |p| p.output(ch as usize).as_ptr())
}
#[no_mangle]
pub unsafe extern "C" fn string_owned_render(p: *mut Engine, frames: u32) -> u32 {
    p.as_mut().is_some_and(|p| p.render(frames as usize)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_owned_reset(p: *mut Engine) {
    if let Some(p) = p.as_mut() {
        p.reset();
    }
}
#[no_mangle]
pub unsafe extern "C" fn string_owned_frame(p: *const Engine) -> f64 {
    p.as_ref().map_or(0., |p| p.cursor as f64)
}

#[cfg(feature = "allocation-audit")]
mod allocation {
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    static WATCH: AtomicBool = AtomicBool::new(false);
    static COUNT: AtomicU32 = AtomicU32::new(0);
    struct Audit;
    fn tick() {
        if WATCH.load(Ordering::Relaxed) {
            COUNT.fetch_add(1, Ordering::Relaxed);
        }
    }
    unsafe impl GlobalAlloc for Audit {
        unsafe fn alloc(&self, l: Layout) -> *mut u8 {
            tick();
            System.alloc(l)
        }
        unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
            tick();
            System.dealloc(p, l)
        }
        unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
            tick();
            System.realloc(p, l, n)
        }
        unsafe fn alloc_zeroed(&self, l: Layout) -> *mut u8 {
            tick();
            System.alloc_zeroed(l)
        }
    }
    #[global_allocator]
    static ALLOC: Audit = Audit;
    #[no_mangle]
    pub extern "C" fn string_alloc_watch(on: u32) {
        COUNT.store(0, Ordering::Relaxed);
        WATCH.store(on != 0, Ordering::Relaxed);
    }
    #[no_mangle]
    pub extern "C" fn string_alloc_count() -> u32 {
        COUNT.load(Ordering::Relaxed)
    }
}
