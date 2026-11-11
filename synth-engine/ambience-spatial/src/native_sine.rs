//! Scheduled-start extension of synth-engine/piano-live/src/live_sine.rs; upstream SHA256 (normalized LF) da79368431721f657f57b4d974ad782b0a074a216ee7dc77bc2ba362859f4c7a.
//! Exact Native harmonic preparation replaces the previous phase basis combination.
//! Existing interpolation/table/tick core retained; accepted upstream is untouched.
//! Live control reuse of the accepted pinned Chromium oscillator/table profile.
//! Pinned Chromium sine oscillator clock/interpolation over immutable native
//! FFT-generated tables. See resources/manifest.json and CHROMIUM_NOTICES.txt.
//! The constant-frequency SSE clock has a native128-frame lifetime independent
//! of caller partitions; a-rate phase increments retain native Float32 rounding.
pub struct Sine {
    phased: Option<Vec<f32>>,
    table: &'static [u8],
    size: usize,
    scale: f32,
    index: f64,
    lanes: [f32; 4],
}
impl Sine {
    pub fn size(rate: f64) -> usize {
        if rate <= 24000. { 2048 } else if rate <= 88200. { 4096 } else { 16384 }
    }
    pub fn new(rate: f64, phase: f64) -> Self {
        let size = Self::size(rate);
        let table: &'static [u8] = match size {
            2048 => include_bytes!("../../tape-fx/resources/chromium-sine-2048.f32"),
            4096 => include_bytes!("../../tape-fx/resources/chromium-sine-4096.f32"),
            _ => include_bytes!("../../tape-fx/resources/chromium-sine-16384.f32"),
        };
        let phased=if phase==0.{None}else{let angle=std::f64::consts::TAU*phase;let a=angle.sin()as f32;let b=angle.cos()as f32;Some(calmbgm_native_wave_preparation::prepare(size,a,b).expect("bounded Native harmonic preparation"))};
        Self { table, phased, size, scale: size as f32 / rate as f32, index: 0., lanes: [0.; 4] }
    }
    pub fn reset(&mut self) { self.index = 0.; self.lanes = [0.; 4]; }
    pub fn virtual_index(&self)->f64 { self.index }
    /// OscillatorHandler::Process: local frequency remains zero on a-rate,
    /// so a negative initial scheduling offset resets the index to zero there.
    pub fn scheduling_offset(&mut self,offset:f64,frequency:f32,constant:bool){
        let frequency=if constant{frequency}else{0.};
        if offset<0.{self.index=-offset*frequency as f64*self.scale as f64;}
        else if offset>0.{self.index+=(1.-offset)*frequency as f64*self.scale as f64;}
    }
    /// Pinned ProcessKRate recomputes its final index with Float32 n*increment;
    /// unlike the usual128samples, a partial first quantum needs this boundary.
    pub fn finish_partial_constant(&mut self,start:f64,n:usize,frequency:f32){
        self.index=start+(n as f32*(frequency*self.scale))as f64;
        self.index-=(self.index/self.size as f64).floor()*self.size as f64;
    }
    pub fn phase(&self) -> f64 { self.index / self.size as f64 }
    fn sample(&self, index: isize) -> f32 {
        if let Some(table)=&self.phased{return table[index as usize&(self.size-1)];}
        let index = (index as usize & (self.size - 1)) * 4;
        f32::from_le_bytes(self.table[index..index + 4].try_into().unwrap())
    }
    fn linear(&self, index: f32) -> f32 {
        self.linear_at(index, index as isize)
    }
    fn linear_at(&self, index: f32, a: isize) -> f32 {
        let fraction = index - a as f32;
        let x = self.sample(a);
        x + fraction * (self.sample(a + 1) - x)
    }
    fn interpolation(&self, increment: f32, vector_linear: bool) -> f32 {
        let a = self.index as isize;
        if increment >= 0.3f32 {
            if vector_linear { return self.linear_at(self.index as f32, a); }
            let t = (self.index as f32 - a as f32) as f64;
            return ((1. - t) * self.sample(a) as f64 + t * self.sample(a + 1) as f64) as f32;
        }
        let t = self.index - a as f64;
        if increment >= 0.16f32 {
            let weights = [0.5 * t * (t - 1.), 1. - t * t, 0.5 * t * (t + 1.)];
            let mut out = 0.;
            for i in 0..3 { out += weights[i] * self.sample(a + i as isize - 1) as f64; }
            out as f32
        } else {
            let t2 = t * t;
            let weights = [
                t * (t2 - 1.) * (t - 2.) / 24.,
                -t * (t - 1.) * (t2 - 4.) / 6.,
                (t2 - 1.) * (t2 - 4.) / 4.,
                -t * (t + 1.) * (t2 - 4.) / 6.,
                t * (t2 - 1.) * (t + 2.) / 24.,
            ];
            let mut out = 0.;
            for i in 0..5 { out += weights[i] * self.sample(a + i as isize - 2) as f64; }
            out as f32
        }
    }
    pub fn tick(&mut self, frequency: f32, frame: u64, constant:bool, vector_linear: bool) -> f32 {
        let increment = frequency * self.scale;
        let out = if constant && increment >= 0.3f32 {
            if frame % 128 == 0 {
                self.lanes = std::array::from_fn(|i| {
                    let mut value = (self.index + (i as f32 * increment) as f64) as f32;
                    if value >= self.size as f32 { value -= self.size as f32; }
                    value
                });
            }
            let out = self.linear(self.lanes[frame as usize % 4]);
            if frame % 4 == 3 {
                for lane in &mut self.lanes {
                    *lane += 4. * increment;
                    if *lane >= self.size as f32 { *lane -= self.size as f32; }
                }
            }
            out
        } else { self.interpolation(increment, vector_linear) };
        self.index += increment as f64;
        if self.index >= self.size as f64 { self.index -= self.size as f64; }
        out
    }
}
