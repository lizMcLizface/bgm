//! Discard only IEEE-754 subnormal state (below ~-758 dBFS), never an audible tail.
//! Apply to recursive state at render boundaries, preserving clocks and parameters.
#[inline]
pub fn flush(values: &mut [f32]) {
    for value in values { if value.is_subnormal() { *value = 0.; } }
}
#[inline]
pub fn clean(value: f32) -> f32 { if value.is_subnormal() { 0. } else { value } }
