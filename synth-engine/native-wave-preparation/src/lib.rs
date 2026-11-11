//! The selected Native RustFFT6.4.1 AVX/FMA arithmetic, scalar-lane port.
//! Only inverse power-of-two sizes1024/2048/8192 and one real harmonic input.
//! No fitted output tables; IEEE fused multiply-add preserves AVX operation order.
#[derive(Clone, Copy, Default)]
struct C {
    r: f32,
    i: f32,
}
impl C {
    const ZERO: Self = Self { r: 0., i: 0. };
    fn add(self, b: Self) -> Self {
        Self {
            r: self.r + b.r,
            i: self.i + b.i,
        }
    }
    fn sub(self, b: Self) -> Self {
        Self {
            r: self.r - b.r,
            i: self.i - b.i,
        }
    }
    fn scale(self, b: f32) -> Self {
        Self {
            r: self.r * b,
            i: self.i * b,
        }
    }
    fn rot(self) -> Self {
        Self {
            r: -self.i,
            i: self.r,
        }
    }
    fn neg(self) -> Self {
        Self {
            r: -self.r,
            i: -self.i,
        }
    }
    fn conj(self) -> Self {
        Self {
            r: self.r,
            i: -self.i,
        }
    }
    fn avx_mul(self, b: Self) -> Self {
        Self {
            r: self.r.mul_add(b.r, -(self.i * b.i)),
            i: self.r.mul_add(b.i, self.i * b.r),
        }
    }
    fn scalar_mul(self, b: Self) -> Self {
        Self {
            r: self.r * b.r - self.i * b.i,
            i: self.r * b.i + self.i * b.r,
        }
    }
}
fn twiddle(index: usize, n: usize) -> C {
    let constant = -2. * std::f64::consts::PI / n as f64;
    let angle = constant * index as f64;
    C {
        r: angle.cos() as f32,
        i: -(angle.sin() as f32),
    }
}
fn tw1(v: C) -> C {
    v.rot().add(v).scale(std::f32::consts::FRAC_1_SQRT_2)
}
fn tw3(v: C) -> C {
    v.rot().sub(v).scale(std::f32::consts::FRAC_1_SQRT_2)
}
fn b4(x: [C; 4]) -> [C; 4] {
    let a = x[0].add(x[2]);
    let b = x[0].sub(x[2]);
    let c = x[1].add(x[3]);
    let d = x[1].sub(x[3]).rot();
    [a.add(c), b.add(d), a.sub(c), b.sub(d)]
}
fn b8(x: [C; 8]) -> [C; 8] {
    let a = b4([x[0], x[2], x[4], x[6]]);
    let mut b = b4([x[1], x[3], x[5], x[7]]);
    b[1] = tw1(b[1]);
    b[2] = b[2].rot();
    b[3] = tw3(b[3]);
    [
        a[0].add(b[0]),
        a[1].add(b[1]),
        a[2].add(b[2]),
        a[3].add(b[3]),
        a[0].sub(b[0]),
        a[1].sub(b[1]),
        a[2].sub(b[2]),
        a[3].sub(b[3]),
    ]
}
fn b32(x: [C; 32]) -> [C; 32] {
    let t = [
        twiddle(1, 32),
        twiddle(2, 32),
        twiddle(3, 32),
        twiddle(5, 32),
        twiddle(6, 32),
        twiddle(7, 32),
    ];
    let mut m = [[C::ZERO; 4]; 8];
    for j in 0..8 {
        m[j] = b4([x[j], x[j + 8], x[j + 16], x[j + 24]]);
    }
    m[1][1] = m[1][1].avx_mul(t[0]);
    m[1][2] = m[1][2].avx_mul(t[1]);
    m[1][3] = m[1][3].avx_mul(t[2]);
    m[2][1] = m[2][1].avx_mul(t[1]);
    m[2][2] = tw1(m[2][2]);
    m[2][3] = m[2][3].avx_mul(t[4]);
    m[3][1] = m[3][1].avx_mul(t[2]);
    m[3][2] = m[3][2].avx_mul(t[4]);
    m[3][3] = m[3][3].avx_mul(t[0].rot());
    m[4][1] = tw1(m[4][1]);
    m[4][2] = m[4][2].rot();
    m[4][3] = tw3(m[4][3]);
    m[5][1] = m[5][1].avx_mul(t[3]);
    m[5][2] = m[5][2].avx_mul(t[1].rot());
    m[5][3] = m[5][3].avx_mul(t[5].rot());
    m[6][1] = m[6][1].avx_mul(t[4]);
    m[6][2] = tw3(m[6][2]);
    m[6][3] = m[6][3].avx_mul(t[1].neg());
    m[7][1] = m[7][1].avx_mul(t[5]);
    m[7][2] = m[7][2].avx_mul(t[4].rot());
    m[7][3] = m[7][3].avx_mul(t[3].neg());
    let mut out = [C::ZERO; 32];
    for i in 0..4 {
        let y = b8(std::array::from_fn(|j| m[j][i]));
        for j in 0..8 {
            out[i + 4 * j] = y[j];
        }
    }
    out
}
fn b256(x: &[C]) -> Vec<C> {
    let mut m = vec![C::ZERO; 256];
    for col in 0..32 {
        let mut y = b8(std::array::from_fn(|row| x[col + 32 * row]));
        for row in 1..8 {
            y[row] = y[row].avx_mul(twiddle(col * row, 256));
        }
        for row in 0..8 {
            m[row * 32 + col] = y[row];
        }
    }
    let mut out = vec![C::ZERO; 256];
    for row in 0..8 {
        let y = b32(std::array::from_fn(|col| m[row * 32 + col]));
        for col in 0..32 {
            out[col * 8 + row] = y[col];
        }
    }
    out
}
fn fft(x: &[C]) -> Vec<C> {
    let n = x.len();
    if n == 256 {
        return b256(x);
    }
    let radix = match n {
        1024 => 4,
        2048 => 8,
        8192 => 4,
        _ => unreachable!(),
    };
    let inner = n / radix;
    let mut m = vec![C::ZERO; n];
    for col in 0..inner {
        let mut y = [C::ZERO; 8];
        if radix == 4 {
            y[..4].copy_from_slice(&b4(std::array::from_fn(|row| x[col + inner * row])));
        } else {
            y = b8(std::array::from_fn(|row| x[col + inner * row]));
        }
        m[col] = y[0];
        for row in 1..radix {
            m[row * inner + col] = twiddle(col * row, n).avx_mul(y[row]);
        }
    }
    let mut out = vec![C::ZERO; n];
    for row in 0..radix {
        let y = fft(&m[row * inner..(row + 1) * inner]);
        for col in 0..inner {
            out[col * radix + row] = y[col];
        }
    }
    out
}
/// Source-defined Native FFTFrame even inverse packing, Float32 multiply/add
/// before the selected AVX/FMA complex FFT and two separate scale operations.
pub fn prepare(size: usize, real: f32, imag: f32) -> Option<Vec<f32>> {
    if !matches!(size, 2048 | 4096 | 16384)
        || !real.is_finite()
        || !imag.is_finite()
        || real.abs() > 1.
        || imag.abs() > 1.
    {
        return None;
    }
    let half = size / 2;
    let mut z = vec![C::ZERO; half];
    let rk = real * size as f32;
    let ik = imag * -(size as f32);
    let fe = C {
        r: (rk + 0.) * 0.5,
        i: (ik - 0.) * 0.5,
    };
    let angle = -2. * std::f64::consts::PI / (size as f64);
    let (sin, cos) = angle.sin_cos();
    let w = C {
        r: (0.5 * cos) as f32,
        i: -((0.5 * sin) as f32),
    };
    let fo = w.scalar_mul(C { r: rk, i: ik });
    let rotated = fo.rot();
    z[1] = fe.add(rotated);
    z[half - 1] = fe.sub(rotated).conj();
    let transformed = fft(&z);
    let scale = 1. / half as f32;
    Some(
        transformed
            .into_iter()
            .flat_map(|v| [(v.r * scale) * 0.5, (v.i * scale) * 0.5])
            .collect(),
    )
}
#[cfg(feature = "standalone")]
pub struct Prepared {
    data: Vec<f32>,
}
#[cfg(feature = "standalone")]
#[no_mangle]
pub extern "C" fn native_wave_api() -> u32 {
    1
}
#[cfg(feature = "standalone")]
#[no_mangle]
pub extern "C" fn native_wave_new(size: u32, real: f64, imag: f64) -> *mut Prepared {
    if !real.is_finite() || !imag.is_finite() || real.abs() > 1. || imag.abs() > 1. {
        return std::ptr::null_mut();
    }
    prepare(size as usize, real as f32, imag as f32)
        .map(|data| Box::into_raw(Box::new(Prepared { data })))
        .unwrap_or(std::ptr::null_mut())
}
#[cfg(feature = "standalone")]
#[no_mangle]
pub extern "C" fn native_wave_data(p: &Prepared) -> *const f32 {
    p.data.as_ptr()
}
#[cfg(feature = "standalone")]
#[no_mangle]
pub extern "C" fn native_wave_len(p: &Prepared) -> u32 {
    p.data.len() as u32
}
#[cfg(feature = "standalone")]
#[no_mangle]
pub unsafe extern "C" fn native_wave_free(p: *mut Prepared) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
