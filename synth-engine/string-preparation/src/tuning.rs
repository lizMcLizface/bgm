use crate::model::Model;
#[derive(Clone, Copy)]
pub struct Tuning {
    pub vibrato: f64,
    pub noise: f64,
    pub tilt: f64,
    pub evenness: f64,
    pub noise_share: f64,
    pub parts: u32,
}
impl Model {
    pub fn tune(&mut self, t: Tuning, smooth: Option<Vec<f64>>) {
        if let Some(shape) = smooth {
            let power = |a: &[f64]| a.iter().fold(0., |sum, db| sum + 10f64.powf(*db / 10.));
            let l = shape.iter().map(|d| d + self.level).collect::<Vec<_>>();
            let lift = 10. * (power(&self.tonal) / power(&l)).log10();
            let smooth: Vec<f64> = shape.iter().map(|d| d + self.level + lift).collect();
            if t.parts == 1 {
                self.tonal = smooth;
            } else {
                self.tonal = self
                    .tonal
                    .iter()
                    .zip(&smooth)
                    .map(|(a, b)| {
                        20. * (10f64.powf(*a / 20.) - 10f64.powf(*b / 20.))
                            .abs()
                            .max(1e-6)
                            .log10()
                    })
                    .collect();
                self.noise.fill(-200.);
                self.low = None;
                self.bed = None;
            }
        }
        for (k, db) in self.tonal.iter_mut().enumerate() {
            *db += t.tilt * (((k + 1) as f64 * self.f0 / 1000.).max(0.25)).log2();
        }
        if t.parts != 2 {
            for (k, db) in self.noise.iter_mut().enumerate() {
                *db += t.tilt * (((k + 1) as f64 * self.f0 / 1000.).max(0.25)).log2() + t.noise;
            }
            if let Some(low) = &mut self.low {
                *low += t.noise;
            }
        }
        if let Some(v) = &mut self.vibrato {
            for d in &mut v.depths {
                *d *= t.vibrato;
            }
        }
    }
}
