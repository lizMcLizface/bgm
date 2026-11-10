//! Owned preparation buffers for the existing felt/electric modal piano.
//! This renders note material off the audio callback, not a voice/FX graph.
use std::f64::consts::{PI, TAU};
mod acoustic;
pub mod control;
pub mod voice;

fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    if x.is_finite() {
        x.max(lo).min(hi)
    } else {
        lo
    }
}
pub struct Piano {
    pub samples: Vec<f32>,
}
#[derive(Clone, Copy, PartialEq)]
pub struct Settings {
    pub electric: bool,
    pub decay: f64,
    pub brightness: f64,
    pub hammer: f64,
    pub unison: f64,
    pub velocity: f64,
    pub seed: u32,
    pub resonance: f64,
    pub softness: f64,
}
fn partial(out: &mut [f32], sr: f64, freq: f64, amp: f64, t60: f64, bloom: f64) {
    if freq > sr * 0.45 {
        return;
    }
    let theta = TAU * freq / sr;
    let r = (-1000f64.ln() / (sr * t60)).exp();
    let c = 2. * r * theta.cos();
    let r2 = r * r;
    let mut previous = 0.;
    let mut current = amp * theta.sin() * r;
    let count = out.len().min((sr * t60 * 1.5).ceil() as usize);
    let mut rise = if bloom != 0. { 1. } else { 0. };
    let rise_decay = if bloom != 0. {
        (-1. / (sr * bloom)).exp()
    } else {
        0.
    };
    for x in out.iter_mut().take(count) {
        *x = (*x as f64
            + if bloom != 0. {
                previous * (1. - rise)
            } else {
                previous
            }) as f32;
        rise *= rise_decay;
        let next = c * current - r2 * previous;
        previous = current;
        current = next;
    }
}
impl Piano {
    pub fn note(sr: f64, freq: f64, kind: u32, settings: Settings, wear: f64) -> Self {
        if kind < 2 {
            Self::strike(sr, freq, settings)
        } else {
            acoustic::render(sr, freq, kind, settings, wear)
        }
    }
    pub fn strike(sample_rate: f64, frequency: f64, s: Settings) -> Self {
        let sr = clamp(sample_rate, 8000., 192000.);
        let freq = clamp(frequency, 10., sr / 6.);
        let electric = s.electric;
        let decay = clamp(s.decay, 0.3, 5.);
        let brightness = clamp(s.brightness, 0., 1.);
        let hammer = clamp(s.hammer, 0., 1.);
        let unison = clamp(s.unison, 0., 1.);
        let velocity = clamp(s.velocity, 0., 1.);
        let softness = clamp(s.softness, 0., 1.);
        let life = decay * clamp((220. / freq).powf(0.25), 0.55, 1.7);
        let duration = (life * 1.2).max(0.6).min(6.);
        let mut out = vec![0.; (sr * duration).ceil() as usize];
        let brilliance = 0.2 + 0.8 * brightness * (0.25 + 0.75 * velocity);
        let stiffness = if electric {
            0.
        } else {
            0.00006 * (freq / 440.).powf(0.6)
        };
        let contact_hz = (freq * 2.5).max(1000. + 10000. * (1. - softness).powf(2.));
        let ratios: Vec<f64> = if electric {
            vec![1., 2., 3., 4., 5., 6., 7., 8., 2.76, 5.4]
        } else {
            (1..=12).map(|x| x as f64).collect()
        };
        for (index, ratio) in ratios.into_iter().enumerate() {
            let upper = index >= 8 && electric;
            let pitch = ratio * ((1. + stiffness * ratio * ratio) / (1. + stiffness)).sqrt();
            let contact = if softness > 0. {
                1. / (1. + (freq * pitch / contact_hz).powf(4.)).sqrt()
            } else {
                1.
            };
            let amp = 0.44 * (if upper { 0.12 } else { 1. }) / ratio.powf(1.8 - brilliance * 0.7)
                * (-(ratio - 1.) * (1. - brilliance) * 0.28).exp()
                * contact;
            let tail = life / (1. + (if electric { 0.08 } else { 0.14 }) * (ratio - 1.).powf(1.3))
                * (if upper { 0.2 } else { 1. });
            partial(
                &mut out,
                sr,
                freq * pitch,
                amp,
                tail.max(0.035),
                softness * 0.003,
            );
            if index < 2 && unison > 0. {
                partial(
                    &mut out,
                    sr,
                    freq * pitch * 2f64.powf((if electric { 1.5 } else { 0.8 }) * unison / 1200.),
                    amp * 0.3 * unison,
                    (tail * 0.85).max(0.035),
                    softness * 0.003,
                );
            }
        }
        let amount = clamp(s.resonance, 0., 1.);
        if amount > 0. {
            let harmonics: &[f64] = if electric {
                &[2., 3., 4., 6., 8.]
            } else {
                &[2., 3., 4., 5., 6.]
            };
            for &h in harmonics {
                let pitch = h * ((1. + stiffness * h * h) / (1. + stiffness)).sqrt();
                let colour = if electric {
                    if h % 2. == 0. {
                        1.
                    } else {
                        0.28
                    }
                } else {
                    (-0.18 * (h - 2.)).exp()
                };
                partial(
                    &mut out,
                    sr,
                    freq * pitch,
                    amount * 0.055 * colour * (0.35 + 0.65 * brilliance) / h.sqrt(),
                    (life * (if electric { 0.8 } else { 0.65 }) / (1. + 0.06 * (h - 2.)))
                        .max(0.035),
                    if electric { 0.055 } else { 0.035 },
                );
            }
        }
        let mut state = s.seed ^ ((freq * 100.).round() as u32);
        if state == 0 {
            state = 1;
        }
        let (mut noise, mut last, mut dc, mut peak) = (0., 0., 0., 0f64);
        let dc_pole = (-TAU * 10. / sr).exp();
        let strike_decay = (-1. / (sr * (if electric { 0.006 } else { 0.012 }))).exp();
        let mut strike = hammer
            * velocity.powf(1.5)
            * (if electric { 0.025 } else { 0.055 })
            * (1. - 0.8 * softness);
        let noise_alpha = if softness > 0. {
            1. - (-TAU * 1800f64.min(contact_hz * 0.5) / sr).exp()
        } else {
            0.25
        };
        let len = out.len();
        for (i, x) in out.iter_mut().enumerate() {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            noise += noise_alpha * (state as f64 / 2147483648. - 1. - noise);
            let raw = *x as f64 + noise * strike;
            strike *= strike_decay;
            dc = raw - last + dc_pole * dc;
            last = raw;
            *x = (dc
                * 0f64.max(
                    1f64.min(i as f64 / (sr * (0.001 + softness * 0.002)))
                        .min((len - 1 - i) as f64 / (sr * 0.025)),
                )) as f32;
            peak = peak.max((*x as f64).abs());
        }
        if peak > 0.8 {
            for x in &mut out {
                *x = (*x as f64 * (0.8 / peak)) as f32;
            }
        }
        Self { samples: out }
    }
    pub fn body(
        sample_rate: f64,
        frequency: f64,
        electric: bool,
        brightness: f64,
        velocity: f64,
        sustain: f64,
        resonance: f64,
    ) -> Self {
        let mut out = vec![0f32; 2048];
        let amount = clamp(sustain, 0., 1.);
        let bright = clamp(brightness, 0., 1.) * (0.25 + 0.75 * clamp(velocity, 0., 1.));
        let harmonics = (if electric { 4f64 } else { 3f64 })
            .min((sample_rate * 0.45 / frequency).floor()) as usize;
        for (i, x) in out.iter_mut().enumerate() {
            for h in 1..=harmonics {
                *x = (*x as f64
                    + 0.44
                        * amount
                        * (if h == 1 { 1. } else { bright * 0.22 / h as f64 })
                        * (2. * PI * h as f64 * i as f64 / 2048.).sin())
                    as f32;
            }
        }
        let colour = clamp(resonance, 0., 1.);
        let limit = 8f64.min((sample_rate * 0.45 / frequency).floor()) as usize;
        if colour > 0. {
            for h in 2..=limit {
                let weight = if electric {
                    if h % 2 == 0 {
                        1.
                    } else {
                        0.2
                    }
                } else {
                    (-0.24 * (h as f64 - 2.)).exp()
                };
                let level = 0.44 * amount * colour * (0.25 + 0.75 * bright) * 0.16 * weight
                    / (h as f64).sqrt();
                for (i, x) in out.iter_mut().enumerate() {
                    *x = (*x as f64 + level * (2. * PI * h as f64 * i as f64 / 2048.).sin()) as f32;
                }
            }
        }
        Self { samples: out }
    }
}

// Opaque handles own immutable PCM. Hosts prepare/copy/free outside render.
// No singleton DSP state or host clock; any number of independent handles.
#[no_mangle]
pub extern "C" fn piano_api_version() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn piano_note_new(
    sr: f64,
    freq: f64,
    kind: u32,
    decay: f64,
    brightness: f64,
    hammer: f64,
    unison: f64,
    velocity: f64,
    seed: u32,
    resonance: f64,
    softness: f64,
    wear: f64,
) -> *mut Piano {
    if kind > 10 {
        return std::ptr::null_mut();
    }
    let settings = Settings {
        electric: kind == 1,
        decay,
        brightness,
        hammer,
        unison,
        velocity,
        seed,
        resonance,
        softness,
    };
    let note = if kind < 2 {
        Piano::strike(sr, freq, settings)
    } else {
        acoustic::render(sr, freq, kind, settings, wear)
    };
    Box::into_raw(Box::new(note))
}
#[no_mangle]
pub extern "C" fn piano_body_new(
    sr: f64,
    freq: f64,
    kind: u32,
    brightness: f64,
    velocity: f64,
    sustain: f64,
    resonance: f64,
) -> *mut Piano {
    if kind > 1
        || !sr.is_finite()
        || !(8000. ..=192000.).contains(&sr)
        || !freq.is_finite()
        || freq <= 0.
    {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(Piano::body(
        sr,
        freq,
        kind == 1,
        brightness,
        velocity,
        sustain,
        resonance,
    )))
}
#[no_mangle]
pub unsafe extern "C" fn piano_note_ptr(p: *const Piano) -> *const f32 {
    p.as_ref().map_or(std::ptr::null(), |n| n.samples.as_ptr())
}
#[no_mangle]
pub unsafe extern "C" fn piano_note_len(p: *const Piano) -> usize {
    p.as_ref().map_or(0, |n| n.samples.len())
}
#[no_mangle]
pub unsafe extern "C" fn piano_note_free(p: *mut Piano) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
