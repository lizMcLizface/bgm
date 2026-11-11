//! Translation of pinned Chromium DynamicsCompressor (2011 Google/Apple BSD).
//! See CHROMIUM_PROFILE.json / CHROMIUM_NOTICES.txt. This is distinct from the
//! existing zero-lookahead graph.compressor. No callback-dependent allocation.
const METER_RELEASE: f32 = 0.325;
const PRE_DELAY: f32 = 0.006;
const SAT_RELEASE: f32 = 0.0025;
const A: f32 = 0.9999999999999998f32 * 0.09f32 + 1.8432219684323923e-16f32 * 0.16f32
    - 1.9373394351676423e-16f32 * 0.42f32
    + 8.824516011816245e-18f32 * 0.98f32;
const B: f32 = -1.5788320352845888f32 * 0.09f32 + 2.3305837032074286f32 * 0.16f32
    - 0.9141194204840429f32 * 0.42f32
    + 0.1623677525612032f32 * 0.98f32;
const C: f32 = 0.5334142869106424f32 * 0.09f32 - 1.272736789213631f32 * 0.16f32
    + 0.9258856042207512f32 * 0.42f32
    - 0.18656310191776226f32 * 0.98f32;
const D: f32 = 0.08783463138207234f32 * 0.09f32 - 0.1694162967925622f32 * 0.16f32
    + 0.08588057951595272f32 * 0.42f32
    - 0.00429891410546283f32 * 0.98f32;
const E: f32 = -0.042416883008123074f32 * 0.09f32 + 0.1115693827987602f32 * 0.16f32
    - 0.09764676325265872f32 * 0.42f32
    + 0.028494263462021576f32 * 0.98f32;
fn db(x: f32) -> f32 {
    20f32 * crate::math_profile::log10f(x)
}
fn linear(x: f32) -> f32 {
    10f64.powf((0.05f32 * x) as f64) as f32
}
// Chromium's explicitly qualified fdlibm float wrappers call the binary64
// function then convert its result toFloat32 (ieee754.cc), rather than using
// an independent single-precision transcendental approximation.
fn fd_powf(x: f32, y: f32) -> f32 {
    (x as f64).powf(y as f64) as f32
}
fn finite(x: f32, fallback: f32) -> f32 {
    if x.is_finite() {
        x
    } else {
        fallback
    }
}
fn flush(x: f32) -> f32 {
    if x.abs() < f32::MIN_POSITIVE {
        0.
    } else {
        x
    }
}
pub struct Kernel {
    rate: f32,
    ring: [[f32; 1024]; 2],
    read: usize,
    write: usize,
    latency: usize,
    detector: f32,
    gain: f32,
    meter: f32,
    meter_release: f32,
    attack_diff: f32,
    threshold_db: f32,
    threshold: f32,
    knee_db: f32,
    knee_threshold_db: f32,
    knee_threshold: f32,
    yknee_db: f32,
    ratio: f32,
    slope: f32,
    knee: f32,
    post_gain: f32,
    attack_frames: f32,
    release_poly: [f32; 5],
    desired_gain: f32,
    envelope_rate: f32,
}
impl Kernel {
    pub fn new(rate: f32) -> Self {
        let mut k = Self {
            rate,
            ring: [[0.; 1024]; 2],
            read: 0,
            write: 256,
            latency: 256,
            detector: 0.,
            gain: 1.,
            meter: 1.,
            meter_release: (1. - (-1. / (METER_RELEASE as f64 * rate as f64)).exp()) as f32,
            attack_diff: -1.,
            threshold_db: -1.,
            threshold: -1.,
            knee_db: -1.,
            knee_threshold_db: -1.,
            knee_threshold: -1.,
            yknee_db: -1.,
            ratio: -1.,
            slope: -1.,
            knee: -1.,
            post_gain: 1.,
            attack_frames: 1.,
            release_poly: [0.; 5],
            desired_gain: 0.,
            envelope_rate: 0.,
        };
        k.prepare_delay();
        k
    }
    fn prepare_delay(&mut self) {
        let frames = ((PRE_DELAY * self.rate) as usize).min(1023);
        if self.latency != frames {
            self.latency = frames;
            self.ring.fill([0.; 1024]);
            self.read = 0;
            self.write = frames;
        }
    }
    pub fn reset(&mut self) {
        self.ring.fill([0.; 1024]);
        self.read = 0;
        self.write = self.latency;
        self.detector = 0.;
        self.gain = 1.;
        self.meter = 1.;
        self.attack_diff = -1.;
        // Fresh native-node state rather than reusing its internal Reset's
        // default256 write index with a stale last_pre_delay_frames cache.
        self.threshold_db = -1.;
        self.knee_db = -1.;
        self.ratio = -1.;
    }
    fn knee_curve(&self, x: f32, k: f32) -> f32 {
        if x < self.threshold {
            return x;
        }
        self.threshold + (1. - ((-k * (x - self.threshold)) as f64).exp() as f32) / k
    }
    fn saturate(&self, x: f32, k: f32) -> f32 {
        if x < self.knee_threshold {
            return self.knee_curve(x, k);
        }
        linear(self.yknee_db + self.slope * (db(x) - self.knee_threshold_db))
    }
    fn k_at_slope(&self, desired: f32) -> f32 {
        let db_x = self.threshold_db + self.knee_db;
        let x = linear(db_x);
        let (x2, db_x2) = if !(x < self.threshold) {
            let x2 = (x as f64 * 1.001f64) as f32;
            (x2, db(x2))
        } else {
            (1., 0.)
        };
        let mut min = 0.1f32;
        let mut max = 10000f32;
        let mut k = 5f32;
        for _ in 0..15 {
            let slope = if !(x < self.threshold) {
                (db(self.knee_curve(x2, k)) - db(self.knee_curve(x, k))) / (db_x2 - db_x)
            } else {
                1.
            };
            if slope < desired {
                max = k;
            } else {
                min = k;
            }
            k = (min * max).sqrt();
        }
        k
    }
    /// Native parameter snapshot once per128 frames; this does not restart the
    ///32-frame detector/envelope divisions when the foreign host splits calls.
    pub fn begin_quantum(&mut self, p: [f32; 5]) {
        let [threshold, knee, ratio, attack, release] = p;
        if threshold != self.threshold_db || knee != self.knee_db || ratio != self.ratio {
            self.threshold_db = threshold;
            self.threshold = linear(threshold);
            self.knee_db = knee;
            self.ratio = ratio;
            self.slope = 1. / ratio;
            self.knee = self.k_at_slope(1. / ratio);
            self.knee_threshold_db = threshold + knee;
            self.knee_threshold = linear(self.knee_threshold_db);
            self.yknee_db = db(self.knee_curve(self.knee_threshold, self.knee));
        }
        self.post_gain = fd_powf(1. / self.saturate(1., self.knee), 0.6f32);
        self.attack_frames = 0.001f32.max(attack) * self.rate;
        let frames = self.rate * release;
        self.release_poly = [frames * A, frames * B, frames * C, frames * D, frames * E];
    }
    fn begin_division(&mut self) {
        self.detector = finite(self.detector, 1.);
        self.desired_gain = (self.detector as f64).asin() as f32 / std::f32::consts::FRAC_PI_2;
        let releasing = self.desired_gain > self.gain;
        let diff = if self.desired_gain == 0. {
            if releasing {
                -1.
            } else {
                1.
            }
        } else {
            db(self.gain / self.desired_gain)
        };
        self.envelope_rate = if releasing {
            self.attack_diff = -1.;
            let x = 0.25f32 * (finite(diff, -1.).clamp(-12., 0.) + 12.);
            let x2 = x * x;
            let x3 = x2 * x;
            let x4 = x2 * x2;
            let [a, b, c, d, e] = self.release_poly;
            linear(5. / (a + b * x + c * x2 + d * x3 + e * x4))
        } else {
            let diff = finite(diff, 1.);
            if self.attack_diff == -1. || self.attack_diff < diff {
                self.attack_diff = diff;
            }
            let effective = 0.5f32.max(self.attack_diff);
            1. - fd_powf(0.25f32 / effective, 1. / self.attack_frames)
        };
    }
    pub fn tick(&mut self, input: [f32; 2], frame: u64) -> [f32; 2] {
        if frame % 32 == 0 {
            self.begin_division();
        }
        let mut abs = 0f32;
        for ch in 0..2 {
            self.ring[ch][self.write] = input[ch];
            let value = if input[ch] > 0. {
                input[ch]
            } else {
                -input[ch]
            };
            if abs < value {
                abs = value;
            }
        }
        let shaped = self.saturate(abs, self.knee);
        let attenuation = if abs <= 0.0001f32 { 1. } else { shaped / abs };
        let per_frame = 2f32.max(-db(attenuation)) / (SAT_RELEASE * self.rate);
        let rate = if attenuation > self.detector {
            linear(per_frame) - 1.
        } else {
            1.
        };
        self.detector += (attenuation - self.detector) * rate;
        self.detector = finite(self.detector.min(1.), 1.);
        if self.envelope_rate < 1. {
            self.gain += (self.desired_gain - self.gain) * self.envelope_rate;
        } else {
            self.gain = (self.gain * self.envelope_rate).min(1.);
        }
        let warped = ((std::f32::consts::FRAC_PI_2 * self.gain) as f64).sin() as f32;
        let total = self.post_gain * warped;
        let real_gain = db(warped);
        if real_gain < self.meter {
            self.meter = real_gain;
        } else {
            self.meter += (real_gain - self.meter) * self.meter_release;
        }
        let out = [
            self.ring[0][self.read] * total,
            self.ring[1][self.read] * total,
        ];
        self.read = (self.read + 1) & 1023;
        self.write = (self.write + 1) & 1023;
        if frame % 32 == 31 {
            self.detector = flush(self.detector);
            self.gain = flush(self.gain);
        }
        out
    }
    pub fn latency(&self) -> usize {
        self.latency
    }
    pub fn reduction(&self) -> f32 {
        self.meter
    }
    pub fn curve_stat(&self, index: u32) -> f32 {
        match index {
            0 => self.knee,
            1 => self.threshold,
            2 => self.knee_threshold,
            3 => self.yknee_db,
            4 => self.post_gain,
            5 => self.saturate(1., self.knee),
            _ => 0.,
        }
    }
}
