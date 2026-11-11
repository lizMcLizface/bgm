//! Actual realtime.js numeric body/table/release preparation. Convolver routing
//! and AudioContext execution remain separate host behavior.
use crate::{fft, fit::Fit, model::Model, table::Table};
use std::f64::consts::PI;
pub struct Curve<'a> {
    table: &'a Table,
    lo: &'a Fit,
    hi: &'a Fit,
    fine: f64,
    mean: f64,
}
impl<'a> Curve<'a> {
    pub fn new(table: &'a Table, lo: &'a Fit, hi: &'a Fit, fine: f64) -> Self {
        let mut s = Self {
            table,
            lo,
            hi,
            fine,
            mean: 0.,
        };
        let (mut mean, mut count, mut f) = (0., 0., 150.);
        while f < 5000. {
            mean += s.raw(f);
            count += 1.;
            f *= 1.03;
        }
        s.mean = mean / count;
        s
    }
    fn raw(&self, f: f64) -> f64 {
        let fine = if let Some(b) = &self.table.body {
            if self.fine == 0. {
                0.
            } else {
                let x = (f / b.from).ln() / b.ratio.ln();
                let i = x.floor() as isize;
                if i < 0 || i as usize >= b.db.len() - 1 {
                    0.
                } else {
                    let i = i as usize;
                    self.fine * (b.db[i] * (1. - (x - i as f64)) + b.db[i + 1] * (x - i as f64))
                        / 4.
                }
            }
        } else {
            0.
        };
        self.lo.body_at(f) * (1. - 1.) + self.hi.body_at(f) * 1. + fine
    }
    pub fn at(&self, f: f64) -> f64 {
        self.raw(f)
            - self.mean
            - if f < 60. {
                12. * (60. / f.max(5.)).log2()
            } else {
                0.
            }
            - if f > 9000. {
                24. * (f / 9000.).log2()
            } else {
                0.
            }
    }
    pub fn impulse(&self, rate: f64, seconds: f64, wake_db: f64, wake_time: f64) -> Vec<f32> {
        let n = 65536;
        let mut re = vec![0.; n];
        let mut im = vec![0.; n];
        for k in 0..=n / 2 {
            let l = self.at((k as f64).max(0.5) * rate / n as f64) * std::f64::consts::LN_10 / 20.;
            re[k] = l;
            if k > 0 && k < n / 2 {
                re[n - k] = l;
            }
        }
        fft::ifft(&mut re, &mut im);
        for k in 1..n / 2 {
            re[k] *= 2.;
            im[k] = 0.;
        }
        for k in n / 2 + 1..n {
            re[k] = 0.;
            im[k] = 0.;
        }
        im.fill(0.);
        fft::fft(&mut re, &mut im);
        for k in 0..n {
            let m = re[k].exp();
            let a = im[k];
            re[k] = m * a.cos();
            im[k] = m * a.sin();
        }
        fft::ifft(&mut re, &mut im);
        let length = n.min((seconds * rate).round() as usize);
        let body: Vec<f32> = (0..length)
            .map(|i| {
                let u = i as f64 / length as f64;
                let fade = if u < 0.7 {
                    1.
                } else {
                    0.5 + 0.5 * (PI * (u - 0.7) / 0.3).cos()
                };
                (re[i] * fade) as f32
            })
            .collect();
        if wake_db <= -40. {
            return body;
        }
        let tail = fft::wake(wake_db, wake_time, rate);
        let mut padded = vec![0f32; length + tail.len()];
        padded[..length].copy_from_slice(&body);
        fft::convolve(&padded, &tail)
    }
}
fn nearest(f: f64) -> usize {
    let edges = [0., 250., 500., 1000., 2000., 4000., 8000., f64::INFINITY];
    let centers: Vec<f64> = edges[..7]
        .iter()
        .enumerate()
        .map(|(b, lo)| {
            if b == 0 {
                125.
            } else {
                (*lo * if edges[b + 1].is_infinite() {
                    *lo * 2.
                } else {
                    edges[b + 1]
                })
                .sqrt()
            }
        })
        .collect();
    if f <= centers[0] {
        return 0;
    }
    for b in 1..centers.len() {
        if f <= centers[b] {
            let u = (f.ln() - centers[b - 1].ln()) / (centers[b].ln() - centers[b - 1].ln());
            return if u < 0.5 { b - 1 } else { b };
        }
    }
    6
}
pub fn release(model: &Model, table: &Table) -> (Vec<f64>, Vec<f64>, f64) {
    let times = &table.release_times;
    let mut power = [0.; 7];
    for (k, db) in model.tonal.iter().enumerate() {
        power[nearest((k + 1) as f64 * model.f0)] += 10f64.powf(*db / 10.);
    }
    let total = power.iter().sum::<f64>();
    let total = if total == 0. { 1. } else { total };
    let mut gains: Vec<f64> = times
        .iter()
        .enumerate()
        .map(|(i, time)| {
            let (mut g, mut w) = (0., 0.);
            if let Some(rows) = &model.release {
                for (b, row) in rows.iter().enumerate() {
                    if let Some(Some(v)) = row.as_ref().and_then(|row| row.get(i)) {
                        g += power[b] / total * 10f64.powf(*v / 20.);
                        w += power[b] / total;
                    }
                }
            }
            if w > 0. {
                g / w
            } else {
                (-time / 0.15).exp()
            }
        })
        .collect();
    let start = if gains[0] > 0. { gains[0] } else { 1. };
    for i in 0..gains.len() {
        gains[i] = (if i > 0 { gains[i - 1] } else { 1. }).min(gains[i] / start);
    }
    let seconds = times.last().unwrap() + 0.25;
    let mut times = times.clone();
    times.push(seconds);
    gains.push(0.);
    (times, gains, seconds)
}
pub struct Bank {
    pub table: Vec<f32>,
    pub dark: Vec<f32>,
    pub f0: f64,
    pub rms: f64,
    pub level: f64,
    pub release_times: Vec<f64>,
    pub release_gains: Vec<f64>,
    pub release_seconds: f64,
    pub vibrato_rate: f64,
    pub vibrato_depths: Vec<f64>,
}
impl Bank {
    pub fn new(
        model: &Model,
        raw: &Table,
        curve: &Curve,
        rate: f64,
        random_phase: bool,
    ) -> Option<Self> {
        let depth_max = model
            .vibrato
            .as_ref()
            .map_or(0., |v| v.depths.iter().copied().fold(0., f64::max))
            + 3.;
        let top = model
            .tonal
            .len()
            .min((0.45 * rate / (model.f0 * 2f64.powf(depth_max / 1200.))).floor() as usize)
            .min(2047);
        if top == 0 {
            return None;
        }
        let mut rng = fft::Lcg((model.midi * 7919. + 13.) as u32);
        let mut amps = vec![0.; top];
        let mut phases = vec![0.; top];
        let mut power = 0.;
        for n in 1..=top {
            let body = 10f64.powf(curve.at(n as f64 * model.f0).max(-40.).min(40.) / 20.);
            amps[n - 1] = (2. * 10f64.powf(model.tonal[n - 1] / 10.)).sqrt() / body;
            phases[n - 1] = if random_phase {
                2. * PI * rng.next()
            } else {
                0.
            };
            power += amps[n - 1].powi(2) / 2.;
        }
        let build = |tilt: f64| {
            let mut table = vec![0f32; 4096];
            for n in 1..=top {
                let a = amps[n - 1] * 10f64.powf(tilt * (n as f64).log2() / 20.);
                let step = 2. * PI * n as f64 / 4096.;
                let (mut c, mut s) = (phases[n - 1].cos(), phases[n - 1].sin());
                let (cs, sn) = (step.cos(), step.sin());
                for j in 0..4096 {
                    table[j] = (table[j] as f64 + a * c) as f32;
                    let nc = c * cs - s * sn;
                    s = s * cs + c * sn;
                    c = nc;
                }
            }
            table
        };
        let (table, dark) = (build(0.), build(-9.));
        let vibrato_depths = if let Some(v) = &model.vibrato {
            let d = &v.depths;
            if d.len() < 3 {
                return None;
            }
            let d = if d.len() >= 5 {
                d.clone()
            } else {
                vec![d[0], d[0], d[1], d[2], d[2]]
            };
            vec![0., d[0] * 0.6, d[0], d[1], d[2], (d[3] + d[4]) / 2.]
        } else {
            Vec::new()
        };
        let (rt, rg, rs) = release(model, raw);
        Some(Self {
            table,
            dark,
            f0: model.f0,
            rms: power.sqrt(),
            level: model.level,
            release_times: rt,
            release_gains: rg,
            release_seconds: rs,
            vibrato_rate: model.vibrato.as_ref().map_or(0., |v| v.rate),
            vibrato_depths,
        })
    }
}
