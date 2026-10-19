//! Explicit SIMD128 arithmetic for the opt-in voice-batching prototype.
#![allow(dead_code, unused_unsafe)]
#[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
compile_error!("simd-voices requires wasm32 and -C target-feature=+simd128");
use core::arch::wasm32::*;
#[derive(Clone, Copy)]
pub struct V(v128);
impl V {
    #[inline(always)]
    pub fn s(x: f32) -> Self {
        Self(f32x4_splat(x))
    }
    #[inline(always)]
    pub fn a(x: [f32; 4]) -> Self {
        Self(f32x4(x[0], x[1], x[2], x[3]))
    }
    #[inline(always)]
    pub fn array(self) -> [f32; 4] {
        unsafe { core::mem::transmute(self.0) }
    }
    #[inline(always)]
    pub fn choose(self, yes: Self, no: Self) -> Self {
        Self(v128_bitselect(yes.0, no.0, self.0))
    }
    #[inline(always)]
    pub fn lt(self, x: Self) -> Self {
        Self(f32x4_lt(self.0, x.0))
    }
    #[inline(always)]
    pub fn floor(self) -> Self {
        Self(f32x4_floor(self.0))
    }
    #[inline(always)]
    pub fn trunc(self) -> Self {
        Self(f32x4_trunc(self.0))
    }
    #[inline(always)]
    pub fn abs(self) -> Self {
        Self(f32x4_abs(self.0))
    }
    #[inline(always)]
    pub fn min(self, x: Self) -> Self {
        Self(f32x4_min(self.0, x.0))
    }
    #[inline(always)]
    pub fn max(self, x: Self) -> Self {
        Self(f32x4_max(self.0, x.0))
    }
    #[inline(always)]
    pub fn clamp(self, a: f32, b: f32) -> Self {
        self.max(Self::s(a)).min(Self::s(b))
    }
}
impl core::ops::Add for V {
    type Output = Self;
    #[inline(always)]
    fn add(self, x: Self) -> Self {
        Self(f32x4_add(self.0, x.0))
    }
}
impl core::ops::Sub for V {
    type Output = Self;
    #[inline(always)]
    fn sub(self, x: Self) -> Self {
        Self(f32x4_sub(self.0, x.0))
    }
}
impl core::ops::Mul for V {
    type Output = Self;
    #[inline(always)]
    fn mul(self, x: Self) -> Self {
        Self(f32x4_mul(self.0, x.0))
    }
}
impl core::ops::Div for V {
    type Output = Self;
    #[inline(always)]
    fn div(self, x: Self) -> Self {
        Self(f32x4_div(self.0, x.0))
    }
}
impl core::ops::AddAssign for V {
    #[inline(always)]
    fn add_assign(&mut self, x: Self) {
        *self = *self + x;
    }
}
#[inline(always)]
pub fn lut(table: &[f32], phase: V) -> V {
    let t = phase - phase.floor();
    let x = (t * V::s((table.len() - 1) as f32)).min(V::s((table.len() - 1) as f32 - 0.0005));
    let xs = x.array();
    let i = xs.map(|v| v as usize);
    let a = V::a(i.map(|k| table[k]));
    let b = V::a(i.map(|k| table[k + 1]));
    a + (b - a) * (x - V::a(i.map(|k| k as f32)))
}

#[derive(Clone, Copy)]
pub struct I(v128);
impl I {
    #[inline(always)]
    pub fn a(x: [u32; 4]) -> Self {
        Self(i32x4(x[0] as i32, x[1] as i32, x[2] as i32, x[3] as i32))
    }
    #[inline(always)]
    pub fn s(x: u32) -> Self {
        Self(i32x4_splat(x as i32))
    }
    #[inline(always)]
    pub fn array(self) -> [u32; 4] {
        unsafe { core::mem::transmute(self.0) }
    }
    #[inline(always)]
    pub fn eq(self, x: Self) -> V {
        V(i32x4_eq(self.0, x.0))
    }
    #[inline(always)]
    pub fn float(self) -> V {
        V(f32x4_convert_u32x4(self.0))
    }
    #[inline(always)]
    pub fn max(self, x: Self) -> Self {
        Self(u32x4_max(self.0, x.0))
    }
    #[inline(always)]
    pub fn down(self) -> Self {
        Self(v128_bitselect(
            i32x4_splat(0),
            i32x4_sub(self.0, i32x4_splat(1)),
            i32x4_eq(self.0, i32x4_splat(0)),
        ))
    }
    #[inline(always)]
    pub fn choose(mask: V, yes: Self, no: Self) -> Self {
        Self(v128_bitselect(yes.0, no.0, mask.0))
    }
}
impl V {
    #[inline(always)]
    pub fn and(self, x: Self) -> Self {
        Self(v128_and(self.0, x.0))
    }
    #[inline(always)]
    pub fn not(self) -> Self {
        Self(v128_not(self.0))
    }
    #[inline(always)]
    pub fn any(self) -> bool {
        v128_any_true(self.0)
    }
}
