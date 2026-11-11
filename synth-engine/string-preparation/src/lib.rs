//! Measured-string interpolation and immutable preparation, off the callback.
pub mod fft;
pub mod fit;
pub mod model;
pub mod realtime;
mod realtime_abi;
pub mod table;
pub mod tuning;
use model::Model;
use table::Table;
pub struct Resource {
    input: Vec<f64>,
    table: Option<Table>,
    fits: [Option<fit::Fit>; 3],
}
pub struct Prepared {
    origin: usize,
    pub model: Option<Model>,
    data: Vec<f64>,
}
#[no_mangle]
pub extern "C" fn string_preparation_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn string_table_new(count: u32) -> *mut Resource {
    if count < 16 || count > 524288 {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(Resource {
        input: vec![0.; count as usize],
        table: None,
        fits: [None, None, None],
    }))
}
#[no_mangle]
pub unsafe extern "C" fn string_table_input(p: *mut Resource) -> *mut f64 {
    p.as_mut().map_or(std::ptr::null_mut(), |p| {
        if p.table.is_some() {
            std::ptr::null_mut()
        } else {
            p.input.as_mut_ptr()
        }
    })
}
#[no_mangle]
pub unsafe extern "C" fn string_table_seal(p: *mut Resource) -> u32 {
    let Some(p) = p.as_mut() else { return 0 };
    if p.table.is_some() {
        return 0;
    }
    let Some(table) = Table::parse(&p.input) else {
        return 0;
    };
    p.table = Some(table);
    p.input = Vec::new();
    1
}
#[no_mangle]
pub unsafe extern "C" fn string_table_free(p: *mut Resource) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub unsafe extern "C" fn string_model_new(
    p: *const Resource,
    midi: f64,
    velocity: f64,
    f0: f64,
    evenness: f64,
    count: u32,
    noise_share: f64,
) -> *mut Prepared {
    let Some(table) = p.as_ref().and_then(|p| p.table.as_ref()) else {
        return std::ptr::null_mut();
    };
    if !midi.is_finite()
        || !(0. ..=127.).contains(&midi)
        || !velocity.is_finite()
        || !(1. ..=127.).contains(&velocity)
        || !f0.is_finite()
        || !(10. ..=12000.).contains(&f0)
        || !evenness.is_finite()
        || !(0. ..=1.).contains(&evenness)
        || count == 0
        || count > 200
        || !noise_share.is_finite()
        || !(0. ..=1.).contains(&noise_share)
    {
        return std::ptr::null_mut();
    }
    let model = Model::new(
        table,
        midi,
        velocity,
        f0,
        evenness,
        count as usize,
        noise_share,
    );
    let data = model.encode();
    Box::into_raw(Box::new(Prepared {
        origin: p as usize,
        model: Some(model),
        data,
    }))
}
#[no_mangle]
pub unsafe extern "C" fn string_fit_new(
    p: *const Resource,
    layer: u32,
    variant: u32,
) -> *mut Prepared {
    let Some(table) = p.as_ref().and_then(|p| p.table.as_ref()) else {
        return std::ptr::null_mut();
    };
    if layer > 2 || variant > 2 {
        return std::ptr::null_mut();
    }
    let f = fit::Fit::new(table, layer as usize, variant);
    Box::into_raw(Box::new(Prepared {
        origin: p as usize,
        model: None,
        data: f.encode(),
    }))
}
#[no_mangle]
pub unsafe extern "C" fn string_tuned_new(
    p: *mut Resource,
    midi: f64,
    velocity: f64,
    vibrato: f64,
    noise: f64,
    tilt: f64,
    evenness: f64,
    noise_share: f64,
    parts: u32,
) -> *mut Prepared {
    let Some(p) = p.as_mut() else {
        return std::ptr::null_mut();
    };
    let Some(table) = &p.table else {
        return std::ptr::null_mut();
    };
    if ![midi, velocity, vibrato, noise, tilt, evenness, noise_share]
        .iter()
        .all(|v| v.is_finite())
        || !(24. ..=96.).contains(&midi)
        || !(1. ..=127.).contains(&velocity)
        || !(0. ..=4.).contains(&vibrato)
        || !(-120. ..=30.).contains(&noise)
        || !(-36. ..=36.).contains(&tilt)
        || !(0. ..=1.).contains(&evenness)
        || !(0. ..=1.).contains(&noise_share)
        || parts > 2
    {
        return std::ptr::null_mut();
    }
    let f0 = 440. * 2f64.powf((midi - 69.) / 12.);
    let mut model = Model::new(table, midi, velocity, f0, evenness, 200, noise_share);
    let shape = if parts > 0 {
        let (lo, hi, t) = Table::pair(velocity);
        for l in [lo, hi] {
            if p.fits[l].is_none() {
                p.fits[l] = Some(fit::Fit::new(table, l, 0));
            }
        }
        Some(fit::smooth_shape(
            p.fits[lo].as_ref().unwrap(),
            p.fits[hi].as_ref().unwrap(),
            t,
            midi,
            f0,
            model.tonal.len(),
        ))
    } else {
        None
    };
    model.tune(
        tuning::Tuning {
            vibrato,
            noise,
            tilt,
            evenness,
            noise_share,
            parts,
        },
        shape,
    );
    let data = model.encode();
    Box::into_raw(Box::new(Prepared {
        origin: p as *const Resource as usize,
        model: Some(model),
        data,
    }))
}
#[no_mangle]
pub unsafe extern "C" fn string_prepared_data(p: *const Prepared) -> *const f64 {
    p.as_ref().map_or(std::ptr::null(), |p| p.data.as_ptr())
}
#[no_mangle]
pub unsafe extern "C" fn string_prepared_len(p: *const Prepared) -> u32 {
    p.as_ref().map_or(0, |p| p.data.len() as u32)
}
#[no_mangle]
pub unsafe extern "C" fn string_prepared_free(p: *mut Prepared) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
