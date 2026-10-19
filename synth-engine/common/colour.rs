//! Shared per-note acoustic colour. Original software textures, not physical bows/air columns.
#[cfg(feature = "simd-colour")]
use crate::simd::V;
use std::f32::consts::PI;
pub const COUNT: usize = 13;
pub const DEFAULTS: [f32; COUNT] = [0., 0., 4500., 0.25, 0., 0., 0., 0., 0., 0., 1., 0., 0.25];
pub fn range(i: usize) -> (f32, f32) {
    match i {
        2 => (500., 10000.),
        5 => (0., 2.),
        6 | 9 => (-12., 12.),
        8 => (0., 4.),
        10 => (0.3, 3.),
        _ => (0., 1.),
    }
}
pub fn enabled(p: &[f32]) -> bool {
    [0, 1, 4, 7].iter().any(|&i| p[i] > 0.)
}
const VOWELS: [[f32; 3]; 3] = [
    [700., 1200., 2600.],
    [350., 900., 2400.],
    [300., 2200., 3000.],
];
// Illustrative body modes: frequency, e-fold decay seconds, weight. Fixed bodies,
// independent of the played note. They are not measured instrument responses.
const BODIES: [[[f32; 3]; 4]; 5] = [
    [
        [110., 0.09, 0.4],
        [210., 0.065, 0.3],
        [430., 0.04, 0.2],
        [900., 0.025, 0.1],
    ],
    [
        [95., 0.16, 0.4],
        [190., 0.12, 0.3],
        [420., 0.07, 0.2],
        [760., 0.05, 0.1],
    ],
    [
        [220., 0.12, 0.4],
        [460., 0.08, 0.3],
        [930., 0.06, 0.2],
        [1800., 0.035, 0.1],
    ],
    [
        [480., 0.045, 0.4],
        [1350., 0.025, 0.3],
        [2700., 0.018, 0.2],
        [3900., 0.012, 0.1],
    ],
    [
        [500., 0.2, 0.4],
        [1100., 0.14, 0.3],
        [2500., 0.08, 0.2],
        [4200., 0.05, 0.1],
    ],
];
#[cfg_attr(feature = "simd-colour", allow(dead_code))]
#[derive(Clone, Copy)]
struct Band {
    g: f32,
    k: f32,
    z1: f32,
    z2: f32,
}
#[cfg_attr(feature = "simd-colour", allow(dead_code))]
impl Band {
    const ZERO: Self = Self {
        g: 0.,
        k: 0.,
        z1: 0.,
        z2: 0.,
    };
    fn configure(&mut self, hz: f32, q: f32, sr: f32) {
        self.g = (PI * hz.clamp(30., sr * 0.4) / sr).tan();
        self.k = 1. / q.max(0.5);
    }
    #[cfg_attr(feature = "profile-sections", inline(never))]
    fn tick(&mut self, x: f32) -> f32 {
        // Scale the input rather than the output to keep internal resonant states
        // bounded at high Q while retaining unit peak bandpass gain.
        let x = x * self.k;
        let a = 1. / (1. + self.g * (self.g + self.k));
        let v1 = a * (self.z1 + self.g * (x - self.z2));
        let v2 = self.z2 + self.g * v1;
        self.z1 = (2. * v1 - self.z1).clamp(-32., 32.);
        self.z2 = (2. * v2 - self.z2).clamp(-32., 32.);
        v1
    }
    fn clear(&mut self) {
        self.z1 = 0.;
        self.z2 = 0.;
    }
}
// Independent resonant modes occupy SIMD lanes. State remains packed across
// samples; the final weighted sum keeps the original ascending-band order.
#[cfg(feature = "simd-colour")]
#[derive(Clone, Copy)]
struct Modes4 {
    g: [f32; 4],
    k: [f32; 4],
    a: [f32; 4],
    z1: [f32; 4],
    z2: [f32; 4],
}
#[cfg(feature = "simd-colour")]
impl Modes4 {
    const ZERO: Self = Self {
        g: [0.; 4],
        k: [0.; 4],
        a: [0.; 4],
        z1: [0.; 4],
        z2: [0.; 4],
    };
    fn configure(&mut self, bands: &[Band]) {
        self.g = core::array::from_fn(|i| bands.get(i).map_or(0., |b| b.g));
        self.k = core::array::from_fn(|i| bands.get(i).map_or(0., |b| b.k));
        self.a = (V::s(1.) / (V::s(1.) + V::a(self.g) * (V::a(self.g) + V::a(self.k)))).array();
    }
    #[inline(always)]
    fn tick(&mut self, x: f32) -> [f32; 4] {
        let g = V::a(self.g);
        let z1 = V::a(self.z1);
        let z2 = V::a(self.z2);
        let x = V::s(x) * V::a(self.k);
        let v1 = V::a(self.a) * (z1 + g * (x - z2));
        let v2 = z2 + g * v1;
        self.z1 = (V::s(2.) * v1 - z1).clamp(-32., 32.).array();
        self.z2 = (V::s(2.) * v2 - z2).clamp(-32., 32.).array();
        v1.array()
    }
    fn clear(&mut self) {
        self.z1 = [0.; 4];
        self.z2 = [0.; 4];
    }
}
fn random(s: &mut u32) -> f32 {
    *s ^= *s << 13;
    *s ^= *s >> 17;
    *s ^= *s << 5;
    (*s as f64 / u32::MAX as f64) as f32 * 2. - 1.
}
#[derive(Clone, Copy)]
pub struct Colour {
    #[cfg(feature = "simd-colour")]
    formants4: [Modes4; 2],
    #[cfg(feature = "simd-colour")]
    body4: [Modes4; 2],
    sr: f32,
    s: [f32; COUNT],
    alpha: f32,
    control_alpha: f32,
    frame: u64,
    rng: [u32; 2],
    formants: [[Band; 3]; 2],
    body: [[Band; 4]; 2],
    weight: [f32; 4],
    air_low: [f32; 2],
    air_high: [f32; 2],
    bow_low: [f32; 2],
    bow_high: [f32; 2],
    grain: [f32; 2],
    bow_level: [f32; 2],
    pressure: f32,
    air_a: f32,
    air_high_a: f32,
    bow_a: f32,
    bow_high_a: f32,
    grain_a: f32,
    attack_a: f32,
    attack: f32,
    active: bool,
    #[cfg(feature = "cache-colour-coefficients")]
    configured: u8,
    quiet: u32,
    idle: u32,
    tail_limit: u32,
}
impl Colour {
    pub const ZERO: Self = Self {
        #[cfg(feature = "simd-colour")]
        formants4: [Modes4::ZERO; 2],
        #[cfg(feature = "simd-colour")]
        body4: [Modes4::ZERO; 2],
        sr: 0.,
        s: [0.; COUNT],
        alpha: 0.,
        control_alpha: 0.,
        frame: 0,
        rng: [0; 2],
        formants: [[Band::ZERO; 3]; 2],
        body: [[Band::ZERO; 4]; 2],
        weight: [0.; 4],
        air_low: [0.; 2],
        air_high: [0.; 2],
        bow_low: [0.; 2],
        bow_high: [0.; 2],
        grain: [0.; 2],
        bow_level: [0.; 2],
        pressure: 0.,
        air_a: 0.,
        air_high_a: 0.,
        bow_a: 0.,
        bow_high_a: 0.,
        grain_a: 0.,
        attack_a: 0.,
        attack: 0.,
        active: false,
        #[cfg(feature = "cache-colour-coefficients")]
        configured: 0,
        quiet: 0,
        idle: 0,
        tail_limit: 0,
    };
    pub fn init(&mut self, sr: f32, seed: u32, p: &[f32]) {
        *self = Self::ZERO;
        self.rng = [
            (seed ^ 0xa5b35705).max(1),
            (seed.wrapping_mul(747796405) ^ 0x915f12cd).max(1),
        ];
        self.s.copy_from_slice(p);
        self.attack = 1.;
        self.rate(sr);
        self.refresh();
    }
    fn rate(&mut self, sr: f32) {
        self.sr = sr;
        self.alpha = 1. - (-1. / (sr * 0.02)).exp();
        self.control_alpha = 1. - (-32. / (sr * 0.02)).exp();
        self.air_high_a = 1. - (-2. * PI * 650. / sr).exp();
        self.bow_high_a = 1. - (-2. * PI * 120. / sr).exp();
        self.grain_a = 1. - (-2. * PI * 12. / sr).exp();
        self.attack_a = 1. - (-1. / (sr * 0.05)).exp();
    }
    #[cfg_attr(feature = "profile-sections", inline(never))]
    fn refresh(&mut self) {
        #[cfg(feature = "cache-colour-coefficients")]
        {
            self.configured = self.band_mask();
        }
        let vowel = self.s[5].clamp(0., 2.);
        let i = vowel as usize;
        let j = (i + 1).min(2);
        let mix = vowel - i as f32;
        let shift = (self.s[6] / 12.).exp2();
        let material = self.s[8].clamp(0., 4.);
        let a = material as usize;
        let b = (a + 1).min(4);
        let blend = material - a as f32;
        let tuning = (self.s[9] / 12.).exp2();
        let mut max_decay: f32 = 0.;
        for ch in 0..2 {
            if self.s[4] > 0.00001 {
                for band in 0..3 {
                    let hz =
                        VOWELS[i][band] * (VOWELS[j][band] / VOWELS[i][band]).powf(mix) * shift;
                    self.formants[ch][band].configure(hz, [5., 7., 9.][band], self.sr);
                }
                #[cfg(feature = "simd-colour")]
                self.formants4[ch].configure(&self.formants[ch]);
            }
            if self.s[7] > 0.00001 {
                for band in 0..4 {
                    let p = BODIES[a][band];
                    let q = BODIES[b][band];
                    let hz = (p[0] + (q[0] - p[0]) * blend) * tuning;
                    let decay = (p[1] + (q[1] - p[1]) * blend) * self.s[10];
                    max_decay = max_decay.max(decay);
                    self.weight[band] = p[2] + (q[2] - p[2]) * blend;
                    self.body[ch][band].configure(hz, PI * hz.min(self.sr * 0.4) * decay, self.sr);
                }
                #[cfg(feature = "simd-colour")]
                self.body4[ch].configure(&self.body[ch]);
            }
        }
        self.air_a = 1. - (-2. * PI * self.s[2].min(self.sr * 0.4) / self.sr).exp();
        self.bow_a =
            1. - (-2. * PI * (self.s[2] * 0.55).clamp(250., self.sr * 0.4) / self.sr).exp();
        self.tail_limit = ((if self.s[7] > 0.00001 {
            max_decay * 17. + 0.2
        } else {
            0.5
        }) * self.sr) as u32;
    }
    #[cfg(feature = "cache-colour-coefficients")]
    fn band_mask(&self) -> u8 {
        (self.s[4] > 0.00001) as u8 | (((self.s[7] > 0.00001) as u8) << 1)
    }
    pub fn engaged(&self) -> bool {
        self.active
    }
    pub fn ringing(&self) -> bool {
        self.active
            && (self.s[4] > 0.00001 || self.s[7] > 0.00001)
            && self.quiet < (self.sr * 0.03) as u32
            && self.idle < self.tail_limit
    }
    #[cfg_attr(feature = "profile-sections", inline(never))]
    pub fn tick(
        &mut self,
        input: [f32; 2],
        noise_gain: [f32; 2],
        pressure: f32,
        p: &[f32],
        sr: f32,
    ) -> [f32; 2] {
        if sr != self.sr {
            self.rate(sr);
            self.refresh();
        }
        if !enabled(p) && [0, 1, 4, 7].iter().all(|&i| self.s[i] == 0.) {
            if self.active {
                self.clear();
            }
            return input;
        }
        self.active = true;
        for &i in &[0, 1, 4, 7] {
            let diff = p[i] - self.s[i];
            self.s[i] = if diff.abs() < 1e-6 {
                p[i]
            } else {
                self.s[i] + diff * self.alpha
            };
        }
        if self.frame % 32 == 0 {
            #[cfg(feature = "cache-colour-coefficients")]
            let mut changed = self.configured != self.band_mask();
            for i in 0..COUNT {
                if ![0, 1, 4, 7].contains(&i) {
                    #[cfg(feature = "cache-colour-coefficients")]
                    let previous = self.s[i];
                    self.s[i] += (p[i] - self.s[i]) * self.control_alpha;
                    #[cfg(feature = "cache-colour-coefficients")]
                    {
                        changed |= self.s[i] != previous;
                    }
                }
            }
            // Coefficients are constant once the control smoothing settles.
            // Keep the original control cadence and every intermediate value.
            #[cfg(feature = "cache-colour-coefficients")]
            if changed {
                self.refresh();
            }
            #[cfg(not(feature = "cache-colour-coefficients"))]
            self.refresh();
        }
        let live = input[0].abs().max(input[1].abs()) > 1e-7
            || ((self.s[0] > 0. || self.s[1] > 0.)
                && noise_gain[0].abs().max(noise_gain[1].abs()) > 1e-7);
        self.idle = if live { 0 } else { self.idle.saturating_add(1) };
        let mut out = input;
        let noisy = (self.s[0] > 0. || self.s[1] > 0.) && noise_gain[0].max(noise_gain[1]) > 0.;
        let (common, side) = if noisy {
            (random(&mut self.rng[0]), random(&mut self.rng[1]))
        } else {
            (0., 0.)
        };
        // Performance input is discrete; avoid turning a pressure message into
        // an instantaneous jump in the independent noise bed.
        self.pressure += (pressure.clamp(0., 1.) - self.pressure) * self.alpha;
        let excitation =
            (1. + self.s[11] * self.pressure * 1.5) * (1. + self.s[12] * self.attack * 2.);
        for ch in 0..2 {
            self.bow_level[ch] += (input[ch].abs() - self.bow_level[ch]) * self.alpha;
            if noisy {
                let white = common * 0.9 + side * if ch == 0 { 0.1 } else { -0.1 };
                self.air_high[ch] += (white - self.air_high[ch]) * self.air_high_a;
                self.air_low[ch] += ((white - self.air_high[ch]) - self.air_low[ch]) * self.air_a;
                self.bow_low[ch] += (white - self.bow_low[ch]) * self.bow_a;
                self.bow_high[ch] += (self.bow_low[ch] - self.bow_high[ch]) * self.bow_high_a;
                self.grain[ch] += (white - self.grain[ch]) * self.grain_a;
                let rough = (self.s[3] * self.grain[ch] * 8.).clamp(-0.5, 0.5);
                let gain = noise_gain[ch].clamp(0., 4.);
                // Bow texture roughens the pitched source. Its small unpitched
                // component follows the audible source level as well as the
                // note envelope, so a dark/quiet string cannot acquire a loud
                // post-filter hiss. Breath remains a separate air source.
                let bow_gain = gain.min(self.bow_level[ch] * 2.);
                out[ch] += self.air_low[ch] * self.s[0] * 0.18 * gain * excitation
                    + self.s[1]
                        * excitation
                        * (input[ch] * rough * 0.5
                            + (self.bow_low[ch] - self.bow_high[ch])
                                * (1. + rough)
                                * 0.1
                                * bow_gain);
            }
            if self.s[4] > 0.00001 {
                let mut vowel = 0.;
                #[cfg(feature = "simd-colour")]
                let values = self.formants4[ch].tick(out[ch]);
                for band in 0..3 {
                    #[cfg(not(feature = "simd-colour"))]
                    {
                        vowel += self.formants[ch][band].tick(out[ch]) * [0.5, 0.3, 0.2][band];
                    }
                    #[cfg(feature = "simd-colour")]
                    {
                        vowel += values[band] * [0.5, 0.3, 0.2][band];
                    }
                }
                out[ch] = out[ch] * (1. - self.s[4] * 0.65) + vowel * self.s[4] * 1.8;
            } else {
                #[cfg(feature = "simd-colour")]
                self.formants4[ch].clear();
                #[cfg(not(feature = "simd-colour"))]
                for band in &mut self.formants[ch] {
                    band.clear();
                }
            }
            if self.s[7] > 0.00001 {
                let mut body = 0.;
                #[cfg(feature = "simd-colour")]
                let values = self.body4[ch].tick(out[ch]);
                for band in 0..4 {
                    #[cfg(not(feature = "simd-colour"))]
                    {
                        body += self.body[ch][band].tick(out[ch]) * self.weight[band];
                    }
                    #[cfg(feature = "simd-colour")]
                    {
                        body += values[band] * self.weight[band];
                    }
                }
                out[ch] = out[ch] * (1. - self.s[7] * 0.2) + body * self.s[7] * 2.5;
            } else {
                #[cfg(feature = "simd-colour")]
                self.body4[ch].clear();
                #[cfg(not(feature = "simd-colour"))]
                for band in &mut self.body[ch] {
                    band.clear();
                }
            }
        }
        self.quiet = if out[0].abs().max(out[1].abs()) > 1e-7 {
            0
        } else {
            self.quiet.saturating_add(1)
        };
        self.attack += (0. - self.attack) * self.attack_a;
        self.frame += 1;
        out
    }
    fn clear(&mut self) {
        #[cfg(feature = "simd-colour")]
        {
            self.formants4 = [Modes4::ZERO; 2];
            self.body4 = [Modes4::ZERO; 2];
        }
        self.formants = [[Band::ZERO; 3]; 2];
        self.body = [[Band::ZERO; 4]; 2];
        self.air_low = [0.; 2];
        self.air_high = [0.; 2];
        self.bow_low = [0.; 2];
        self.bow_high = [0.; 2];
        self.grain = [0.; 2];
        self.bow_level = [0.; 2];
        self.pressure = 0.;
        self.active = false;
        #[cfg(feature = "cache-colour-coefficients")]
        {
            self.configured = 0;
        }
        self.quiet = 0;
        self.idle = 0;
    }
}
