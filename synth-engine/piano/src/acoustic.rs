//! The existing three acoustic models; matched/table models are separate.
use super::{clamp, Piano, Settings};
use std::f64::consts::{PI, TAU};
struct Kind {
    strike: f64,
    contact: f64,
    loss: f64,
    inharm: f64,
    spread: f64,
    slow: f64,
    knee: f64,
    lead: f64,
    thump: f64,
    knock: f64,
    decay: f64,
    after: f64,
    count: usize,
    low: f64,
    high: f64,
    q: [f64; 2],
    gain: f64,
}
fn kind(code: u32) -> Kind {
    match code {
        2 => Kind {
            strike: 0.118,
            contact: 1.,
            loss: 1.,
            inharm: 1.,
            spread: 0.45,
            slow: 4.5,
            knee: 70.,
            lead: 1.,
            thump: 0.3,
            knock: 0.8,
            decay: 1.2,
            after: 0.3,
            count: 12,
            low: 110.,
            high: 2200.,
            q: [7., 16.],
            gain: 1.,
        },
        3 => Kind {
            strike: 0.131,
            contact: 3.4,
            loss: 2.4,
            inharm: 1.05,
            spread: 0.55,
            slow: 3.,
            knee: 80.,
            lead: 1.1,
            thump: 0.8,
            knock: 0.35,
            decay: 0.75,
            after: 0.22,
            count: 8,
            low: 100.,
            high: 900.,
            q: [6., 12.],
            gain: 0.9,
        },
        _ => Kind {
            strike: 0.135,
            contact: 0.8,
            loss: 1.35,
            inharm: 1.,
            spread: 1.6,
            slow: 3.2,
            knee: 110.,
            lead: 0.65,
            thump: 1.1,
            knock: 1.,
            decay: 0.8,
            after: 0.38,
            count: 8,
            low: 140.,
            high: 1500.,
            q: [10., 26.],
            gain: 1.6,
        },
    }
}
struct Random(u32);
impl Random {
    fn new(seed: u32) -> Self {
        Self(if seed == 0 { 1 } else { seed })
    }
    fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        self.0 as f64 / 2147483648. - 1.
    }
}
fn mode(out: &mut [f32], sr: f64, limit: f64, freq: f64, amplitude: f64, alpha: f64) {
    if freq >= limit || amplitude < 1e-7 {
        return;
    }
    let theta = TAU * freq / sr;
    let r = (-alpha / sr).exp();
    let c = 2. * r * theta.cos();
    let r2 = r * r;
    let count = out.len().min((sr * 8. / alpha).ceil() as usize);
    let mut previous = 0.;
    let mut current = amplitude * theta.sin() * r;
    for x in out.iter_mut().take(count) {
        *x = (*x as f64 + previous) as f32;
        let following = c * current - r2 * previous;
        previous = current;
        current = following;
    }
}
fn soundboard(sr: f64, k: &Kind, seed: u32, input: Vec<f32>, amount: f64) -> Vec<f32> {
    if amount <= 0. {
        return input;
    }
    let mut random = Random::new(seed.wrapping_mul(7919).wrapping_add(13));
    let mut wet = vec![0f32; input.len()];
    for m in 0..k.count {
        let fc = (sr * 0.4).min(
            k.low * (k.high / k.low).powf((m as f64 + 0.5 + 0.35 * random.next()) / k.count as f64),
        );
        let quality = k.q[0] + (k.q[1] - k.q[0]) * (random.next() + 1.) / 2.;
        let weight = k.gain * (0.5 + (random.next() + 1.) / 2.) / (k.count as f64).sqrt();
        let w0 = TAU * fc / sr;
        let alpha = w0.sin() / (2. * quality);
        let a0 = 1. + alpha;
        let a1 = -2. * w0.cos() / a0;
        let a2 = (1. - alpha) / a0;
        let b = alpha / a0 * weight;
        let (mut x1, mut x2, mut y1, mut y2) = (0., 0., 0., 0.);
        for (i, &x) in input.iter().enumerate() {
            let x = x as f64;
            let y = b * (x - x2) - a1 * y1 - a2 * y2;
            wet[i] = (wet[i] as f64 + y) as f32;
            x2 = x1;
            x1 = x;
            y2 = y1;
            y1 = y;
        }
    }
    input
        .iter()
        .zip(wet)
        .map(|(&x, w)| (x as f64 + amount * 1.6 * w as f64) as f32)
        .collect()
}
fn low_rms(data: &[f32], sr: f64, count: usize) -> f64 {
    let k = 1. - (-TAU * 700. / sr).exp();
    let n = count.min(data.len());
    let (mut a, mut b, mut sum) = (0., 0., 0.);
    for &x in data.iter().take(n) {
        a += k * (x as f64 - a);
        b += k * (a - b);
        sum += b * b;
    }
    let rms = (sum / n as f64).sqrt();
    if rms == 0. {
        1e-6
    } else {
        rms
    }
}
pub fn render(sr: f64, freq: f64, code: u32, s: Settings, wear: f64) -> Piano {
    let sr = clamp(sr, 8000., 192000.);
    let f0 = clamp(freq, 15., sr / 6.);
    let k = kind(code);
    let decay = clamp(s.decay, 0.3, 5.);
    let brightness = clamp(s.brightness, 0., 1.);
    let hammer = clamp(s.hammer, 0., 1.);
    let unison = clamp(s.unison, 0., 1.);
    let velocity = clamp(s.velocity, 0., 1.);
    let resonance = clamp(s.resonance, 0., 1.);
    let wear = clamp(wear, 0., 1.);
    let midi = 69. + 12. * (f0 / 440.).log2();
    let v = velocity.max(0.12);
    let mut random = Random::new(s.seed ^ ((f0 * 100.).round() as u32));
    let prompt = decay * k.decay * clamp((220. / f0).powf(0.45), 0.35, 2.2);
    let aftersound = prompt * k.slow;
    let duration = (aftersound * 1.1).max(0.8).min(7.);
    let mut out = vec![0f32; (sr * duration).ceil() as usize];
    let alpha_prompt = 1000f64.ln() / prompt;
    let alpha_after = 1000f64.ln() / aftersound;
    let loss_rate = 0.9 * k.loss * (1. + wear * 0.3);
    let contact = clamp(
        0.0018
            * (220. / f0).powf(0.3)
            * k.contact
            * (2.2 - 1.7 * hammer)
            * (1.2 - 0.4 * brightness)
            * (0.7 / v).powf(0.6),
        0.0004,
        0.012,
    );
    let order = 0.35 + 0.4 * (1. - hammer) + 0.6 * (1. - v);
    let stiffness =
        (8e-5 + 3e-4 * 2f64.powf((midi - 60.) / 7.5) + 3e-4 * 2f64.powf((30. - midi) / 6.))
            * k.inharm
            * (1. + wear * 0.25);
    let limit = (sr * 0.45).min(12000. * (0.5 + brightness));
    let strings = if midi < 30. {
        1
    } else if midi < 48. {
        2
    } else {
        3
    };
    let tilt = (1. - brightness) * 0.9;
    let lead = 10f64.powf(-20. * k.lead * clamp((midi - 50.) / 14., 0., 1.) / 20.);
    let spread = k.spread * (0.3 + 1.4 * unison) + wear * 6.;
    let detune: Vec<f64> = (0..strings)
        .map(|i| {
            if i == 0 {
                0.
            } else {
                (if random.next() > 0. { 1. } else { -1. })
                    * spread
                    * (0.4 + (random.next() + 1.) / 2. * 0.8)
            }
        })
        .collect();
    let per_string = 1. / (strings as f64).powf(0.7);
    for n in 1.. {
        let nf = n as f64;
        let partial = nf * ((1. + stiffness * nf * nf) / (1. + stiffness)).sqrt();
        if f0 * partial >= limit {
            break;
        }
        let reach = f0 * partial;
        let level = (PI * nf * k.strike).sin().abs()
            * (1. + (reach * contact / 1.6).powf(2.)).powf(-order)
            * nf.powf(-tilt)
            / (1. + (k.knee / reach).powf(6.)).sqrt()
            * (if n == 1 { 1. } else { lead });
        let loss = loss_rate * (reach / 1000.).powf(2.);
        let merged = if n > 10 { 1 } else { strings };
        for st in 0..merged {
            let shift = if n > 10 { 0. } else { detune[st] };
            let here = reach * 2f64.powf(shift / 1200.);
            let gain = level * per_string * (if n > 10 { (strings as f64).sqrt() } else { 1. });
            mode(&mut out, sr, limit, here, gain, alpha_prompt + loss);
            if n <= 24 {
                mode(
                    &mut out,
                    sr,
                    limit,
                    here * 2f64.powf(random.next() * 0.35 / 1200.),
                    gain * k.after * (1. + wear * 0.4),
                    alpha_after + loss * 0.35,
                );
            }
        }
    }
    let mut body = soundboard(
        sr,
        &k,
        s.seed,
        out,
        resonance * (if code == 2 { 0.8 } else { 1. }),
    );
    let reference = low_rms(&body, sr, (sr * 0.3).round() as usize);
    let thud_cut = 1. - (-TAU * (600. + 700. * hammer) / sr).exp();
    let thud_decay = (-1. / (sr * 0.005)).exp();
    let click_cut = 1. - (-TAU * 3000. / sr).exp();
    let click_decay = (-1. / (sr * 0.0012)).exp();
    let mut thud =
        reference * 0.6 * k.knock * (1.3 - 0.6 * hammer) * (0.55 + 0.45 * v) * (1. + wear * 0.5);
    let mut click = reference * 1.1 * k.knock * hammer.powf(1.5) * v.powf(1.2) * (1. + wear * 0.4);
    let thump_hz = 70. + 40. * random.next().powf(2.);
    let mut thump = reference * 0.35 * k.thump * (0.6 + 0.4 * v) * (1. + wear * 0.6);
    let thump_decay = (-1. / (sr * 0.03)).exp();
    let (mut thud_noise, mut click_noise) = (0., 0.);
    let end = body.len().min((sr * 0.15).round() as usize);
    for (i, x) in body.iter_mut().enumerate().take(end) {
        let white = random.next();
        thud_noise += thud_cut * (white - thud_noise);
        click_noise += click_cut * (white - click_noise);
        *x = (*x as f64
            + thud_noise * thud
            + (white - click_noise) * click
            + thump * (TAU * thump_hz * i as f64 / sr).sin()) as f32;
        thud *= thud_decay;
        click *= click_decay;
        thump *= thump_decay;
    }
    let (mut dc, mut last) = (0., 0.);
    let pole = (-TAU * 12. / sr).exp();
    let settle = (sr * 0.4).round() as usize;
    let tail = (sr * 0.12).round();
    for x in &mut body {
        let v = *x as f64;
        dc = v - last + pole * dc;
        last = v;
        *x = dc as f32;
    }
    let scale = 0.08 / low_rms(&body, sr, settle);
    let mut peak = 0f64;
    let len = body.len();
    for (i, x) in body.iter_mut().enumerate() {
        let fade = 1f64
            .min(i as f64 / (sr * 0.0008))
            .min((len - 1 - i) as f64 / tail);
        *x = (*x as f64 * (scale * 0f64.max(fade))) as f32;
        peak = peak.max((*x as f64).abs());
    }
    if peak > 0.85 {
        for x in &mut body {
            *x = (*x as f64 * (0.85 / peak)) as f32;
        }
    }
    Piano { samples: body }
}
