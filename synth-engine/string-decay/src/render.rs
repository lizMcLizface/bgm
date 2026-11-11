//! Numeric renderDecay port. Flare states are snapshotted in original draw order
//! and regenerated separately, so expensive noise buffers never all coexist.
use crate::{
    fft,
    model::{power_size, Bed, Model},
};
use std::f64::consts::PI;
const STEP: f64 = 0.01;
const SKIRT: [f64; 7] = [0.01, 0.03, 0.06, 0.1, 0.2, 0.3, 0.45];
#[derive(Clone, Copy)]
pub struct Rng {
    pub state: u32,
    pub calls: u64,
}
impl Rng {
    pub fn new(seed: u32) -> Self {
        Self {
            state: if seed == 0 { 1 } else { seed },
            calls: 0,
        }
    }
    pub fn next(&mut self) -> f64 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 17;
        self.state ^= self.state << 5;
        self.calls += 1;
        self.state as f64 / 4294967296.
    }
}
fn interp(times: &[f64], values: &[f64], t: f64) -> f64 {
    if t <= times[0] {
        return values[0];
    }
    for i in 1..times.len() {
        if t <= times[i] {
            let u = (t - times[i - 1]) / (times[i] - times[i - 1]);
            return values[i - 1] * (1. - u) + values[i] * u;
        }
    }
    *values.last().unwrap()
}
fn centres() -> [f64; 7] {
    [
        125.,
        (250f64 * 500.).sqrt(),
        (500f64 * 1000.).sqrt(),
        (1000f64 * 2000.).sqrt(),
        (2000f64 * 4000.).sqrt(),
        (4000f64 * 8000.).sqrt(),
        (8000f64 * 16000.).sqrt(),
    ]
}
fn band_mix(f: f64) -> (usize, usize, f64) {
    let c = centres();
    let lf = f.ln();
    if f <= c[0] {
        return (0, 0, 0.);
    }
    for b in 1..7 {
        if f <= c[b] {
            return (b - 1, b, (lf - c[b - 1].ln()) / (c[b].ln() - c[b - 1].ln()));
        }
    }
    (6, 6, 0.)
}
fn nearest(f: f64) -> usize {
    let (lo, hi, u) = band_mix(f);
    if u < 0.5 {
        lo
    } else {
        hi
    }
}
fn envelope_grid(m: &Model) -> Vec<Vec<f64>> {
    let rows: Vec<Option<Vec<f64>>> = m
        .env
        .iter()
        .map(|row| {
            row.as_ref()
                .filter(|r| {
                    r.iter()
                        .map(|v| v.unwrap_or(-90.))
                        .fold(f64::NEG_INFINITY, f64::max)
                        <= 12.
                })
                .map(|r| r.iter().map(|v| v.unwrap_or(-90.)).collect())
        })
        .collect();
    let steps = (m.seconds / STEP).ceil() as usize + 2;
    (0..7)
        .map(|b| {
            let row = rows[b]
                .as_ref()
                .or_else(|| rows[b + 1..].iter().find_map(Option::as_ref))
                .or_else(|| rows[..b].iter().rev().find_map(Option::as_ref));
            let zero = vec![0.; m.env_times.len()];
            let row = row.unwrap_or(&zero);
            (0..steps)
                .map(|j| interp(&m.env_times, row, j as f64 * STEP))
                .collect()
        })
        .collect()
}
fn normalise(grid: &mut [Vec<f64>]) {
    let weight = |t: f64, from: f64| {
        let u = (t - from) / 0.1707;
        if u > 0. && u < 1. {
            0.5 - 0.5 * (2. * PI * u).cos()
        } else {
            0.
        }
    };
    for row in grid {
        let (mut num, mut den) = (0., 0.);
        for (j, v) in row.iter().enumerate() {
            let t = j as f64 * STEP;
            let w = weight(t, 0.004) + weight(t, 0.05);
            num += w * 10f64.powf(*v / 10.);
            den += w;
        }
        let shift = if den > 0. && num > 0. {
            10. * (num / den).log10()
        } else {
            0.
        };
        if shift.abs() < 20. {
            for v in row {
                *v -= shift;
            }
        }
    }
}
fn gains(m: &Model, grid: &[Vec<f64>]) -> (Vec<usize>, Vec<Vec<f32>>, Vec<f32>) {
    let top = m.tonal.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let harmonics: Vec<usize> = m
        .tonal
        .iter()
        .enumerate()
        .filter(|(_, v)| **v > top - m.floor)
        .map(|(k, _)| k + 1)
        .collect();
    let gains = harmonics
        .iter()
        .map(|n| {
            let (lo, hi, u) = band_mix(*n as f64 * m.f0);
            (0..grid[0].len())
                .map(|j| 10f64.powf((grid[lo][j] * (1. - u) + grid[hi][j] * u) / 20.) as f32)
                .collect()
        })
        .collect();
    let mut power = [0.; 7];
    for (k, db) in m.noise.iter().enumerate() {
        power[nearest((k + 1) as f64 * m.f0)] += 10f64.powf(*db / 10.);
    }
    if let Some(db) = m.low {
        power[nearest(0.25 * m.f0)] += 10f64.powf(db / 10.);
    }
    let total = power.iter().sum::<f64>();
    let total = if total == 0. { 1. } else { total };
    let ng = (0..grid[0].len())
        .map(|j| {
            let mut g = 0.;
            for b in 0..7 {
                g += power[b] / total * 10f64.powf(grid[b][j] / 20.);
            }
            g as f32
        })
        .collect();
    (harmonics, gains, ng)
}
fn phases(m: &Model, h: &[usize], rng: &mut Rng) -> Vec<f64> {
    if m.phase == 1 {
        return vec![PI / 2.; h.len()];
    }
    if m.phase != 2 {
        return h.iter().map(|_| 2. * PI * rng.next()).collect();
    }
    let n = 16384;
    let half = n / 2;
    let mut re = vec![0.; n];
    let mut im = vec![0.; n];
    let hz = m.rate / n as f64;
    let db = |i: usize| m.tonal[i - 1] / 2.;
    for k in 0..=half {
        let pos = k as f64 * hz / m.f0;
        let a = if pos <= 1. {
            db(1)
        } else {
            let n0 = (pos.floor() as usize).min(m.tonal.len() - 1);
            let n1 = (n0 + 1).min(m.tonal.len());
            let u = pos - n0 as f64;
            if n0 >= m.tonal.len() {
                db(m.tonal.len()) - 40.
            } else {
                db(n0) * (1. - u) + db(n1) * u
            }
        };
        re[k] = a * std::f64::consts::LN_10 / 10.;
        if k > 0 && k < half {
            re[n - k] = re[k];
        }
    }
    fft::fft(&mut re, &mut im);
    let c: Vec<f64> = re.iter().map(|v| *v / n as f64).collect();
    let mut fold = vec![0.; n];
    let mut zero = vec![0.; n];
    fold[0] = c[0];
    for i in 1..half {
        fold[i] = 2. * c[i];
    }
    fold[half] = c[half];
    fft::fft(&mut fold, &mut zero);
    h.iter()
        .map(|h| PI / 2. + zero[half.min((*h as f64 * m.f0 / hz).round() as usize)])
        .collect()
}
struct Flare {
    frequency: f64,
    size: usize,
    gain: Vec<f32>,
    rng: Rng,
    after: u32,
}
fn flares(m: &Model, h: &[usize], gains: &mut [Vec<f32>], rng: &mut Rng) -> Vec<Flare> {
    let Some(skirt) = &m.skirt else {
        return Vec::new();
    };
    if !(m.flare > 0.) {
        return Vec::new();
    }
    let mut values = skirt.clone();
    values.push(0.);
    let steps = gains[0].len();
    let share: Vec<f32> = (0..steps)
        .map(|j| {
            (m.flare * interp(&SKIRT, &values, j as f64 * STEP))
                .max(0.)
                .min(0.98) as f32
        })
        .collect();
    let size = power_size(0.45 * 1.6 * m.rate);
    let mut out = Vec::new();
    for (index, n) in h.iter().enumerate() {
        let f = *n as f64 * m.f0;
        if f > 4500. {
            continue;
        }
        let power = 10f64.powf(m.tonal[*n - 1] / 10.).sqrt();
        let mut gain = vec![0.; steps];
        for j in 0..steps {
            gain[j] = (power * gains[index][j] as f64 * (share[j] as f64).sqrt()) as f32;
            gains[index][j] = (gains[index][j] as f64 * (1. - share[j] as f64).sqrt()) as f32;
        }
        let before = *rng;
        let hz = m.rate / size as f64;
        for b in 1..size / 2 {
            let d = (b as f64 * hz - f) / 60.;
            if d * d < 18. {
                rng.next();
            }
        }
        out.push(Flare {
            frequency: f,
            size,
            gain,
            rng: before,
            after: rng.state,
        });
    }
    out
}
fn lobe(f: f64, size: usize, rate: f64, rng: &mut Rng) -> Vec<f32> {
    let mut re = vec![0.; size];
    let mut im = vec![0.; size];
    let mut weights = vec![0.; size / 2];
    let hz = rate / size as f64;
    let mut total = 0.;
    for b in 1..size / 2 {
        let d = (b as f64 * hz - f) / 60.;
        weights[b] = if d * d < 18. {
            (-0.5 * d * d).exp()
        } else {
            0.
        };
        total += weights[b];
    }
    for b in 1..size / 2 {
        if weights[b] == 0. {
            continue;
        }
        let amp = (2. * weights[b] / total).sqrt();
        let ph = 2. * PI * rng.next();
        re[b] = amp * ph.cos();
        im[b] = -amp * ph.sin();
    }
    fft::fft(&mut re, &mut im);
    re.into_iter().map(|v| v as f32).collect()
}
fn noise(m: &Model, size: usize, rng: &mut Rng) -> Vec<f32> {
    let mut re = vec![0.; size];
    let mut im = vec![0.; size];
    for (k, db) in m.noise.iter().enumerate() {
        let lo = 1usize.max(((k as f64 + 0.5) * m.f0 * m.seconds).round() as usize);
        let hi = (size / 2).min(((k as f64 + 1.5) * m.f0 * m.seconds).round() as usize);
        if hi <= lo {
            continue;
        }
        let amp = (2. * 10f64.powf(*db / 10.) / (hi - lo) as f64).sqrt();
        for b in lo..hi {
            let ph = 2. * PI * rng.next();
            re[b] = amp * ph.cos();
            im[b] = -amp * ph.sin();
        }
    }
    if let Some(db) = m.low {
        let hi = (size / 2).min((0.5 * m.f0 * m.seconds).round() as usize);
        if hi > 1 {
            let amp = (2. * 10f64.powf(db / 10.) / (hi - 1) as f64).sqrt();
            for b in 1..hi {
                let ph = 2. * PI * rng.next();
                re[b] += amp * ph.cos();
                im[b] -= amp * ph.sin();
            }
        }
    }
    fft::fft(&mut re, &mut im);
    re.into_iter().map(|v| v as f32).collect()
}
fn cubic(x: &[f32], i: usize, t: f64) -> f64 {
    let n = x.len();
    let a = x[(i + n - 1) % n] as f64;
    let b = x[i % n] as f64;
    let c = x[(i + 1) % n] as f64;
    let d = x[(i + 2) % n] as f64;
    b + 0.5 * t * (c - a + t * (2. * a - 5. * b + 4. * c - d + t * (3. * (b - c) + d - a)))
}
fn bed_noise(levels: &[Option<f64>], bed: &Bed, m: &Model, size: usize, rng: &mut Rng) -> Vec<f32> {
    let mut re = vec![0.; size];
    let mut im = vec![0.; size];
    let n = levels.len();
    let bin_hz = m.rate / 2048.;
    let lr = bed.ratio.ln();
    let octave = bed.ratio.log2();
    let filled: Vec<f64> = levels
        .iter()
        .enumerate()
        .map(|(k, v)| {
            if let Some(v) = v {
                return *v;
            }
            let mut a = k as isize - 1;
            let mut b = k + 1;
            while a >= 0 && levels[a as usize].is_none() {
                a -= 1;
            }
            while b < n && levels[b].is_none() {
                b += 1;
            }
            if a < 0 && b >= n {
                -200.
            } else if a < 0 {
                levels[b].unwrap()
            } else if b >= n {
                levels[a as usize].unwrap()
            } else {
                let a = a as usize;
                levels[a].unwrap()
                    + (levels[b].unwrap() - levels[a].unwrap()) * (k - a) as f64 / (b - a) as f64
            }
        })
        .collect();
    for b in 1..size / 2 {
        let f = b as f64 / m.seconds;
        let pos = (f / bed.from).ln() / lr - 0.5;
        let i = pos.floor() as isize;
        let u = pos - i as f64;
        let db = if i < 0 {
            filled[0] + 6. * pos * octave
        } else if i as usize >= n - 1 {
            filled[n - 1] - 12. * (pos - (n - 1) as f64) * octave
        } else {
            filled[i as usize] * (1. - u) + filled[i as usize + 1] * u
        };
        let amp = (2. * 10f64.powf(db / 10.) / bin_hz / m.seconds).sqrt();
        let ph = 2. * PI * rng.next();
        re[b] = amp * ph.cos();
        im[b] = -amp * ph.sin();
    }
    fft::fft(&mut re, &mut im);
    re.into_iter().map(|v| v as f32).collect()
}
fn add_bed(out: &mut [f32], m: &Model, size: usize, rng: &mut Rng) {
    let Some(bed) = &m.bed else { return };
    let buffers: Vec<_> = bed
        .rows
        .iter()
        .map(|row| {
            bed_noise(
                &row.iter()
                    .map(|v| v.map(|v| v + m.bed_db))
                    .collect::<Vec<_>>(),
                bed,
                m,
                size,
                rng,
            )
        })
        .collect();
    let count = out.len();
    for i in 0..count {
        let t = i as f64 / m.rate;
        let x = t * m.rate * size as f64 / count as f64;
        let xi = x.floor() as usize;
        let mut w = 0;
        while w < bed.edges.len() && t >= bed.edges[w] + bed.fades[w] {
            w += 1;
        }
        let value = if w < bed.edges.len() && t > bed.edges[w] - bed.fades[w] {
            let u = (t - bed.edges[w] + bed.fades[w]) / (2. * bed.fades[w]);
            cubic(&buffers[w], xi, x - xi as f64) * (PI * u / 2.).cos()
                + cubic(&buffers[w + 1], xi, x - xi as f64) * (PI * u / 2.).sin()
        } else {
            cubic(&buffers[w], xi, x - xi as f64)
        };
        out[i] = (out[i] as f64 + value) as f32;
    }
}
fn wake(db: f64, tau: f64, rate: f64, rng: &mut Rng) -> Vec<f32> {
    let length = (tau * rate).round().max(16.) as usize;
    let size = power_size((length * 2) as f64);
    let mut tail = vec![0.; size];
    let mut im = vec![0.; size];
    let mut energy = 0.;
    for i in 0..length {
        let v = (rng.next() * 2. - 1.) * (-6.9 * i as f64 / (tau * rate)).exp();
        tail[i] = v;
        energy += v * v;
    }
    for i in 0..length {
        tail[i] /= energy.sqrt();
    }
    fft::fft(&mut tail, &mut im);
    let g = 10f64.powf(db / 10.);
    let mut re = vec![0.; size];
    let mut ii = vec![0.; size];
    for k in 0..=size / 2 {
        let f = k as f64 * rate / size as f64;
        let w = if f <= 500. {
            0.
        } else if f >= 2500. {
            1.
        } else {
            (f / 500.).ln() / (2500f64 / 500.).ln()
        };
        let gg = g.sqrt() * w;
        let norm = 1. / (1. + gg * gg).sqrt();
        re[k] = norm * (1. + gg * tail[k]);
        ii[k] = norm * gg * im[k];
        if k > 0 && k < size / 2 {
            re[size - k] = re[k];
            ii[size - k] = -ii[k];
        }
    }
    for v in &mut ii {
        *v = -*v;
    }
    fft::fft(&mut re, &mut ii);
    re[..size / 2]
        .iter()
        .map(|v| (*v / size as f64) as f32)
        .collect()
}
pub struct Rendered {
    pub samples: Vec<f32>,
    pub rng: Rng,
    pub workspace: usize,
}
pub fn render(m: &Model) -> Option<Rendered> {
    let count = (m.seconds * m.rate).ceil() as usize;
    let mut rng = Rng::new(m.seed);
    let mut grid = envelope_grid(m);
    normalise(&mut grid);
    let (h, mut g, mut ng) = gains(m, &grid);
    let flares = flares(m, &h, &mut g, &mut rng);
    let phi = phases(m, &h, &mut rng);
    let amps: Vec<_> = h
        .iter()
        .map(|n| (2. * 10f64.powf(m.tonal[*n - 1] / 10.)).sqrt())
        .collect();
    let top = *h.last()?;
    let mut at = vec![-1isize; top + 1];
    for (i, n) in h.iter().enumerate() {
        at[*n] = i as isize;
    }
    let cos: Vec<_> = phi.iter().map(|p| p.cos()).collect();
    let sin: Vec<_> = phi.iter().map(|p| p.sin()).collect();
    let mut out = vec![0f32; count];
    for i in 0..count {
        let j = i as f64 / m.rate / STEP;
        let j0 = (grid[0].len() - 2).min(j.floor() as usize);
        let u = j - j0 as f64;
        let theta = 2. * PI * m.f0 * i as f64 / m.rate;
        let c = theta.cos();
        let two = 2. * c;
        let (mut sp, mut sc, mut cp, mut cc, mut sum) = (0., theta.sin(), 1., c, 0.);
        for n in 1..=top {
            let hi = at[n];
            if hi >= 0 {
                let h = hi as usize;
                sum += amps[h]
                    * (g[h][j0] as f64 * (1. - u) + g[h][j0 + 1] as f64 * u)
                    * (sc * cos[h] + cc * sin[h]);
            }
            let sn = two * sc - sp;
            let cn = two * cc - cp;
            sp = sc;
            sc = sn;
            cp = cc;
            cc = cn;
        }
        out[i] = sum as f32;
    }
    if m.noise_tau > 0. {
        for (j, v) in ng.iter_mut().enumerate() {
            *v = (*v as f64 * (0.2 + 0.8 * (-(j as f64) * STEP / m.noise_tau).exp())) as f32;
        }
    }
    for f in flares {
        let mut copy = f.rng;
        let buffer = lobe(f.frequency, f.size, m.rate, &mut copy);
        if copy.state != f.after {
            return None;
        }
        let end = count
            .min(buffer.len())
            .min((0.47 * m.rate).round() as usize);
        for i in 0..end {
            let j = i as f64 / m.rate / STEP;
            let j0 = (f.gain.len() - 2).min(j.floor() as usize);
            let u = j - j0 as f64;
            out[i] = (out[i] as f64
                + buffer[i] as f64 * (f.gain[j0] as f64 * (1. - u) + f.gain[j0 + 1] as f64 * u))
                as f32;
        }
    }
    let size = power_size(m.seconds * m.rate);
    let noise = noise(m, size, &mut rng);
    for i in 0..count {
        let j = i as f64 / m.rate / STEP;
        let j0 = (grid[0].len() - 2).min(j.floor() as usize);
        let u = j - j0 as f64;
        let x = i as f64 * size as f64 / count as f64;
        let xi = x.floor() as usize;
        out[i] = (out[i] as f64
            + cubic(&noise, xi, x - xi as f64) * (ng[j0] as f64 * (1. - u) + ng[j0 + 1] as f64 * u))
            as f32;
    }
    drop(noise);
    add_bed(&mut out, m, size, &mut rng);
    let mut wet = if let Some([db, tau]) = m.wake {
        let impulse = wake(db, tau, m.rate, &mut rng);
        fft::convolve(&out, &impulse)
    } else {
        out
    };
    let fade = (0.15 * m.rate).round() as usize;
    for i in 0..fade {
        wet[count - 1 - i] = (wet[count - 1 - i] as f64 * (i as f64 / fade as f64)) as f32;
    }
    let n = count.min((0.004 * m.rate).round().max(1.) as usize);
    for i in 0..n {
        wet[i] = (wet[i] as f64 * (0.5 - 0.5 * (PI * i as f64 / n as f64).cos())) as f32;
    }
    for v in &mut wet {
        *v = (*v as f64 * m.gain) as f32;
    }
    if !wet.iter().all(|v| v.is_finite()) {
        return None;
    }
    Some(Rendered {
        samples: wet,
        rng,
        workspace: m.workspace_bytes(),
    })
}
