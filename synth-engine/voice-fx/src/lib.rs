//! Owned ports of the actual Shimmer/Freeze DSP in public/space-processor.js.
//! No native Tape/Motion approximation, mutable singleton or browser callback.
//! Freeze owns an explicitly versioned seeded random stream; parity uses the
//! same stream injected into the original worklet, not its unseeded default.
use std::f64::consts::PI;
pub const BLOCK: usize = 2048;
pub const MAX_PREPARED_BYTES: usize = 32 * 1024 * 1024;
const GRAINS: usize = 4;
const SHIFT: usize = 8192;
const TINY: f64 = 1e-18;
#[derive(Clone, Copy, PartialEq)]
#[repr(u32)]
pub enum Kind {
    Shimmer = 1,
    Freeze = 2,
}
impl Kind {
    pub fn from_code(code: u32) -> Option<Self> {
        match code {
            1 => Some(Self::Shimmer),
            2 => Some(Self::Freeze),
            _ => None,
        }
    }
    pub fn bounds(self, index: usize) -> Option<(f64, f64)> {
        let bounds: &[(f64, f64)] = match self {
            Self::Shimmer => &[(0., 1.), (0.3, 30.), (0., 24.), (0., 0.95), (500., 16000.)],
            Self::Freeze => &[(0., 1.), (0., 1.), (0.25, 4.), (0.02, 30.)],
        };
        bounds.get(index).copied()
    }
}
fn round(x: f64) -> usize {
    let low = x.floor();
    (if x - low < 0.5 { low } else { low + 1. }) as usize
}
struct Random {
    initial: u32,
    state: u32,
    draws: u64,
}
impl Random {
    fn next(&mut self) -> f64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        self.draws += 1;
        x as f64 / 4294967296.
    }
    fn reset(&mut self) {
        self.state = self.initial;
        self.draws = 0;
    }
}
struct Diffuser {
    buffer: Vec<f32>,
    at: usize,
}
struct Shimmer {
    rate: f64,
    mix: f64,
    climb: f64,
    lines: [Vec<f32>; 4],
    pos: [usize; 4],
    lp: [f64; 4],
    gains: [f64; 4],
    damp: f64,
    step: f64,
    diffusers: [Diffuser; 2],
    window: f64,
    shift: Vec<f32>,
    shift_write: usize,
    phase: f64,
    hp: f64,
    hp_in: f64,
    energy: f64,
}
impl Shimmer {
    fn new(rate: f64) -> Self {
        let mut s = Self {
            rate,
            mix: 0.,
            climb: 0.5,
            lines: [47.3, 59.9, 71.1, 83.3].map(|ms| vec![0.; round(ms * rate / 1000.)]),
            pos: [0; 4],
            lp: [0.; 4],
            gains: [0.; 4],
            damp: 0.,
            step: 0.,
            diffusers: [4.7, 11.3].map(|ms| Diffuser {
                buffer: vec![0.; round(ms * rate / 1000.)],
                at: 0,
            }),
            window: round(0.06 * rate) as f64,
            shift: vec![0.; SHIFT],
            shift_write: 0,
            phase: 0.,
            hp: 0.,
            hp_in: 0.,
            energy: 0.,
        };
        s.set([0., 6., 12., 0.5, 7000.]);
        s
    }
    fn set(&mut self, p: [f64; 5]) {
        self.mix = p[0];
        self.climb = p[3];
        for k in 0..4 {
            self.gains[k] =
                10f64.powf(-3. * self.lines[k].len() as f64 / (p[1].max(0.3) * self.rate));
        }
        self.damp = 1. - (-2. * PI * p[4].clamp(500., 16000.) / self.rate).exp();
        self.step = (2f64.powf(p[2] / 12.) - 1.) / self.window;
    }
    fn tap(&self, delay: f64) -> f64 {
        let size = self.shift.len();
        let mut r = self.shift_write as f64 - delay;
        while r < 0. {
            r += size as f64;
        }
        let i = r.floor() as usize;
        let f = r - i as f64;
        self.shift[i % size] as f64 * (1. - f) + self.shift[(i + 1) % size] as f64 * f
    }
    fn clear(&mut self) {
        self.lines.iter_mut().for_each(|l| l.fill(0.));
        self.diffusers.iter_mut().for_each(|d| d.buffer.fill(0.));
        self.shift.fill(0.);
        self.lp.fill(0.);
        self.hp = 0.;
        self.hp_in = 0.;
        self.energy = 0.;
    }
    fn reset(&mut self) {
        self.clear();
        self.pos = [0; 4];
        for d in &mut self.diffusers {
            d.at = 0;
        }
        self.shift_write = 0;
        self.phase = 0.;
    }
    fn process(&mut self, input: &[[f32; BLOCK]; 2], out: &mut [[f32; BLOCK]; 2], frames: usize) {
        let mut loud = 0.;
        for &v in &input[0][..frames] {
            loud += (v as f64).abs();
        }
        // Preserve the original left-only sleep scan, including right-only input.
        if loud == 0. && self.energy < 1e-7 {
            for ch in 0..2 {
                out[ch][..frames].copy_from_slice(&input[ch][..frames]);
            }
            return;
        }
        let mut energy = 0.;
        for i in 0..frames {
            let dry_l = input[0][i] as f64;
            let dry_r = input[1][i] as f64;
            self.phase -= self.step;
            if self.phase < 0. {
                self.phase += 1.;
            }
            let p2 = (self.phase + 0.5) % 1.;
            let shifted = self.tap(self.phase * self.window + 1.) * (PI * self.phase).sin()
                + self.tap(p2 * self.window + 1.) * (PI * p2).sin();
            let hp = 0.985 * (self.hp + shifted - self.hp_in);
            self.hp_in = shifted;
            self.hp = hp;
            let climbed = (hp / 1.2).tanh();
            let c = self.climb * 0.8;
            let keep = (1. - c * c).sqrt();
            let mut u = (dry_l + dry_r) * 0.25;
            for d in &mut self.diffusers {
                let delayed = d.buffer[d.at] as f64;
                let v = u + 0.6 * delayed;
                d.buffer[d.at] = v as f32;
                d.at = (d.at + 1) % d.buffer.len();
                u = delayed - 0.6 * v;
            }
            let mut sum = 0.;
            for k in 0..4 {
                self.lp[k] += self.damp * (self.lines[k][self.pos[k]] as f64 - self.lp[k]) + TINY;
                sum += self.lp[k];
            }
            let half = sum * 0.5;
            for k in 0..4 {
                self.lines[k][self.pos[k]] =
                    (self.gains[k] * (keep * (self.lp[k] - half) + c * climbed) + u) as f32;
                self.pos[k] = (self.pos[k] + 1) % self.lines[k].len();
            }
            let wet_l = (self.lp[0] + self.lp[2]) * 0.6;
            let wet_r = (self.lp[1] + self.lp[3]) * 0.6;
            self.shift[self.shift_write] = ((wet_l + wet_r) * 0.5) as f32;
            self.shift_write = (self.shift_write + 1) % self.shift.len();
            energy += wet_l.abs() + wet_r.abs();
            out[0][i] = (dry_l + wet_l * self.mix) as f32;
            out[1][i] = (dry_r + wet_r * self.mix) as f32;
        }
        self.energy = energy / frames as f64;
    }
}
#[derive(Clone, Copy, Default)]
struct Grain {
    start: usize,
    t: usize,
    size: usize,
}
struct Cloud {
    audio: [Vec<f32>; 2],
    length: usize,
    level: f64,
    target: f64,
    grains: [Grain; GRAINS],
    grain_count: usize,
}
impl Cloud {
    fn new(rate: usize) -> Self {
        Self {
            audio: std::array::from_fn(|_| vec![0.; 4 * rate]),
            length: 0,
            level: 0.,
            target: 0.,
            grains: [Grain::default(); GRAINS],
            grain_count: 0,
        }
    }
}
struct Freeze {
    rate: f64,
    mix: f64,
    hold: bool,
    length: f64,
    fade: f64,
    ring: [Vec<f32>; 2],
    write: usize,
    clouds: [Cloud; 2],
    current: Option<usize>,
    waiting: bool,
    retry: i64,
    waited: usize,
    captures: u64,
}
impl Freeze {
    fn new(rate: f64) -> Self {
        Self {
            rate,
            mix: 0.,
            hold: false,
            length: 2.,
            fade: 1.,
            ring: std::array::from_fn(|_| vec![0.; (4.5 * rate).ceil() as usize]),
            write: 0,
            clouds: std::array::from_fn(|_| Cloud::new(rate as usize)),
            current: None,
            waiting: false,
            retry: 0,
            waited: 0,
            captures: 0,
        }
    }
    fn set(&mut self, p: [f64; 5]) {
        let hold = p[1] != 0.;
        let rising = hold && !self.hold;
        self.mix = p[0];
        self.hold = hold;
        self.length = p[2].clamp(0.25, 4.);
        self.fade = p[3].max(0.02);
        if rising {
            self.waiting = true;
            self.waited = 0;
            self.retry = 0;
        }
        if !self.hold {
            self.waiting = false;
            for c in &mut self.clouds {
                c.target = 0.;
            }
            self.current = None;
        }
    }
    fn clear(&mut self) {
        for c in &mut self.clouds {
            c.level = 0.;
            c.target = 0.;
            c.length = 0;
        }
        self.current = None;
        self.waiting = self.hold;
    }
    fn reset(&mut self) {
        for r in &mut self.ring {
            r.fill(0.);
        }
        for c in &mut self.clouds {
            for a in &mut c.audio {
                a.fill(0.);
            }
            c.level = 0.;
            c.target = 0.;
            c.length = 0;
            c.grain_count = 0;
            c.grains = [Grain::default(); GRAINS];
        }
        self.write = 0;
        self.current = None;
        self.waiting = self.hold;
        self.retry = 0;
        self.waited = 0;
        self.captures = 0;
    }
    fn capture(&mut self, rng: &mut Random) -> bool {
        let n = round(self.length * self.rate);
        let size = self.ring[0].len();
        let index = (0..2)
            .find(|i| Some(*i) != self.current && self.clouds[*i].level < 0.001)
            .or_else(|| (0..2).find(|i| Some(*i) != self.current))
            .unwrap();
        let mut quarters = [0.; 4];
        for ch in 0..2 {
            for i in 0..n {
                let x = self.ring[ch][(self.write + size - n + i) % size];
                self.clouds[index].audio[ch][i] = x;
                quarters[(4 * i / n).min(3)] += (x as f64) * (x as f64);
            }
        }
        let floor = 1e-8 * n as f64 / 2.;
        if quarters.iter().any(|q| *q < floor)
            && !(self.waited > 8 && quarters.iter().any(|q| *q >= floor))
        {
            return false;
        }
        let cloud = &mut self.clouds[index];
        cloud.length = n;
        let grain = round(0.5 * n as f64).min(round(0.8 * self.rate)).max(64);
        for g in 0..GRAINS {
            cloud.grains[g] = Grain {
                start: (rng.next() * (n - grain) as f64).floor() as usize,
                t: g * grain / GRAINS,
                size: grain,
            };
        }
        cloud.grain_count = GRAINS;
        cloud.target = 1.;
        if let Some(old) = self.current {
            self.clouds[old].target = 0.;
        }
        self.current = Some(index);
        self.captures += 1;
        true
    }
    fn process(
        &mut self,
        input: &[[f32; BLOCK]; 2],
        out: &mut [[f32; BLOCK]; 2],
        frames: usize,
        rng: &mut Random,
    ) {
        let size = self.ring[0].len();
        for i in 0..frames {
            self.ring[0][self.write] = input[0][i];
            self.ring[1][self.write] = input[1][i];
            self.write = (self.write + 1) % size;
        }
        if self.waiting {
            self.retry -= 1;
            if self.retry <= 0 {
                self.retry = round(0.25 * self.rate / frames as f64) as i64;
                self.waited += 1;
                if self.capture(rng) {
                    self.waiting = false;
                    self.waited = 0;
                }
            }
        }
        let coef = 1. - (-1. / (self.fade * self.rate / 3.)).exp();
        for i in 0..frames {
            let mut l = 0.;
            let mut r = 0.;
            for c in &mut self.clouds {
                if c.level < 1e-5 && c.target == 0. {
                    c.level = 0.;
                    continue;
                }
                c.level += (c.target - c.level) * coef;
                let mut gl = 0.;
                let mut gr = 0.;
                for g in &mut c.grains[..c.grain_count] {
                    let w = 0.5 - 0.5 * (2. * PI * g.t as f64 / g.size as f64).cos();
                    let at = g.start + g.t;
                    gl += c.audio[0][at] as f64 * w;
                    gr += c.audio[1][at] as f64 * w;
                    g.t += 1;
                    if g.t >= g.size {
                        g.t = 0;
                        g.start = (rng.next() * (c.length - g.size) as f64).floor() as usize;
                    }
                }
                l += gl * 0.5 * c.level;
                r += gr * 0.5 * c.level;
            }
            out[0][i] = (input[0][i] as f64 + l * self.mix) as f32;
            out[1][i] = (input[1][i] as f64 + r * self.mix) as f32;
        }
    }
}
enum Dsp {
    Shimmer(Shimmer),
    Freeze(Freeze),
}
pub struct Engine {
    dsp: Dsp,
    p: [f64; 5],
    kind: Kind,
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
    frame: u64,
    peak: f64,
    rng: Random,
}
impl Engine {
    pub fn required_bytes(kind: Kind, rate: f64) -> Option<usize> {
        if !rate.is_finite() || rate.fract() != 0. || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        let n = rate as usize;
        Some(
            std::mem::size_of::<Self>()
                + match kind {
                    Kind::Freeze => ((4.5 * rate).ceil() as usize * 2 + 4 * n * 4) * 4,
                    Kind::Shimmer => {
                        [47.3, 59.9, 71.1, 83.3, 4.7, 11.3]
                            .iter()
                            .map(|ms| round(ms * rate / 1000.) * 4)
                            .sum::<usize>()
                            + SHIFT * 4
                    }
                },
        )
    }
    pub fn new(kind: Kind, rate: f64, seed: u32) -> Option<Box<Self>> {
        if seed == 0 || Self::required_bytes(kind, rate)? > MAX_PREPARED_BYTES {
            return None;
        }
        let dsp = match kind {
            Kind::Shimmer => Dsp::Shimmer(Shimmer::new(rate)),
            Kind::Freeze => Dsp::Freeze(Freeze::new(rate)),
        };
        let p = match kind {
            Kind::Shimmer => [0., 6., 12., 0.5, 7000.],
            Kind::Freeze => [0., 0., 2., 1., 0.],
        };
        Some(Box::new(Self {
            dsp,
            p,
            kind,
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
            frame: 0,
            peak: 0.,
            rng: Random {
                initial: seed,
                state: seed,
                draws: 0,
            },
        }))
    }
    pub fn param(&mut self, index: usize, value: f64) -> bool {
        let Some((lo, hi)) = self.kind.bounds(index) else {
            return false;
        };
        if !value.is_finite()
            || value < lo
            || value > hi
            || self.kind == Kind::Freeze && index == 1 && value != 0. && value != 1.
        {
            return false;
        }
        self.p[index] = value;
        match &mut self.dsp {
            Dsp::Shimmer(d) => d.set(self.p),
            Dsp::Freeze(d) => d.set(self.p),
        }
        true
    }
    pub fn parameters(&self) -> [f64; 5] {
        self.p
    }
    pub fn input_mut(&mut self, ch: usize) -> Option<&mut [f32; BLOCK]> {
        self.input.get_mut(ch)
    }
    pub fn output(&self, ch: usize) -> Option<&[f32; BLOCK]> {
        self.output.get(ch)
    }
    pub fn render(&mut self, frames: usize) -> bool {
        if frames > BLOCK {
            return false;
        }
        if frames == 0 {
            return true;
        }
        match &mut self.dsp {
            Dsp::Shimmer(d) => d.process(&self.input, &mut self.output, frames),
            Dsp::Freeze(d) => d.process(&self.input, &mut self.output, frames, &mut self.rng),
        }
        self.frame += frames as u64;
        self.peak = 0.;
        for ch in 0..2 {
            for &v in &self.output[ch][..frames] {
                self.peak = self.peak.max(v.abs() as f64);
            }
        }
        true
    }
    /// Preserve the original clear-message policy, including Freeze recording,
    /// retry clocks and random stream and Shimmer line/modulation positions.
    pub fn clear(&mut self) {
        match &mut self.dsp {
            Dsp::Shimmer(d) => d.clear(),
            Dsp::Freeze(d) => d.clear(),
        }
        self.peak = 0.;
    }
    pub fn reset(&mut self) {
        match &mut self.dsp {
            Dsp::Shimmer(d) => d.reset(),
            Dsp::Freeze(d) => d.reset(),
        }
        self.rng.reset();
        self.frame = 0;
        self.peak = 0.;
        self.input.iter_mut().for_each(|b| b.fill(0.));
        self.output.iter_mut().for_each(|b| b.fill(0.));
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.peak,
            1 => self.frame as f64,
            2 => match &self.dsp {
                Dsp::Shimmer(d) => d.energy,
                Dsp::Freeze(d) => d.clouds.iter().filter(|c| c.level > 0.).count() as f64,
            },
            3 => match &self.dsp {
                Dsp::Freeze(d) => d.captures as f64,
                _ => 0.,
            },
            4 => self.rng.draws as f64,
            5 => match &self.dsp {
                Dsp::Freeze(d) => d.waiting as u32 as f64,
                _ => 0.,
            },
            6 => self.rng.state as f64,
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn voice_fx_owned_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn voice_fx_owned_new(kind: u32, rate: f64, seed: u32) -> *mut Engine {
    Kind::from_code(kind)
        .and_then(|k| Engine::new(k, rate, seed))
        .map_or(std::ptr::null_mut(), Box::into_raw)
}
#[no_mangle]
pub unsafe extern "C" fn voice_fx_owned_free(e: *mut Engine) {
    if !e.is_null() {
        drop(Box::from_raw(e));
    }
}
#[no_mangle]
pub extern "C" fn voice_fx_owned_param(e: &mut Engine, index: usize, value: f64) -> u32 {
    e.param(index, value) as u32
}
#[no_mangle]
pub extern "C" fn voice_fx_owned_input(e: &mut Engine, ch: usize) -> *mut f32 {
    e.input_mut(ch)
        .map_or(std::ptr::null_mut(), |b| b.as_mut_ptr())
}
#[no_mangle]
pub extern "C" fn voice_fx_owned_output(e: &Engine, ch: usize) -> *const f32 {
    e.output(ch).map_or(std::ptr::null(), |b| b.as_ptr())
}
#[no_mangle]
pub extern "C" fn voice_fx_owned_render(e: &mut Engine, frames: usize) -> u32 {
    e.render(frames) as u32
}
#[no_mangle]
pub extern "C" fn voice_fx_owned_clear(e: &mut Engine) {
    e.clear();
}
#[no_mangle]
pub extern "C" fn voice_fx_owned_reset(e: &mut Engine) {
    e.reset();
}
#[no_mangle]
pub extern "C" fn voice_fx_owned_stat(e: &Engine, index: u32) -> f64 {
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
    pub extern "C" fn voice_fx_owned_alloc_watch(w: u32) {
        COUNT.store(0, Ordering::Relaxed);
        WATCH.store(w != 0, Ordering::Relaxed);
    }
    #[no_mangle]
    pub extern "C" fn voice_fx_owned_alloc_count() -> usize {
        COUNT.load(Ordering::Relaxed)
    }
}
