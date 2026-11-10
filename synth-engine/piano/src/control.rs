//! Immutable finite control snapshots. Graph time is independent of host time.
pub struct Control {
    pub axis: u32,
    pub kind: u32,
    pub phase: f64,
    pub frequency: f64,
    pub initial: f64,
    pub target: f64,
    pub tau: f64,
    pub points: Vec<(f64, f64)>,
}
impl Control {
    pub fn valid(&self) -> bool {
        self.axis <= 1
            && self.kind <= 1
            && [
                self.phase,
                self.frequency,
                self.initial,
                self.target,
                self.tau,
            ]
            .iter()
            .all(|x| x.is_finite())
            && (0. ..1.).contains(&self.phase)
            && (0. ..=44100.).contains(&self.frequency)
            && self.initial.abs() <= 24000.
            && self.target.abs() <= 24000.
            && (0. ..=1_440_000.).contains(&self.tau)
    }
    pub fn ready(&self) -> bool {
        self.kind == 0
            || self.kind == 1
                && self.points.len() >= 2
                && self.points[0].0 == 0.
                && self.points.last().unwrap().0 >= 5_760_000.
    }
    pub fn at(&self, frame: f64, sr: f64) -> f64 {
        let depth = if self.tau > 0. {
            self.target + (self.initial - self.target) * (-frame / self.tau).exp()
        } else {
            self.target
        };
        let wave = if self.kind == 0 {
            let mut cycles = self.phase;
            let mut at = 0.;
            let mut hz = self.frequency;
            for &(time, rate) in &self.points {
                if time > frame {
                    break;
                }
                cycles += (time - at) * hz / sr;
                at = time;
                hz = rate;
            }
            (std::f64::consts::TAU * (cycles + (frame - at) * hz / sr)).sin()
        } else {
            let next = self.points.partition_point(|p| p.0 < frame);
            if next == 0 {
                self.points[0].1
            } else if next == self.points.len() {
                self.points[next - 1].1
            } else {
                let a = self.points[next - 1];
                let b = self.points[next];
                a.1 + (b.1 - a.1) * (frame - a.0) / (b.0 - a.0)
            }
        };
        wave * depth
    }
}
