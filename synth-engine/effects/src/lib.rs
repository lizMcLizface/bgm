//! Original stereo send effects. Fixed storage, no allocation in the render loop.
#![allow(static_mut_refs)]
use std::f32::consts::PI;
#[path = "../../common/headroom.rs"]
mod headroom;
pub const BLOCK: usize = 2048;
const LINES: usize = 16;
const FDN: usize = 32768; // > 160 ms at 192 kHz
const ECHO: usize = 384002; // two seconds at 192 kHz, including interpolation
const EARLY: usize = 65536;
const DIFF: usize = 8192;
pub const PARAMS: usize = 21;
// Parameters 18..=20 (appended): echo low cut in the feedback (Hz, 0 off), echo ducking (0..1), reverb type (0 classic, 1 room, 2 hall, 3 plate).
// Their defaults leave the earlier sound bit for bit as it was.
// Denser early reflections, scaled by parameter 17 (off by default): offsets in ms after the pre-delay,
// with their gains. The first four reflections (13, 27, 43 and 59 ms) are always on.
const DENSE_MS: [f32; 8] = [5., 9., 17., 23., 33., 39., 49., 71.];
const DENSE_GAIN: [f32; 8] = [0.22, -0.19, 0.17, -0.15, 0.13, 0.11, -0.09, 0.07];
const TIMES: [f32; LINES] = [
    0.0297, 0.0371, 0.0411, 0.0437, 0.0531, 0.0593, 0.0617, 0.0671, 0.0713, 0.0797, 0.0839, 0.0893,
    0.0971, 0.1013, 0.1097, 0.1277,
];
fn finite(x: f32) -> f32 {
    if x.is_finite() {
        x
    } else {
        0.
    }
}
fn tap(data: &[f32], pos: usize, delay: f32) -> f32 {
    let at = pos as f32 + data.len() as f32 - delay;
    let at = if at >= data.len() as f32 {
        at - data.len() as f32
    } else {
        at
    };
    let i = at as usize;
    let frac = at - i as f32;
    data[i] * (1. - frac) + data[if i + 1 == data.len() { 0 } else { i + 1 }] * frac
}
// Four-point Lagrange interpolation preserves considerably more of the upper
// spectrum than linear interpolation on each trip around the feedback loop.
fn late_tap(data: &[f32; FDN], pos: usize, delay: f32) -> f32 {
    let at = pos as f32 + FDN as f32 - delay;
    let at = if at >= FDN as f32 {
        at - FDN as f32
    } else {
        at
    };
    let i = at as usize;
    let f = at - i as f32;
    let a = data[(i + FDN - 1) % FDN];
    let b = data[i];
    let c = data[(i + 1) % FDN];
    let d = data[(i + 2) % FDN];
    -a * f * (f - 1.) * (f - 2.) / 6. + b * (f + 1.) * (f - 1.) * (f - 2.) / 2.
        - c * (f + 1.) * f * (f - 2.) / 2.
        + d * (f + 1.) * f * (f - 1.) / 6.
}
struct Effects {
    sr: f32,
    p: [f32; PARAMS],
    smooth: [f32; 3],
    lines: [[f32; FDN]; LINES],
    pos: usize,
    delay: [f32; LINES],
    target: [f32; LINES],
    gain: [f32; LINES],
    high_gain: [f32; LINES],
    return_gain: f32,
    return_target: f32,
    damp: [f32; LINES],
    dc_in: [f32; LINES],
    dc_out: [f32; LINES],
    phase: [f32; LINES],
    echoes: [[f32; ECHO]; 2],
    echo_pos: usize,
    echo_tone: [f32; 2],
    echo_delay: f32,
    old_echo_delay: f32,
    fade: u32,
    early: [[f32; EARLY]; 2],
    early_pos: usize,
    diff: [[f32; DIFF]; 4],
    diff_pos: usize,
    damping: f32,
    echo_alpha: f32,
    dc_r: f32,
    fb_x: [f32; 2],
    fb_y: [f32; 2],
    fb_a: f32,
    duck_env: f32,
    duck_attack: f32,
    duck_release: f32,
    diff_coef: f32,
    early_scale: f32,
    size_k: f32,
    mod_k: f32,
    hf_ratio: f32,
    quiet: u64,
    asleep: bool,
    frame: u64,
    peak: f32,
    internal: f32,
    reverb_active: bool,
    reverb_quiet: u64,
    reverb_frames: u64,
    /// A reverb type change waits here while the wet return fades out; `swap_g` is that fade (1 open, 0 shut).
    next_type: Option<f32>,
    swap_g: f32,
    headroom: headroom::Headroom,
}
impl Effects {
    #[cfg(feature = "legacy-abi")]
    const fn new() -> Self {
        Self {
            sr: 0.,
            p: [0.; PARAMS],
            smooth: [0.; 3],
            lines: [[0.; FDN]; LINES],
            pos: 0,
            delay: [0.; LINES],
            target: [0.; LINES],
            gain: [0.; LINES],
            high_gain: [0.; LINES],
            return_gain: 0.,
            return_target: 0.,
            damp: [0.; LINES],
            dc_in: [0.; LINES],
            dc_out: [0.; LINES],
            phase: [0.; LINES],
            echoes: [[0.; ECHO]; 2],
            echo_pos: 0,
            echo_tone: [0.; 2],
            echo_delay: 0.,
            old_echo_delay: 0.,
            fade: 0,
            early: [[0.; EARLY]; 2],
            early_pos: 0,
            diff: [[0.; DIFF]; 4],
            diff_pos: 0,
            damping: 0.,
            echo_alpha: 0.,
            dc_r: 0.,
            fb_x: [0.; 2],
            fb_y: [0.; 2],
            fb_a: 0.,
            duck_env: 0.,
            duck_attack: 0.,
            duck_release: 0.,
            diff_coef: 0.65,
            early_scale: 1.,
            size_k: 1.,
            mod_k: 1.,
            hf_ratio: 0.5,
            quiet: 0,
            asleep: false,
            frame: 0,
            peak: 0.,
            internal: 0.,
            reverb_active: false,
            reverb_quiet: 0,
            reverb_frames: 0,
            next_type: None,
            swap_g: 1.,
            headroom: headroom::Headroom::new(),
        }
    }
    // Each field is initialized before assume_init. Zero writes apply only to
    // f32 arrays; Option/headroom/scalars use typed writes. No multi-megabyte
    // preparation stack temporary is constructed.
    fn boxed() -> Box<Self> {
        let mut value = Box::<Self>::new_uninit();
        let ptr = value.as_mut_ptr();
        unsafe {
            std::ptr::addr_of_mut!((*ptr).sr).write(0.);
            std::ptr::addr_of_mut!((*ptr).p).write([0.; PARAMS]);
            std::ptr::addr_of_mut!((*ptr).smooth).write([0.; 3]);
            std::ptr::addr_of_mut!((*ptr).lines).write_bytes(0, 1);
            std::ptr::addr_of_mut!((*ptr).pos).write(0);
            std::ptr::addr_of_mut!((*ptr).delay).write([0.; LINES]);
            std::ptr::addr_of_mut!((*ptr).target).write([0.; LINES]);
            std::ptr::addr_of_mut!((*ptr).gain).write([0.; LINES]);
            std::ptr::addr_of_mut!((*ptr).high_gain).write([0.; LINES]);
            std::ptr::addr_of_mut!((*ptr).return_gain).write(0.);
            std::ptr::addr_of_mut!((*ptr).return_target).write(0.);
            std::ptr::addr_of_mut!((*ptr).damp).write([0.; LINES]);
            std::ptr::addr_of_mut!((*ptr).dc_in).write([0.; LINES]);
            std::ptr::addr_of_mut!((*ptr).dc_out).write([0.; LINES]);
            std::ptr::addr_of_mut!((*ptr).phase).write([0.; LINES]);
            std::ptr::addr_of_mut!((*ptr).echoes).write_bytes(0, 1);
            std::ptr::addr_of_mut!((*ptr).echo_pos).write(0);
            std::ptr::addr_of_mut!((*ptr).echo_tone).write([0.; 2]);
            std::ptr::addr_of_mut!((*ptr).echo_delay).write(0.);
            std::ptr::addr_of_mut!((*ptr).old_echo_delay).write(0.);
            std::ptr::addr_of_mut!((*ptr).fade).write(0);
            std::ptr::addr_of_mut!((*ptr).early).write_bytes(0, 1);
            std::ptr::addr_of_mut!((*ptr).early_pos).write(0);
            std::ptr::addr_of_mut!((*ptr).diff).write_bytes(0, 1);
            std::ptr::addr_of_mut!((*ptr).diff_pos).write(0);
            std::ptr::addr_of_mut!((*ptr).damping).write(0.);
            std::ptr::addr_of_mut!((*ptr).echo_alpha).write(0.);
            std::ptr::addr_of_mut!((*ptr).dc_r).write(0.);
            std::ptr::addr_of_mut!((*ptr).fb_x).write([0.; 2]);
            std::ptr::addr_of_mut!((*ptr).fb_y).write([0.; 2]);
            std::ptr::addr_of_mut!((*ptr).fb_a).write(0.);
            std::ptr::addr_of_mut!((*ptr).duck_env).write(0.);
            std::ptr::addr_of_mut!((*ptr).duck_attack).write(0.);
            std::ptr::addr_of_mut!((*ptr).duck_release).write(0.);
            std::ptr::addr_of_mut!((*ptr).diff_coef).write(0.65);
            std::ptr::addr_of_mut!((*ptr).early_scale).write(1.);
            std::ptr::addr_of_mut!((*ptr).size_k).write(1.);
            std::ptr::addr_of_mut!((*ptr).mod_k).write(1.);
            std::ptr::addr_of_mut!((*ptr).hf_ratio).write(0.5);
            std::ptr::addr_of_mut!((*ptr).quiet).write(0);
            std::ptr::addr_of_mut!((*ptr).asleep).write(false);
            std::ptr::addr_of_mut!((*ptr).frame).write(0);
            std::ptr::addr_of_mut!((*ptr).peak).write(0.);
            std::ptr::addr_of_mut!((*ptr).internal).write(0.);
            std::ptr::addr_of_mut!((*ptr).reverb_active).write(false);
            std::ptr::addr_of_mut!((*ptr).reverb_quiet).write(0);
            std::ptr::addr_of_mut!((*ptr).reverb_frames).write(0);
            std::ptr::addr_of_mut!((*ptr).next_type).write(None);
            std::ptr::addr_of_mut!((*ptr).swap_g).write(1.);
            std::ptr::addr_of_mut!((*ptr).headroom).write(headroom::Headroom::new());
            value.assume_init()
        }
    }
    fn clear(&mut self) {
        self.headroom.clear();
        for b in &mut self.lines {
            b.fill(0.);
        }
        for b in &mut self.echoes {
            b.fill(0.);
        }
        for b in &mut self.early {
            b.fill(0.);
        }
        for b in &mut self.diff {
            b.fill(0.);
        }
        self.damp.fill(0.);
        self.dc_in.fill(0.);
        self.dc_out.fill(0.);
        self.echo_tone.fill(0.);
        self.fb_x = [0.; 2];
        self.fb_y = [0.; 2];
        self.duck_env = 0.;
        self.smooth = [self.p[0], self.p[1], self.p[2]];
        self.return_gain = self.return_target;
        self.quiet = 0;
        self.asleep = true;
        self.peak = 0.;
        self.internal = 0.;
        self.reverb_active = false;
        self.reverb_quiet = 0;
        self.next_type = None;
        self.swap_g = 1.;
    }
    /// Empties the reverb tank only (not the echo), for a type change.
    fn clear_tank(&mut self) {
        for b in &mut self.lines {
            b.fill(0.);
        }
        for b in &mut self.early {
            b.fill(0.);
        }
        for b in &mut self.diff {
            b.fill(0.);
        }
        self.damp.fill(0.);
        self.dc_in.fill(0.);
        self.dc_out.fill(0.);
    }
    fn init(&mut self, sr: f32) {
        self.sr = if sr.is_finite() {
            sr.clamp(8000., 192000.)
        } else {
            48000.
        };
        self.headroom.init(self.sr);
        self.p = [
            1., 0.22, 0.12, 8., 0.7, 6000., 25., 1., 0.3, 375., 0.4, 4500., 1., 0.2, 1., 0., 0.,
            0., 0., 0., 0.,
        ];
        self.smooth = [self.p[0], self.p[1], self.p[2]];
        self.pos = 0;
        self.echo_pos = 0;
        self.early_pos = 0;
        self.diff_pos = 0;
        self.frame = 0;
        self.reverb_frames = 0;
        self.echo_delay = self.p[9] * 0.001 * self.sr;
        self.old_echo_delay = self.echo_delay;
        self.fade = 0;
        for i in 0..LINES {
            self.phase[i] = i as f32 / LINES as f32;
            self.delay[i] = TIMES[i] * (0.55 + self.p[4] * 0.65) * self.sr;
            self.target[i] = self.delay[i];
        }
        self.refresh();
        self.clear();
    }
    fn refresh(&mut self) {
        self.damping = 1. - (-2. * PI * self.p[5].min(self.sr * 0.4) / self.sr).exp();
        self.echo_alpha = 1. - (-2. * PI * self.p[11].min(self.sr * 0.4) / self.sr).exp();
        self.dc_r = (-2. * PI * 8. / self.sr).exp();
        self.return_target = 10_f32.powf(self.p[16] / 20.);
        self.fb_a = if self.p[18] > 0. {
            1. / (1. + 2. * PI * self.p[18] / self.sr)
        } else {
            1.
        };
        self.duck_attack = 1. - (-1. / (self.sr * 0.004)).exp();
        self.duck_release = 1. - (-1. / (self.sr * 0.25)).exp();
        // reverb types: (diffuser coefficient, early-reflection level, delay-line scale, modulation scale, high-frequency decay ratio)
        let (diff, early, size, modulation, hf) = match self.p[20].round() as u32 {
            1 => (0.55, 1.5, 0.75, 0.8, 0.45),
            2 => (0.7, 0.8, 1.3, 1., 0.6),
            3 => (0.78, 0., 1., 1.6, 0.9),
            _ => (0.65, 1., 1., 1., 0.5),
        };
        self.diff_coef = diff;
        self.early_scale = early;
        self.size_k = size;
        self.mod_k = modulation;
        self.hf_ratio = hf;
        for i in 0..LINES {
            let seconds = TIMES[i] * (0.55 + self.p[4] * 0.65) * self.size_k;
            self.gain[i] = 10_f32.powf(-3. * seconds / self.p[3]);
            // Shelf loss follows the requested decay time, rather than applying
            // an unrelated low-pass loss on every traversal. High frequencies
            // decay in roughly half the time; damping sets the shelf corner.
            self.high_gain[i] = 10_f32.powf(-3. * seconds / (self.p[3] * self.hf_ratio));
        }
    }
    fn param(&mut self, index: usize, value: f32) {
        if index >= PARAMS || !value.is_finite() {
            return;
        }
        let ranges = [
            (0., 1.),
            (0., 0.8),
            (0., 0.8),
            (0.3, 30.),
            (0.2, 1.),
            (500., 16000.),
            (0., 150.),
            (0., 1.),
            (0., 1.),
            (40., 2000.),
            (0., 0.85),
            (300., 14000.),
            (0., 1.),
            (0., 1.),
            (0., 1.),
            (0., 1.),
            (-24., 18.),
            (0., 8.),
            (0., 1000.),
            (0., 1.),
            (0., 3.),
        ];
        let val = value.clamp(ranges[index].0, ranges[index].1);
        if index == 20 {
            // Switching type moves the decay gains, diffuser and line lengths at once, which bangs.
            // While the reverb is sounding, fade the wet return out first and switch when it is silent.
            if self.next_type.is_none() && self.p[20] == val {
                return;
            }
            if self.asleep || !self.reverb_active || self.p[15] >= 0.5 {
                self.next_type = None;
                self.swap_g = 1.;
            } else {
                self.next_type = Some(val);
                return;
            }
        }
        if self.p[index] == val {
            return;
        }
        if index == 14 || index == 15 {
            self.clear();
        }
        self.p[index] = val;
        if index < 3 && self.asleep {
            self.smooth[index] = val;
        }
        if index == 9 {
            self.old_echo_delay = self.echo_delay;
            self.echo_delay = val * 0.001 * self.sr;
            self.fade = (self.sr * 0.03) as u32;
        }
        self.refresh();
        if self.asleep {
            self.return_gain = self.return_target;
        }
    }
    fn render(
        &mut self,
        n: usize,
        input_bus: &[[f32; BLOCK]; 6],
        output_bus: &mut [[f32; BLOCK]; 2],
    ) {
        let n = n.min(BLOCK);
        let count = if self.p[14] >= 0.5 { 16 } else { 8 };
        let norm = (count as f32).sqrt().recip();
        let mut input_peak = 0_f32;
        let mut reverb_input_peak = 0_f32;
        for i in 0..n {
            {
                for c in 0..6 {
                    let level = finite(input_bus[c][i]).abs();
                    input_peak = input_peak.max(level);
                    if c == 2 || c == 3 {
                        reverb_input_peak =
                            reverb_input_peak.max(level * self.smooth[1].max(self.p[1]));
                    }
                }
            }
        }
        self.peak = 0.;
        self.internal = 0.;
        if input_peak > 1e-8 {
            self.asleep = false;
            self.quiet = 0;
        } else {
            self.quiet += n as u64;
        }
        if self.p[15] >= 0.5 || self.asleep {
            for i in 0..n {
                {
                    output_bus[0][i] = finite(input_bus[0][i]) * self.p[0];
                    output_bus[1][i] = finite(input_bus[1][i]) * self.p[0];
                }
            }
            self.frame += n as u64;
            return;
        }
        // Match the existing block-start wake timing for direct room input;
        // otherwise a leading zero sample shifts the modulation clock.
        if reverb_input_peak > 1e-12 {
            self.reverb_active = true;
            self.reverb_quiet = 0;
        }
        for i in 0..n {
            self.return_gain += (self.return_target - self.return_gain) * 0.002;
            for k in 0..3 {
                self.smooth[k] += (self.p[k] - self.smooth[k]) * 0.002;
            }
            let mut echo = [0.; 2];
            let mut room = [0.; 2];
            let mut dry = [0.; 2];
            for ch in 0..2 {
                dry[ch] = finite(input_bus[ch][i]);
                let current = tap(&self.echoes[ch], self.echo_pos, self.echo_delay);
                let value = if self.fade > 0 {
                    let t = (self.fade as f32 / (self.sr * 0.03)).clamp(0., 1.);
                    current * (1. - t)
                        + tap(&self.echoes[ch], self.echo_pos, self.old_echo_delay) * t
                } else {
                    current
                };
                self.echo_tone[ch] += self.echo_alpha * (value - self.echo_tone[ch]);
                echo[ch] = self.echo_tone[ch];
            }
            self.fade = self.fade.saturating_sub(1);
            for ch in 0..2 {
                let raw = echo[if self.p[12] >= 0.5 { 1 - ch } else { ch }] * self.p[10];
                let feedback = if self.p[18] > 0. {
                    let y = self.fb_a * (self.fb_y[ch] + raw - self.fb_x[ch]);
                    self.fb_x[ch] = raw;
                    self.fb_y[ch] = y;
                    y
                } else {
                    raw
                };
                self.echoes[ch][self.echo_pos] =
                    { finite(input_bus[4 + ch][i]) } * self.smooth[2] + feedback;
            }
            let reverb_input = [
                { finite(input_bus[2][i]) } * self.smooth[1] + echo[0] * self.p[13],
                { finite(input_bus[3][i]) } * self.smooth[1] + echo[1] * self.p[13],
            ];
            let input_level = reverb_input[0].abs().max(reverb_input[1].abs());
            if input_level > 1e-12 {
                self.reverb_active = true;
                self.reverb_quiet = 0;
            }
            if let Some(t) = self.next_type {
                self.swap_g -= 1. / (self.sr * 0.015);
                if self.swap_g <= 0. {
                    self.swap_g = 0.;
                    self.p[20] = t;
                    self.refresh();
                    self.clear_tank();
                    self.next_type = None;
                }
            } else if self.swap_g < 1. {
                self.swap_g = (self.swap_g + 1. / (self.sr * 0.015)).min(1.);
            }
            let mut wet = [0.; 2];
            if self.reverb_active {
                self.reverb_frames += 1;
                let mut reverb_peak = input_level;
                for ch in 0..2 {
                    self.early[ch][self.early_pos] = reverb_input[ch];
                    room[ch] = tap(
                        &self.early[ch],
                        self.early_pos,
                        (self.p[6] * 0.001 * self.sr).max(1.),
                    );
                }
                let mut early = [0.; 2];
                for ch in 0..2 {
                    for (j, ms) in [13., 27., 43., 59.].iter().enumerate() {
                        let side = if j % 2 == 0 { ch } else { 1 - ch };
                        early[ch] += tap(
                            &self.early[side],
                            self.early_pos,
                            (self.p[6] + ms) * 0.001 * self.sr,
                        ) * [0.25, 0.18, -0.13, 0.09][j]
                            * self.early_scale;
                    }
                }
                for ch in 0..2 {
                    for k in 0..2 {
                        let line = ch * 2 + k;
                        let delay = ([0.0097, 0.0163, 0.0127, 0.0239][line] * self.sr)
                            .round()
                            .max(1.) as usize;
                        let read = (self.diff_pos + DIFF - delay) % DIFF;
                        let y = self.diff[line][read] - self.diff_coef * room[ch];
                        self.diff[line][self.diff_pos] = room[ch] + self.diff_coef * y;
                        room[ch] = y;
                    }
                }
                if self.frame % 32 == 0 {
                    for j in 0..count {
                        self.phase[j] =
                            (self.phase[j] + 32. * (0.11 + j as f32 * 0.007) / self.sr).fract();
                        self.target[j] =
                            TIMES[j] * (0.55 + self.p[4] * 0.65) * self.sr * self.size_k
                                + (self.phase[j] * 2. * PI).sin()
                                    * self.p[8]
                                    * 0.0006
                                    * self.sr
                                    * self.mod_k;
                    }
                }
                let mut reads = [0.; LINES];
                let mut mixed = [0.; LINES];
                let mut late = [0.; 2];
                for j in 0..count {
                    self.delay[j] += (self.target[j] - self.delay[j]) * 0.02;
                    reads[j] = late_tap(&self.lines[j], self.pos, self.delay[j]);
                    self.internal = self.internal.max(reads[j].abs());
                    reverb_peak = reverb_peak.max(reads[j].abs());
                    self.damp[j] += self.damping * (reads[j] - self.damp[j]);
                    let x = reads[j] * self.high_gain[j]
                        + self.damp[j] * (self.gain[j] - self.high_gain[j]);
                    let hp = x - self.dc_in[j] + self.dc_r * self.dc_out[j];
                    self.dc_in[j] = x;
                    self.dc_out[j] = hp;
                    mixed[j] = hp;
                    // Injection already distributes energy across N lines. Applying
                    // 1/sqrt(N) again at the return made the diffuse tail 9/12 dB
                    // too quiet for 8/16 lines. Sum signed taps at unity here; the
                    // orthogonal feedback matrix retains its own normalization.
                    late[0] += reads[j] * if j & 1 == 0 { 1. } else { -1. };
                    late[1] += reads[j] * if j & 2 == 0 { 1. } else { -1. };
                }
                // Normalized Hadamard butterfly: orthogonal feedback, O(N log N).
                let mut stride = 1;
                while stride < count {
                    let mut base = 0;
                    while base < count {
                        for j in 0..stride {
                            let a = mixed[base + j];
                            let b = mixed[base + j + stride];
                            mixed[base + j] = a + b;
                            mixed[base + j + stride] = a - b;
                        }
                        base += stride * 2;
                    }
                    stride *= 2;
                }
                for j in 0..count {
                    let injection = (room[0] * if j & 1 == 0 { 1. } else { -1. }
                        + room[1] * if j & 2 == 0 { 1. } else { -1. })
                        * norm
                        * 0.5;
                    self.lines[j][self.pos] = mixed[j] * norm + injection;
                }
                if self.p[17] > 0. {
                    for ch in 0..2 {
                        for j in 0..DENSE_MS.len() {
                            // alternate which ear a reflection came from, as the first four do
                            let side = if j % 2 == 0 { 1 - ch } else { ch };
                            early[ch] += tap(
                                &self.early[side],
                                self.early_pos,
                                (self.p[6] + DENSE_MS[j]) * 0.001 * self.sr,
                            ) * DENSE_GAIN[j]
                                * self.p[17];
                        }
                    }
                }
                let reverb = [late[0] * 0.7 + early[0], late[1] * 0.7 + early[1]];
                let mid = (reverb[0] + reverb[1]) * 0.5 * self.return_gain;
                let side = (reverb[0] - reverb[1]) * 0.5 * self.p[7] * self.return_gain;
                wet = [(mid + side) * self.swap_g, (mid - side) * self.swap_g];
                for ch in 0..2 {
                    reverb_peak = reverb_peak
                        .max(room[ch].abs())
                        .max(early[ch].abs())
                        .max(wet[ch].abs());
                }
                // Guard every pending pre-delay/early/diffuser/FDN tap, not just
                // today's output sample. Keep a tail alive after sends reach 0.
                if reverb_peak > 1e-12 {
                    self.reverb_quiet = 0;
                } else {
                    self.reverb_quiet += 1;
                    if self.reverb_quiet > (self.sr * 0.5) as u64 {
                        self.reverb_active = false;
                    }
                }
                self.pos = (self.pos + 1) % FDN;
                self.early_pos = (self.early_pos + 1) % EARLY;
                self.diff_pos = (self.diff_pos + 1) % DIFF;
            }
            let level = dry[0].abs().max(dry[1].abs());
            let coef = if level > self.duck_env {
                self.duck_attack
            } else {
                self.duck_release
            };
            self.duck_env += (level - self.duck_env) * coef;
            let duck = 1. - self.p[19] * (self.duck_env * 6.).min(1.);
            let protected = self.headroom.tick(std::array::from_fn(|ch| {
                dry[ch] * self.smooth[0] + wet[ch] + echo[ch] * duck
            }));
            for ch in 0..2 {
                let y = protected[ch];
                {
                    output_bus[ch][i] = y;
                }
                self.peak = self.peak.max(y.abs());
                self.internal = self.internal.max(echo[ch].abs()).max(room[ch].abs());
            }
            self.echo_pos = (self.echo_pos + 1) % ECHO;
            self.frame += 1;
        }
        // Account for delayed input before deciding a quiet tail is finished.
        if self.quiet > (self.sr * 2.5) as u64 && self.internal < 1e-7 && self.peak < 1e-7 {
            self.asleep = true;
            self.reverb_active = false;
        }
    }
}
/// Exact legacy parameter bounds. Values outside them fail at the owned contract.
pub const PARAMETER_RANGES: [(f32, f32); PARAMS] = [
    (0f32, 1f32),
    (0f32, 0.8f32),
    (0f32, 0.8f32),
    (0.3f32, 30f32),
    (0.2f32, 1f32),
    (500f32, 16000f32),
    (0f32, 150f32),
    (0f32, 1f32),
    (0f32, 1f32),
    (40f32, 2000f32),
    (0f32, 0.85f32),
    (300f32, 14000f32),
    (0f32, 1f32),
    (0f32, 1f32),
    (0f32, 1f32),
    (0f32, 1f32),
    (-24f32, 18f32),
    (0f32, 8f32),
    (0f32, 1000f32),
    (0f32, 1f32),
    (0f32, 3f32),
];
/// One independent fixed-storage processor plus preparation-owned I/O buffers.
/// All construction/disposal occurs outside render. Buffers and DSP state belong
/// to this instance; no singleton ABI or browser object is referenced here.
pub struct Engine {
    dsp: Box<Effects>,
    input: [[f32; BLOCK]; 6],
    output: [[f32; BLOCK]; 2],
}
impl Engine {
    pub fn new(rate: f32) -> Option<Box<Self>> {
        if !rate.is_finite() || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        let mut dsp = Effects::boxed();
        dsp.init(rate);
        Some(Box::new(Self {
            dsp,
            input: [[0.; BLOCK]; 6],
            output: [[0.; BLOCK]; 2],
        }))
    }
    pub fn param(&mut self, index: usize, value: f32) -> bool {
        let Some(&(lo, hi)) = PARAMETER_RANGES.get(index) else {
            return false;
        };
        if !value.is_finite() || value < lo || value > hi {
            return false;
        }
        self.dsp.param(index, value);
        true
    }
    pub fn parameters(&self) -> [f32; PARAMS] {
        let mut p = self.dsp.p;
        if let Some(target) = self.dsp.next_type {
            p[20] = target;
        }
        p
    }
    pub fn input_mut(&mut self, channel: usize) -> Option<&mut [f32; BLOCK]> {
        self.input.get_mut(channel)
    }
    pub fn output(&self, channel: usize) -> Option<&[f32; BLOCK]> {
        self.output.get(channel)
    }
    pub fn render(&mut self, frames: usize) -> bool {
        if frames > BLOCK {
            return false;
        }
        self.dsp.render(frames, &self.input, &mut self.output);
        true
    }
    pub fn clear(&mut self) {
        self.dsp.clear();
    }
    /// Restart at sample zero with the current target parameters. This is a
    /// fresh-instance replay, not an in-flight delay/filter snapshot.
    pub fn reset(&mut self) {
        let p = self.parameters();
        self.dsp.init(self.dsp.sr);
        for (i, v) in p.into_iter().enumerate() {
            self.dsp.param(i, v);
        }
        self.input.iter_mut().for_each(|b| b.fill(0.));
        self.output.iter_mut().for_each(|b| b.fill(0.));
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.dsp.peak as f64,
            1 => self.dsp.asleep as u32 as f64,
            2 => self.dsp.frame as f64,
            3 => self.dsp.internal as f64,
            4 => self.dsp.reverb_active as u32 as f64,
            5 => self.dsp.reverb_frames as f64,
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn fx_owned_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn fx_owned_new(rate: f32) -> *mut Engine {
    Engine::new(rate).map_or(std::ptr::null_mut(), Box::into_raw)
}
#[no_mangle]
pub unsafe extern "C" fn fx_owned_free(engine: *mut Engine) {
    if !engine.is_null() {
        drop(Box::from_raw(engine));
    }
}
#[no_mangle]
pub extern "C" fn fx_owned_param(engine: &mut Engine, index: usize, value: f32) -> u32 {
    engine.param(index, value) as u32
}
#[no_mangle]
pub extern "C" fn fx_owned_input(engine: &mut Engine, channel: usize) -> *mut f32 {
    engine
        .input_mut(channel)
        .map_or(std::ptr::null_mut(), |b| b.as_mut_ptr())
}
#[no_mangle]
pub extern "C" fn fx_owned_output(engine: &Engine, channel: usize) -> *const f32 {
    engine
        .output(channel)
        .map_or(std::ptr::null(), |b| b.as_ptr())
}
#[no_mangle]
pub extern "C" fn fx_owned_render(engine: &mut Engine, frames: usize) -> u32 {
    engine.render(frames) as u32
}
#[no_mangle]
pub extern "C" fn fx_owned_clear(engine: &mut Engine) {
    engine.clear();
}
#[no_mangle]
pub extern "C" fn fx_owned_reset(engine: &mut Engine) {
    engine.reset();
}
#[no_mangle]
pub extern "C" fn fx_owned_stat(engine: &Engine, index: u32) -> f64 {
    engine.stat(index)
}
#[cfg(feature = "allocation-audit")]
mod allocation {
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    struct Counting;
    static WATCH: AtomicBool = AtomicBool::new(false);
    static COUNT: AtomicUsize = AtomicUsize::new(0);
    unsafe impl GlobalAlloc for Counting {
        unsafe fn alloc(&self, l: Layout) -> *mut u8 {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.alloc(l)
        }
        unsafe fn alloc_zeroed(&self, l: Layout) -> *mut u8 {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.alloc_zeroed(l)
        }
        unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.realloc(p, l, n)
        }
        unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
            if WATCH.load(Ordering::Relaxed) {
                COUNT.fetch_add(1, Ordering::Relaxed);
            }
            System.dealloc(p, l)
        }
    }
    #[global_allocator]
    static ALLOCATOR: Counting = Counting;
    #[no_mangle]
    pub extern "C" fn fx_owned_alloc_watch(watch: u32) {
        COUNT.store(0, Ordering::Relaxed);
        WATCH.store(watch != 0, Ordering::Relaxed);
    }
    #[no_mangle]
    pub extern "C" fn fx_owned_alloc_count() -> usize {
        COUNT.load(Ordering::Relaxed)
    }
}

#[cfg(feature = "legacy-abi")]
mod legacy {
    use super::*;

    static mut FX: Effects = Effects::new();
    static mut INPUT: [[f32; BLOCK]; 6] = [[0.; BLOCK]; 6];
    static mut OUTPUT: [[f32; BLOCK]; 2] = [[0.; BLOCK]; 2];
    #[no_mangle]
    pub extern "C" fn fx_api() -> u32 {
        1
    }
    #[no_mangle]
    pub extern "C" fn fx_init(sr: f32) {
        unsafe {
            FX.init(sr);
        }
    }
    #[no_mangle]
    pub extern "C" fn fx_param(index: u32, value: f32) {
        unsafe {
            FX.param(index as usize, value);
        }
    }
    #[no_mangle]
    pub extern "C" fn fx_clear() {
        unsafe {
            FX.clear();
        }
    }
    #[no_mangle]
    pub extern "C" fn fx_input(channel: u32) -> *mut f32 {
        unsafe { INPUT[(channel as usize).min(5)].as_mut_ptr() }
    }
    #[no_mangle]
    pub extern "C" fn fx_output(channel: u32) -> *const f32 {
        unsafe { OUTPUT[(channel as usize).min(1)].as_ptr() }
    }
    #[no_mangle]
    pub extern "C" fn fx_render(n: u32) {
        unsafe {
            FX.render(n as usize, &INPUT, &mut OUTPUT);
        }
    }
    #[no_mangle]
    pub extern "C" fn fx_stat(index: u32) -> f64 {
        unsafe {
            match index {
                0 => FX.peak as f64,
                1 => {
                    if FX.asleep {
                        1.
                    } else {
                        0.
                    }
                }
                2 => FX.frame as f64,
                3 => FX.internal as f64,
                // Independent FDN activity and cumulative processed samples let
                // callers distinguish echo-only work from actual reverb DSP.
                4 => {
                    if FX.reverb_active {
                        1.
                    } else {
                        0.
                    }
                }
                5 => FX.reverb_frames as f64,
                _ => 0.,
            }
        }
    }
}
