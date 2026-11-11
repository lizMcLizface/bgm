//! Prepared step/target subset of pinned AudioParamHandler's fixed-k-rate
//! evaluator. It preserves original seconds, zero-output old segments, native
//! convergence and the distinction between audio-frame and control-frame time.
//! See CHROMIUM_PROFILE.json / CHROMIUM_NOTICES.txt for original BSD sources.
pub const MAX_EVENTS: usize = 256;
#[derive(Clone, Copy)]
pub struct Event {
    pub kind: u32,
    pub seconds: f64,
    pub value: f64,
    pub tau: f64,
}
fn converged(value: f32, target: f32, time: f64, start: f64, tau: f64) -> bool {
    const THRESHOLD: f32 = 4.539992976248485e-5;
    time > start + 10. * tau
        || target == 0. && value.abs() < THRESHOLD
        || target != 0. && (target - value).abs() < THRESHOLD * value.abs()
}
pub struct Timeline {
    events: Vec<Event>,
    head: usize,
    current: f32,
    requested: f64,
    initial: f64,
    min: f32,
    max: f32,
}
impl Timeline {
    pub fn new(min: f32, max: f32) -> Self {
        Self {
            events: Vec::with_capacity(MAX_EVENTS),
            head: 0,
            current: 0.,
            requested: 0.,
            initial: 0.,
            min,
            max,
        }
    }
    pub fn len(&self) -> usize {
        self.events.len()
    }
    pub fn initial(&mut self, value: f64) {
        self.initial = value;
        self.current = value as f32;
        self.requested = value;
    }
    pub fn push(&mut self, event: Event) -> bool {
        if self.events.len() >= MAX_EVENTS
            || self
                .events
                .last()
                .is_some_and(|e| e.seconds >= event.seconds)
        {
            return false;
        }
        self.events.push(event);
        true
    }
    pub fn reset(&mut self) {
        self.head = 0;
        self.current = self.initial as f32;
        self.requested = self.initial;
    }
    pub fn requested(&self) -> f64 {
        self.requested
    }
    pub fn current(&self) -> f32 {
        self.current
    }
    pub fn remaining(&self) -> usize {
        self.events.len() - self.head
    }
    /// One native128-frame control tick; caller never invokes this between
    /// control boundaries. No timeline mutation/allocation occurs during ticks.
    pub fn tick(&mut self, frame: u64, rate: f64) -> f32 {
        if self.head == self.events.len() {
            return self.current;
        }
        let time = frame as f64 / rate;
        let first = self.events[self.head];
        if time < first.seconds {
            return self.current;
        }
        let last = self.events[self.events.len() - 1];
        if last.seconds + 1.5 * 128. / rate < time
            && (last.kind == 0
                || converged(
                    self.current,
                    last.value as f32,
                    time,
                    last.seconds,
                    last.tau,
                ))
        {
            self.current = (last.value as f32).clamp(self.min, self.max);
            self.requested = last.value;
            self.head = self.events.len();
            return self.current;
        }
        let mut value = self.current;
        let mut index = self.head;
        let mut skipped = 0;
        let mut out = None;
        while index < self.events.len() && out.is_none() {
            let event = self.events[index];
            let next = self.events.get(index + 1).copied();
            let r = event.seconds * rate;
            if next.is_some_and(|next| next.seconds * rate < frame as f64)
                && !(event.kind == 0 && r <= frame as f64 && (frame as f64) < r + 1.)
            {
                self.requested = event.value;
                skipped += 1;
                index += 1;
                continue;
            }
            self.requested = event.value;
            // ValuesForFrameRange asks for one audio-frame value even though
            // its recurrence rate is sampleRate/128. A next event exactly at
            // this boundary can cause a zero-output preceding segment.
            let fills = next.map_or(true, |next| (next.seconds * rate).ceil() > frame as f64);
            if event.kind == 0 {
                value = event.value as f32;
                if fills {
                    out = Some(value);
                }
            } else {
                let target = event.value as f32;
                let tau = event.tau as f32;
                let c = (1. - (-1. / (tau as f64 * (rate / 128.))).exp()) as f32;
                if r <= frame as f64 && (frame as f64) < r + 1. {
                    value = (target as f64
                        + (value - target) as f64 * (-(time - event.seconds) / tau as f64).exp())
                        as f32;
                } else {
                    value += (target - value) * c;
                }
                if fills {
                    out = Some(
                        if converged(value, target, time, event.seconds, tau as f64) {
                            target
                        } else {
                            value
                        },
                    );
                }
            }
            index += 1;
        }
        self.head += skipped;
        self.current = out.unwrap_or(value).clamp(self.min, self.max);
        self.current
    }
}
