//! Zero-lookahead stereo-linked compressor. The key bus is never an audible input.
//! Parameters are fixed per sample by the graph; coefficient updates are cached.
pub struct Compressor {
    sr: f32,
    reduction: f32,
    hp: [f32; 2],
    previous: [f32; 2],
    coefficients: [f32; 3],
    cached: [f32; 3],
    output: f32,
    blend: f32,
    bypass: f32,
    smooth: f32,
    selected: Option<bool>,
    initialized: bool,
    pub meter: [f32; 6],
}
impl Compressor {
    pub fn new(sr: f32) -> Self {
        Self {
            sr,
            reduction: 0.,
            hp: [0.; 2],
            previous: [0.; 2],
            coefficients: [0.; 3],
            cached: [-1.; 3],
            output: 1.,
            blend: 1.,
            bypass: 0.,
            smooth: 1. - (-1. / (sr * 0.005)).exp(),
            selected: None,
            initialized: false,
            meter: [0.; 6],
        }
    }
    pub fn reset(&mut self) {
        self.reduction = 0.;
        self.hp = [0.; 2];
        self.previous = [0.; 2];
        self.selected = None;
        self.meter = [0.; 6];
        self.output = 1.;
        self.blend = 1.;
        self.bypass = 0.;
        self.initialized = false;
    }
    pub fn begin_block(&mut self) {
        self.meter[0] = 0.;
        self.meter[1] = 0.;
        self.meter[3] = 0.;
    }
    pub fn tick(
        &mut self,
        program: [f32; 2],
        key: [f32; 2],
        connected: bool,
        p: &[f32],
    ) -> [f32; 2] {
        if !self.initialized {
            self.output = 10f32.powf(p[5] / 20.);
            self.blend = p[6];
            self.bypass = p[9];
            self.initialized = true;
        }
        let external = p[8] == 1. || (p[8] == 2. && connected);
        let missing = external && !connected;
        if self.selected != Some(external) {
            self.hp = [0.; 2];
            self.previous = [0.; 2];
            self.selected = Some(external);
        }
        let config = [p[3], p[4], p[7]];
        if config != self.cached {
            self.cached = config;
            self.coefficients = [
                (-1. / (self.sr * p[3])).exp(),
                (-1. / (self.sr * p[4])).exp(),
                (-std::f32::consts::TAU * p[7] / self.sr).exp(),
            ];
        }
        let mut detector = if external {
            if connected {
                key
            } else {
                [0.; 2]
            }
        } else {
            program
        };
        if p[7] > 0. {
            for ch in 0..2 {
                let x = detector[ch];
                self.hp[ch] = self.coefficients[2] * (self.hp[ch] + x - self.previous[ch]);
                self.previous[ch] = x;
                detector[ch] = self.hp[ch];
            }
        }
        let level = detector[0].abs().max(detector[1].abs());
        let above = 20. * level.max(1e-12).log10() - p[0];
        let slope = 1. - 1. / p[1];
        let desired = if missing {
            0.
        } else if p[2] > 0. && above.abs() < p[2] * 0.5 {
            slope * (above + p[2] * 0.5).powi(2) / (2. * p[2])
        } else if above > 0. {
            slope * above
        } else {
            0.
        };
        let coefficient = if desired > self.reduction {
            self.coefficients[0]
        } else {
            self.coefficients[1]
        };
        self.reduction = desired + (self.reduction - desired) * coefficient;
        self.output += (10f32.powf(p[5] / 20.) - self.output) * self.smooth;
        self.blend += (p[6] - self.blend) * self.smooth;
        self.bypass += (p[9] - self.bypass) * self.smooth;
        let compressed = 10f32.powf(-self.reduction / 20.);
        let gain = ((1. - self.blend) + self.blend * compressed) * self.output;
        let gain = gain + (1. - gain) * self.bypass;
        let out = [program[0] * gain, program[1] * gain];
        self.meter[0] = self.meter[0].max(program[0].abs().max(program[1].abs()));
        self.meter[1] = self.meter[1].max(level);
        self.meter[2] = self.reduction * (1. - self.bypass);
        self.meter[3] = self.meter[3].max(out[0].abs().max(out[1].abs()));
        self.meter[4] = missing as u32 as f32;
        self.meter[5] = external as u32 as f32;
        out
    }
}
