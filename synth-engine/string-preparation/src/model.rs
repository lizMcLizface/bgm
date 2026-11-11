//! Direct modelFor/tunedModelFrom arithmetic, including nullable row blends.
use crate::table::{write_list, write_rows, Layer, Rows, Table, Vibrato};
fn mix(a: f64, b: f64, t: f64) -> f64 {
    a * (1. - t) + b * t
}
fn mix_value(a: Option<f64>, b: Option<f64>, t: f64) -> Option<f64> {
    match (a, b) {
        (Some(a), Some(b)) => Some(mix(a, b, t)),
        (Some(a), None) => Some(a),
        (_, b) => b,
    }
}
fn mix_rows(a: &Rows, b: &Rows, t: f64) -> Rows {
    match (a, b) {
        (Some(a), Some(b)) => Some(
            a.iter()
                .enumerate()
                .map(|(i, row)| match (row, b.get(i).unwrap_or(&None)) {
                    (Some(a), Some(b)) => Some(
                        a.iter()
                            .enumerate()
                            .map(|(j, a)| mix_value(*a, *b.get(j).unwrap_or(a), t))
                            .collect(),
                    ),
                    (Some(a), None) => Some(a.clone()),
                    (_, b) => b.clone(),
                })
                .collect(),
        ),
        (Some(a), None) => Some(a.clone()),
        (_, b) => b.clone(),
    }
}
pub struct Model {
    pub midi: f64,
    pub velocity: f64,
    pub f0: f64,
    pub level: f64,
    pub low: Option<f64>,
    pub onset: f64,
    pub tonal: Vec<f64>,
    pub noise: Vec<f64>,
    pub vibrato: Option<Vibrato>,
    pub env: Rows,
    pub release: Rows,
    pub bed: Rows,
}
fn level_at(table: &Table, layer: usize, midi: f64, evenness: f64) -> f64 {
    let p: Vec<_> = table
        .pitches
        .iter()
        .filter(|p| p.layers[layer].present)
        .collect();
    let raw: Vec<f64> = p
        .iter()
        .enumerate()
        .map(|(i, pitch)| {
            let here = pitch.layers[layer].total;
            let a = p[i.saturating_sub(1)].layers[layer].total;
            let b = p[(i + 1).min(p.len() - 1)].layers[layer].total;
            here * (1. - evenness) + evenness * (a + here + b) / 3.
        })
        .collect();
    match p.iter().position(|p| p.midi >= midi) {
        None => *raw.last().unwrap(),
        Some(0) => raw[0],
        Some(j) => mix(
            raw[j - 1],
            raw[j],
            (midi - p[j - 1].midi) / (p[j].midi - p[j - 1].midi),
        ),
    }
}
fn low_at(table: &Table, layer: usize, midi: f64, f0: f64, level: f64) -> Option<f64> {
    let (mut sum, mut weight) = (0., 0.);
    for p in &table.pitches {
        let l = &p.layers[layer];
        let Some(c) = l.cells.iter().find(|c| c[0] == 0.) else {
            continue;
        };
        if !p.layers[layer].present || (p.midi - midi).abs() > 6. {
            continue;
        }
        let w = (-0.5 * ((p.midi - midi) / 1.5).powi(2)).exp();
        let density = c[2] - l.total - 10. * (0.5 * p.f0).log10();
        sum += w * 10f64.powf(density / 20.);
        weight += w;
    }
    if weight > 0. {
        Some(20. * (sum / weight).log10() + 10. * (0.5 * f0).log10() + level)
    } else {
        None
    }
}
fn bed_at(table: &Table, layer: usize, midi: f64) -> Rows {
    let entries: Vec<_> = table
        .pitches
        .iter()
        .filter(|p| p.layers[layer].bed.is_some())
        .collect();
    let first = entries.first()?.layers[layer].bed.as_ref()?;
    let windows = first.len();
    let bands = first[0].as_ref()?.len();
    Some(
        (0..windows)
            .map(|w| {
                Some(
                    (0..bands)
                        .map(|b| {
                            for sigma in [1.5, 3., 6., 12., 48.] {
                                let (mut sum, mut weight) = (0., 0.);
                                for e in &entries {
                                    let v =
                                        e.layers[layer].bed.as_ref()?.get(w)?.as_ref()?.get(b)?;
                                    let Some(v) = v else { continue };
                                    let k = (-0.5 * ((e.midi - midi) / sigma).powi(2)).exp();
                                    sum += k * 10f64.powf(*v / 10.);
                                    weight += k;
                                }
                                if weight > 0.3 {
                                    return Some(10. * (sum / weight).log10());
                                }
                            }
                            None
                        })
                        .collect(),
                )
            })
            .collect(),
    )
}
fn shape(table: &Table, layer: usize, midi: f64, f0: f64, count: usize) -> (Vec<f64>, Vec<f64>) {
    let mut tonal = vec![0.; count];
    let mut noise = vec![0.; count];
    let mut weight = vec![0.; count];
    for p in &table.pitches {
        if !p.layers[layer].present || (p.midi - midi).abs() > 6. {
            continue;
        }
        let l = &p.layers[layer];
        let pw = (-0.5 * ((p.midi - midi) / 1.5).powi(2)).exp();
        let cw = 10. * p.f0.log10();
        for c in &l.cells {
            if c[0] == 0. {
                continue;
            }
            let f = c[0] * p.f0;
            for k in 0..count {
                let d = (f / ((k + 1) as f64 * f0)).log2();
                let w = pw * (-0.5 * (d / 0.075).powi(2)).exp();
                if w < 1e-4 {
                    continue;
                }
                tonal[k] += w * 10f64.powf((c[1] - l.total) / 20.);
                noise[k] += w * 10f64.powf((c[2] - l.total - cw) / 20.);
                weight[k] += w;
            }
        }
    }
    for k in 0..count {
        if weight[k] > 1e-3 {
            tonal[k] = 20. * (tonal[k] / weight[k]).log10();
            noise[k] = 20. * (noise[k] / weight[k]).log10();
        } else {
            tonal[k] = if k > 0 { tonal[k - 1] - 3. } else { -40. };
            noise[k] = if k > 0 { noise[k - 1] } else { -80. };
        }
    }
    let (a, b, t) = table.around(midi);
    let la = &table.pitches[a].layers[layer];
    let lb = &table.pitches[b].layers[layer];
    for k in 0..if la.present && lb.present {
        count.min(8)
    } else {
        0
    } {
        let at = |l: &Layer| {
            l.cells
                .iter()
                .find(|c| c[0] == (k + 1) as f64)
                .map(|c| c[1] - l.total)
        };
        if let (Some(x), Some(y)) = (at(la), at(lb)) {
            let own = 1. / (1. + (k as f64 / 3.).powi(2));
            let bn = mix(x, y, t);
            tonal[k] = 10.
                * (own * 10f64.powf(bn / 10.) + (1. - own) * 10f64.powf(tonal[k] / 10.)).log10();
        }
    }
    for n in &mut noise {
        *n += 10. * f0.log10();
    }
    (tonal, noise)
}
fn pick(layers: &[Layer; 3], wanted: usize, lo: usize) -> &Layer {
    if layers[wanted].present {
        return &layers[wanted];
    }
    let mut best = layers.iter().find(|l| l.present).unwrap();
    if layers[lo].present {
        for l in layers.iter().filter(|l| l.present) {
            if (l.total - layers[lo].total).abs() < (best.total - layers[lo].total).abs() {
                best = l;
            }
        }
    }
    best
}
impl Model {
    pub fn new(
        table: &Table,
        midi: f64,
        velocity: f64,
        f0: f64,
        evenness: f64,
        count: usize,
        noise_share: f64,
    ) -> Self {
        let (lo, hi, t) = Table::pair(velocity);
        let count = count.min((12000. / f0).floor() as usize);
        let make = |layer| {
            let level = level_at(table, layer, midi, evenness);
            let (tonal, noise) = shape(table, layer, midi, f0, count);
            (
                tonal.into_iter().map(|v| v + level).collect::<Vec<_>>(),
                noise.into_iter().map(|v| v + level).collect::<Vec<_>>(),
                level,
                low_at(table, layer, midi, f0, level),
            )
        };
        let a = make(lo);
        let b = make(hi);
        let mut tonal: Vec<f64> = a.0.iter().zip(&b.0).map(|(a, b)| mix(*a, *b, t)).collect();
        let mut noise: Vec<f64> = a.1.iter().zip(&b.1).map(|(a, b)| mix(*a, *b, t)).collect();
        for k in 0..count {
            let total = 10f64.powf(tonal[k] / 10.) + 10f64.powf(noise[k] / 10.);
            let cap = total * noise_share;
            if 10f64.powf(noise[k] / 10.) > cap {
                noise[k] = 10. * cap.log10();
                tonal[k] = 10. * (total - cap).log10();
            }
        }
        let (pa, pb, pt) = table.around(midi);
        let pl = &table.pitches[pa].layers;
        let ph = &table.pitches[pb].layers;

        let plo = pick(pl, lo, lo);
        let phi = pick(pl, hi, lo);
        let pho = pick(ph, lo, lo);
        let phh = pick(ph, hi, lo);
        let rows = |f: fn(&Layer) -> &Rows| {
            mix_rows(
                &mix_rows(f(plo), f(pho), pt),
                &mix_rows(f(phi), f(phh), pt),
                t,
            )
        };
        let vibrato = match (&plo.vibrato, &pho.vibrato) {
            (Some(a), Some(b)) => Some(Vibrato {
                rate: mix(a.rate, b.rate, pt),
                depths: a
                    .depths
                    .iter()
                    .zip(&b.depths)
                    .map(|(a, b)| mix(*a, *b, pt))
                    .collect(),
            }),
            _ => None,
        };
        Self {
            midi,
            velocity,
            f0,
            level: mix(a.2, b.2, t),
            low: mix_value(a.3, b.3, t),
            onset: mix(plo.onset, pho.onset, pt),
            tonal,
            noise,
            vibrato,
            env: rows(|l| &l.env),
            release: rows(|l| &l.release),
            bed: mix_rows(&bed_at(table, lo, midi), &bed_at(table, hi, midi), t),
        }
    }
    pub fn encode(&self) -> Vec<f64> {
        let mut a = vec![
            self.midi,
            self.velocity,
            self.f0,
            self.level,
            self.low.unwrap_or(f64::NAN),
            self.onset,
        ];
        write_list(&mut a, &self.tonal);
        write_list(&mut a, &self.noise);
        if let Some(v) = &self.vibrato {
            a.push(1.);
            a.push(v.rate);
            write_list(&mut a, &v.depths);
        } else {
            a.push(0.);
        }
        write_rows(&mut a, &self.env);
        write_rows(&mut a, &self.release);
        write_rows(&mut a, &self.bed);
        a
    }
}
