//! Actual sourceFilter.js observations, normal equations and Cholesky solve.
use crate::table::Table;
const MAX_H: usize = 120;
pub struct Fit {
    pub body: Vec<f64>,
    pub source: Vec<f64>,
    pub a: Vec<f64>,
    pub b: Vec<f64>,
    pub pitches: Vec<f64>,
    pub f0s: Vec<f64>,
}
fn add(a: &mut [f64], y: &mut [f64], n: usize, idx: &[usize], val: &[f64], target: f64, w: f64) {
    for i in 0..idx.len() {
        y[idx[i]] += w * val[i] * target;
        for j in 0..idx.len() {
            a[idx[i] * n + idx[j]] += w * val[i] * val[j];
        }
    }
}
impl Fit {
    pub fn new(table: &Table, layer: usize, variant: u32) -> Self {
        let entries: Vec<_> = table
            .pitches
            .iter()
            .filter(|p| p.layers[layer].present)
            .collect();
        let p = entries.len();
        let k = ((14000f64 / 55.).log2() * 24.).ceil() as usize + 1;
        let use_s = variant != 0;
        let use_t = variant != 1;
        let os = k;
        let oa = os + if use_s { MAX_H } else { 0 };
        let ot = oa + p;
        let n = ot + if use_t { p } else { 0 };
        let mut a = vec![0.; n * n];
        let mut y = vec![0.; n];
        for (pi, pitch) in entries.iter().enumerate() {
            let l = &pitch.layers[layer];
            for cell in &l.cells {
                let h = cell[0] as usize;
                if h < 1 || h > MAX_H || cell[1] <= l.total - 60. {
                    continue;
                }
                let x = ((cell[0] * pitch.f0 / 55.).log2() * 24.)
                    .max(0.)
                    .min(k as f64 - 1.0001);
                let i = x.floor() as usize;
                let u = x - i as f64;
                let mut idx = [i, i + 1, oa + pi, 0, 0];
                let mut val = [1. - u, u, 1., 0., 0.];
                let mut len = 3;
                if use_s {
                    idx[len] = os + h - 1;
                    val[len] = 1.;
                    len += 1;
                }
                if use_t {
                    idx[len] = ot + pi;
                    val[len] = cell[0].log2();
                    len += 1;
                }
                add(
                    &mut a,
                    &mut y,
                    n,
                    &idx[..len],
                    &val[..len],
                    cell[1] - l.total,
                    1.,
                );
            }
        }
        for i in 1..k - 1 {
            add(
                &mut a,
                &mut y,
                n,
                &[i - 1, i, i + 1],
                &[1., -2., 1.],
                0.,
                0.3,
            );
        }
        if use_s {
            for i in 1..MAX_H - 1 {
                add(
                    &mut a,
                    &mut y,
                    n,
                    &[os + i - 1, os + i, os + i + 1],
                    &[1., -2., 1.],
                    0.,
                    0.3 * 0.3,
                );
            }
        }
        for i in 0..n {
            a[i * n + i] += 1e-3;
        }
        for i in 0..n {
            for j in 0..=i {
                let mut s = a[i * n + j];
                for k in 0..j {
                    s -= a[i * n + k] * a[j * n + k];
                }
                a[i * n + j] = if i == j {
                    s.max(1e-12).sqrt()
                } else {
                    s / a[j * n + j]
                };
            }
        }
        for i in 0..n {
            let mut s = y[i];
            for k in 0..i {
                s -= a[i * n + k] * y[k];
            }
            y[i] = s / a[i * n + i];
        }
        for i in (0..n).rev() {
            let mut s = y[i];
            for k in i + 1..n {
                s -= a[k * n + i] * y[k];
            }
            y[i] = s / a[i * n + i];
        }
        Self {
            body: y[..k].to_vec(),
            source: if use_s {
                y[os..os + MAX_H].to_vec()
            } else {
                vec![0.; MAX_H]
            },
            a: y[oa..oa + p].to_vec(),
            b: if use_t {
                y[ot..ot + p].to_vec()
            } else {
                vec![0.; p]
            },
            pitches: entries.iter().map(|p| p.midi).collect(),
            f0s: entries.iter().map(|p| p.f0).collect(),
        }
    }
    pub fn body_at(&self, f: f64) -> f64 {
        let t = ((f / 55.).log2() * 24.)
            .max(0.)
            .min(self.body.len() as f64 - 1.0001);
        let i = t.floor() as usize;
        self.body[i] * (1. - (t - i as f64)) + self.body[i + 1] * (t - i as f64)
    }
    pub fn terms(&self, midi: f64) -> (f64, f64) {
        let p = self.pitches.len();
        if midi >= self.pitches[p - 1] {
            return (self.a[p - 1], self.b[p - 1]);
        }
        match self.pitches.iter().position(|v| *v >= midi) {
            Some(0) | None => (self.a[0], self.b[0]),
            Some(j) => {
                let t = (midi - self.pitches[j - 1]) / (self.pitches[j] - self.pitches[j - 1]);
                (
                    self.a[j - 1] * (1. - t) + self.a[j] * t,
                    self.b[j - 1] * (1. - t) + self.b[j] * t,
                )
            }
        }
    }
    pub fn level(&self, midi: f64, f0: f64, h: usize) -> f64 {
        let (a, b) = self.terms(midi);
        self.body_at(h as f64 * f0) + self.source[h.min(MAX_H) - 1] + a + b * (h as f64).log2()
    }
    pub fn encode(&self) -> Vec<f64> {
        let mut v = Vec::new();
        for a in [
            &self.body,
            &self.source,
            &self.a,
            &self.b,
            &self.pitches,
            &self.f0s,
        ] {
            crate::table::write_list(&mut v, a);
        }
        v
    }
}
pub fn smooth_shape(lo: &Fit, hi: &Fit, t: f64, midi: f64, f0: f64, count: usize) -> Vec<f64> {
    (1..=count)
        .map(|k| lo.level(midi, f0, k) * (1. - t) + hi.level(midi, f0, k) * t)
        .collect()
}
