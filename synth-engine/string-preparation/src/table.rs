//! Bounded owned upload of the actual three-strength measured string schema.
//! Null envelope values use NaN on the numeric ABI, never in numeric DSP fields.
pub type Rows = Option<Vec<Option<Vec<Option<f64>>>>>;
#[derive(Clone)]
pub struct Vibrato {
    pub rate: f64,
    pub depths: Vec<f64>,
}
#[derive(Clone, Default)]
pub struct Layer {
    pub present: bool,
    pub total: f64,
    pub onset: f64,
    pub cells: Vec<[f64; 3]>,
    pub vibrato: Option<Vibrato>,
    pub env: Rows,
    pub release: Rows,
    pub bed: Rows,
}
#[derive(Clone)]
pub struct Pitch {
    pub midi: f64,
    pub f0: f64,
    pub layers: [Layer; 3],
}
#[derive(Clone)]
pub struct Body {
    pub from: f64,
    pub ratio: f64,
    pub db: Vec<f64>,
}
#[derive(Clone)]
pub struct Table {
    pub decay: bool,
    pub env_times: Vec<f64>,
    pub release_times: Vec<f64>,
    pub pitches: Vec<Pitch>,
    pub body: Option<Body>,
}
pub struct Read<'a> {
    pub values: &'a [f64],
    pub at: usize,
}
impl<'a> Read<'a> {
    pub fn number(&mut self) -> Option<f64> {
        let v = *self.values.get(self.at)?;
        self.at += 1;
        v.is_finite().then_some(v)
    }
    pub fn count(&mut self, max: usize) -> Option<usize> {
        let v = self.number()?;
        (v >= 0. && v.fract() == 0. && v <= max as f64).then_some(v as usize)
    }
    pub fn list(&mut self, max: usize) -> Option<Vec<f64>> {
        let n = self.count(max)?;
        let a = self.values.get(self.at..self.at + n)?;
        if !a.iter().all(|v| v.is_finite()) {
            return None;
        }
        self.at += n;
        Some(a.to_vec())
    }
    pub fn rows(&mut self, max_rows: usize, max_cols: usize) -> Option<Rows> {
        let n = self.number()?;
        if n == -1. {
            return Some(None);
        }
        if n < 0. || n.fract() != 0. || n > max_rows as f64 {
            return None;
        }
        let mut rows = Vec::with_capacity(n as usize);
        for _ in 0..n as usize {
            let c = self.number()?;
            if c == -1. {
                rows.push(None);
                continue;
            }
            if c < 0. || c.fract() != 0. || c > max_cols as f64 {
                return None;
            }
            let v = self.values.get(self.at..self.at + c as usize)?;
            if v.iter().any(|v| v.is_infinite()) {
                return None;
            }
            self.at += c as usize;
            rows.push(Some(
                v.iter()
                    .map(|v| if v.is_nan() { None } else { Some(*v) })
                    .collect(),
            ));
        }
        Some(Some(rows))
    }
}
fn times(v: &[f64]) -> bool {
    !v.is_empty() && v[0] >= 0. && *v.last().unwrap() <= 120. && v.windows(2).all(|w| w[1] > w[0])
}
fn rows_match(rows: &Rows, n: usize) -> bool {
    rows.as_ref().is_none_or(|rs| {
        rs.len() == 7
            && rs.iter().all(|r| {
                r.as_ref().is_none_or(|r| {
                    r.len() == n
                        && r.iter()
                            .all(|v| v.is_none_or(|v| (-400. ..=100.).contains(&v)))
                })
            })
    })
}
impl Table {
    pub fn parse(values: &[f64]) -> Option<Self> {
        let mut r = Read { values, at: 0 };
        if r.number()? != 1. {
            return None;
        }
        let decay = r.count(1)? == 1;
        let env_times = r.list(64)?;
        let release_times = r.list(64)?;
        if !times(&env_times) || !times(&release_times) {
            return None;
        }
        let n = r.count(64)?;
        if n < 2 {
            return None;
        }
        let mut pitches = Vec::with_capacity(n);
        for _ in 0..n {
            let midi = r.number()?;
            let f0 = r.number()?;
            if !(0. ..=127.).contains(&midi)
                || !(10. ..=20000.).contains(&f0)
                || pitches.last().is_some_and(|p: &Pitch| p.midi >= midi)
            {
                return None;
            }
            let mut layers = Vec::with_capacity(3);
            for _ in 0..3 {
                if r.count(1)? == 0 {
                    layers.push(Layer::default());
                    continue;
                }
                let total = r.number()?;
                let onset = r.number()?;
                if !(-200. ..=40.).contains(&total) || !(0. ..=5.).contains(&onset) {
                    return None;
                }
                let count = r.count(256)?;
                if count == 0 {
                    return None;
                }
                let mut cells = Vec::with_capacity(count);
                for _ in 0..count {
                    let cell = [r.number()?, r.number()?, r.number()?];
                    if cell[0] < 0.
                        || cell[0] > 256.
                        || cell[0].fract() != 0.
                        || cells.last().is_some_and(|c: &[f64; 3]| c[0] >= cell[0])
                        || !cell[1..].iter().all(|v| (-400. ..=40.).contains(v))
                    {
                        return None;
                    }
                    cells.push(cell);
                }
                let vibrato = if r.count(1)? == 1 {
                    let rate = r.number()?;
                    let depths = r.list(16)?;
                    if !(0. ..=30.).contains(&rate)
                        || depths.is_empty()
                        || !depths.iter().all(|v| (0. ..=200.).contains(v))
                    {
                        return None;
                    }
                    Some(Vibrato { rate, depths })
                } else {
                    None
                };
                let env = r.rows(7, 64)?;
                let release = r.rows(7, 64)?;
                let bed = r.rows(16, 32)?;
                if env.is_none()
                    || !rows_match(&env, env_times.len())
                    || !rows_match(&release, release_times.len())
                    || bed.as_ref().is_some_and(|rs| {
                        rs.is_empty()
                            || rs.iter().any(|row| {
                                row.as_ref().is_none_or(|r| {
                                    r.is_empty() || r.len() != rs[0].as_ref().map_or(0, Vec::len)
                                })
                            })
                    })
                {
                    return None;
                }
                layers.push(Layer {
                    present: true,
                    total,
                    onset,
                    cells,
                    vibrato,
                    env,
                    release,
                    bed,
                });
            }
            pitches.push(Pitch {
                midi,
                f0,
                layers: layers.try_into().ok()?,
            });
        }
        let body = if r.count(1)? == 1 {
            let from = r.number()?;
            let ratio = r.number()?;
            let db = r.list(2048)?;
            if !(10. ..=20000.).contains(&from)
                || !(1.00001..=2.).contains(&ratio)
                || db.len() < 2
                || !db.iter().all(|v| (-400. ..=400.).contains(v))
            {
                return None;
            }
            Some(Body { from, ratio, db })
        } else {
            None
        };
        if r.at != values.len() {
            return None;
        }
        if (0..3).any(|i| !pitches.iter().any(|p| p.layers[i].present))
            || pitches.iter().any(|p| !p.layers.iter().any(|l| l.present))
        {
            return None;
        }
        for layer in 0..3 {
            let vib = pitches
                .iter()
                .filter_map(|p| p.layers[layer].vibrato.as_ref())
                .next()
                .map(|v| v.depths.len());
            let bed = pitches
                .iter()
                .filter_map(|p| p.layers[layer].bed.as_ref())
                .next();
            if pitches.iter().any(|p| {
                p.layers[layer]
                    .vibrato
                    .as_ref()
                    .is_some_and(|v| Some(v.depths.len()) != vib)
                    || p.layers[layer].bed.as_ref().is_some_and(|b| {
                        bed.is_none_or(|a| {
                            b.len() != a.len()
                                || b[0].as_ref().unwrap().len() != a[0].as_ref().unwrap().len()
                        })
                    })
            }) {
                return None;
            }
        }
        let depth_count = pitches
            .iter()
            .flat_map(|p| p.layers.iter())
            .filter_map(|l| l.vibrato.as_ref())
            .next()
            .map(|v| v.depths.len());
        if pitches.iter().flat_map(|p| p.layers.iter()).any(|l| {
            l.vibrato
                .as_ref()
                .is_some_and(|v| Some(v.depths.len()) != depth_count)
        }) {
            return None;
        }
        Some(Self {
            decay,
            env_times,
            release_times,
            pitches,
            body,
        })
    }
    pub fn pair(velocity: f64) -> (usize, usize, f64) {
        let v = velocity.max(40.).min(127.);
        if v <= 40. {
            (0, 0, 0.)
        } else if v <= 80. {
            (0, 1, (v - 40.) / 40.)
        } else {
            (1, 2, (v - 80.) / 47.)
        }
    }
    pub fn around(&self, midi: f64) -> (usize, usize, f64) {
        let j = self.pitches.iter().position(|p| p.midi >= midi);
        match j {
            Some(0) => (0, 0, 0.),
            None => {
                let k = self.pitches.len() - 1;
                (k, k, 0.)
            }
            Some(j) => (
                j - 1,
                j,
                (midi - self.pitches[j - 1].midi)
                    / (self.pitches[j].midi - self.pitches[j - 1].midi),
            ),
        }
    }
}
pub fn write_list(out: &mut Vec<f64>, a: &[f64]) {
    out.push(a.len() as f64);
    out.extend(a);
}
pub fn write_rows(out: &mut Vec<f64>, a: &Rows) {
    let Some(a) = a else {
        out.push(-1.);
        return;
    };
    out.push(a.len() as f64);
    for row in a {
        if let Some(row) = row {
            out.push(row.len() as f64);
            out.extend(row.iter().map(|v| v.unwrap_or(f64::NAN)));
        } else {
            out.push(-1.);
        }
    }
}
