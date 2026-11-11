use crate::{
    fit::Fit,
    realtime::{Bank, Curve},
    table::write_list,
    Prepared, Resource,
};
pub struct Buffer {
    data: Vec<f32>,
}
pub struct OwnedBank {
    bank: Bank,
    meta: Vec<f64>,
}
#[no_mangle]
pub unsafe extern "C" fn string_reference_gain(p: *const Resource) -> f64 {
    let Some(table) = p.as_ref().and_then(|p| p.table.as_ref()) else {
        return f64::NAN;
    };
    let f0 = 440. * 2f64.powf((60. - 69.) / 12.);
    let m = crate::model::Model::new(table, 60., 80., f0, 0.6, 200, 0.002);
    10f64.powf((-22. - m.level) / 20.)
}
fn body_fits(p: &mut Resource) -> bool {
    let Some(table) = &p.table else { return false };
    for l in [0, 1] {
        if p.fits[l].is_none() {
            p.fits[l] = Some(Fit::new(table, l, 0));
        }
    }
    true
}
fn curve(p: &Resource, fine: f64) -> Curve<'_> {
    Curve::new(
        p.table.as_ref().unwrap(),
        p.fits[0].as_ref().unwrap(),
        p.fits[1].as_ref().unwrap(),
        fine,
    )
}
#[no_mangle]
pub unsafe extern "C" fn string_body_value(p: *mut Resource, fine: f64, frequency: f64) -> f64 {
    let Some(p) = p.as_mut() else { return f64::NAN };
    if !fine.is_finite()
        || !(0. ..=4.).contains(&fine)
        || !frequency.is_finite()
        || !(0.001..=192000.).contains(&frequency)
        || !body_fits(p)
    {
        return f64::NAN;
    }
    curve(p, fine).at(frequency)
}
#[no_mangle]
pub unsafe extern "C" fn string_body_new(
    p: *mut Resource,
    rate: f64,
    fine: f64,
    seconds: f64,
    wake_db: f64,
    wake_time: f64,
) -> *mut Buffer {
    let Some(p) = p.as_mut() else {
        return std::ptr::null_mut();
    };
    if ![rate, fine, seconds, wake_db, wake_time]
        .iter()
        .all(|v| v.is_finite())
        || !(8000. ..=192000.).contains(&rate)
        || !(0. ..=4.).contains(&fine)
        || !(0.01..=1.).contains(&seconds)
        || !(-120. ..=24.).contains(&wake_db)
        || !(0.05..=1.2).contains(&wake_time)
        || !body_fits(p)
    {
        return std::ptr::null_mut();
    }
    let data = curve(p, fine).impulse(rate, seconds, wake_db, wake_time);
    if !data.iter().all(|v| v.is_finite()) {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(Buffer { data }))
}
#[no_mangle]
pub unsafe extern "C" fn string_buffer_data(p: *const Buffer) -> *const f32 {
    p.as_ref().map_or(std::ptr::null(), |p| p.data.as_ptr())
}
#[no_mangle]
pub unsafe extern "C" fn string_buffer_len(p: *const Buffer) -> u32 {
    p.as_ref().map_or(0, |p| p.data.len() as u32)
}
#[no_mangle]
pub unsafe extern "C" fn string_buffer_free(p: *mut Buffer) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub unsafe extern "C" fn string_bank_new(
    p: *mut Resource,
    model: *const Prepared,
    rate: f64,
    fine: f64,
    phase: u32,
) -> *mut OwnedBank {
    let origin = p as usize;
    let Some(p) = p.as_mut() else {
        return std::ptr::null_mut();
    };
    let Some(model) = model.as_ref() else {
        return std::ptr::null_mut();
    };
    if model.origin != origin
        || model.model.is_none()
        || !rate.is_finite()
        || !(8000. ..=192000.).contains(&rate)
        || !fine.is_finite()
        || !(0. ..=4.).contains(&fine)
        || phase > 2
        || !body_fits(p)
    {
        return std::ptr::null_mut();
    }
    let Some(model) = &model.model else {
        return std::ptr::null_mut();
    };
    let Some(bank) = Bank::new(
        model,
        p.table.as_ref().unwrap(),
        &curve(p, fine),
        rate,
        phase == 0,
    ) else {
        return std::ptr::null_mut();
    };
    let mut meta = vec![
        bank.f0,
        bank.rms,
        bank.level,
        bank.release_seconds,
        bank.vibrato_rate,
    ];
    write_list(&mut meta, &bank.release_times);
    write_list(&mut meta, &bank.release_gains);
    write_list(&mut meta, &bank.vibrato_depths);
    Box::into_raw(Box::new(OwnedBank { bank, meta }))
}
#[no_mangle]
pub unsafe extern "C" fn string_bank_data(p: *const OwnedBank, dark: u32) -> *const f32 {
    if dark > 1 {
        return std::ptr::null();
    }
    p.as_ref().map_or(std::ptr::null(), |p| {
        if dark == 0 {
            p.bank.table.as_ptr()
        } else {
            p.bank.dark.as_ptr()
        }
    })
}
#[no_mangle]
pub unsafe extern "C" fn string_bank_meta(p: *const OwnedBank) -> *const f64 {
    p.as_ref().map_or(std::ptr::null(), |p| p.meta.as_ptr())
}
#[no_mangle]
pub unsafe extern "C" fn string_bank_meta_len(p: *const OwnedBank) -> u32 {
    p.as_ref().map_or(0, |p| p.meta.len() as u32)
}
#[no_mangle]
pub unsafe extern "C" fn string_bank_free(p: *mut OwnedBank) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
