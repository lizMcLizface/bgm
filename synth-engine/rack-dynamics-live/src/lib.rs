//! Original rack parallel compressor / added limiter native clocks and topology.
//! No implicit PDC: dry0 frames, wet native6ms lookahead remain separate.
#[cfg(feature = "allocation-audit")]
mod allocation;
#[allow(dead_code)]
mod gain;
#[allow(dead_code)]
mod timeline;
use calmbgm_native_compressor::{Engine, PARAMETERS};
const BLOCK: usize = 2048;
const MAX_FRAME: f64 = 9007199254738944.;
pub struct Live {
    core: Box<Engine>,
    timelines: [timeline::Timeline; 5],
    gains: [gain::Gain; 2],
    kind: u32,
    rate: f64,
    values: [f64; 7],
    mask: u8,
    ready: bool,
    frame: u64,
    pulled: bool,
    last_non_silent_time: f64,
    process_core: bool,
    params_only: u64,
    commands: u64,
    peak: f64,
    input: [[f32; BLOCK]; 2],
    output: [[f32; BLOCK]; 2],
    wet: [[f32; BLOCK]; 2],
    coefficients: [f32; 7],
}
impl Live {
    pub fn new(kind: u32, rate: f64) -> Option<Box<Self>> {
        if !(1..=2).contains(&kind) {
            return None;
        }
        let tau = if kind == 1 { 0.012 } else { 0.02 };
        Some(Box::new(Self {
            core: Engine::new(rate)?,
            timelines: std::array::from_fn(|i| {
                timeline::Timeline::new(PARAMETERS[i].0 as f32, PARAMETERS[i].1 as f32)
            }),
            gains: [
                gain::Gain::prepared(rate, 1., tau)?,
                gain::Gain::prepared(rate, 1., tau)?,
            ],
            kind,
            rate,
            values: if kind == 1 {
                [-24., 12., 4., 0.005, 0.1, 0., 1.]
            } else {
                [-1., 0., 20., 0.002, 0.09, 0., 1.]
            },
            mask: 0,
            ready: false,
            frame: 0,
            pulled: false,
            last_non_silent_time: 0.,
            process_core: true,
            params_only: 0,
            commands: 0,
            peak: 0.,
            input: [[0.; BLOCK]; 2],
            output: [[0.; BLOCK]; 2],
            wet: [[0.; BLOCK]; 2],
            coefficients: [0.; 7],
        }))
    }
    fn canonical(frame: f64) -> bool {
        frame.is_finite()
            && frame >= 0.
            && frame <= MAX_FRAME
            && frame.fract() == 0.
            && frame % 128. == 0.
    }
    fn valid(index: usize, value: f64) -> bool {
        value.is_finite()
            && if index < 5 {
                let (a, b) = PARAMETERS[index];
                value >= a && value <= b
            } else {
                index < 7 && value >= 0. && value <= 8.
            }
    }
    pub fn initial(&mut self, index: usize, value: f64) -> bool {
        if self.ready
            || !Self::valid(index, value)
            || self.kind == 2
                && (1..5).contains(&index)
                && value != [0., 20., 0.002, 0.09][index - 1]
            || self.mask & (1 << index) != 0
        {
            return false;
        }
        self.values[index] = value;
        self.mask |= 1 << index;
        true
    }
    fn cold(&mut self, seconds: f64) {
        let intrinsic = if self.kind == 1 {
            [-24., 30., 12., 0.005, 0.05]
        } else {
            [-24., 0., 20., 0.002, 0.09]
        };
        for (i, value) in intrinsic.into_iter().enumerate() {
            self.timelines[i].restart(value);
            self.coefficients[i] = value as f32;
        }
        self.coefficients[5] = 1.;
        self.coefficients[6] = 1.;
        let range = if self.kind == 1 { 3..5 } else { 1..5 };
        for i in range {
            assert!(self.timelines[i].step_now(seconds, self.frame, self.rate, intrinsic[i]));
        }
        for g in &mut self.gains {
            g.restart_live();
        }
    }
    pub fn prepare(&mut self, frame: f64, seconds: f64) -> bool {
        self.prepare_inner(frame, seconds, true)
    }
    pub fn prepare_native(&mut self, frame: f64, seconds: f64) -> bool {
        let intrinsic = if self.kind == 1 {
            [-24., 30., 12., 0.005, 0.05, 1., 1.]
        } else {
            [-24., 0., 20., 0.002, 0.09, 1., 1.]
        };
        if self.values != intrinsic {
            return false;
        }
        self.prepare_inner(frame, seconds, false)
    }
    fn prepare_inner(&mut self, frame: f64, seconds: f64, packet: bool) -> bool {
        if self.ready
            || self.mask != 127
            || !Self::canonical(frame)
            || !seconds.is_finite()
            || seconds < 0.
            || (seconds * self.rate - frame).abs() > 0.5
        {
            return false;
        }
        let intrinsic = if self.kind == 1 {
            [-24., 30., 12., 0.005, 0.05]
        } else {
            [-24., 0., 20., 0.002, 0.09]
        };
        for (i, v) in intrinsic.into_iter().enumerate() {
            if !self.core.initial(i, v) {
                return false;
            }
        }
        if !self.core.prepare() {
            return false;
        }
        self.frame = frame as u64;
        self.ready = true;
        self.cold(seconds);
        if packet {
            self.patch(self.values, seconds, frame, true)
        } else {
            true
        }
    }
    pub fn patch(
        &mut self,
        values: [f64; 7],
        seconds: f64,
        called_frame: f64,
        initial: bool,
    ) -> bool {
        self.patch_masked(values,if self.kind==1{127}else{97},seconds,called_frame,initial)
    }
    pub fn lane(&mut self,index:usize,value:f64,seconds:f64,called_frame:f64,initial:bool)->bool{
        if index>=7{return false;}let mut values=self.values;values[index]=value;
        self.patch_masked(values,1<<index,seconds,called_frame,initial)
    }
    pub fn patch_masked(&mut self,values:[f64;7],mask:u32,seconds:f64,called_frame:f64,initial:bool)->bool{
        if !self.ready
            || mask==0 || mask>127 || self.kind==2&&mask&!97!=0
            || !Self::canonical(called_frame)
            || called_frame > self.frame as f64
            || !seconds.is_finite()
            || seconds < 0.
            || (seconds * self.rate - called_frame).abs() > 0.5
            || values.iter().enumerate().any(|(i, v)| !Self::valid(i, *v))
            || self.kind == 2 && values[1..5].iter().zip([0.,20.,0.002,0.09]).any(|(v,expected)|*v as f32!=expected as f32)
        {
            return false;
        }
        if (0..5).any(|i| mask&(1<<i)!=0 && !self.timelines[i].available_now(seconds, self.frame, self.rate))
            || (0..2).any(|i| mask&(1<<(i+5))!=0 && !self.gains[i].available_now(seconds, self.frame))
        {
            return false;
        }
        let tau = if self.kind == 1 { 0.012 } else { 0.02 };
        for i in 0..5 {
            if mask&(1<<i)==0 {
                continue;
            }
            let ok = if initial {
                self.timelines[i].step_now(seconds, self.frame, self.rate, values[i])
            } else {
                self.timelines[i].target_now(seconds, self.frame, self.rate, values[i], tau)
            };
            assert!(ok);
        }
        for i in 0..2 {
            if mask&(1<<(i+5))==0{continue;}
            let ok = if initial {
                self.gains[i].step_now(seconds, self.frame, values[i + 5])
            } else {
                self.gains[i].target_now(seconds, self.frame, values[i + 5])
            };
            assert!(ok);
        }
        for i in 0..7{if mask&(1<<i)!=0{self.values[i]=values[i];}}
        self.commands += 1;
        true
    }
    pub fn sync(&mut self, frame: f64) -> bool {
        if !self.ready
            || !Self::canonical(frame)
            || frame < self.frame as f64
            || self.frame % 128 != 0
        {
            return false;
        }
        self.frame = frame as u64;
        true
    }
    pub fn pulled(&mut self, value: u32) -> bool {
        if !self.ready || value > 1 || self.frame % 128 != 0 {
            return false;
        }
        self.pulled = value != 0;
        true
    }
    pub fn render(&mut self, n: usize, channels: usize, silent: bool) -> bool {
        if !self.ready
            || n > BLOCK
            || !(1..=2).contains(&channels)
            || (silent && (n != 128 || self.frame % 128 != 0))
            || self.frame + n as u64 > MAX_FRAME as u64
            || (0..channels).any(|c| self.input[c][..n].iter().any(|v| !v.is_finite()))
        {
            return false;
        }
        self.core.begin_block();
        self.peak = 0.;
        for i in 0..n {
            let out = if self.pulled {
                if self.frame % 128 == 0 {
                    self.process_core = !silent
                        || !(self.last_non_silent_time
                            + (if self.core.stat(1) == 0. {
                                256.
                            } else {
                                self.core.stat(2)
                            }) / self.rate
                            + self.core.stat(4)
                            < self.frame as f64 / self.rate);
                    if !self.process_core {
                        self.params_only += 1;
                    }
                    for j in 0..5 {
                        self.coefficients[j] = self.timelines[j].tick(self.frame, self.rate);
                        if self.process_core {
                            assert!(self.core.param(j, self.coefficients[j] as f64));
                        }
                    }
                }
                let dry = self.gains[0].tick(self.frame);
                let wet = self.gains[1].tick(self.frame);
                self.coefficients[5] = dry;
                self.coefficients[6] = wet;
                let input = [self.input[0][i], self.input[channels - 1][i]];
                let w = if self.process_core {
                    self.core.tick(input)
                } else {
                    [0.; 2]
                };
                self.wet[0][i] = w[0];
                self.wet[1][i] = w[1];
                if !silent && (self.frame + 1) % 128 == 0 {
                    self.last_non_silent_time = (self.frame + 1) as f64 / self.rate;
                }
                [input[0] * dry + w[0] * wet, input[1] * dry + w[1] * wet]
            } else {
                self.wet[0][i] = 0.;
                self.wet[1][i] = 0.;
                [0.; 2]
            };
            self.output[0][i] = out[0];
            self.output[1][i] = out[1];
            self.peak = self.peak.max(out[0].abs() as f64).max(out[1].abs() as f64);
            self.frame += 1;
        }
        true
    }
    pub fn reset(&mut self, seconds: f64) -> bool {
        if !self.ready
            || self.frame % 128 != 0
            || !seconds.is_finite()
            || (seconds * self.rate - self.frame as f64).abs() > 0.5
        {
            return false;
        }
        self.core.reset();
        self.last_non_silent_time = 0.;
        self.process_core = true;
        self.params_only = 0;
        self.cold(seconds);
        self.input.fill([0.; BLOCK]);
        self.output.fill([0.; BLOCK]);
        self.wet.fill([0.; BLOCK]);
        self.patch(self.values, seconds, self.frame as f64, true)
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.peak,
            1 => self.frame as f64,
            2 => self.core.stat(1),
            3 => self.core.stat(2),
            4 => self.core.stat(3),
            5 => self.pulled as u32 as f64,
            6 => self.commands as f64,
            7 => self.last_non_silent_time,
            8 => self.params_only as f64,
            9 => self.process_core as u32 as f64,
            10 => self.kind as f64,
            _ => f64::NAN,
        }
    }
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_new(kind: u32, rate: f64) -> *mut Live {
    Live::new(kind, rate)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn rack_dynamics_live_free(p: *mut Live) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_initial(p: &mut Live, index: usize, value: f64) -> u32 {
    p.initial(index, value) as u32
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_prepare(p: &mut Live, frame: f64, seconds: f64) -> u32 {
    p.prepare(frame, seconds) as u32
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_patch(
    p: &mut Live,
    seconds: f64,
    frame: f64,
    initial: u32,
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    e: f64,
    f: f64,
    g: f64,
) -> u32 {
    if initial > 1 {
        0
    } else {
        p.patch([a, b, c, d, e, f, g], seconds, frame, initial != 0) as u32
    }
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_sync(p: &mut Live, frame: f64) -> u32 {
    p.sync(frame) as u32
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_pulled(p: &mut Live, value: u32) -> u32 {
    p.pulled(value) as u32
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_render(
    p: &mut Live,
    n: usize,
    channels: usize,
    silent: u32,
) -> u32 {
    if silent > 1 {
        0
    } else {
        p.render(n, channels, silent != 0) as u32
    }
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_reset(p: &mut Live, seconds: f64) -> u32 {
    p.reset(seconds) as u32
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_input(p: &mut Live, ch: usize) -> *mut f32 {
    p.input
        .get_mut(ch)
        .map(|a| a.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_output(p: &Live, ch: usize) -> *const f32 {
    p.output
        .get(ch)
        .map(|a| a.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_wet(p: &Live, ch: usize) -> *const f32 {
    p.wet
        .get(ch)
        .map(|a| a.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_value(p: &Live, index: usize) -> f64 {
    p.values.get(index).copied().unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_coefficient(p: &Live, index: usize) -> f64 {
    p.coefficients
        .get(index)
        .map(|v| *v as f64)
        .unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn rack_dynamics_live_stat(p: &Live, index: u32) -> f64 {
    p.stat(index)
}

#[no_mangle]
pub extern "C" fn rack_dynamics_live_gain_curve(p: &Live, ch: usize) -> *const f32 {
    p.gains
        .get(ch)
        .map(|g| g.samples.as_ptr())
        .unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn rack_dynamics_live_prepare_native(p: &mut Live, frame: f64, seconds: f64) -> u32 {
    p.prepare_native(frame, seconds) as u32
}

#[no_mangle]pub extern "C" fn rack_dynamics_live_lane(p:&mut Live,index:usize,value:f64,seconds:f64,frame:f64,initial:u32)->u32{if initial>1{0}else{p.lane(index,value,seconds,frame,initial!=0)as u32}}
