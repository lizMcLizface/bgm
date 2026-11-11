//! Captured active VoiceCompressor topology: unchanged native compressor core
//! plus the actual source20ms a-rate makeup/trim gain. Instrument bypass is a
//! separate existing host policy and is not inferred here.
#[cfg(feature = "allocation-audit")]
mod allocation;
pub mod gain;
use calmbgm_native_compressor_automation::Automation;
const BLOCK: usize = 2048;
const RANGES: [(f64, f64); 5] = [(0., 1.), (1., 20.), (-18., 18.), (0.001, 1.), (0.01, 1.)];
#[derive(Clone, Copy)]
struct UiEvent {
    index: usize,
    seconds: f64,
    value: f64,
}
pub struct Voice {
    core: Box<Automation>,
    gain: gain::Gain,
    rate: f64,
    initial: [f64; 5],
    ui: [f64; 5],
    mask: u8,
    events: Vec<UiEvent>,
    cursor: usize,
    ready: bool,
    frame: u64,
    peak: f64,
    last_gain: f32,
    last_core: [f32; 2],
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
    core_output: [[f32; BLOCK]; 2],
}
impl Voice {
    pub fn new(rate: f64) -> Option<Box<Self>> {
        let core = Automation::new(rate)?;
        let initial = [0., 4., 0., 0.003, 0.25];
        Some(Box::new(Self {
            core,
            gain: gain::Gain::new(rate),
            rate,
            initial,
            ui: initial,
            mask: 0,
            events: Vec::with_capacity(128),
            cursor: 0,
            ready: false,
            frame: 0,
            peak: 0.,
            last_gain: 1.,
            last_core: [0.; 2],
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
            core_output: [[0.; BLOCK]; 2],
        }))
    }
    fn valid(i: usize, value: f64) -> bool {
        RANGES
            .get(i)
            .is_some_and(|(min, max)| value.is_finite() && value >= *min && value <= *max)
    }
    pub fn initial(&mut self, i: usize, value: f64) -> bool {
        if self.ready || !Self::valid(i, value) || self.mask & (1 << i) != 0 {
            return false;
        }
        self.initial[i] = value;
        self.ui[i] = value;
        self.mask |= 1 << i;
        true
    }
    pub fn event(&mut self, i: usize, seconds: f64, value: f64) -> bool {
        if self.ready
            || !Self::valid(i, value)
            || !seconds.is_finite()
            || seconds < 0.
            || seconds * self.rate > 9007199254740864.
            || self.events.len() >= 128
            || self.events.last().is_some_and(|e| e.seconds > seconds)
        {
            return false;
        }
        self.events.push(UiEvent {
            index: i,
            seconds,
            value,
        });
        true
    }
    fn update(&mut self, state: [f64; 5], seconds: f64, flags: u8) -> bool {
        if flags & 7 != 0 {
            let threshold = -state[0] * 36.;
            let ratio = state[1];
            let slope = 1. - 1. / ratio;
            let built_in = 0.6 * -threshold * slope;
            let typical = (-18. - threshold).max(0.) * slope;
            let db = -built_in + typical * 0.85 + state[2];
            let makeup = 10f64.powf(db / 20.);
            if !self.core.event(0, 1, seconds, threshold, 0.02)
                || !self.core.event(2, 1, seconds, ratio, 0.02)
                || !self.gain.push(seconds, makeup)
            {
                return false;
            }
        }
        if flags & 8 != 0 && !self.core.event(3, 1, seconds, state[3], 0.02) {
            return false;
        }
        if flags & 16 != 0 && !self.core.event(4, 1, seconds, state[4], 0.02) {
            return false;
        }
        true
    }
    pub fn prepare(&mut self) -> bool {
        if self.ready || self.mask != 31 {
            return false;
        }
        for (i, value) in [-24., 6., 12., 0.003, 0.25].into_iter().enumerate() {
            if !self.core.initial(i, value) {
                return false;
            }
        }
        let mut state = self.initial;
        let mut index = 0;
        while index < self.events.len() && self.events[index].seconds == 0. {
            let e = self.events[index];
            state[e.index] = e.value;
            index += 1;
        }
        if !self.update(state, 0., 31) {
            return false;
        }
        while index < self.events.len() {
            let seconds = self.events[index].seconds;
            let mut flags = 0u8;
            while index < self.events.len() && self.events[index].seconds == seconds {
                let e = self.events[index];
                state[e.index] = e.value;
                flags |= 1 << e.index;
                index += 1;
            }
            if !self.update(state, seconds, flags) {
                return false;
            }
        }
        self.gain.seal();
        if !self.core.prepare() {
            return false;
        }
        self.ready = true;
        true
    }
    pub fn begin_block(&mut self) {
        self.peak = 0.;
        self.core.begin_block();
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        if !self.ready {
            return [0.; 2];
        }
        while self.cursor < self.events.len()
            && self.events[self.cursor].seconds * self.rate <= self.frame as f64
        {
            let e = self.events[self.cursor];
            self.ui[e.index] = e.value;
            self.cursor += 1;
        }
        let core = self.core.tick(input);
        self.last_core = core;
        self.last_gain = self.gain.tick(self.frame);
        let out = [core[0] * self.last_gain, core[1] * self.last_gain];
        self.frame += 1;
        self.peak = self.peak.max(out[0].abs() as f64).max(out[1].abs() as f64);
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
            self.core_output[0][i] = self.last_core[0];
            self.core_output[1][i] = self.last_core[1];
        }
        true
    }
    pub fn reset(&mut self) {
        self.core.reset();
        self.gain.reset();
        self.ui = self.initial;
        self.cursor = 0;
        self.frame = 0;
        self.peak = 0.;
        self.last_gain = 1.;
        self.last_core = [0.; 2];
        self.input.fill([0.; BLOCK]);
        self.output.fill([0.; BLOCK]);
        self.core_output.fill([0.; BLOCK]);
    }
    pub fn stat(&self, i: u32) -> f64 {
        match i {
            0 => self.peak,
            1 => self.frame as f64,
            2 => self.core.stat(2),
            3 => self.core.stat(3),
            4 => self.last_gain as f64,
            5 => self.core.stat(0),
            6 => self.events.len() as f64,
            7 => self.cursor as f64,
            8 => self.ready as u32 as f64,
            9 => (self.frame % 128) as f64,
            10 => self.gain.len() as f64,
            11 => self.core.stat(8),
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn voice_comp_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn voice_comp_new(rate: f64) -> *mut Voice {
    Voice::new(rate)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn voice_comp_free(p: *mut Voice) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn voice_comp_initial(p: &mut Voice, i: usize, v: f64) -> u32 {
    p.initial(i, v) as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_event(p: &mut Voice, i: usize, s: f64, v: f64) -> u32 {
    p.event(i, s, v) as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_prepare(p: &mut Voice) -> u32 {
    p.prepare() as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_value(p: &Voice, i: usize) -> f64 {
    p.ui.get(i).copied().unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn voice_comp_coefficient(p: &Voice, i: usize) -> f64 {
    p.core.coefficient(i)
}
#[no_mangle]
pub extern "C" fn voice_comp_gain_buffer(p: &Voice) -> *const f32 {
    p.gain.samples.as_ptr()
}
#[no_mangle]
pub extern "C" fn voice_comp_input(p: &mut Voice, ch: usize) -> *mut f32 {
    p.input
        .get_mut(ch)
        .map(|v| v.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn voice_comp_output(p: &Voice, ch: usize) -> *const f32 {
    p.output
        .get(ch)
        .map(|v| v.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn voice_comp_core_output(p: &Voice, ch: usize) -> *const f32 {
    p.core_output
        .get(ch)
        .map(|v| v.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn voice_comp_render(p: &mut Voice, n: usize, c: usize) -> u32 {
    p.render(n, c) as u32
}
#[no_mangle]
pub extern "C" fn voice_comp_reset(p: &mut Voice) {
    p.reset();
}
#[no_mangle]
pub extern "C" fn voice_comp_stat(p: &Voice, i: u32) -> f64 {
    p.stat(i)
}
