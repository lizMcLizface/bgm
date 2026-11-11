//! Standalone owned normal-live piano/physical-slot source.
pub mod timeline;
mod live_timeline;
mod live_sine;
mod live_controls;
pub mod envelope;
pub mod biquad;
pub mod engine;

mod abi;
#[cfg(feature="allocation-audit")]
mod allocation;

#[path="../../piano/src/control.rs"]
pub mod control;

pub mod air;
