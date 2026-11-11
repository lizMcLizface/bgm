//! Offthread original Brownian booking forecast. No audio rendering here.
//! Source Walk is reused read-only; candidates never mutate committed state.
#[cfg(feature = "allocation-audit")]
mod allocation;
#[path = "../../ambience-spatial/src/walk.rs"]
mod walk;
use walk::Walk;
const MAX_POINTS: usize = 256;
const MAX_SECONDS: f64 = 137438953.;
#[derive(Clone, Copy)]
struct Candidate {
    kind: u32,
    tag: u32,
    period_after: f64,
    initial: f64,
    first: u64,
    min: usize,
    max: usize,
    states: [Walk; 3],
    after: Walk,
    at: f64,
    points: [[f64; 2]; MAX_POINTS],
}
pub struct Planner {
    seed: u32,
    initial_period: f64,
    period: f64,
    offset: f64,
    birth: f64,
    walk: Option<Walk>,
    next: u64,
    last_refill: f64,
    tag: u32,
    revision: u32,
    pending: Option<Candidate>,
    committed: u32,
}
fn period(p: f64) -> bool {
    p.is_finite() && (15. ..=900.).contains(&p)
}
fn seconds(s: f64) -> bool {
    s.is_finite() && (0. ..=MAX_SECONDS).contains(&s)
}
impl Planner {
    pub fn new(seed: u32, p: f64, offset: f64) -> Option<Box<Self>> {
        if !period(p) || !offset.is_finite() || !(0. ..=1_000_000.).contains(&offset) {
            return None;
        }
        Some(Box::new(Self {
            seed,
            initial_period: p,
            period: p,
            offset,
            birth: 0.,
            walk: None,
            next: 0,
            last_refill: 0.,
            tag: 0,
            revision: 0,
            pending: None,
            committed: 0,
        }))
    }
    fn new_tag(&self) -> Option<u32> {
        self.tag.checked_add(1)
    }
    pub fn begin_first(&mut self, period_after: f64) -> bool {
        if self.pending.is_some() || self.walk.is_some() || !period(period_after) {
            return false;
        }
        let Some(tag) = self.new_tag() else {
            return false;
        };
        let mut w = Walk::new(self.seed, self.period);
        let initial = w.at(self.offset);
        let first = (self.offset / 2.).floor() as u64 + 1;
        let mut nominal = 0;
        while (first + nominal) as f64 * 2. - self.offset <= 90. {
            nominal += 1;
            if nominal as usize + 1 > MAX_POINTS {
                return false;
            }
        }
        let min = nominal.saturating_sub(1) as usize;
        let max = nominal as usize + 1;
        let mut c = Candidate {
            kind: 1,
            tag,
            period_after,
            initial,
            first,
            min,
            max,
            states: [w; 3],
            after: w,
            at: 0.,
            points: [[0.; 2]; MAX_POINTS],
        };
        for n in 0..max {
            let index = first + n as u64;
            let value = w.knot(index);
            c.points[n] = [index as f64, value];
            let count = n + 1;
            if count >= min && count <= max {
                c.states[count - min] = w;
            }
        }
        c.after = w;
        self.pending = Some(c);
        self.tag = tag;
        true
    }
    pub fn begin_refill(&mut self, now: f64) -> bool {
        if self.pending.is_some() || !seconds(now) || now < self.last_refill || now < self.birth {
            return false;
        }
        let (Some(mut w), Some(tag)) = (self.walk, self.new_tag()) else {
            return false;
        };
        let mut last = self.next;
        let until = now + 90.;
        while self.birth + last as f64 * 2. - self.offset <= until {
            last += 1;
            if last - self.next > MAX_POINTS as u64 {
                return false;
            }
        }
        let n = (last - self.next) as usize;
        let mut c = Candidate {
            kind: 2,
            tag,
            period_after: self.period,
            initial: 0.,
            first: self.next,
            min: n,
            max: n,
            states: [w; 3],
            after: w,
            at: now,
            points: [[0.; 2]; MAX_POINTS],
        };
        for i in 0..n {
            let index = self.next + i as u64;
            c.points[i] = [index as f64, w.knot(index)];
        }
        c.after = w;
        self.pending = Some(c);
        self.tag = tag;
        true
    }
    pub fn commit(&mut self, tag: u32, count: usize, birth: f64) -> bool {
        let Some(c) = self.pending else {
            return false;
        };
        if c.tag != tag
            || count < c.min
            || count > c.max
            || !seconds(birth)
            || self.revision == u32::MAX
            || self.committed == u32::MAX
        {
            return false;
        }
        let mut w = if c.kind == 1 {
            let mut exact = 0;
            while exact < c.max
                && birth + (c.first + exact as u64) as f64 * 2. - self.offset <= birth + 90.
            {
                exact += 1;
            }
            if exact != count {
                return false;
            }
            self.birth = birth;
            self.last_refill = birth;
            c.states[count - c.min]
        } else {
            if count != c.max || birth != self.birth {
                return false;
            }
            self.last_refill = c.at;
            c.after
        };
        w.set_period(c.period_after);
        self.walk = Some(w);
        self.period = c.period_after;
        self.next = c.first + count as u64;
        self.pending = None;
        self.revision += 1;
        self.committed += 1;
        true
    }
    pub fn cancel(&mut self, tag: u32) -> bool {
        if self.pending.is_none_or(|c| c.tag != tag) {
            return false;
        }
        self.pending = None;
        true
    }
    pub fn set_period(&mut self, p: f64) -> bool {
        if !period(p) || self.pending.is_some() || self.revision == u32::MAX {
            return false;
        }
        self.period = p;
        if let Some(w) = &mut self.walk {
            w.set_period(p);
        }
        self.revision += 1;
        true
    }
    pub fn reset(&mut self) -> bool {
        if self.revision == u32::MAX {
            return false;
        }
        self.period = self.initial_period;
        self.birth = 0.;
        self.walk = None;
        self.next = 0;
        self.pending = None;
        self.last_refill = 0.;
        self.committed = 0;
        self.revision += 1;
        true
    }
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_new(seed: u32, p: f64, offset: f64) -> *mut Planner {
    Planner::new(seed, p, offset)
        .map(Box::into_raw)
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn ambience_control_preparation_free(p: *mut Planner) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_first(p: &mut Planner, period_after: f64) -> u32 {
    p.begin_first(period_after) as u32
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_refill(p: &mut Planner, now: f64) -> u32 {
    p.begin_refill(now) as u32
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_commit(
    p: &mut Planner,
    tag: u32,
    count: u32,
    birth: f64,
) -> u32 {
    p.commit(tag, count as usize, birth) as u32
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_cancel(p: &mut Planner, tag: u32) -> u32 {
    p.cancel(tag) as u32
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_period(p: &mut Planner, value: f64) -> u32 {
    p.set_period(value) as u32
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_reset(p: &mut Planner) -> u32 {
    p.reset() as u32
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_points(p: &Planner) -> *const f64 {
    p.pending
        .as_ref()
        .map_or(std::ptr::null(), |c| c.points.as_ptr().cast())
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_stat(p: &Planner, key: u32) -> f64 {
    match key {
        0 => p.period,
        1 => p.offset,
        2 => p.birth,
        3 => p.next as f64,
        4 => p.walk.map_or(0, |w| w.draws) as f64,
        5 => p.revision as f64,
        6 => p.committed as f64,
        7 => p.last_refill,
        8 => p.pending.is_some() as u32 as f64,
        16..=24 => p.pending.map_or(f64::NAN, |c| match key {
            16 => c.tag as f64,
            17 => c.kind as f64,
            18 => c.min as f64,
            19 => c.max as f64,
            20 => c.initial,
            21 => c.first as f64,
            22 => c.period_after,
            23 => c.at,
            _ => c.after.draws as f64,
        }),
        _ => f64::NAN,
    }
}

/// Independent offthread phase resource. Caller supplies the captured actual
/// constructor period; original layer phase and offset arithmetic stay owned.
pub struct PhaseResource {
    table: Vec<f32>,
    metadata: [f64; 7],
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_phase_new(
    rate: f64,
    wave: u32,
    p: f64,
    offset: f64,
) -> *mut PhaseResource {
    if !rate.is_finite()
        || rate.fract() != 0.
        || !(8000. ..=192000.).contains(&rate)
        || wave > 6
        || !period(p)
        || !offset.is_finite()
        || !(0. ..=1_000_000.).contains(&offset)
    {
        return std::ptr::null_mut();
    }
    let size = if rate <= 24000. {
        2048
    } else if rate <= 88200. {
        4096
    } else {
        16384
    };
    let base = if wave == 6 {
        0.31
    } else {
        let x = wave as f64 * 0.618034 + 0.07;
        x - x.floor()
    };
    let phase = base + offset / p;
    let angle = std::f64::consts::TAU * (phase - phase.floor());
    let real = angle.sin() as f32;
    let imag = angle.cos() as f32;
    let Some(table) = calmbgm_native_wave_preparation::prepare(size, real, imag) else {
        return std::ptr::null_mut();
    };
    Box::into_raw(Box::new(PhaseResource {
        table,
        metadata: [
            rate,
            wave as f64,
            p,
            offset,
            real as f64,
            imag as f64,
            size as f64,
        ],
    }))
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_phase_data(p: &PhaseResource) -> *const f32 {
    p.table.as_ptr()
}
#[no_mangle]
pub extern "C" fn ambience_control_preparation_phase_stat(p: &PhaseResource, key: u32) -> f64 {
    p.metadata.get(key as usize).copied().unwrap_or(f64::NAN)
}
#[no_mangle]
pub unsafe extern "C" fn ambience_control_preparation_phase_free(p: *mut PhaseResource) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
