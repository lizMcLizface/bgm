// Additive tables are built once during preparation, then read without mutation.
// The original harmonic/normalization order is retained exactly.
use std::sync::OnceLock;
static ADDITIVE: OnceLock<Box<[f32]>> = OnceLock::new();
fn init_additive() {
    ADDITIVE.get_or_init(|| {
        let mut table = vec![0.; 6 * 16 * (LUT + 1)].into_boxed_slice();
        let mut amps = [[0.; 16]; 6];
        amps[0][..8].copy_from_slice(&[1., 0.8, 0.6, 0.5, 0., 0.3, 0., 0.25]);
        amps[1][..11].copy_from_slice(&[1., 0., 0.5, 0., 0.3, 0., 0.18, 0., 0.1, 0., 0.05]);
        amps[2][..12].copy_from_slice(&[1., 0.7, 0.9, 0.5, 0.3, 0.25, 0.15, 0.2, 0.18, 0.1, 0.06, 0.04]);
        amps[3][0] = 1.; amps[3][3] = 0.35; amps[3][8] = 0.2; amps[3][12] = 0.1;
        for h in 0..16 { amps[4][h] = (if h % 2 == 1 { 0.7 } else { 1. }) / ((h + 1) as f32).powf(1.3); }
        for h in 0..16 { if h % 2 == 0 { amps[5][h] = (if h % 4 == 0 { 1. } else { -1. }) / ((h + 1) * (h + 1)) as f32; } }
        for k in 0..6 {
            let mut peak: f32 = 0.;
            for i in 0..=LUT {
                let t = i as f32 / LUT as f32;
                let mut value = 0.;
                for h in 0..16 {
                    value += amps[k][h] * (2. * PI * t * (h + 1) as f32).sin();
                    table[(k * 16 + h) * (LUT + 1) + i] = value;
                }
                peak = peak.max(value.abs());
            }
            for h in 0..16 { for i in 0..=LUT { table[(k * 16 + h) * (LUT + 1) + i] /= peak.max(1e-6); } }
        }
        table
    });
}
#[cfg_attr(feature = "profile-sections", inline(never))]
fn additive_wave(kind: usize, t: f32, dt: f32) -> f32 {
    let limit = (0.45 / dt.max(0.000001)).clamp(1., 17.) - 1.;
    let limit = if limit >= 16. { 16. } else { limit };
    let low = limit.floor() as usize;
    let blend = limit - low as f32;
    let x = t * LUT as f32;
    let i = x as usize;
    let f = x - i as f32;
    let tables = ADDITIVE.get().expect("prepare additive tables before rendering");
    let lookup = |n: usize| {
        let at = (kind * 16 + n.min(15)) * (LUT + 1);
        tables[at + i] + (tables[at + i + 1] - tables[at + i]) * f
    };
    if low >= 16 { return lookup(15); }
    let a = if low == 0 { 0. } else { lookup(low - 1) };
    a + (lookup(low) - a) * blend
}
