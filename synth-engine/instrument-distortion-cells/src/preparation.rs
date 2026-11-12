//! Runs only in a separate build-preparation Wasm, never the audio binary.
const N:usize=44100;
#[repr(C)]pub struct Basis{data:[f64;N*2]}
#[no_mangle]pub extern "C" fn distortion_cells_basis_new()->*mut Basis{let mut p=Box::new(Basis{data:[0.;N*2]});for i in 0..N{let x=i as f64*2./N as f64-1.;p.data[i*2]=((x*0.25).sinh()*5.).atan();p.data[i*2+1]=x.abs();}Box::into_raw(p)}
#[no_mangle]pub extern "C" fn distortion_cells_basis_data(p:&Basis)->*const f64{p.data.as_ptr()}
#[no_mangle]pub unsafe extern "C" fn distortion_cells_basis_free(p:*mut Basis){if !p.is_null(){drop(Box::from_raw(p));}}
