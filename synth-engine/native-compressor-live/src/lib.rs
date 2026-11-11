//! Original immediate step setters and explicit pull state around the unchanged
//! owned native compressor. The absolute parameter clock and processed DSP clock
//! remain separate, including a disconnected node's unprocessed pending steps.
#[cfg(feature = "allocation-audit")]
mod allocation;
#[allow(dead_code)]
mod timeline;
use calmbgm_native_compressor::{Engine, BLOCK, PARAMETERS};
pub struct Live {
    core: Box<Engine>,
    timelines: [timeline::Timeline; 5],
    values: [f64; 5],
    rate: f64,
    frame: u64,
    ready: bool,
    mask: u8,
    pulled: bool,
    last_non_silent_time: f64,
    process_core: bool,
    params_only_quanta: u64,
    commands: u64,
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
}
impl Live {
    pub fn new(rate: f64) -> Option<Box<Self>> {
        Some(Box::new(Self {
            core: Engine::new(rate)?,
            timelines: std::array::from_fn(|i| {
                timeline::Timeline::new(PARAMETERS[i].0 as f32, PARAMETERS[i].1 as f32)
            }),
            values: [-24., 30., 12., 0.005, 0.05],
            rate,
            frame: 0,
            ready: false,
            mask: 0,
            pulled: false,
            last_non_silent_time: 0.,
            process_core: true,
            params_only_quanta: 0,
            commands: 0,
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
        }))
    }
    fn canonical(frame: f64) -> bool {
        frame.is_finite()
            && frame >= 0.
            && frame <= 9007199254738944.
            && frame.fract() == 0.
            && frame % 128. == 0.
    }
    pub fn initial(&mut self, index: usize, value: f64) -> bool {
        if self.ready || !self.core.initial(index, value) {
            return false;
        }
        self.values[index] = value;
        self.timelines[index].initial(value);
        self.mask |= 1 << index;
        true
    }
    pub fn prepare(&mut self, frame: f64) -> bool {
        if self.ready || self.mask != 31 || !Self::canonical(frame) || !self.core.prepare() {
            return false;
        }
        self.frame = frame as u64;
        self.ready = true;
        true
    }
    pub fn sync(&mut self, frame: f64) -> bool {
        if !self.ready
            || !Self::canonical(frame)
            || self.frame % 128 != 0
            || frame < self.frame as f64
        {
            return false;
        }
        self.frame = frame as u64;
        true
    }
    pub fn step(&mut self, index: usize, value: f64, seconds: f64, called_frame: f64) -> bool {
        if !self.ready
            || index >= 5
            || !Self::canonical(called_frame)
            || !seconds.is_finite()
            || seconds < 0.
            || seconds * self.rate > 9007199254738944.
            || (seconds * self.rate - called_frame).abs() > 0.5
            || !self.timelines[index].step_now(seconds, called_frame as u64, self.rate, value)
        {
            return false;
        }
        self.values[index] = value;
        self.commands += 1;
        true
    }
    pub fn pulled(&mut self, value: bool) -> bool {
        if !self.ready || self.frame % 128 != 0 {
            return false;
        }
        self.pulled = value;
        true
    }
    pub fn property(&mut self, index: usize, value: f64, seconds: f64, called_frame: f64) -> bool {
        if !self.step(index, value, seconds, called_frame) {
            return false;
        }
        // Public AudioParam.value changes the intrinsic scalar and also
        // schedules a step; ordinary setValueAtTime only schedules the step.
        self.timelines[index].intrinsic(value);
        true
    }
    pub fn render(&mut self, n: usize, channels: usize) -> bool {
        self.render_inner(n, channels, false)
    }
    /// Literal AudioHandler silence hint for one native quantum. `true` means
    /// known-silent input metadata, never a scan for zero-valued samples.
    pub fn render_hint(&mut self, n: usize, channels: usize, inputs_silent: bool) -> bool {
        if n != 128 || self.frame % 128 != 0 {
            return false;
        }
        self.render_inner(n, channels, inputs_silent)
    }
    fn render_inner(&mut self, n: usize, channels: usize, inputs_silent: bool) -> bool {
        if !self.ready
            || n > BLOCK
            || !(1..=2).contains(&channels)
            || self
                .frame
                .checked_add(n as u64)
                .is_none_or(|end| end > 9007199254740991)
        {
            return false;
        }
        self.core.begin_block();
        for i in 0..n {
            let out = if self.pulled {
                if self.frame % 128 == 0 {
                    // AudioHandler::PropagatesSilence compares absolute context
                    // seconds. Fresh handlers start last_non_silent_time at 0,
                    // including when created in an already old context.
                    self.process_core = !inputs_silent
                        || !(self.last_non_silent_time
                            // Native delay starts at256 before first Process;
                            // SetPreDelayTime installs the rate-specific value.
                            + if self.core.stat(1) == 0. { 256. } else { self.core.stat(2) } / self.rate
                            + self.core.stat(4)
                            < self.frame as f64 / self.rate);
                    if !self.process_core {
                        self.params_only_quanta += 1;
                    }
                    for index in 0..5 {
                        let value = self.timelines[index].tick(self.frame, self.rate);
                        if self.process_core {
                            let accepted = self.core.param(index, value as f64);
                            debug_assert!(accepted);
                        }
                    }
                }
                let out = if self.process_core {
                    self.core
                        .tick([self.input[0][i], self.input[channels - 1][i]])
                } else {
                    [0.; 2]
                };
                // Native updates this AFTER processing the complete quantum.
                if !inputs_silent && (self.frame + 1) % 128 == 0 {
                    self.last_non_silent_time = (self.frame + 1) as f64 / self.rate;
                }
                out
            } else {
                [0.; 2]
            };
            self.output[0][i] = out[0];
            self.output[1][i] = out[1];
            self.frame += 1;
        }
        true
    }
    pub fn reset(&mut self) -> bool {
        if !self.ready || self.frame % 128 != 0 {
            return false;
        }
        self.core.reset();
        self.last_non_silent_time = 0.;
        self.process_core = true;
        self.params_only_quanta = 0;
        for i in 0..5 {
            self.timelines[i].restart(self.values[i]);
        }
        self.input.fill([0.; BLOCK]);
        self.output.fill([0.; BLOCK]);
        true
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.core.stat(0),
            1 => self.frame as f64,
            2 => self.core.stat(1),
            3 => self.core.stat(2),
            4 => self.core.stat(3),
            5 => self.core.stat(4),
            6 => self.core.stat(5),
            7 => self.core.stat(6),
            8 => self.ready as u32 as f64,
            9 => self.pulled as u32 as f64,
            10 => self
                .timelines
                .iter()
                .map(timeline::Timeline::len)
                .sum::<usize>() as f64,
            11 => self.commands as f64,
            12 => self.last_non_silent_time,
            13 => self.params_only_quanta as f64,
            14 => self.process_core as u32 as f64,
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn native_comp_live_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn native_comp_live_new(rate: f64) -> *mut Live {
    Live::new(rate)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn native_comp_live_free(p: *mut Live) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn native_comp_live_initial(p: &mut Live, index: usize, value: f64) -> u32 {
    p.initial(index, value) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_live_prepare(p: &mut Live, frame: f64) -> u32 {
    p.prepare(frame) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_live_sync(p: &mut Live, frame: f64) -> u32 {
    p.sync(frame) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_live_step(
    p: &mut Live,
    index: usize,
    value: f64,
    seconds: f64,
    frame: f64,
) -> u32 {
    p.step(index, value, seconds, frame) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_live_property(
    p: &mut Live,
    index: usize,
    value: f64,
    seconds: f64,
    frame: f64,
) -> u32 {
    p.property(index, value, seconds, frame) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_live_pulled(p: &mut Live, value: u32) -> u32 {
    if value > 1 {
        0
    } else {
        p.pulled(value != 0) as u32
    }
}
#[no_mangle]
pub extern "C" fn native_comp_live_render(p: &mut Live, n: usize, channels: usize) -> u32 {
    p.render(n, channels) as u32
}
#[no_mangle]
pub extern "C" fn native_comp_live_render_hint(
    p: &mut Live,
    n: usize,
    channels: usize,
    inputs_silent: u32,
) -> u32 {
    if inputs_silent > 1 {
        0
    } else {
        p.render_hint(n, channels, inputs_silent != 0) as u32
    }
}
#[no_mangle]
pub extern "C" fn native_comp_live_reset(p: &mut Live) -> u32 {
    p.reset() as u32
}
#[no_mangle]
pub extern "C" fn native_comp_live_input(p: &mut Live, ch: usize) -> *mut f32 {
    p.input
        .get_mut(ch)
        .map(|a| a.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn native_comp_live_output(p: &Live, ch: usize) -> *const f32 {
    p.output
        .get(ch)
        .map(|a| a.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn native_comp_live_value(p: &Live, index: usize) -> f64 {
    p.values.get(index).copied().unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn native_comp_live_coefficient(p: &Live, index: usize) -> f64 {
    p.timelines
        .get(index)
        .map(|t| t.current() as f64)
        .unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn native_comp_live_stat(p: &Live, index: u32) -> f64 {
    p.stat(index)
}
