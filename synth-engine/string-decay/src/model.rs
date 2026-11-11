//! Bounded immutable input of the actual tuned renderDecay model. Metadata not
//! read by that source remains in the complete saved host preparation spec.
pub struct Reader<'a> {
    pub values: &'a [f64],
    pub at: usize,
}
impl<'a> Reader<'a> {
    pub fn number(&mut self) -> Option<f64> {
        let x = *self.values.get(self.at)?;
        self.at += 1;
        x.is_finite().then_some(x)
    }
    pub fn count(&mut self, max: usize) -> Option<usize> {
        let x = self.number()?;
        (x >= 0. && x.fract() == 0. && x <= max as f64).then_some(x as usize)
    }
    pub fn list(&mut self, max: usize, noise: bool) -> Option<Vec<f64>> {
        let n = self.count(max)?;
        let a = self.values.get(self.at..self.at + n)?;
        if a.iter()
            .any(|v| !v.is_finite() && !(noise && *v == f64::NEG_INFINITY))
        {
            return None;
        }
        self.at += n;
        Some(a.to_vec())
    }
    pub fn rows(
        &mut self,
        max_rows: usize,
        max_cols: usize,
    ) -> Option<Vec<Option<Vec<Option<f64>>>>> {
        let n = self.count(max_rows)?;
        let mut a = Vec::with_capacity(n);
        for _ in 0..n {
            let c = self.number()?;
            if c == -1. {
                a.push(None);
                continue;
            }
            if c < 0. || c.fract() != 0. || c > max_cols as f64 {
                return None;
            }
            let row = self.values.get(self.at..self.at + c as usize)?;
            if row.iter().any(|v| v.is_infinite()) {
                return None;
            }
            self.at += c as usize;
            a.push(Some(
                row.iter()
                    .map(|v| if v.is_nan() { None } else { Some(*v) })
                    .collect(),
            ));
        }
        Some(a)
    }
}
pub struct Bed {
    pub edges: Vec<f64>,
    pub fades: Vec<f64>,
    pub from: f64,
    pub ratio: f64,
    pub rows: Vec<Vec<Option<f64>>>,
}
pub struct Model {
    pub rate: f64,
    pub seconds: f64,
    pub floor: f64,
    pub seed: u32,
    pub gain: f64,
    pub f0: f64,
    pub noise_tau: f64,
    pub phase: u32,
    pub flare: f64,
    pub bed_db: f64,
    pub tonal: Vec<f64>,
    pub noise: Vec<f64>,
    pub low: Option<f64>,
    pub env_times: Vec<f64>,
    pub env: Vec<Option<Vec<Option<f64>>>>,
    pub bed: Option<Bed>,
    pub skirt: Option<Vec<f64>>,
    pub wake: Option<[f64; 2]>,
}
fn times(a: &[f64]) -> bool {
    !a.is_empty()
        && a[0] >= 0.
        && a.last().is_some_and(|v| *v <= 120.)
        && a.windows(2).all(|w| w[1] > w[0])
}
pub fn power_size(x: f64) -> usize {
    1usize << x.log2().ceil() as u32
}
impl Model {
    pub fn parse(values: &[f64]) -> Option<Self> {
        let mut r = Reader { values, at: 0 };
        if r.number()? != 1. {
            return None;
        }
        let rate = r.number()?;
        let seconds = r.number()?;
        let floor = r.number()?;
        let seed = r.number()?;
        let gain = r.number()?;
        let f0 = r.number()?;
        let noise_tau = r.number()?;
        let phase = r.count(2)? as u32;
        let flare = r.number()?;
        let bed_db = r.number()?;
        if !(8000. ..=192000.).contains(&rate)
            || !(0.2..=4.).contains(&seconds)
            || !(1. ..=120.).contains(&floor)
            || !(0. ..=4294967295.).contains(&seed)
            || seed.fract() != 0.
            || !(0. ..=1e9).contains(&gain)
            || !(10. ..=12000.).contains(&f0)
            || !(0. ..=5.).contains(&noise_tau)
            || !(0. ..=4.).contains(&flare)
            || !(-120. ..=30.).contains(&bed_db)
        {
            return None;
        }
        let tonal = r.list(200, false)?;
        let noise = r.list(200, true)?;
        if tonal.is_empty()
            || (phase == 2 && tonal.len() < 2)
            || tonal.len() != noise.len()
            || !tonal.iter().all(|v| (-400. ..=200.).contains(v))
            || !noise
                .iter()
                .all(|v| *v == f64::NEG_INFINITY || (-400. ..=200.).contains(v))
        {
            return None;
        }
        let low = if r.count(1)? == 1 {
            let v = r.values.get(r.at).copied()?;
            r.at += 1;
            if !(v.is_finite() && (-400. ..=200.).contains(&v) || v == f64::NEG_INFINITY) {
                return None;
            }
            Some(v)
        } else {
            None
        };
        let env_times = r.list(64, false)?;
        if !times(&env_times) {
            return None;
        }
        let env = r.rows(7, 64)?;
        if env.len() != 7
            || env.iter().any(|row| {
                row.as_ref().is_some_and(|r| {
                    r.len() != env_times.len()
                        || r.iter()
                            .any(|v| v.is_some_and(|v| !(-400. ..=100.).contains(&v)))
                })
            })
        {
            return None;
        }
        let bed = if r.count(1)? == 1 {
            let edges = r.list(15, false)?;
            let fades = r.list(15, false)?;
            let from = r.number()?;
            let ratio = r.number()?;
            let rows = r.rows(16, 32)?;
            let rows: Option<Vec<_>> = rows.into_iter().collect();
            let rows = rows?;
            if rows.is_empty()
                || rows.len() != edges.len() + 1
                || edges.len() != fades.len()
                || !times(&edges)
                || fades.iter().any(|v| !(0.00001..=1.).contains(v))
                || !(1. ..=2000.).contains(&from)
                || !(1.0001..=2.).contains(&ratio)
                || rows.iter().any(|r| {
                    r.is_empty()
                        || r.len() != rows[0].len()
                        || r.iter()
                            .any(|v| v.is_some_and(|v| !(-400. ..=100.).contains(&v)))
                })
            {
                return None;
            }
            Some(Bed {
                edges,
                fades,
                from,
                ratio,
                rows,
            })
        } else {
            None
        };
        let skirt = if r.count(1)? == 1 {
            let v = r.list(6, false)?;
            if v.len() != 6 || !v.iter().all(|v| (0. ..=1.).contains(v)) {
                return None;
            }
            Some(v)
        } else {
            None
        };
        let wake = if r.count(1)? == 1 {
            let db = r.number()?;
            let tau = r.number()?;
            if !(-40. ..=24.).contains(&db) || !(0.05..=1.2).contains(&tau) {
                return None;
            }
            Some([db, tau])
        } else {
            None
        };
        if r.at != values.len() {
            return None;
        }
        let m = Self {
            rate,
            seconds,
            floor,
            seed: seed as u32,
            gain,
            f0,
            noise_tau,
            phase,
            flare,
            bed_db,
            tonal,
            noise,
            low,
            env_times,
            env,
            bed,
            skirt,
            wake,
        };
        if m.workspace_bytes() > 64 * 1024 * 1024 {
            return None;
        }
        Some(m)
    }
    pub fn workspace_bytes(&self) -> usize {
        let count = (self.seconds * self.rate).ceil() as usize;
        let noise_size = power_size(self.seconds * self.rate);
        let bed_count = self.bed.as_ref().map_or(0, |b| b.rows.len());
        let grid = ((self.seconds / 0.01).ceil() as usize + 2)
            * (self.tonal.len() + self.tonal.len().min(200) + 1)
            * 4;
        let noise_peak =
            (2 * noise_size * 8) + (bed_count * noise_size * 4) + noise_size * 4 + count * 4 + grid;
        let flare_size = power_size(0.45 * 1.6 * self.rate);
        let flare_peak = flare_size * 20 + count * 4 + grid;
        let wake_len = self.wake.map_or(0, |w| {
            power_size(((w[1] * self.rate).round().max(16.)) * 2.) / 2
        });
        let conv_peak = if wake_len > 0 {
            power_size((count + wake_len) as f64) * 32 + count * 8 + wake_len * 4 + grid
        } else {
            0
        };
        noise_peak.max(flare_peak).max(conv_peak) + 1024 * 1024
    }
}
