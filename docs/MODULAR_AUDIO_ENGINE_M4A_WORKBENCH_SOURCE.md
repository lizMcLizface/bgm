# M4a: opt-in finite All source preview

2026-11-09. Implements the bounded GO in the
[M3 decision gate](MODULAR_AUDIO_ENGINE_M3_DECISION_GATE.md), committed as
`3670f50`. This is the first workbench source integration, not a replacement
for normal transport or the existing engines.

## Contract and route

All's MIDI / Setup dropdown offers **Owned Rust sequence preview**. Select a
ready pitched core/FM voice and a progression, then explicitly start one pass.
The existing context must be 48 kHz. Percussion, native, procedural and classic
voices are rejected without substituting a reference patch. FM currently
requires effective quality 1 (2x); Economy/other qualities are rejected.

The compiler snapshots the current pattern, progression, tempo, effective source
patch, tuning and deterministic probability realization. It reuses All's note
and placed-chord event functions, including ties, repeats, velocity, strum and
nudge, with All's existing neutral swing/flam and leader policy. This is a new
finite probability realization, not a capture of an already-running legacy
random stream. Bounds: 16 bars, 2,000 notes (4,000 source events), 120 seconds,
and at most 30 seconds source tail including envelope/body/formant ringing.
The 2,000-note limit respects the existing pitched-event capacity; it is lower
than the graph-wide 4,096-event capacity.

A fresh private Wasm graph owns the actual selected patch and timestamped notes.
Its unity raw-source stem enters a new unity summing node before LabVoice's
existing inserts, VoiceFx, room/delay sends and 0.7 output trim, then passes
through the ordinary role mixer, music subgroup and master effects/limiter.
The selected role ID, patch and setup schema remain unchanged. The normal
keyboard backend remains connected to the same seam.

The explicit executors are **one dedicated worker** and **serial worklet
reference**, each with 512-frame producer blocks, six slots, Message tasks for
the worker, and 3,072 frames / **64 ms declared source buffering**. A failed
worker startup may fall back to serial and reports the actual mode/reason.
This is not the three-worker rig used in the user's lock-screen observation.
Defaults on the existing harnesses and normal workbench are unchanged.

Preparation fills the queue without advancing the output/source clocks. The
controller connects the stem and its source/channel/master analyser taps before
arming it. It never suspends the shared AudioContext. An asynchronous cancel
disposes late-created routes without starting them. Score, tempo, selection,
mute/solo, source patch, tuning or host replacement invalidates the snapshot.
Normal song Play is disabled during preparation/playback; keyboard/MIDI remains
on its current engine. Stop source preview fades/disposes only its own route,
nodes and tap lease, without panic/held-key release on the legacy instrument.

## Diagnostics and limits

The visible JSON report includes captured notes/graph, engine build, actual
executor, explicit buffering, source/output/engine clocks, event counters,
bounded queue diagnostics, analyser peaks and completion/failure status. A
successful complete run requires all notes applied without lateness/overflow,
full finite clocks, zero missing transport frames and nonzero source/channel/
master peaks. Interrupted/unsupported/failed runs cannot be relabelled passes.
Reports are review-only and are not new saved song/backend defaults.

Raw owned scalar core/FM is compared against the unchanged scalar legacy ABI
at the same render cadence. All's optional SIMD/acoustic/banked legacy variants
and current keyboard remain under their existing policies; this preview does
not switch them or claim bit equality with those optional variants. Worker and
serial cadences differ, so prior documented subnormal behavior still applies.

Shared/master analyser peaks can contain other audio, keyboard notes and tails;
they prove routing/activity, not isolated wet PCM equality or physical sound.
The 64 ms capacity plus 125 ms captured-note preroll is not a live-MIDI latency
claim. There is no loop/pause/live score editing, full-song/several-role engine
replacement, drum-kit translation, native CPU proof or lock-screen quality
guarantee. Existing effects tails continue naturally after source completion.

## Verification

- Full regression run: **396 files / 2,815 tests passed**, 386.29 s. Subsequent
  final focused runs pass **36 tests / seven files** (2.75 s) and **81 tests /
  two files** (55.87 s), covering the last resource/quality/failure checks and
  Panic integration. Full-suite diagnostics include existing expected negative
  link-load errors and React act warnings; there were no failing tests.
- Real Node worker and private Wasm tests compare selected core and FM source
  plans with serial/unchanged legacy scalar ABI PCM, with **zero raw sample
  difference**, nonzero signal and zero unused output buses. Existing full-suite
  independent worker/pool instances and 44.1/48/96 kHz comparisons also pass.
  Lifecycle tests cover paused preparation, connection before arm, late-created
  route cancellation, source/host invalidation, separate Stop, Panic, invalid
  quality/rate and startup failure. Existing setup file and reload tests pass.
- Public build/package/provenance checks pass; final Vite build **44.66 s**.
  Engine runtime **`31d4ba7553a47868`**, Wasm **296,101 bytes**, unchanged SHA256
  `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
  No Rust source/ABI, golden DSP or fixed six-role fixture changes.
- Real All browser: existing **Thump Bass**, current four-bar progression at
  **76 BPM**, worker and serial each complete **668,956 frames / 18 events**,
  zero late/overflow/missing frames and nonzero source/channel/master signals.
  Source peaks **0.3811096251** in both; post-effects channel peaks
  **0.1005288884 / 0.1003885865**. These are activity measurements of separate
  runs with existing effect state, not a final wet-PCM equality comparison.
  The selected native piano is explicitly rejected; an empty lead progression
  is explicitly rejected. Neither substitutes a fixture or starts transport.
  See `reports/modular_audio/m4a-all-core-{worker,serial}.json` and
  `m4a-unsupported-source.json`.
- A separate worker run with the existing Bass fader at **-16.0 dB** completes
  without misses: raw source peak stays **0.3811096251**, channel/master become
  **0.0159004219** (ratio **0.15817** versus the first run). The fader is restored
  to 0.0 dB. Live -1.6 dB/restore edits leave the source playing. This checks the
  real mixer path rather than adding a separate preview gain outside it.
- Actual **Four-op round bass** FM worker completes **698,716 frames / 18
  events**, no late/overflow/missing frames; source/channel/master peaks
  **0.2005034834 / 0.0485101491 / 0.0485101491**. Replacing the playing FM source
  yields `source-changed`, incomplete/pass:false at **23,296 consumed frames**.
  Stop preview during a legacy keyboard Chord phrase leaves that phrase running;
  its separate Pause then stops it. These are separate interrupted reports, not
  clean full-run listening verdicts. Original Bass generator/Thump Bass patch
  and fader are restored after this temporary comparison.
- Normal full-song transport then plays through the legacy sources: Play
  pressed, preview start disabled, **five notes sounding / 36 lit meter
  segments** observed. Normal Stop returns to stopped, after which a fresh
  preview can start. No physical output/listening verdict is fabricated.
- After restoring Thump Bass, its raw source configuration and captured notes
  compare **exactly** to the initial worker plan; the fresh generation completes
  without misses. Actual Save setup is clicked without a native download wait
  or path retrieval. Browser reload restores the original visible voice choices,
  object IDs/poses, selected Pad and stopped normal transport; serial experiment
  choice resets to worker and the transient report clears. The session is
  **Continuous**, confirmed in Generator: its grid is regenerated on ordinary
  reload under existing policy, and the recorded grid comparison is false.
  This is not claimed as a byte-exact browser setup-file round trip. Existing
  finite/continuous setup-file restoration and corruption tests pass; native
  exported bytes were not retrieved/reuploaded in this browser pass.
- Fresh post-reload worker completes **668,956 frames / 14 events**, zero misses,
  generation 1, with nonzero source/channel/master activity. The changed event
  count belongs to the regenerated Continuous progression, not the earlier
  18-event capture. Stored report invariants pass, including exact restored
  source/notes and measured **-16.01764 dB** channel attenuation. Evidence:
  `reports/modular_audio/m4a-browser-workflow.json`, `m4a-report-invariants.json`
  and the per-run reports. Screenshot `.tmp/modular-audio-m4a-browser.png`.
  Original voices/poses, selected Pad and stopped normal transport are retained;
  preview is completed, default worker selector, keyboard phrase stopped.

## Next task

Collect a run-bound target-device listening result for this actual one-role
All route before expanding it. Then extend the finite adapter to a captured set
of eligible pitched roles, keeping one patch/owner authority per role and
coherent failure, existing mixer/FX paths and explicit stopped switching.
Translate unsupported percussion/voice families and continuous transport only
behind separate acceptance gates; do not substitute the fixed six-role fixture.
