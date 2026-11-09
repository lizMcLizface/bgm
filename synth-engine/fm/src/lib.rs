//! Original four/six-operator phase-modulation engine. Not a DX-ROM emulator.
#![allow(static_mut_refs)]
#[path = "../../common/denormal.rs"]
mod denormal;
use std::f32::consts::PI;
#[path = "../../common/colour.rs"]
mod colour;
#[path = "../../common/headroom.rs"]
mod headroom;
#[path = "../../common/notes.rs"]
mod notes;
#[cfg(any(feature = "simd-voices", feature = "simd-colour"))]
#[path = "../../common/simd.rs"]
mod simd;
#[cfg(feature = "simd-voices")]
mod simd_voices;
include!("engine.rs");
#[cfg(feature = "simd-voices")]
type Fm = Engine;
#[cfg(feature = "legacy-abi")]
mod abi;
