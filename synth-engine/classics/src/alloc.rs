//! Shared polyphonic voice allocation for every model.

/// What the allocator needs to know about one voice.
#[derive(Clone, Copy)]
pub struct Slot {
    pub active: bool,
    /// Key still physically held.
    pub down: bool,
    /// Released key kept sounding by the sustain pedal.
    pub held: bool,
    pub note: f32,
    /// Allocation order; lower is older.
    pub stamp: u32,
    /// Current loudness, used to pick the least audible release to steal.
    pub level: f32,
}

/// Picks the voice for a new note. In order: re-strike a released voice on
/// the same key (pedal-friendly), the least recently used free voice, the
/// quietest released voice, the oldest pedal-held voice, the oldest held key.
pub fn choose(pool: &[Slot], note: f32) -> usize {
    let oldest = |keep: &dyn Fn(&Slot) -> bool| pool.iter().enumerate().filter(|(_, s)| keep(s)).min_by_key(|(_, s)| s.stamp).map(|(i, _)| i);
    pool.iter().position(|s| s.active && !s.down && s.note == note)
        .or_else(|| oldest(&|s| !s.active))
        .or_else(|| pool.iter().enumerate().filter(|(_, s)| !s.down && !s.held).min_by(|a, b| a.1.level.total_cmp(&b.1.level)).map(|(i, _)| i))
        .or_else(|| oldest(&|s| !s.down))
        .or_else(|| oldest(&|_| true))
        .unwrap_or(0)
}
