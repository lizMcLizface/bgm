//! Portable DSP for the actual native graph in src/nodes/motion.js.
//! Two continuous sine LFOs, native Float32 gain boundaries, and the original
//! 1025-point stereo balance curves. Native oscillator implementations can
//! differ numerically; browser-reference compatibility is tolerance-based.
use std::f64::consts::{PI, SQRT_2, TAU};
pub const BLOCK: usize = 2048;
pub const PARAMS: usize = 4;
pub const PARAMETER_RANGES: [(f64, f64); PARAMS] = [(0., 1.), (0.01, 20.), (0., 1.), (0.01, 20.)];
pub struct Engine {
    rate: f64,
    targets: [f64; PARAMS],
    base: f32,
    depth: f32,
    pan_depth: f32,
    frequencies: [f64; 2],
    phase: [f64; 2],
    curves: [[f32; 1025]; 2],
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
    frame: u64,
    peak: f64,
}
impl Engine {
    pub fn new(rate: f64) -> Option<Box<Self>> {
        if !rate.is_finite() || rate.fract() != 0. || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        let mut curves = [[0.; 1025]; 2];
        for i in 0..1025 {
            let position = i as f64 / 1024. * 2. - 1.;
            let angle = (position + 1.) * PI / 4.;
            curves[0][i] = (SQRT_2 * angle.cos()) as f32;
            curves[1][i] = (SQRT_2 * angle.sin()) as f32;
        }
        Some(Box::new(Self {
            rate,
            targets: [0., 4., 0., 0.2],
            base: 1.,
            depth: 0.,
            pan_depth: 0.,
            frequencies: [4., 0.2f32 as f64],
            phase: [0.; 2],
            curves,
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
            frame: 0,
            peak: 0.,
        }))
    }
    pub fn param(&mut self, index: usize, value: f64) -> bool {
        let Some((lo, hi)) = PARAMETER_RANGES.get(index).copied() else {
            return false;
        };
        if !value.is_finite() || value < lo || value > hi {
            return false;
        }
        self.targets[index] = value;
        match index {
            0 => {
                self.base = (1. - value / 2.) as f32;
                self.depth = (value / 2.) as f32;
            }
            1 => self.frequencies[0] = value as f32 as f64,
            2 => self.pan_depth = value as f32,
            3 => self.frequencies[1] = value as f32 as f64,
            _ => unreachable!(),
        };
        true
    }
    pub fn parameters(&self) -> [f64; PARAMS] {
        self.targets
    }
    fn balance(&self, ch: usize, input: f32) -> f32 {
        let position = (input + 1.) * 512.;
        if position <= 0. {
            return self.curves[ch][0];
        }
        if position >= 1024. {
            return self.curves[ch][1024];
        }
        let index = position as usize;
        let fraction = position - index as f32;
        self.curves[ch][index] + fraction * (self.curves[ch][index + 1] - self.curves[ch][index])
    }
    /// Phase advances even on silence or zero depth, as already-created native
    /// oscillators do. Stage creation/routing bypass belongs to the host.
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        let sine = [
            (self.phase[0] * TAU).sin() as f32,
            (self.phase[1] * TAU).sin() as f32,
        ];
        let gain = self.base + sine[0] * self.depth;
        let pan = sine[1] * self.pan_depth;
        let out = [
            (input[0] * gain) * self.balance(0, pan),
            (input[1] * gain) * self.balance(1, pan),
        ];
        self.peak = self.peak.max(out[0].abs() as f64).max(out[1].abs() as f64);
        for i in 0..2 {
            self.phase[i] = (self.phase[i] + self.frequencies[i] / self.rate).fract();
        }
        self.frame += 1;
        out
    }
    /// A graph host calls this once at its outer render boundary, including
    /// when unrelated events divide that render into smaller internal spans.
    pub fn begin_block(&mut self) {
        self.peak = 0.;
    }
    pub fn input_mut(&mut self, ch: usize) -> Option<&mut [f32; BLOCK]> {
        self.input.get_mut(ch)
    }
    pub fn output(&self, ch: usize) -> Option<&[f32; BLOCK]> {
        self.output.get(ch)
    }
    pub fn render(&mut self, frames: usize, channels: usize) -> bool {
        if frames > BLOCK || !(1..=2).contains(&channels) {
            return false;
        }
        self.begin_block();
        for i in 0..frames {
            let out = self.tick([self.input[0][i], self.input[channels - 1][i]]);
            for ch in 0..2 {
                self.output[ch][i] = out[ch];
            }
        }
        true
    }
    /// Explicit fresh-run policy. The original native class has no reset call.
    /// Latest control targets stay intact; both LFO phases and clock restart.
    pub fn reset(&mut self) {
        self.phase = [0.; 2];
        self.frame = 0;
        self.peak = 0.;
        self.input.fill([0.; BLOCK]);
        self.output.fill([0.; BLOCK]);
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.peak,
            1 => self.frame as f64,
            2 => self.phase[0],
            3 => self.phase[1],
            4 => 0.,
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn motion_owned_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn motion_owned_new(rate: f64) -> *mut Engine {
    Engine::new(rate)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn motion_owned_free(p: *mut Engine) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn motion_owned_param(p: &mut Engine, index: usize, value: f64) -> u32 {
    p.param(index, value) as u32
}
#[no_mangle]
pub extern "C" fn motion_owned_value(p: &Engine, index: usize) -> f64 {
    p.parameters().get(index).copied().unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn motion_owned_input(p: &mut Engine, ch: usize) -> *mut f32 {
    p.input_mut(ch)
        .map(|v| v.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn motion_owned_output(p: &Engine, ch: usize) -> *const f32 {
    p.output(ch).map(|v| v.as_ptr()).unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn motion_owned_render(p: &mut Engine, frames: usize, channels: usize) -> u32 {
    p.render(frames, channels) as u32
}
#[no_mangle]
pub extern "C" fn motion_owned_reset(p: &mut Engine) {
    p.reset();
}
#[no_mangle]
pub extern "C" fn motion_owned_stat(p: &Engine, index: u32) -> f64 {
    p.stat(index)
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
        unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.dealloc(p, l)
        }
        unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.realloc(p, l, n)
        }
    }
    #[global_allocator]
    static ALLOCATOR: Counting = Counting;
    #[no_mangle]
    pub extern "C" fn motion_owned_alloc_watch(watch: u32) {
        COUNT.store(0, Ordering::Relaxed);
        WATCH.store(watch != 0, Ordering::Relaxed);
    }
    #[no_mangle]
    pub extern "C" fn motion_owned_alloc_count() -> usize {
        COUNT.load(Ordering::Relaxed)
    }
}
