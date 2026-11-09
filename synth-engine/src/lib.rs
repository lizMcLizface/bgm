//! Standalone, allocation-free subtractive DSP prototype. No third-party DSP code.
#![allow(static_mut_refs)]
#[path = "../common/denormal.rs"]
mod denormal;
use std::f32::consts::PI;
#[path = "../common/headroom.rs"]
mod headroom;
#[path = "../common/colour.rs"]
mod colour;
#[path = "../common/notes.rs"]
mod notes;
#[cfg(any(feature = "simd-voices", feature = "simd-colour"))]
#[path = "../common/simd.rs"]
mod simd;
#[cfg(feature = "simd-voices")]
mod simd_voices;
include!("engine.rs");
#[cfg(feature = "legacy-abi")]
mod abi;
