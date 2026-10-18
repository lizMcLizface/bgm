//! Fixed-capacity last-key priority. Only called at the kernel's event frame.
#[derive(Clone, Copy)]
pub struct Key {
    pub id: u32,
    pub midi: f32,
    pub velocity: f32,
    down: bool,
}
impl Key {
    const ZERO: Self = Self {
        id: 0,
        midi: 0.,
        velocity: 0.,
        down: false,
    };
}
pub enum Action {
    None,
    Select(Key),
    Release,
}
pub struct Notes {
    keys: [Key; 32],
    len: usize,
    pedal: bool,
}
impl Notes {
    pub const fn new() -> Self {
        Self {
            keys: [Key::ZERO; 32],
            len: 0,
            pedal: false,
        }
    }
    pub fn clear(&mut self) {
        *self = Self::new();
    }
    fn selected(&self) -> Option<Key> {
        self.keys[..self.len]
            .iter()
            .rev()
            .find(|k| k.down)
            .or_else(|| self.keys[..self.len].last())
            .copied()
    }
    fn remove(&mut self, index: usize) {
        self.keys.copy_within(index + 1..self.len, index);
        self.len -= 1;
    }
    pub fn retune(&mut self, id: u32, midi: f32) {
        for k in &mut self.keys[..self.len] {
            if k.id == id {
                k.midi = midi;
            }
        }
    }
    pub fn event(&mut self, kind: u32, id: u32, midi: f32, velocity: f32) -> Action {
        let before = self.selected().map(|k| k.id);
        match kind {
            0 => {
                if id == 0 {
                    return Action::None;
                }
                if let Some(i) = self.keys[..self.len].iter().position(|k| k.id == id) {
                    self.remove(i);
                }
                // Forget the oldest key on overflow; its later release is harmless.
                if self.len == self.keys.len() {
                    self.remove(0);
                }
                self.keys[self.len] = Key {
                    id,
                    midi: midi.clamp(0., 127.),
                    velocity: velocity.clamp(0., 1.),
                    down: true,
                };
                self.len += 1;
            }
            1 => {
                if let Some(i) = self.keys[..self.len].iter().position(|k| k.id == id) {
                    if self.pedal {
                        self.keys[i].down = false;
                    } else {
                        self.remove(i);
                    }
                }
            }
            2 => {
                self.pedal = midi >= 0.5;
                if !self.pedal {
                    let mut i = 0;
                    while i < self.len {
                        if !self.keys[i].down {
                            self.remove(i);
                        } else {
                            i += 1;
                        }
                    }
                }
            }
            _ => return Action::None,
        }
        match self.selected() {
            Some(k) if Some(k.id) != before || kind == 0 => Action::Select(k),
            None if before.is_some() => Action::Release,
            _ => Action::None,
        }
    }
}
