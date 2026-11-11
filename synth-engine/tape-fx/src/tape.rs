//! Full native Tape topology behind an explicit pinned portable profile.
//! The 2x native primitive has its own retained reference proof.
use super::{Shaper, BLOCK};
use crate::{delay::Delay, oscillator::Sine, target::Target, tone::Lowpass};
pub const PARAMETERS: [(f64, f64); 5] = [(0., 1.), (0.05, 5.), (0., 1.), (0., 1.), (500., 20000.)];
const INITIAL: [f64; 5] = [0., 0.6, 0., 0., 9000.];
const MAX_DRIVES: usize = 32;
struct Drive {
    value: f64,
    curve: [f32; 2049],
}

#[no_mangle]
pub extern "C" fn tape_owned_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn tape_owned_new(rate: f64) -> *mut Engine {
    Engine::new(rate)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn tape_owned_free(p: *mut Engine) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn tape_owned_initial(p: &mut Engine, index: usize, value: f64) -> u32 {
    p.initial(index, value) as u32
}
#[no_mangle]
pub extern "C" fn tape_owned_prepare_drive(p: &mut Engine, value: f64) -> u32 {
    p.prepare_drive(value) as u32
}
#[no_mangle]
pub extern "C" fn tape_owned_prepare(p: &mut Engine) -> u32 {
    p.prepare() as u32
}
#[no_mangle]
pub extern "C" fn tape_owned_param(p: &mut Engine, index: usize, value: f64) -> u32 {
    p.param(index, value) as u32
}
#[no_mangle]
pub extern "C" fn tape_owned_target(p: &mut Engine, index: usize, value: f64, seconds: f64) -> u32 {
    p.native_target(index, value, seconds) as u32
}
#[no_mangle]
pub extern "C" fn tape_owned_value(p: &Engine, index: usize) -> f64 {
    p.parameters().get(index).copied().unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn tape_owned_input(p: &mut Engine, ch: usize) -> *mut f32 {
    p.input_mut(ch)
        .map(|v| v.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn tape_owned_output(p: &Engine, ch: usize) -> *const f32 {
    p.output(ch).map(|v| v.as_ptr()).unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn tape_owned_stage_output(p: &Engine, stage: usize, ch: usize) -> *const f32 {
    p.stage_output(stage, ch)
        .map(|v| v.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn tape_owned_render(p: &mut Engine, n: usize, channels: usize) -> u32 {
    p.render(n, channels) as u32
}
#[no_mangle]
pub extern "C" fn tape_owned_reset(p: &mut Engine) {
    p.reset();
}
#[no_mangle]
pub extern "C" fn tape_owned_stat(p: &Engine, index: u32) -> f64 {
    p.stat(index)
}
pub struct Engine {
    rate: f64,
    shaper: Shaper,
    tone: Lowpass,
    delay: Delay,
    controls: [Target; 7],
    oscillators: [Sine; 4],
    linear_groups: [bool; 2],
    last_oscillators: [f32; 4],
    last_modulation: [f32; 4],
    drives: Vec<Drive>,
    parameters: [f64; 5],
    mask: u8,
    prepared: bool,
    frame: u64,
    peak: f64,
    last_delay: f32,
    last_tone: f32,
    last_shaped: [f32; 2],
    last_toned: [f32; 2],
    stage_output: [[[f32; BLOCK]; 2]; 2],
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
}
impl Engine {
    fn controls(rate: f64) -> [Target; 7] {
        let initial = [0., 0., 0.6f64 as f32, (0.6f64 * 0.37) as f32, 0., 0., 350.];
        std::array::from_fn(|i| Target::new(initial[i], rate))
    }
    pub fn new(rate: f64) -> Option<Box<Self>> {
        if !rate.is_finite() || rate.fract() != 0. || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        Some(Box::new(Self {
            rate,
            shaper: Shaper::new(0., false)?,
            tone: Lowpass::new(rate),
            delay: Delay::new(rate),
            controls: Self::controls(rate),
            oscillators: std::array::from_fn(|i| Sine::new(rate, i >= 2)),
            linear_groups: [false; 2],
            last_oscillators: [0.; 4],
            last_modulation: [0.; 4],
            drives: Vec::with_capacity(MAX_DRIVES),
            parameters: INITIAL,
            mask: 0,
            prepared: false,
            frame: 0,
            peak: 0.,
            last_delay: 0.006,
            last_tone: 350.,
            last_shaped: [0.; 2],
            last_toned: [0.; 2],
            stage_output: [[[0.; BLOCK]; 2]; 2],
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
        }))
    }
    fn valid(index: usize, value: f64) -> bool {
        PARAMETERS
            .get(index)
            .is_some_and(|(a, b)| value.is_finite() && value >= *a && value <= *b)
    }
    pub fn prepare_drive(&mut self, value: f64) -> bool {
        if self.prepared
            || !Self::valid(3, value)
            || self.drives.len() >= MAX_DRIVES
            || self.drives.iter().any(|d| d.value == value)
        {
            return false;
        }
        let Some(shaper) = Shaper::new(value, false) else {
            return false;
        };
        self.drives.push(Drive {
            value,
            curve: shaper.curve,
        });
        true
    }
    pub fn initial(&mut self, index: usize, value: f64) -> bool {
        if self.prepared || !Self::valid(index, value) || self.mask & (1 << index) != 0 {
            return false;
        }
        self.parameters[index] = value;
        self.mask |= 1 << index;
        if index != 3 {
            self.set_controls(index, value, 0., false);
        }
        true
    }
    pub fn prepare(&mut self) -> bool {
        if self.prepared || self.mask != 31 {
            return false;
        }
        let Some(drive) = self.drives.iter().find(|d| d.value == self.parameters[3]) else {
            return false;
        };
        self.shaper.curve.copy_from_slice(&drive.curve);
        self.prepared = true;
        true
    }
    fn set_controls(&mut self, index: usize, value: f64, seconds: f64, native: bool) {
        let frame = self.frame;
        let rate = self.rate;
        let mut set = |i: usize, value: f32| {
            if native {
                if i == 6 && frame > 0 && frame % 128 == 0 {
                    self.controls[i].carry_clipped(frame, 0., (rate * 0.5) as f32);
                }
                self.controls[i].set_native(value, seconds, frame, rate);
            } else {
                self.controls[i].set(value, seconds);
            }
        };
        match index {
            0 => {
                set(0, (value * 0.003) as f32);
                set(1, (value * 0.0015) as f32);
            }
            1 => {
                set(2, value as f32);
                set(3, (value * 0.37) as f32);
            }
            2 => {
                set(4, (value * 0.00025) as f32);
                set(5, (value * 0.00012) as f32);
            }
            4 => set(6, value as f32),
            _ => {}
        }
    }
    fn apply(&mut self, index: usize, value: f64, seconds: f64, native: bool) -> bool {
        if !self.prepared || !Self::valid(index, value) || !seconds.is_finite() || seconds < 0. {
            return false;
        }
        if index == 3 {
            if self.frame % 128 != 0 {
                return false;
            }
            let Some(curve) = self.drives.iter().find(|d| d.value == value) else {
                return false;
            };
            self.shaper.curve.copy_from_slice(&curve.curve);
        } else {
            self.set_controls(index, value, seconds, native);
        }
        self.parameters[index] = value;
        true
    }
    /// Portable exact-integer clock. Native seconds import is a separate call.
    pub fn param(&mut self, index: usize, value: f64) -> bool {
        self.apply(index, value, self.frame as f64 / self.rate, false)
    }
    /// setTargetAtTime keeps its original seconds/fractional offset; the host
    /// calls at ceil(seconds*rate). Drive curve messages use the actual native
    /// quantum control frame and do not use AudioParam time conversion.
    pub fn native_target(&mut self, index: usize, value: f64, seconds: f64) -> bool {
        if index != 3 && (!seconds.is_finite() || (seconds * self.rate).ceil() != self.frame as f64)
        {
            return false;
        }
        self.apply(index, value, seconds, true)
    }
    pub fn parameters(&self) -> [f64; 5] {
        self.parameters
    }
    pub fn input_mut(&mut self, ch: usize) -> Option<&mut [f32; BLOCK]> {
        self.input.get_mut(ch)
    }
    pub fn output(&self, ch: usize) -> Option<&[f32; BLOCK]> {
        self.output.get(ch)
    }
    /// Reference taps are copied by render(), not by per-sample graph tick.
    /// Stage0 is shaper,1 tone,2 final delay. They do not alter the DSP path.
    pub fn stage_output(&self, stage: usize, ch: usize) -> Option<&[f32; BLOCK]> {
        if stage == 2 {
            return self.output(ch);
        }
        self.stage_output.get(stage)?.get(ch)
    }
    pub fn begin_block(&mut self) {
        self.peak = 0.;
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        if !self.prepared {
            return [0.; 2];
        }
        if self.frame > 0 && self.frame % 128 == 0 {
            self.controls[6].carry_clipped(self.frame, 0., (self.rate * 0.5) as f32);
        }
        if self.frame % 4 == 0 {
            for i in 0..2 {
                let mut control = self.controls[i + 2].clone();
                self.linear_groups[i] = (0..4).all(|offset| {
                    Sine::increment(self.rate, control.tick(self.frame + offset, self.rate)) >= 0.3f32
                });
            }
        }
        let values =
            std::array::from_fn::<_, 7, _>(|i| self.controls[i].tick(self.frame, self.rate));
        let frequencies = [
            values[2],
            values[3],
            7.3f32,
            11.7f32,
        ];
        let depths = [values[0], values[1], values[4], values[5]];
        let oscillators: [f32; 4] = std::array::from_fn(|i| {
            self.oscillators[i].tick(frequencies[i], self.frame, i >= 2 || self.linear_groups[i])
        });
        let modulation: [f32; 4] = std::array::from_fn(|i| oscillators[i] * depths[i]);
        self.last_oscillators = oscillators;
        self.last_modulation = modulation;
        // AudioParamHandler aliases its Float32 intrinsic values as the summing
        // bus, then adds each connection in native connection order.
        self.last_delay = (((0.006f32 + modulation[0]) + modulation[1])
            + modulation[2])
            + modulation[3];
        self.last_tone = values[6].clamp(0., (self.rate * 0.5) as f32);
        let shaped = self.shaper.tick(input);
        let toned = self.tone.tick(shaped, self.last_tone, self.frame);
        self.last_shaped = shaped;
        self.last_toned = toned;
        let out = self.delay.tick(toned, self.last_delay);
        self.frame += 1;
        self.peak = self.peak.max(out[0].abs() as f64).max(out[1].abs() as f64);
        out
    }
    pub fn render(&mut self, n: usize, channels: usize) -> bool {
        if !self.prepared || n > BLOCK || !(1..=2).contains(&channels) {
            return false;
        }
        self.begin_block();
        for i in 0..n {
            let out = self.tick([self.input[0][i], self.input[channels - 1][i]]);
            for ch in 0..2 {
                self.output[ch][i] = out[ch];
                self.stage_output[0][ch][i] = self.last_shaped[ch];
                self.stage_output[1][ch][i] = self.last_toned[ch];
            }
        }
        true
    }
    pub fn reset(&mut self) {
        self.shaper.reset();
        self.tone.reset();
        self.delay.reset();
        self.controls = Self::controls(self.rate);
        for oscillator in &mut self.oscillators { oscillator.reset(); }
        self.linear_groups = [false; 2];
        self.last_oscillators = [0.; 4];
        self.last_modulation = [0.; 4];
        self.frame = 0;
        self.peak = 0.;
        self.last_delay = 0.006;
        self.last_tone = 350.;
        self.last_shaped = [0.; 2];
        self.last_toned = [0.; 2];
        self.stage_output.fill([[0.; BLOCK]; 2]);
        self.input.fill([0.; BLOCK]);
        self.output.fill([0.; BLOCK]);
        for index in [0, 1, 2, 4] {
            self.set_controls(index, self.parameters[index], 0., false);
        }
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.peak,
            1 => self.frame as f64,
            2 => 128.,
            3 => 0.006f32 as f64 * self.rate,
            4 => self.last_delay as f64,
            5 => self.last_tone as f64,
            6..=9 => self.oscillators[(index - 6) as usize].phase(),
            10 => self.prepared as u32 as f64,
            11 => self.drives.len() as f64,
            12..=18 => self.controls[(index - 12) as usize].value() as f64,
            19..=22 => self.last_oscillators[(index - 19) as usize] as f64,
            23..=26 => self.last_modulation[(index - 23) as usize] as f64,
            _ => 0.,
        }
    }
}
