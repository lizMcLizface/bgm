//! Pure Iowa measurement/model/FFT preparation. All state and output are owned;
//! this API allocates deliberately outside realtime rendering.
use std::f64::consts::PI;
const SIZE: usize = 2048;
const ENVELOPE_MS: [f64; 17] = [
    0., 5., 10., 15., 20., 30., 40., 60., 80., 100., 130., 160., 200., 250., 300., 400., 500.,
];
const RELEASE_MS: [f64; 9] = [0., 20., 40., 80., 120., 200., 300., 500., 800.];
const SLICE_MS: [f64; 6] = [10., 25., 50., 90., 160., 280.];
const MAX_NUMBERS: usize = 2_097_152;
#[derive(Clone, Default)]
struct Take {
    midi: f64,
    l: f64,
    level: f64,
    seconds: f64,
    fields: u32,
    h: Vec<f64>,
    s: Vec<Vec<f64>>,
    e: Vec<f64>,
    r: Vec<f64>,
    n: Vec<f64>,
    b: Vec<f64>,
    v: Vec<f64>,
    p: Vec<[f64; 5]>,
}
pub struct Table {
    layers: [Vec<Take>; 3],
    decay: bool,
    even: bool,
    soften: [f64; 2],
    settled: bool,
    sealed: bool,
    numbers: usize,
}
pub struct Prepared {
    fields: [Vec<f64>; 9],
    meta: [f64; 10],
}
fn finite(a: &[f64]) -> bool {
    a.iter().all(|v| v.is_finite())
}
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}
fn lerp_list(a: &[f64], b: &[f64], t: f64) -> Vec<f64> {
    a.iter()
        .enumerate()
        .map(|(i, v)| lerp(*v, *b.get(i).unwrap_or(v), t))
        .collect()
}
fn median(mut a: Vec<f64>) -> f64 {
    a.sort_by(|a, b| a.total_cmp(b));
    a[a.len() / 2]
}
fn medians(notes: &[Take], len: usize, field: impl Fn(&Take) -> &[f64]) -> Vec<f64> {
    (0..len)
        .map(|k| {
            median(
                notes
                    .iter()
                    .filter_map(|n| field(n).get(k).copied())
                    .collect(),
            )
        })
        .collect()
}
fn pitch(midi: f64) -> f64 {
    440. * 2f64.powf((midi - 69.) / 12.)
}
impl Table {
    fn valid(&self) -> bool {
        self.layers.iter().any(|a| !a.is_empty())
            && self.layers.iter().all(|notes| {
                notes.windows(2).all(|w| w[1].midi > w[0].midi)
                    && notes.iter().all(|n| {
                        if self.decay {
                            n.fields == ((1 << 5) | (1 << 7)) && n.b.len() == 22 && !n.p.is_empty()
                        } else {
                            n.fields == 127
                                && !n.h.is_empty()
                                && n.s.len() == 6
                                && n.s.iter().all(|r| !r.is_empty())
                                && n.e.len() == 17
                                && n.r.len() == 9
                                && n.n.len() == 22
                                && n.b.len() == 22
                                && n.v.len() == 5
                        }
                    })
            })
    }
    fn settle(&mut self) {
        if self.settled {
            return;
        }
        for notes in &mut self.layers {
            if notes.is_empty() {
                continue;
            }
            let raw: Vec<f64> = notes.iter().map(|n| n.l).collect();
            let kept: Vec<Take> = notes
                .iter()
                .enumerate()
                .filter(|(i, n)| {
                    n.l >= median(raw[i.saturating_sub(3)..(i + 4).min(raw.len())].to_vec()) - 12.
                        && n.v.get(3).is_none_or(|v| *v <= 20.)
                })
                .map(|(_, n)| n.clone())
                .collect();
            if !kept.is_empty() {
                *notes = kept;
            }
            if self.even {
                let source = notes.clone();
                for (i, n) in notes.iter_mut().enumerate() {
                    let near = &source[i.saturating_sub(3)..(i + 4).min(source.len())];
                    let close = &source[i.saturating_sub(2)..(i + 3).min(source.len())];
                    n.e = medians(near, n.e.len(), |n| &n.e);
                    n.r = medians(near, n.r.len(), |n| &n.r);
                    n.n = medians(near, n.n.len(), |n| &n.n);
                    n.b = medians(near, n.b.len(), |n| &n.b);
                    n.v = medians(near, n.v.len(), |n| &n.v);
                    n.h = medians(close, n.h.len(), |n| &n.h);
                    for r in 0..n.s.len() {
                        let row = &n.s[r];
                        n.s[r] = (0..row.len())
                            .map(|k| {
                                median(
                                    near.iter()
                                        .filter_map(|a| a.s.get(r).unwrap_or(row).get(k).copied())
                                        .collect(),
                                )
                            })
                            .collect();
                    }
                    for k in (0..n.e.len() - 1).rev() {
                        n.e[k] =
                            n.e[k].max(n.e[k + 1] - 0.7 * (ENVELOPE_MS[k + 1] - ENVELOPE_MS[k]));
                    }
                }
            }
            if self.soften[0] > 0. {
                let cut = |hz: f64| 0f64.max((hz / self.soften[0]).log2()) * self.soften[1];
                for n in notes.iter_mut() {
                    let f0 = pitch(n.midi);
                    for (k, h) in n.h.iter_mut().enumerate() {
                        *h -= cut((k + 1) as f64 * f0);
                    }
                    for a in [&mut n.n, &mut n.b] {
                        for (k, v) in a.iter_mut().enumerate() {
                            if *v > -90. {
                                *v -= cut(125. * 2f64.powf(k as f64 / 3.));
                            }
                        }
                    }
                }
            }
            let levels: Vec<f64> = notes.iter().map(|n| n.l).collect();
            let whole = median(levels.clone());
            let mean_m = notes.iter().map(|n| n.midi).sum::<f64>() / notes.len() as f64;
            let mean_l = levels.iter().sum::<f64>() / notes.len() as f64;
            let denominator = notes.iter().map(|n| (n.midi - mean_m).powi(2)).sum::<f64>();
            let slope = notes
                .iter()
                .map(|n| (n.midi - mean_m) * (n.l - mean_l))
                .sum::<f64>()
                / if denominator == 0. { 1. } else { denominator };
            for (i, n) in notes.iter_mut().enumerate() {
                let near = median(levels[i.saturating_sub(3)..(i + 4).min(levels.len())].to_vec());
                n.level = whole
                    + ((if self.even {
                        mean_l + slope * (n.midi - mean_m)
                    } else {
                        n.l.clamp(near - 3., near + 3.)
                    }) - whole)
                        * 0.5;
            }
        }
        self.settled = true;
    }
}
#[derive(Clone, Copy)]
struct Spot<'a> {
    a: &'a Take,
    b: &'a Take,
    t: f64,
}
fn around(notes: &[Take], midi: f64) -> Option<Spot<'_>> {
    if notes.is_empty() || midi < notes[0].midi - 4. || midi > notes.last()?.midi + 4. {
        return None;
    }
    let upper = notes.iter().position(|n| n.midi >= midi);
    match upper {
        None => Some(Spot {
            a: notes.last()?,
            b: notes.last()?,
            t: 0.,
        }),
        Some(0) => Some(Spot {
            a: &notes[0],
            b: &notes[0],
            t: 0.,
        }),
        Some(i) => {
            let (a, b) = (&notes[i - 1], &notes[i]);
            Some(Spot {
                a,
                b,
                t: if b.midi == a.midi {
                    0.
                } else {
                    (midi - a.midi) / (b.midi - a.midi)
                },
            })
        }
    }
}
fn pair(table: &Table, midi: f64, velocity: f64) -> Option<(Spot<'_>, Spot<'_>, f64)> {
    let at = [30., 80., 118.];
    let usable: Vec<(f64, Spot<'_>)> = table
        .layers
        .iter()
        .enumerate()
        .filter_map(|(i, n)| around(n, midi).map(|s| (at[i], s)))
        .collect();
    let first = *usable.first()?;
    let last = *usable.last()?;
    if velocity <= first.0 {
        return Some((first.1, first.1, 0.));
    }
    if velocity >= last.0 {
        return Some((last.1, last.1, 0.));
    }
    let i = usable.iter().position(|n| n.0 >= velocity)?;
    let (lo, hi) = (usable[i - 1], usable[i]);
    Some((lo.1, hi.1, (velocity - lo.0) / (hi.0 - lo.0)))
}
struct HeldModel {
    f0: f64,
    level: f64,
    h: Vec<f64>,
    s: Vec<Vec<f64>>,
    e: Vec<f64>,
    r: Vec<f64>,
    n: Vec<f64>,
    b: Vec<f64>,
    moves: Vec<f64>,
}
fn held_spot(s: Spot<'_>, count: usize) -> HeldModel {
    let pad = |a: &[f64]| {
        let mut v = a.to_vec();
        while v.len() < count {
            v.push((-60f64).min(v.last().copied().unwrap_or(-60.) - 3.));
        }
        v
    };
    HeldModel {
        f0: 0.,
        level: lerp(s.a.level, s.b.level, s.t),
        h: lerp_list(&pad(&s.a.h), &pad(&s.b.h), s.t),
        s: s.a
            .s
            .iter()
            .enumerate()
            .map(|(i, row)| lerp_list(row, s.b.s.get(i).unwrap_or(row), s.t))
            .collect(),
        e: lerp_list(&s.a.e, &s.b.e, s.t),
        r: lerp_list(&s.a.r, &s.b.r, s.t),
        n: lerp_list(&s.a.n, &s.b.n, s.t),
        b: lerp_list(&s.a.b, &s.b.b, s.t),
        moves: lerp_list(&s.a.v, &s.b.v, s.t),
    }
}
fn held_model(table: &Table, midi: f64, velocity: f64) -> Option<HeldModel> {
    let (lo, hi, t) = pair(table, midi, velocity)?;
    let count = [lo.a, lo.b, hi.a, hi.b].iter().map(|n| n.h.len()).max()?;
    let (a, b) = (held_spot(lo, count), held_spot(hi, count));
    let mut moves = lerp_list(&a.moves, &b.moves, t);
    moves[3] = moves[3].min(6.);
    moves[4] = moves[4].min(2.);
    Some(HeldModel {
        f0: pitch(midi),
        level: lerp(a.level, b.level, t),
        h: lerp_list(&a.h, &b.h, t),
        s: a.s
            .iter()
            .enumerate()
            .map(|(i, row)| lerp_list(row, &b.s[i], t))
            .collect(),
        e: lerp_list(&a.e, &b.e, t),
        r: lerp_list(&a.r, &b.r, t),
        n: lerp_list(&a.n, &b.n, t),
        b: lerp_list(&a.b, &b.b, t),
        moves,
    })
}
fn fft(re: &mut [f64], im: &mut [f64]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2. * PI / len as f64;
        let (wr, wi) = (ang.cos(), ang.sin());
        for i in (0..n).step_by(len) {
            let (mut cr, mut ci) = (1., 0.);
            for k in 0..len / 2 {
                let (a, b) = (i + k, i + k + len / 2);
                let tr = re[b] * cr - im[b] * ci;
                let ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                let nr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = nr;
            }
        }
        len <<= 1;
    }
}
fn ifft(re: &mut [f64], im: &mut [f64]) {
    for x in im.iter_mut() {
        *x = -*x;
    }
    fft(re, im);
    let n = re.len() as f64;
    for x in re {
        *x /= n;
    }
}
fn random(seed: &mut u32) -> f64 {
    *seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
    *seed as f64 / 4294967296.
}
fn seed(value: f64) -> u32 {
    let s = value as u64 as u32;
    if s == 0 {
        1
    } else {
        s
    }
}
fn cycle(levels: &[f64], top: usize, phases: &[f64]) -> Vec<f64> {
    let (mut re, mut im) = (vec![0.; SIZE], vec![0.; SIZE]);
    let mut power = 0.;
    for k in 1..=top {
        let amp = (2. * 10f64.powf(levels[k - 1] / 10.)).sqrt();
        let half = amp * SIZE as f64 / 2.;
        re[k] = half * phases[k].cos();
        im[k] = half * phases[k].sin();
        re[SIZE - k] = re[k];
        im[SIZE - k] = -im[k];
        power += amp * amp / 2.;
    }
    ifft(&mut re, &mut im);
    let scale = 1. / (if power == 0. { 1. } else { power }).sqrt();
    re.iter().map(|v| (*v * scale) as f32 as f64).collect()
}
fn shaped_noise(bands: &[f64], rate: f64, size: usize, initial_seed: f64) -> Vec<f64> {
    let (mut re, mut im) = (vec![0.; size], vec![0.; size]);
    let hz = rate / size as f64;
    let mut rng = seed(initial_seed);
    let mut any = false;
    for (b, db) in bands.iter().enumerate() {
        if *db <= -90. {
            continue;
        }
        any = true;
        let centre = 125. * 2f64.powf(b as f64 / 3.);
        let first = (centre * 2f64.powf(-1. / 6.) / hz).ceil().max(1.) as usize;
        let last = ((size / 2 - 1) as f64).min((centre * 2f64.powf(1. / 6.) / hz).floor()) as usize;
        if last < first {
            continue;
        }
        let per_bin =
            (2. * 10f64.powf(*db / 10.) / (last - first + 1) as f64).sqrt() * size as f64 / 2.;
        for k in first..=last {
            let a = 2. * PI * random(&mut rng);
            re[k] = per_bin * a.cos();
            im[k] = per_bin * a.sin();
            re[size - k] = re[k];
            im[size - k] = -im[k];
        }
    }
    if !any {
        return Vec::new();
    }
    ifft(&mut re, &mut im);
    re.iter().map(|v| *v as f32 as f64).collect()
}
fn prepare_held(m: HeldModel, rate: f64, vibrato: f64, initial_seed: f64) -> Prepared {
    let top =
        m.h.len()
            .min(
                (0.45 * rate / (m.f0 * 2f64.powf((m.moves[1] * vibrato + 8.) / 1200.))).floor()
                    as usize,
            )
            .min(SIZE / 2 - 1);
    let mut rng = seed(initial_seed * 7919. + 13.);
    let phases: Vec<f64> = (0..=top).map(|_| 2. * PI * random(&mut rng)).collect();
    let mut fields: [Vec<f64>; 9] = std::array::from_fn(|_| Vec::new());
    for row in &m.s {
        let levels: Vec<f64> =
            m.h.iter()
                .enumerate()
                .map(|(k, l)| l + row.get(k.min(15)).copied().unwrap_or(0.))
                .collect();
        fields[1].extend(cycle(&levels, top, &phases));
    }
    fields[1].extend(cycle(&m.h, top, &phases));
    fields[0] = SLICE_MS.iter().map(|t| t / 1000.).chain([0.4]).collect();
    fields[2] = ENVELOPE_MS.iter().map(|t| t / 1000.).chain([1.]).collect();
    fields[3] = m.e;
    fields[3].push(0.);
    let released: Vec<f64> = m.r.iter().map(|v| v - m.r[0]).collect();
    let mut end = released.len();
    while end > 2 && released[end - 1] == released[end - 2] {
        end -= 1;
    }
    fields[4] = RELEASE_MS[..end].iter().map(|v| v / 1000.).collect();
    fields[5] = released[..end].to_vec();
    fields[4].push(fields[4].last().unwrap() + 0.06);
    fields[5].push(-80.);
    fields[6] = shaped_noise(&m.n, rate, 1 << 15, initial_seed + 1.);
    let extra: Vec<f64> =
        m.b.iter()
            .enumerate()
            .map(|(i, b)| if *b > m.n[i] + 3. { *b } else { -99. })
            .collect();
    fields[7] = shaped_noise(&extra, rate, 1 << 13, initial_seed + 2.);
    Prepared {
        fields,
        meta: [
            0.,
            m.f0,
            0.,
            m.moves[0],
            m.moves[1] * vibrato,
            m.moves[2] * vibrato.min(1.),
            m.moves[3],
            m.moves[4],
            m.level,
            0.,
        ],
    }
}
#[derive(Clone)]
struct Partial {
    f: f64,
    level: f64,
    rise: f64,
    early: f64,
    late: f64,
}
fn partials(note: &Take, f0: f64) -> Vec<Partial> {
    let level = note.level - note.l;
    note.p
        .iter()
        .map(|p| Partial {
            f: p[0] * f0,
            level: p[1] + level,
            rise: p[2] / 1000.,
            early: p[3],
            late: p[4],
        })
        .collect()
}
fn blend(low: &[Partial], high: &[Partial], t: f64) -> Vec<Partial> {
    if t == 0. {
        return low.to_vec();
    }
    let mut taken = vec![false; high.len()];
    let mut out = Vec::new();
    let weighted = |p: &Partial, w: f64| {
        let mut p = p.clone();
        p.level += 20. * w.max(1e-4).log10();
        p
    };
    for a in low {
        let mut twin: Option<usize> = None;
        for (i, b) in high.iter().enumerate() {
            if !taken[i]
                && (b.f / a.f - 1.).abs() < 0.03
                && twin.is_none_or(|j| (b.f - a.f).abs() < (high[j].f - a.f).abs())
            {
                twin = Some(i);
            }
        }
        if let Some(i) = twin {
            taken[i] = true;
            let b = &high[i];
            out.push(Partial {
                f: lerp(a.f, b.f, t),
                level: lerp(a.level, b.level, t),
                rise: lerp(a.rise, b.rise, t),
                early: lerp(a.early, b.early, t),
                late: lerp(a.late, b.late, t),
            });
        } else {
            out.push(weighted(a, 1. - t));
        }
    }
    for (i, b) in high.iter().enumerate() {
        if !taken[i] {
            out.push(weighted(b, t));
        }
    }
    out.sort_by(|a, b| a.f.total_cmp(&b.f));
    out
}
fn prepare_decay(
    table: &Table,
    midi: f64,
    velocity: f64,
    rate: f64,
    initial_seed: f64,
) -> Option<Prepared> {
    let (lo, hi, t) = pair(table, midi, velocity)?;
    let a = if lo.t < 0.5 { lo.a } else { lo.b };
    let b = if hi.t < 0.5 { hi.a } else { hi.b };
    let f0 = pitch(midi);
    let parts = blend(&partials(a, f0), &partials(b, f0), t);
    let burst_of = |n: &Take| {
        n.b.iter()
            .map(|b| if *b <= -90. { -99. } else { b + n.level - n.l })
            .collect::<Vec<f64>>()
    };
    let (one, other) = (burst_of(a), burst_of(b));
    let burst: Vec<f64> = one
        .iter()
        .enumerate()
        .map(|(i, b)| {
            let db = 10.
                * ((1. - t) * 10f64.powf(*b / 10.) + t * 10f64.powf(other[i] / 10.) + 1e-12)
                    .log10();
            if db < -90. {
                -99.
            } else {
                db
            }
        })
        .collect();
    let mut fields: [Vec<f64>; 9] = std::array::from_fn(|_| Vec::new());
    fields[7] = shaped_noise(&burst, rate, 1 << 12, initial_seed);
    let mut rng = seed(initial_seed * 104729. + 7.);
    for p in parts.iter().filter(|p| p.f < rate * 0.47) {
        fields[8].extend([
            p.f,
            10f64.powf(p.level / 20.),
            2. * PI * random(&mut rng),
            p.rise.min(0.004),
            p.early,
            p.late,
        ]);
    }
    Some(Prepared {
        fields,
        meta: [
            1.,
            f0,
            lerp(a.seconds, b.seconds, t).clamp(0.3, 8.),
            0.,
            0.,
            0.,
            0.,
            0.,
            0.,
            0.,
        ],
    })
}

#[no_mangle]
pub extern "C" fn iowa_prep_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn iowa_prep_table_new(
    decay: u32,
    even: u32,
    soften_from: f64,
    soften_per_octave: f64,
    settled: u32,
) -> *mut Table {
    if decay > 1
        || even > 1
        || settled > 1
        || decay == 1 && (even == 1 || soften_from > 0.)
        || !finite(&[soften_from, soften_per_octave])
        || !(0. ..=20000.).contains(&soften_from)
        || !(0. ..=60.).contains(&soften_per_octave)
    {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(Table {
        layers: std::array::from_fn(|_| Vec::new()),
        decay: decay == 1,
        even: even == 1,
        soften: [soften_from, soften_per_octave],
        settled: settled == 1,
        sealed: false,
        numbers: 0,
    }))
}
#[no_mangle]
pub unsafe extern "C" fn iowa_prep_table_free(t: *mut Table) {
    if !t.is_null() {
        drop(Box::from_raw(t));
    }
}
#[no_mangle]
pub extern "C" fn iowa_prep_take(
    t: &mut Table,
    layer: u32,
    midi: f64,
    level: f64,
    seconds: f64,
    settled_level: f64,
) -> u32 {
    if t.sealed
        || layer > 2
        || t.layers.get(layer as usize).is_some_and(|l| l.len() >= 128)
        || t.layers.iter().map(Vec::len).sum::<usize>() >= 384
        || !finite(&[midi, level, seconds, settled_level])
        || !(0. ..=127.).contains(&midi)
        || level.abs() > 300.
        || settled_level.abs() > 300.
        || !(0. ..=120.).contains(&seconds)
    {
        return 0;
    }
    let index = t.layers[layer as usize].len();
    t.layers[layer as usize].push(Take {
        midi,
        l: level,
        seconds,
        level: settled_level,
        ..Take::default()
    });
    1 + layer * 128 + index as u32
}
#[no_mangle]
pub extern "C" fn iowa_prep_buffer_new(len: usize) -> *mut Vec<f64> {
    if len > 262144 {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(vec![0.; len]))
}
#[no_mangle]
pub extern "C" fn iowa_prep_buffer_ptr(b: &mut Vec<f64>) -> *mut f64 {
    b.as_mut_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn iowa_prep_buffer_free(b: *mut Vec<f64>) {
    if !b.is_null() {
        drop(Box::from_raw(b));
    }
}
#[no_mangle]
pub extern "C" fn iowa_prep_data(t: &mut Table, take: u32, field: u32, data: &Vec<f64>) -> u32 {
    if t.sealed
        || take == 0
        || field > 7
        || t.numbers + data.len() > MAX_NUMBERS
        || !finite(data)
        || data.iter().any(|v| v.abs() > 100000.)
    {
        return 1;
    }
    let n = take - 1;
    let Some(note) = t
        .layers
        .get_mut((n / 128) as usize)
        .and_then(|a| a.get_mut((n % 128) as usize))
    else {
        return 1;
    };
    if note.fields & (1 << field) != 0 {
        return 1;
    }
    match field {
        0 if data.len() <= 128 => note.h = data.clone(),
        1 if data.len() % 6 == 0 && data.len() <= 96 => {
            note.s = data
                .chunks(data.len().checked_div(6).unwrap_or(0).max(1))
                .map(|r| r.to_vec())
                .collect()
        }
        2 if data.len() == 17 => note.e = data.clone(),
        3 if data.len() == 9 => note.r = data.clone(),
        4 if data.len() == 22 => note.n = data.clone(),
        5 if data.len() == 22 => note.b = data.clone(),
        6 if data.len() == 5 => note.v = data.clone(),
        7 if data.len() % 5 == 0 && data.len() <= 640 => {
            note.p = data
                .chunks_exact(5)
                .map(|p| [p[0], p[1], p[2], p[3], p[4]])
                .collect()
        }
        _ => return 1,
    };
    note.fields |= 1 << field;
    t.numbers += data.len();
    0
}
#[no_mangle]
pub extern "C" fn iowa_prep_settle(t: &mut Table) -> u32 {
    if !t.valid() {
        return 1;
    }
    t.settle();
    t.sealed = true;
    0
}
#[no_mangle]
pub extern "C" fn iowa_prep_note(
    t: &Table,
    midi: f64,
    velocity: f64,
    rate: f64,
    vibrato: f64,
    initial_seed: f64,
) -> *mut Prepared {
    if !t.sealed
        || !t.settled
        || !t.valid()
        || !finite(&[midi, velocity, rate, vibrato, initial_seed])
        || !(0. ..=127.).contains(&midi)
        || !(1. ..=127.).contains(&velocity)
        || !(8000. ..=192000.).contains(&rate)
        || !(0. ..=4.).contains(&vibrato)
        || !(0. ..=4294967295.).contains(&initial_seed)
    {
        return std::ptr::null_mut();
    }
    let p = if t.decay {
        prepare_decay(t, midi, velocity, rate, initial_seed)
    } else {
        held_model(t, midi, velocity).map(|m| prepare_held(m, rate, vibrato, initial_seed))
    };
    p.filter(|p| {
        finite(&p.meta)
            && p.fields.iter().all(|a| finite(a))
            && if p.meta[0] == 0. {
                (1. ..=20000.).contains(&p.meta[1])
                    && (0. ..=30.).contains(&p.meta[3])
                    && (0. ..=2400.).contains(&p.meta[4])
                    && (0. ..=60.).contains(&p.meta[5])
                    && (0. ..=100.).contains(&p.meta[6])
                    && (0. ..=60.).contains(&p.meta[7])
                    && p.fields[1]
                        .iter()
                        .chain(&p.fields[6])
                        .chain(&p.fields[7])
                        .all(|v| v.abs() <= 64.)
                    && p.fields[3]
                        .iter()
                        .chain(&p.fields[5])
                        .all(|v| v.abs() <= 240.)
            } else {
                p.fields[7].iter().all(|v| v.abs() <= 64.)
                    && p.fields[8].chunks_exact(6).all(|v| {
                        (0. ..=rate * 0.47).contains(&v[0])
                            && (0. ..=64.).contains(&v[1])
                            && (0. ..=0.004).contains(&v[3])
                            && (-100000. ..=0.).contains(&v[4])
                            && (-100000. ..=0.).contains(&v[5])
                    })
                    && p.fields[8].len() / 6 <= 128
            }
    })
    .map(|p| Box::into_raw(Box::new(p)))
    .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn iowa_prep_note_free(p: *mut Prepared) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn iowa_prep_note_meta(p: &Prepared, field: usize) -> f64 {
    p.meta.get(field).copied().unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn iowa_prep_note_len(p: &Prepared, field: usize) -> usize {
    p.fields.get(field).map_or(0, Vec::len)
}
#[no_mangle]
pub extern "C" fn iowa_prep_note_ptr(p: &Prepared, field: usize) -> *const f64 {
    p.fields.get(field).map_or(std::ptr::null(), |v| v.as_ptr())
}
