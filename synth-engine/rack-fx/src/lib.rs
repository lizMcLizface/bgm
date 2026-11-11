//! Owned ports of the existing rack-crusher, rack-pitch and rack-zplane JS
//! AudioWorklet DSP. Original k-rate callback semantics and f64 arithmetic remain.
//! No mutable singleton, browser dependency, or render-time allocation.
use std::f64::consts::PI;
pub const BLOCK: usize = 2048;
pub const SECTIONS: usize = 12;
pub const MAX_SHAPES: usize = 64;
const POINTS: usize = 40;
const SIZE: usize = 1 << 15;
pub type Rows = [[f64; 3]; SECTIONS];

#[derive(Clone, Copy, PartialEq)]
#[repr(u32)]
pub enum Kind {
    Crusher = 1,
    Pitch = 2,
    ZPlane = 3,
}
impl Kind {
    pub fn from_code(code: u32) -> Option<Self> {
        match code {
            1 => Some(Self::Crusher),
            2 => Some(Self::Pitch),
            3 => Some(Self::ZPlane),
            _ => None,
        }
    }
    pub fn bounds(self, index: usize) -> Option<(f64, f64)> {
        let list: &[(f64, f64)] = match self {
            Self::Crusher => &[(2., 16.), (1., 32.), (0., 1.)],
            Self::Pitch => &[(-24., 24.), (-50., 50.), (0., 1.)],
            Self::ZPlane => &[
                (0., 63.),
                (0., 63.),
                (0., 1.),
                (-1., 1.),
                (0., 1.),
                (0., 1.),
            ],
        };
        list.get(index).copied()
    }
}
fn js_round(x: f64) -> f64 {
    if x == 0. {
        return x;
    }
    // Comparing the fraction avoids rounding x+0.5 up at a near-half value.
    // JS rounds negative ties toward +infinity and preserves negative zero.
    let low = x.floor();
    let n = if x - low < 0.5 { low } else { low + 1. };
    if n == 0. && x < 0. {
        -0.
    } else {
        n
    }
}
fn valid_row(row: [f64; 3]) -> bool {
    row.iter().all(|v| v.is_finite())
        && (20. ..=12000.).contains(&row[0])
        && (8. ..=8000.).contains(&row[1])
        && (-30. ..=30.).contains(&row[2])
}

pub struct Engine {
    kind: Kind,
    rate: f64,
    ready: bool,
    p: [f64; 6],
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
    frame: u64,
    peak: f64,
    // Crusher state. JS retains its quantized sample in Number precision.
    held: [f64; 2],
    count: usize,
    // Pitch's only large allocation; non-pitch engines leave it empty.
    ring: Vec<[f32; 2]>,
    write: u64,
    window: f64,
    delay: [f64; 2],
    // Immutable built-ins plus two side-specific mutable custom shapes.
    shape_count: usize,
    shapes: [Rows; MAX_SHAPES + 2],
    populated: [u16; MAX_SHAPES + 2],
    coef: [[f64; 5]; SECTIONS],
    state: [[[f64; 2]; SECTIONS]; 2],
    gain: f64,
    used: [usize; SECTIONS],
    used_count: usize,
    last: [f64; 5],
    points: [f64; POINTS],
}
impl Engine {
    pub fn new(kind: Kind, rate: f64) -> Option<Box<Self>> {
        if !rate.is_finite() || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        let window = js_round(0.05 * rate);
        let p = match kind {
            Kind::Crusher => [8., 1., 1., 0., 0., 0.],
            Kind::Pitch => [-12., 0., 0.5, 0., 0., 0.],
            Kind::ZPlane => [0., 2., 0., 0., 0.5, 1.],
        };
        let mut points = [0.; POINTS];
        for (i, w) in points.iter_mut().enumerate() {
            *w = 2.
                * PI
                * (0.45 * rate).min(60. * (10000f64 / 60.).powf(i as f64 / (POINTS - 1) as f64))
                / rate;
        }
        Some(Box::new(Self {
            kind,
            rate,
            ready: false,
            p,
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
            frame: 0,
            peak: 0.,
            held: [0.; 2],
            count: 0,
            ring: if kind == Kind::Pitch {
                vec![[0.; 2]; SIZE]
            } else {
                Vec::new()
            },
            write: 0,
            window,
            delay: [0., window / 2.],
            shape_count: 0,
            shapes: [[[0.; 3]; SECTIONS]; MAX_SHAPES + 2],
            populated: [0; MAX_SHAPES + 2],
            coef: [[0.; 5]; SECTIONS],
            state: [[[0.; 2]; SECTIONS]; 2],
            gain: 1.,
            used: [0; SECTIONS],
            used_count: 0,
            last: [f64::NAN; 5],
            points,
        }))
    }
    pub fn kind(&self) -> Kind {
        self.kind
    }
    pub fn param(&mut self, index: usize, value: f64) -> bool {
        let Some((lo, hi)) = self.kind.bounds(index) else {
            return false;
        };
        if !value.is_finite() || value < lo || value > hi {
            return false;
        }
        // Web Audio k-rate AudioParam buffers contain Float32 samples.
        self.p[index] = value as f32 as f64;
        true
    }
    pub fn parameters(&self) -> [f64; 6] {
        self.p
    }
    pub fn shape_count(&mut self, count: usize) -> bool {
        if self.kind != Kind::ZPlane
            || self.ready
            || self.shape_count != 0
            || !(1..=MAX_SHAPES).contains(&count)
        {
            return false;
        }
        self.shape_count = count;
        true
    }
    pub fn shape_row(&mut self, shape: usize, section: usize, row: [f64; 3]) -> bool {
        if self.kind != Kind::ZPlane
            || shape >= MAX_SHAPES + 2
            || section >= SECTIONS
            || !valid_row(row)
            || self.ready && shape < MAX_SHAPES
            || shape < MAX_SHAPES && shape >= self.shape_count
        {
            return false;
        }
        self.shapes[shape][section] = row;
        self.populated[shape] |= 1 << section;
        self.last = [f64::NAN; 5];
        true
    }
    /// Nonmutating readiness check for a host preparing several owned units.
    pub fn can_prepare(&self) -> bool {
        if self.ready
            || self.kind == Kind::ZPlane
                && (self.shape_count == 0
                    || (0..self.shape_count)
                        .chain(MAX_SHAPES..MAX_SHAPES + 2)
                        .any(|i| self.populated[i] != (1 << SECTIONS) - 1))
        {
            return false;
        }
        true
    }
    pub fn prepare(&mut self) -> bool {
        if !self.can_prepare() { return false; }
        self.ready = true;
        true
    }
    pub fn input_mut(&mut self, channel: usize) -> Option<&mut [f32; BLOCK]> {
        self.input.get_mut(channel)
    }
    pub fn output(&self, channel: usize) -> Option<&[f32; BLOCK]> {
        self.output.get(channel)
    }
    fn zplane_update(&mut self, now: [f64; 5]) {
        let a = now[0] as usize;
        let b = now[1] as usize;
        let morph = now[2];
        let shift = now[3];
        let q = now[4];
        let aa = if a >= self.shape_count { MAX_SHAPES } else { a };
        let bb = if b >= self.shape_count {
            MAX_SHAPES + 1
        } else {
            b
        };
        let widen = 9f64.powf(0.5 - q);
        let octave = 2f64.powf(shift);
        let nyquist = 0.45 * self.rate;
        self.used_count = 0;
        for s in 0..SECTIONS {
            let [fa, wa, da] = self.shapes[aa][s];
            let [fb, wb, db] = self.shapes[bb][s];
            let frequency =
                ((fa.ln() * (1. - morph) + fb.ln() * morph).exp() * octave).clamp(20., nyquist);
            let bandwidth =
                ((wa.ln() * (1. - morph) + wb.ln() * morph).exp() * widen).clamp(8., 8000.);
            let boost = (da + (db - da) * morph).clamp(-30., 30.);
            if boost.abs() >= 0.05 {
                self.used[self.used_count] = s;
                self.used_count += 1;
            }
            let zero_bandwidth = (bandwidth * 10f64.powf(boost / 20.)).clamp(1., 20000.);
            let theta = 2. * PI * frequency / self.rate;
            let c = theta.cos();
            let rp = (-PI * bandwidth / self.rate).exp().min(0.9995);
            let rz = (-PI * zero_bandwidth / self.rate).exp().min(0.9995);
            self.coef[s] = [1., -2. * rz * c, rz * rz, -2. * rp * c, rp * rp];
        }
        let mut total = 0.;
        for w in self.points {
            let cw = w.cos();
            let sw = w.sin();
            let c2 = (2. * w).cos();
            let s2 = (2. * w).sin();
            let mut db = 0.;
            for &s in &self.used[..self.used_count] {
                let c = self.coef[s];
                let nr = c[0] + c[1] * cw + c[2] * c2;
                let ni = -(c[1] * sw + c[2] * s2);
                let dr = 1. + c[3] * cw + c[4] * c2;
                let di = -(c[3] * sw + c[4] * s2);
                db += 10. * ((nr * nr + ni * ni + 1e-20) / (dr * dr + di * di + 1e-20)).log10();
            }
            total += db;
        }
        self.gain = 10f64.powf(-total / POINTS as f64 / 20.);
    }
    fn pitch_read(&self, ch: usize, delay: f64) -> f64 {
        let at = self.write as f64 - delay;
        let i = at.floor();
        let f = at - i;
        let a = (i as i64 & (SIZE as i64 - 1)) as usize;
        let b = ((i as i64 + 1) & (SIZE as i64 - 1)) as usize;
        self.ring[a][ch] as f64 * (1. - f) + self.ring[b][ch] as f64 * f
    }
    pub fn render(&mut self, frames: usize) -> bool {
        if !self.ready || frames > BLOCK {
            return false;
        }
        self.peak = 0.;
        match self.kind {
            Kind::Crusher => {
                let levels = 2f64.powf(js_round(self.p[0]) - 1.);
                let divide = js_round(self.p[1]).max(1.) as usize;
                let mix = self.p[2];
                for i in 0..frames {
                    if self.count == 0 {
                        for ch in 0..2 {
                            self.held[ch] = js_round(self.input[ch][i] as f64 * levels) / levels;
                        }
                    }
                    self.count = (self.count + 1) % divide;
                    for ch in 0..2 {
                        self.output[ch][i] =
                            (self.input[ch][i] as f64 * (1. - mix) + self.held[ch] * mix) as f32;
                    }
                }
            }
            Kind::Pitch => {
                let ratio = 2f64.powf((self.p[0] + self.p[1] / 100.) / 12.);
                let mix = self.p[2];
                for i in 0..frames {
                    let a = (PI * self.delay[0] / self.window).sin();
                    let b = (PI * self.delay[1] / self.window).sin();
                    let g0 = a * a;
                    let g1 = b * b;
                    for ch in 0..2 {
                        let dry = self.input[ch][i] as f64;
                        self.ring[self.write as usize & (SIZE - 1)][ch] = dry as f32;
                        let wet = self.pitch_read(ch, self.delay[0] + 1.) * g0
                            + self.pitch_read(ch, self.delay[1] + 1.) * g1;
                        self.output[ch][i] = (dry * (1. - mix) + wet * mix) as f32;
                    }
                    self.write = self.write.wrapping_add(1);
                    for d in &mut self.delay {
                        *d += 1. - ratio;
                        if *d >= self.window {
                            *d -= self.window;
                        } else if *d < 0. {
                            *d += self.window;
                        }
                    }
                }
            }
            Kind::ZPlane => {
                let now = [
                    js_round(self.p[0]),
                    js_round(self.p[1]),
                    self.p[2],
                    self.p[3],
                    self.p[4],
                ];
                if now.iter().zip(&self.last).any(|(a, b)| a != b) {
                    self.zplane_update(now);
                    self.last = now;
                }
                let mix = self.p[5];
                for ch in 0..2 {
                    for i in 0..frames {
                        let dry = self.input[ch][i] as f64;
                        let mut x = dry;
                        for &s in &self.used[..self.used_count] {
                            let c = self.coef[s];
                            let st = &mut self.state[ch][s];
                            let y = c[0] * x + st[0];
                            st[0] = c[1] * x - c[3] * y + st[1];
                            st[1] = c[2] * x - c[4] * y;
                            if st[0] < 1e-20 && st[0] > -1e-20 {
                                st[0] = 0.;
                            }
                            if st[1] < 1e-20 && st[1] > -1e-20 {
                                st[1] = 0.;
                            }
                            x = y;
                        }
                        self.output[ch][i] = (dry * (1. - mix) + x * self.gain * mix) as f32;
                    }
                }
            }
        }
        self.frame += frames as u64;
        for ch in 0..2 {
            for &x in &self.output[ch][..frames] {
                self.peak = self.peak.max(x.abs() as f64);
            }
        }
        true
    }
    /// Clear owned DSP history and restart its modulation; controls/shapes remain.
    /// The original worklet has no clear message; this is an explicit new API.
    pub fn clear(&mut self) {
        self.held = [0.; 2];
        self.count = 0;
        self.ring.fill([0.; 2]);
        self.write = 0;
        self.delay = [0., self.window / 2.];
        self.state = [[[0.; 2]; SECTIONS]; 2];
        self.last = [f64::NAN; 5];
        self.gain = 1.;
        self.used_count = 0;
        self.output.iter_mut().for_each(|b| b.fill(0.));
        self.peak = 0.;
    }
    pub fn reset(&mut self) {
        self.clear();
        self.frame = 0;
        self.input.iter_mut().for_each(|b| b.fill(0.));
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.peak,
            1 => self.frame as f64,
            2 => self.used_count as f64,
            3 => {
                if self.kind == Kind::Pitch {
                    self.window
                } else {
                    0.
                }
            }
            4 => self.kind as u32 as f64,
            _ => 0.,
        }
    }
}

#[no_mangle]
pub extern "C" fn rack_fx_owned_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_new(kind: u32, rate: f64) -> *mut Engine {
    Kind::from_code(kind)
        .and_then(|k| Engine::new(k, rate))
        .map_or(std::ptr::null_mut(), Box::into_raw)
}
#[no_mangle]
pub unsafe extern "C" fn rack_fx_owned_free(e: *mut Engine) {
    if !e.is_null() {
        drop(Box::from_raw(e));
    }
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_param(e: &mut Engine, index: usize, value: f64) -> u32 {
    e.param(index, value) as u32
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_shape_count(e: &mut Engine, count: usize) -> u32 {
    e.shape_count(count) as u32
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_shape_row(
    e: &mut Engine,
    shape: usize,
    section: usize,
    frequency: f64,
    bandwidth: f64,
    boost: f64,
) -> u32 {
    e.shape_row(shape, section, [frequency, bandwidth, boost]) as u32
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_prepare(e: &mut Engine) -> u32 {
    e.prepare() as u32
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_input(e: &mut Engine, ch: usize) -> *mut f32 {
    e.input_mut(ch)
        .map_or(std::ptr::null_mut(), |b| b.as_mut_ptr())
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_output(e: &Engine, ch: usize) -> *const f32 {
    e.output(ch).map_or(std::ptr::null(), |b| b.as_ptr())
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_render(e: &mut Engine, frames: usize) -> u32 {
    e.render(frames) as u32
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_clear(e: &mut Engine) {
    e.clear();
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_reset(e: &mut Engine) {
    e.reset();
}
#[no_mangle]
pub extern "C" fn rack_fx_owned_stat(e: &Engine, index: u32) -> f64 {
    e.stat(index)
}

#[cfg(feature = "allocation-audit")]
mod allocation {
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    struct Counting;
    static WATCH: AtomicBool = AtomicBool::new(false);
    static COUNT: AtomicUsize = AtomicUsize::new(0);
    unsafe impl GlobalAlloc for Counting {
        unsafe fn alloc(&self, l: Layout) -> *mut u8 {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.alloc(l)
        }
        unsafe fn alloc_zeroed(&self, l: Layout) -> *mut u8 {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.alloc_zeroed(l)
        }
        unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.realloc(p, l, n)
        }
        unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.dealloc(p, l)
        }
    }
    #[global_allocator]
    static ALLOCATOR: Counting = Counting;
    #[no_mangle]
    pub extern "C" fn rack_fx_owned_alloc_watch(w: u32) {
        COUNT.store(0, Ordering::Relaxed);
        WATCH.store(w != 0, Ordering::Relaxed);
    }
    #[no_mangle]
    pub extern "C" fn rack_fx_owned_alloc_count() -> usize {
        COUNT.load(Ordering::Relaxed)
    }
}
