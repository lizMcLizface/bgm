//! Fixed-native-clock setTarget profile derived from pinned Chromium's
//! AudioParamHandler::ProcessSetTarget. See CHROMIUM_NOTICES.txt.
//! Native seconds remain explicit: fractional start offset is evaluated before
//! Float32 recurrence. Four-lane expansion and convergence checks follow the
//! native128-frame control clock, independent of caller render partitions.
const TAU: f64 = 0.03f32 as f64;
const THRESHOLD: f32 = 4.539992976248485e-5;

#[derive(Clone)]
pub struct Target {
    value: f32,
    target: f32,
    started: f64,
    active: bool,
    new: bool,
    c: [f32; 4],
    group: [f32; 4],
    group_at: usize,
    next: f32,
    transition: f32,
    converged_block: bool,
    has_event: bool,
    carried_frame: u64,
}
impl Target {
    pub fn new(value: f32, rate: f64) -> Self {
        let c0 = (1. - (-1. / (TAU * rate)).exp()) as f32;
        let c1 = c0 * (2. - c0);
        let c2 = c0 * ((c0 - 3.) * c0 + 3.);
        let c3 = c0 * (c0 * ((4. - c0) * c0 - 6.) + 4.);
        Self {
            value,
            target: value,
            started: 0.,
            active: false,
            new: false,
            c: [c0, c1, c2, c3],
            group: [value; 4],
            group_at: 0,
            next: value,
            transition: value,
            converged_block: false,
            has_event: false,
            carried_frame: u64::MAX,
        }
    }
    pub fn set(&mut self, value: f32, time_seconds: f64) {
        self.target = value;
        self.started = time_seconds;
        self.active = true;
        self.new = true;
        self.group_at = 0;
        self.converged_block = false;
        self.has_event = true;
    }
    /// Import of an already captured/prebooked native timeline. A converged
    /// native segment emits target samples but returns its pre-evaluated scalar
    /// to the following event. An exact quantum-boundary old segment can run
    /// with zero outputs and still advance that scalar once.
    pub fn set_native(&mut self, value: f32, seconds: f64, frame: u64, rate: f64) {
        if self.has_event {
            if frame > 0 && frame % 128 == 0 && seconds * rate >= frame as f64 {
                self.value += (self.target - self.value) * self.c[0];
            } else if self.converged_block {
                self.value = self.transition;
            }
        }
        self.set(value, seconds);
    }
    pub fn value(&self) -> f32 {
        self.value
    }
    /// ValuesForFrameRange clips the output buffer and carries its final value
    /// into the next native quantum. Raw values inside that quantum remain
    /// unclipped and can start a later event. A previously converged target
    /// must therefore re-enter the block evaluator if clipping changed it.
    pub fn carry_clipped(&mut self, frame: u64, min: f32, max: f32) {
        if self.carried_frame == frame { return; }
        self.carried_frame = frame;
        let clipped = self.value.clamp(min, max);
        if clipped != self.value {
            self.value = clipped;
            if !self.active {
                self.active = true;
                self.new = false;
            }
        }
    }
    pub fn tick(&mut self, frame: u64, rate: f64) -> f32 {
        if !self.active {
            return self.value;
        }
        if self.new || frame % 128 == 0 {
            let mut value = self.value;
            if self.new {
                let difference = (value - self.target) as f64;
                value = (self.target as f64
                    + difference * (-((frame as f64 / rate - self.started).max(0.)) / TAU).exp())
                    as f32;
            } else {
                value += (self.target - value) * self.c[0];
            }
            self.new = false;
            self.converged_block = false;
            if frame as f64 / rate > self.started + 10. * TAU
                || self.target == 0. && value.abs() < THRESHOLD
                || self.target != 0. && (self.target - value).abs() < THRESHOLD * value.abs()
            {
                self.transition = value;
                self.converged_block = true;
                self.value = self.target;
                self.active = false;
                return self.value;
            }
            self.next = value;
            self.group_at = 4;
        }
        if self.group_at == 4 {
            let delta = self.target - self.next;
            self.group = [
                self.next,
                self.next + delta * self.c[0],
                self.next + delta * self.c[1],
                self.next + delta * self.c[2],
            ];
            self.next += delta * self.c[3];
            self.group_at = 0;
        }
        self.value = self.group[self.group_at];
        self.group_at += 1;
        self.value
    }
}
