//! Immutable captured native k-rate automation around the unchanged owned
//! compressor Engine. Static live controls keep their separate original API.
#[cfg(feature = "allocation-audit")]
mod allocation;
mod timeline;
use calmbgm_native_compressor::{Engine, BLOCK, PARAMETERS};
use timeline::{Event, Timeline};
const MAX_TOTAL: usize = 1024;
pub struct Automation {
    engine: Box<Engine>,
    rate: f64,
    timelines: [Timeline; 5],
    initial: [f64; 5],
    ready: bool,
    frame: u64,
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
}
impl Automation {
    pub fn new(rate: f64) -> Option<Box<Self>> {
        let engine = Engine::new(rate)?;
        Some(Box::new(Self {
            engine,
            rate,
            timelines: std::array::from_fn(|i| {
                Timeline::new(PARAMETERS[i].0 as f32, PARAMETERS[i].1 as f32)
            }),
            initial: [-24., 30., 12., 0.003, 0.25],
            ready: false,
            frame: 0,
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
        }))
    }
    pub fn initial(&mut self, index: usize, value: f64) -> bool {
        if self.ready || !self.engine.initial(index, value) {
            return false;
        }
        self.initial[index] = value;
        self.timelines[index].initial(value);
        true
    }
    pub fn event(&mut self, index: usize, kind: u32, seconds: f64, value: f64, tau: f64) -> bool {
        if self.ready
            || index >= 5
            || kind > 1
            || !seconds.is_finite()
            || seconds < 0.
            || seconds * self.rate > 9007199254740864.
            || !value.is_finite()
            || value < PARAMETERS[index].0
            || value > PARAMETERS[index].1
            || !tau.is_finite()
            || tau < 0.
            || (kind == 0 && tau != 0.)
            || !(tau as f32).is_finite()
            || (tau > 0. && tau as f32 == 0.)
            || self.timelines.iter().map(Timeline::len).sum::<usize>() >= MAX_TOTAL
        {
            return false;
        }
        self.timelines[index].push(Event {
            kind: if tau == 0. { 0 } else { kind },
            seconds,
            value,
            tau,
        })
    }
    pub fn prepare(&mut self) -> bool {
        if self.ready || !self.engine.prepare() {
            return false;
        }
        self.ready = true;
        true
    }
    pub fn begin_block(&mut self) {
        self.engine.begin_block();
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        if !self.ready {
            return [0.; 2];
        }
        if self.frame % 128 == 0 {
            for i in 0..5 {
                let value = self.timelines[i].tick(self.frame, self.rate);
                let accepted = self.engine.param(i, value as f64);
                debug_assert!(accepted);
            }
        }
        let out = self.engine.tick(input);
        self.frame += 1;
        out
    }
    pub fn render(&mut self, n: usize, channels: usize) -> bool {
        if !self.ready || n > BLOCK || !(1..=2).contains(&channels) {
            return false;
        }
        self.begin_block();
        for i in 0..n {
            let out = self.tick([self.input[0][i], self.input[channels - 1][i]]);
            self.output[0][i] = out[0];
            self.output[1][i] = out[1];
        }
        true
    }
    pub fn reset(&mut self) {
        self.engine.reset();
        for i in 0..5 {
            let accepted = self.engine.param(i, self.initial[i]);
            debug_assert!(accepted);
            self.timelines[i].reset();
        }
        self.frame = 0;
        self.input.fill([0.; BLOCK]);
        self.output.fill([0.; BLOCK]);
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0..=7 => self.engine.stat(index),
            8 => self.timelines.iter().map(Timeline::len).sum::<usize>() as f64,
            9 => self
                .timelines
                .iter()
                .map(Timeline::remaining)
                .sum::<usize>() as f64,
            _ => 0.,
        }
    }
    pub fn value(&self, index: usize) -> f64 {
        self.timelines
            .get(index)
            .map(Timeline::requested)
            .unwrap_or(f64::NAN)
    }
    pub fn coefficient(&self, index: usize) -> f64 {
        self.timelines
            .get(index)
            .map(|v| v.current() as f64)
            .unwrap_or(f64::NAN)
    }
}
#[no_mangle]
pub extern "C" fn native_comp_auto_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn native_comp_auto_new(rate: f64) -> *mut Automation {
    Automation::new(rate)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn native_comp_auto_free(p: *mut Automation) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn native_comp_auto_initial(p: &mut Automation, i: usize, v: f64) -> u32 {
    p.initial(i, v) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_auto_event(
    p: &mut Automation,
    i: usize,
    k: u32,
    s: f64,
    v: f64,
    t: f64,
) -> u32 {
    p.event(i, k, s, v, t) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_auto_prepare(p: &mut Automation) -> u32 {
    p.prepare() as u32
}
#[no_mangle]
pub extern "C" fn native_comp_auto_value(p: &Automation, i: usize) -> f64 {
    p.value(i)
}
#[no_mangle]
pub extern "C" fn native_comp_auto_coefficient(p: &Automation, i: usize) -> f64 {
    p.coefficient(i)
}
#[no_mangle]
pub extern "C" fn native_comp_auto_input(p: &mut Automation, ch: usize) -> *mut f32 {
    p.input
        .get_mut(ch)
        .map(|v| v.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn native_comp_auto_output(p: &Automation, ch: usize) -> *const f32 {
    p.output
        .get(ch)
        .map(|v| v.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn native_comp_auto_render(p: &mut Automation, n: usize, c: usize) -> u32 {
    p.render(n, c) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_auto_reset(p: &mut Automation) {
    p.reset();
}
#[no_mangle]
pub extern "C" fn native_comp_auto_stat(p: &Automation, i: u32) -> f64 {
    p.stat(i)
}
