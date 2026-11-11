//! Actual prepared a-rate setTarget subset of pinned AudioParamHandler.
//! Native128-frame evaluation and four-lane recurrence remain independent of
//! host splits. Converged samples and returned segment values are distinct.
#[derive(Clone, Copy)]
struct Event {
    fresh: bool,
    seconds: f64,
    value: f32,
}
fn converged(value: f32, target: f32, time: f64, start: f64, tau: f64) -> bool {
    const THRESHOLD: f32 = 4.539992976248485e-5;
    time > start + 10. * tau
        || target == 0. && value.abs() < THRESHOLD
        || target != 0. && (target - value).abs() < THRESHOLD * value.abs()
}
pub struct Gain {
    rate: f64,
    initial: f32,
    tau: f64,
    raw_tau: f64,
    sealed: bool,
    events: Vec<Event>,
    head: usize,
    current: f32,
    coefficients: [f32; 4],
    pub samples: [f32; 128],
}
impl Gain {
    pub fn new(rate: f64) -> Self {
        Self::prepared(rate, 1., 0.02).expect("validated voice sample rate")
    }
    /// Reusable target-only gain clock. Initial gain models the native value
    /// at frame0; preparation is explicitly sealed before audio rendering.
    pub fn prepared(rate: f64, initial: f64, time_constant: f64) -> Option<Self> {
        if !rate.is_finite()
            || rate.fract() != 0.
            || !(8000. ..=192000.).contains(&rate)
            || !initial.is_finite()
            || !(initial as f32).is_finite()
            || !time_constant.is_finite()
            || time_constant <= 0.
            || !(time_constant as f32).is_finite()
            || time_constant as f32 == 0.
        {
            return None;
        }
        let tau = time_constant as f32 as f64;
        let c0 = (1. - (-1. / (tau * rate)).exp()) as f32;
        Some(Self {
            rate,
            initial: initial as f32,
            tau,
            raw_tau: time_constant,
            sealed: false,
            events: Vec::with_capacity(2),
            head: 0,
            current: initial as f32,
            coefficients: [
                c0,
                c0 * (2. - c0),
                c0 * ((c0 - 3.) * c0 + 3.),
                c0 * (c0 * ((4. - c0) * c0 - 6.) + 4.),
            ],
            samples: [initial as f32; 128],
        })
    }
    pub fn push(&mut self, seconds: f64, value: f64) -> bool {
        if self.sealed
            || !seconds.is_finite()
            || seconds < 0.
            || seconds * self.rate > 9007199254740864.
            || self.events.len() >= 256
            || self.events.last().is_some_and(|e| e.seconds >= seconds)
            || !value.is_finite()
            || !(value as f32).is_finite()
        {
            return false;
        }
        self.events.push(Event {
            seconds,
            value: value as f32,
            fresh: true,
        });
        true
    }
    pub fn len(&self) -> usize {
        self.events.len()
    }
    pub fn seal(&mut self) {
        self.sealed = true;
    }
    pub fn reset(&mut self) {
        self.head = 0;
        self.current = self.initial;
        self.samples.fill(self.initial);
    }
    fn prepare_quantum(&mut self, frame: u64) {
        let now = frame as f64 / self.rate;
        for e in &mut self.events {
            if e.fresh {
                if e.seconds < now {
                    e.seconds = now;
                }
                e.fresh = false;
            }
        }
        if self.head == self.events.len() {
            self.samples.fill(self.current);
            return;
        }
        let time = frame as f64 / self.rate;
        let first = self.events[self.head];
        if (frame + 128) as f64 / self.rate <= first.seconds {
            self.samples.fill(self.current);
            return;
        }
        let last = self.events[self.events.len() - 1];
        if last.seconds + 1.5 * 128. / self.rate < time
            && converged(self.current, last.value, time, last.seconds, self.raw_tau)
        {
            self.current = last.value;
            self.samples.fill(last.value);
            let last = *self.events.last().unwrap();
            self.events.clear();
            self.events.push(last);
            self.head = 0;
            return;
        }
        let mut write = 0usize;
        if first.seconds > time {
            let first_frame = (first.seconds * self.rate).ceil() as u64;
            let count = (first_frame - frame).min(128) as usize;
            self.samples[..count].fill(self.current);
            write = count;
        }
        let mut value = self.current;
        let mut index = self.head;
        let mut skipped = 0;
        while index < self.events.len() && write < 128 {
            let event = self.events[index];
            let next = self.events.get(index + 1).copied();
            let current = frame + write as u64;
            if next.is_some_and(|n| n.seconds * self.rate < current as f64) {
                skipped += 1;
                index += 1;
                continue;
            }
            let end = next.map_or(frame + 128, |n| {
                let r = n.seconds * self.rate;
                if (frame + 128) as f64 > r {
                    r.ceil() as u64
                } else {
                    frame + 128
                }
            });
            let fill = (end - frame).min(128) as usize;
            let r = event.seconds * self.rate;
            if r <= current as f64 && (current as f64) < r + 1. {
                value = (event.value as f64
                    + (value - event.value) as f64
                        * (-(current as f64 / self.rate - event.seconds) / self.tau).exp())
                    as f32;
            } else {
                value += (event.value - value) * self.coefficients[0];
            }
            if converged(
                value,
                event.value,
                current as f64 / self.rate,
                event.seconds,
                self.tau,
            ) {
                self.samples[write..fill].fill(event.value);
                write = fill;
            } else {
                let vector_end = write + ((fill - write) / 4) * 4;
                let [c0, c1, c2, c3] = self.coefficients;
                while write < vector_end {
                    let delta = event.value - value;
                    self.samples[write] = value;
                    self.samples[write + 1] = value + delta * c0;
                    self.samples[write + 2] = value + delta * c1;
                    self.samples[write + 3] = value + delta * c2;
                    value += delta * c3;
                    write += 4;
                }
                while write < fill {
                    let v = value;
                    value += (event.value - value) * c0;
                    self.samples[write] = v;
                    write += 1;
                }
                if write >= 1 {
                    value = self.samples[write - 1];
                }
            }
            index += 1;
        }
        let remove = skipped.min(self.events.len().saturating_sub(1));
        if remove > 0 {
            self.events.drain(..remove);
        }
        self.head = 0;
        self.current = self.samples[127];
    }
    pub fn tick(&mut self, frame: u64) -> f32 {
        self.sealed = true;
        if frame % 128 == 0 {
            self.prepare_quantum(frame);
        }
        self.samples[frame as usize % 128]
    }
}

impl Gain {
    pub fn restart_live(&mut self) {
        self.events.clear();
        self.head = 0;
        self.current = self.initial;
        self.samples.fill(self.initial);
        self.sealed = true;
    }
    pub fn target_now(&mut self, frame: u64, value: f64) -> bool {
        let seconds = frame as f64 / self.rate;
        if !value.is_finite()
            || !(value as f32).is_finite()
            || self.events.last().is_some_and(|e| e.seconds > seconds)
        {
            return false;
        }
        while self.events.len() > 1 && self.events[1].seconds * self.rate < (frame as f64) {
            self.events.remove(0);
        }
        self.head = 0;
        let event = Event {
            seconds,
            value: value as f32,
            fresh: true,
        };
        if let Some(last) = self.events.last_mut() {
            if last.seconds == seconds {
                *last = event;
                return true;
            }
        }
        if self.events.len() >= 2 {
            return false;
        }
        self.events.push(event);
        true
    }
}
