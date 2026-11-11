//! Explicit pinned Chromium SSE-style Float32 read-position/interpolation
//! arithmetic. This is a profile choice, not universal DelayNode bit identity.
pub struct Delay {
    ring: [Vec<f32>; 2],
    at: usize,
    rate: f32,
}
impl Delay {
    pub fn new(rate: f64) -> Self {
        let length = (0.2 * rate).ceil() as usize + 128;
        Self {
            ring: std::array::from_fn(|_| vec![0.; length]),
            at: 0,
            rate: rate as f32,
        }
    }
    pub fn reset(&mut self) {
        self.ring.iter_mut().for_each(|v| v.fill(0.));
        self.at = 0;
    }
    /// Native DelayHandler remaps the entire history and retains its write index
    /// when CheckNumberOfChannelsForInput changes the logical layout.
    pub fn layout(&mut self, previous:usize, next:usize) {
        if previous==2 && next==1 {
            for i in 0..self.ring[0].len(){let left=self.ring[0][i]*0.5;self.ring[0][i]=self.ring[1][i].mul_add(0.5,left);}
        } else if previous==1 && next==2 {
            let [left,right]=&mut self.ring;right.copy_from_slice(left);
        }
    }
    pub fn tick(&mut self, input: [f32; 2], seconds: [f32; 2]) -> [f32; 2] {
        let length = self.ring[0].len();
        for ch in 0..2 {
            self.ring[ch][self.at] = input[ch];
        }
        let out = std::array::from_fn(|ch| {
            let desired = seconds[ch].max(0.) * self.rate;
            let mut position = self.at as f32 + (length as f32 - desired);
            if position >= length as f32 { position -= length as f32; }
            let a = position as usize;
            let b = if a + 1 >= length { 0 } else { a + 1 };
            let fraction = position - a as f32;
            self.ring[ch][a] + fraction * (self.ring[ch][b] - self.ring[ch][a])
        });
        self.at = if self.at + 1 >= length {
            0
        } else {
            self.at + 1
        };
        out
    }
}
