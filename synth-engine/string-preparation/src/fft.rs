//! Same in-place radix-2 butterflies and update order as pianoModel/dsp.js.
use std::f64::consts::PI;
pub fn fft(re: &mut [f64], im: &mut [f64]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2. * PI / len as f64;
        let wr = ang.cos();
        let wi = ang.sin();
        for i in (0..n).step_by(len) {
            let (mut cr, mut ci) = (1., 0.);
            for k in 0..len / 2 {
                let a = i + k;
                let b = a + len / 2;
                let tr = re[b] * cr - im[b] * ci;
                let ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                let nr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = nr;
            }
        }
        len <<= 1;
    }
}
pub fn ifft(re: &mut [f64], im: &mut [f64]) {
    for i in im.iter_mut() {
        *i = -*i;
    }
    fft(re, im);
    let n = re.len() as f64;
    for i in 0..re.len() {
        re[i] /= n;
        im[i] = -im[i] / n;
    }
}
pub fn convolve(x: &[f32], h: &[f32]) -> Vec<f32> {
    let size = (x.len() + h.len()).next_power_of_two();
    let mut ar = vec![0.; size];
    let mut ai = vec![0.; size];
    let mut br = vec![0.; size];
    let mut bi = vec![0.; size];
    for (i, v) in x.iter().enumerate() {
        ar[i] = *v as f64;
    }
    for (i, v) in h.iter().enumerate() {
        br[i] = *v as f64;
    }
    fft(&mut ar, &mut ai);
    fft(&mut br, &mut bi);
    for k in 0..size {
        let r = ar[k] * br[k] - ai[k] * bi[k];
        ai[k] = -(ar[k] * bi[k] + ai[k] * br[k]);
        ar[k] = r;
    }
    fft(&mut ar, &mut ai);
    ar[..x.len()]
        .iter()
        .map(|v| (*v / size as f64) as f32)
        .collect()
}
pub struct Lcg(pub u32);
impl Lcg {
    pub fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(1664525).wrapping_add(1013904223);
        self.0 as f64 / 4294967296.
    }
}
pub fn wake(gain_db: f64, tau: f64, rate: f64) -> Vec<f32> {
    let length = (tau * rate).round().max(16.) as usize;
    let size = (length * 2).next_power_of_two();
    let mut tail = vec![0.; size];
    let mut im = vec![0.; size];
    let mut rng = Lcg(7);
    let mut energy = 0.;
    for i in 0..length {
        let v = (rng.next() * 2. - 1.) * (-6.9 * i as f64 / (tau * rate)).exp();
        tail[i] = v;
        energy += v * v;
    }
    for i in 0..length {
        tail[i] /= energy.sqrt();
    }
    fft(&mut tail, &mut im);
    let g = 10f64.powf(gain_db / 10.);
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
    for i in &mut ii {
        *i = -*i;
    }
    fft(&mut re, &mut ii);
    re[..size / 2]
        .iter()
        .map(|v| (*v / size as f64) as f32)
        .collect()
}
