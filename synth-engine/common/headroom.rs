// Output protection is gain control, not a waveshaper. Leave ordinary signals
// linear; link stereo and hold reduction across waveform peaks so a sustained
// chord is attenuated as a whole instead of flattened sample by sample.
pub struct Headroom {
    reduction: f32,
    hold: u32,
    hold_frames: u32,
    release: f32,
}
impl Headroom {
    pub const fn new() -> Self {
        // Keep static storage zero-initialized, especially in the large FDN
        // instance. init() configures the rate and restores unity gain.
        Self { reduction: 0., hold: 0, hold_frames: 0, release: 0. }
    }
    pub fn init(&mut self, sr: f32) {
        self.hold_frames = (sr * 0.05) as u32;
        self.release = 1. - (-1. / (sr * 0.12)).exp();
        self.clear();
    }
    pub fn clear(&mut self) {
        self.reduction = 0.;
        self.hold = 0;
    }
    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        let input = input.map(|x| if x.is_finite() { x } else { 0. });
        let peak = input[0].abs().max(input[1].abs());
        let needed = if peak > 0.98 { 1. - 0.98 / peak } else { 0. };
        if needed > 0. && needed >= self.reduction {
            self.reduction = needed;
            self.hold = self.hold_frames;
        } else if self.hold > 0 {
            self.hold -= 1;
        } else {
            // Decay reduction towards zero rather than adding tiny increments
            // to a gain near one, which stalls in f32 at high sample rates.
            self.reduction = (self.reduction * (1. - self.release)).max(needed);
            if self.reduction < 1e-7 { self.reduction = 0.; }
        }
        let gain = 1. - self.reduction;
        [input[0] * gain, input[1] * gain]
    }
}
