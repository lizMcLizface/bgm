//! Portable owned weather source. Original DSP identities and native three-stem
//! boundary are retained; this crate does not implement Ambience host filters.
mod events;
pub mod rain;
use events::{Surf, Thunder};
use rain::Rain;
pub const MAX_BLOCK: usize = 2048;
pub const MAX_EVENTS: usize = 4000;
const MAX_FRAME: u64 = 9007199254740991;
pub const DEFAULT_ENV: [f64; 13] = [
    0.5, 0.3, 0., 0.75, 0.9, 0., 0.6, 0.55, 0.65, 0., 0.55, 0.45, 0.55,
];
#[derive(Clone, Copy)]
pub struct Event {
    pub frame: u64,
    pub owner: u32,
    pub kind: u32,
    pub id: u32,
    pub value: f64,
}
struct Model {
    rain: Rain,
    thunder: Thunder,
    surf: Surf,
}
impl Model {
    fn new(rate: f64, e: &[f64; 13], seed: u32) -> Self {
        Self {
            rain: Rain::new(rate, e, seed),
            thunder: Thunder::new(rate, e, seed ^ 0x7158),
            surf: Surf::new(rate, e, seed ^ 0x8913),
        }
    }
    fn environment(&mut self, e: &[f64; 13]) {
        self.thunder.environment(e);
        self.surf.environment(e);
    }
    fn tick(&mut self, e: &[f64; 13], surface: u32, out: &mut [f32; 24]) {
        self.rain.tick(e, surface, out);
        self.thunder.tick(e, out);
        self.surf.tick(e, out);
    }
    fn reset(&mut self, rate: f64, e: &[f64; 13], seed: u32) {
        self.rain = Rain::new(rate, e, seed);
        self.thunder.reset(e, seed ^ 0x7158);
        self.surf = Surf::new(rate, e, seed ^ 0x8913);
    }
}
pub struct Engine {
    rate: f64,
    seed: u32,
    initial: [f64; 26],
    config: [f64; 26],
    gains: [f64; 12],
    smooth: f64,
    model: Option<Box<Model>>,
    output: Vec<f32>,
    queue: Vec<Event>,
    queue_head: usize,
    frame: u64,
    applied: u64,
    late: u64,
    overflow: u64,
}
impl Engine {
    pub fn new(rate: f64, seed: u32) -> Option<Box<Self>> {
        if !rate.is_finite() || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        let mut config = [1.; 26];
        config[..13].copy_from_slice(&DEFAULT_ENV);
        config[13] = 0.;
        Some(Box::new(Self {
            rate,
            seed,
            initial: config,
            config,
            gains: [1.; 12],
            smooth: 1. - (-1. / (rate * 0.04)).exp(),
            model: None,
            output: vec![0.; 30 * MAX_BLOCK],
            queue: Vec::with_capacity(MAX_EVENTS),
            queue_head: 0,
            frame: 0,
            applied: 0,
            late: 0,
            overflow: 0,
        }))
    }
    fn valid_config(id: u32, value: f64) -> bool {
        value.is_finite()
            && match id {
                0..=12 => (0. ..=1.).contains(&value),
                13 => (0. ..=5.).contains(&value) && value.fract() == 0.,
                14..=25 => (0. ..=2.5).contains(&value),
                _ => false,
            }
    }
    pub fn initial(&mut self, id: u32, value: f64) -> bool {
        if self.model.is_some() || !Self::valid_config(id, value) {
            return false;
        }
        self.initial[id as usize] = value;
        self.config[id as usize] = value;
        true
    }
    pub fn prepare(&mut self) -> bool {
        if self.model.is_some() {
            return false;
        }
        let e = self.env();
        self.model = Some(Box::new(Model::new(self.rate, &e, self.seed)));
        self.gains.copy_from_slice(&self.config[14..26]);
        true
    }
    fn env(&self) -> [f64; 13] {
        self.config[..13].try_into().unwrap()
    }
    pub fn enqueue(&mut self, e: Event) -> bool {
        if self.model.is_none()
            || e.owner == 0
            || e.frame > MAX_FRAME
            || !e.value.is_finite()
            || !(match e.kind {
                0 => Self::valid_config(e.id, e.value),
                1 | 2 => e.id == 0 && e.value == 0.,
                _ => false,
            })
        {
            return false;
        }
        if e.frame < self.frame {
            self.late += 1;
            return false;
        }
        self.compact_queue();
        if self.queue.len() >= MAX_EVENTS {
            self.overflow += 1;
            return false;
        }
        let at = self.queue.partition_point(|v| v.frame <= e.frame);
        self.queue.insert(at, e);
        true
    }
    fn compact_queue(&mut self) {
        if self.queue_head > 0 {
            self.queue.drain(..self.queue_head);
            self.queue_head = 0;
        }
    }
    pub fn cancel(&mut self, owner: u32) {
        self.compact_queue();
        self.queue.retain(|e| e.owner != owner);
    }
    fn apply(&mut self, e: Event) {
        match e.kind {
            0 => {
                self.config[e.id as usize] = e.value;
                if e.id <= 13 {
                    let env = self.env();
                    self.model.as_mut().unwrap().environment(&env);
                }
            }
            1 => {
                let env = self.env();
                self.model.as_mut().unwrap().thunder.trigger(&env);
            }
            2 => {
                let env = self.env();
                self.model.as_mut().unwrap().surf.trigger(&env, true);
            }
            _ => {}
        }
        self.applied += 1;
    }
    pub fn render(&mut self, n: usize) -> bool {
        if self.model.is_none() || n > MAX_BLOCK || self.frame > MAX_FRAME - n as u64 {
            return false;
        }
        for i in 0..n {
            while self
                .queue
                .get(self.queue_head)
                .is_some_and(|e| e.frame <= self.frame)
            {
                let e = self.queue[self.queue_head];
                self.queue_head += 1;
                self.apply(e);
            }
            if self.queue_head == self.queue.len() {
                self.queue.clear();
                self.queue_head = 0;
            }
            let mut layers = [0f32; 24];
            let env = self.env();
            self.model
                .as_mut()
                .unwrap()
                .tick(&env, self.config[13] as u32, &mut layers);
            for l in 0..12 {
                self.gains[l] += self.smooth * (self.config[14 + l] - self.gains[l]);
            }
            for c in 0..2 {
                let (mut rain, mut thunder, mut surf) = (0., 0., 0.);
                for l in 0..6 {
                    rain += layers[l * 2 + c] as f64 * self.gains[l];
                }
                for l in 6..9 {
                    thunder += layers[l * 2 + c] as f64 * self.gains[l];
                }
                for l in 9..12 {
                    surf += layers[l * 2 + c] as f64 * self.gains[l];
                }
                self.output[(24 + c) * MAX_BLOCK + i] = rain as f32;
                self.output[(26 + c) * MAX_BLOCK + i] = thunder as f32;
                self.output[(28 + c) * MAX_BLOCK + i] = surf as f32;
            }
            for ch in 0..24 {
                self.output[ch * MAX_BLOCK + i] = layers[ch];
            }
            self.frame += 1;
        }
        true
    }
    pub fn reset(&mut self) -> bool {
        if self.model.is_none() {
            return false;
        }
        self.config = self.initial;
        let e = self.env();
        self.model.as_mut().unwrap().reset(self.rate, &e, self.seed);
        self.gains.copy_from_slice(&self.config[14..26]);
        self.queue.clear();
        self.queue_head = 0;
        self.frame = 0;
        self.applied = 0;
        self.late = 0;
        self.overflow = 0;
        self.output.fill(0.);
        true
    }
    /// Channels0..23 are the twelve original stereo layers;24..29 are the
    /// three independent WeatherBed reductions. Only the last rendered prefix
    /// is valid; retained output storage never reallocates during rendering.
    pub fn output(&self, channel: usize) -> Option<&[f32]> {
        if channel >= 30 {
            return None;
        }
        Some(&self.output[channel * MAX_BLOCK..(channel + 1) * MAX_BLOCK])
    }
    pub fn stat(&self, id: u32) -> f64 {
        let Some(m) = &self.model else { return 0. };
        match id {
            0 => self.frame as f64,
            1 => m.rain.events as f64,
            2 => m.rain.active() as f64,
            3 => m.rain.stolen as f64,
            4 => m.thunder.events as f64,
            5 => m.thunder.active() as f64,
            6 => m.thunder.skipped as f64,
            7 => m.surf.events as f64,
            8 => m.surf.active() as f64,
            9 => m.surf.skipped as f64,
            10 => self.applied as f64,
            11 => self.late as f64,
            12 => self.overflow as f64,
            13 => (self.queue.len() - self.queue_head) as f64,
            14 => m.rain.rate_now,
            15 => m.rain.heave,
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn weather_owned_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn weather_owned_new(rate: f64, seed: u32) -> *mut Engine {
    Engine::new(rate, seed).map_or(std::ptr::null_mut(), Box::into_raw)
}
#[no_mangle]
pub unsafe extern "C" fn weather_owned_free(p: *mut Engine) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub unsafe extern "C" fn weather_owned_initial(p: *mut Engine, id: u32, value: f64) -> u32 {
    p.as_mut().is_some_and(|p| p.initial(id, value)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn weather_owned_prepare(p: *mut Engine) -> u32 {
    p.as_mut().is_some_and(|p| p.prepare()) as u32
}
#[no_mangle]
pub unsafe extern "C" fn weather_owned_enqueue(
    p: *mut Engine,
    frame: f64,
    owner: u32,
    kind: u32,
    id: u32,
    value: f64,
) -> u32 {
    if !frame.is_finite() || frame < 0. || frame > MAX_FRAME as f64 || frame.fract() != 0. {
        return 0;
    }
    p.as_mut().is_some_and(|p| {
        p.enqueue(Event {
            frame: frame as u64,
            owner,
            kind,
            id,
            value,
        })
    }) as u32
}
#[no_mangle]
pub unsafe extern "C" fn weather_owned_cancel(p: *mut Engine, owner: u32) {
    if let Some(p) = p.as_mut() {
        p.cancel(owner);
    }
}
#[no_mangle]
pub unsafe extern "C" fn weather_owned_render(p: *mut Engine, n: u32) -> u32 {
    p.as_mut().is_some_and(|p| p.render(n as usize)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn weather_owned_reset(p: *mut Engine) -> u32 {
    p.as_mut().is_some_and(|p| p.reset()) as u32
}
#[no_mangle]
pub unsafe extern "C" fn weather_owned_output(p: *const Engine, ch: u32) -> *const f32 {
    if ch >= 30 {
        return std::ptr::null();
    }
    p.as_ref().map_or(std::ptr::null(), |p| {
        p.output.as_ptr().add(ch as usize * MAX_BLOCK)
    })
}
#[no_mangle]
pub unsafe extern "C" fn weather_owned_stat(p: *const Engine, id: u32) -> f64 {
    p.as_ref().map_or(0., |p| p.stat(id))
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
    pub extern "C" fn weather_alloc_watch(on: u32) {
        COUNT.store(0, Ordering::Relaxed);
        WATCH.store(on != 0, Ordering::Relaxed);
    }
    #[no_mangle]
    pub extern "C" fn weather_alloc_count() -> u32 {
        COUNT.load(Ordering::Relaxed)
    }
}
