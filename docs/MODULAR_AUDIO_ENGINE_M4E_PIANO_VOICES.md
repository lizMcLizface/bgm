# M4e: prepared owned piano voices

2026-11-10. This extends M4d's two synthesis routines / five supported variants
into a finite owned graph source. It does not migrate normal transport or change
the default piano renderer. Matched acoustic presets, calibrated tables, Iowa
and classic synth/drum-machine adapters remain separate work.

## Contract and ownership

`legacy.piano` v1 / kind 10 is a 48 kHz prepared source. Each graph owns its
immutable PCM banks and note automation, round-robin slots, playback cursors,
gain envelopes, pitch-envelope playback and lowpass filter state. Mono native
piano output is duplicated into the graph's stereo bus; existing native/shared
effects supply the later stereo processing. There is no implicit panning change.

The serialized configuration contains synthesis settings, original tuned
frequencies and finite per-note gain/filter points, never PCM or host pointers.
Banks prepare off render, deduplicate identical material and preserve rounded
strike pitch, eight velocity layers and unrounded modal-body pitch. Limits:
128 banks, 64 MiB retained PCM per source, 2,000 prepared notes, 65,536 automation
points and 1–32 slots. Existing graph limits and the All 120-second budget apply.
The ABI and JS both validate configuration. Preparation failures release the
graph instead of falling back to another sound.

Timestamped graph note-on triggers reference prepared note IDs. Their release
is already in the immutable finite envelope. Live note-off/pedal/retune are not
pretended to work: v1 rejects those event kinds. Panic and owner cancellation
remain supported. Compile-time over-polyphony is rejected rather than replacing
the native pre-onset voice-steal fade with an approximation. Reset retains banks
and restores independent mutable state, allowing exact replay.

Pitch detune is evaluated on the 128-frame quantum clock; buffer playback uses
linear interpolation. This is approximate native AudioBufferSource parity,
not bit-identical browser resampling. The lowpass uses Web Audio's dB Q
interpretation ([Web Audio coefficient contract](https://www.w3.org/TR/webaudio/#BiquadFilterNode)).
No native executable or application-control workaround is used.

## Native boundary and host lifecycle

The source lease accepts both a direct native `Instrument` and a native piano
inside `WasmInstrument`. It captures actual native temperament/key frequencies,
envelopes and accepted filter settings. The old filter rejects frequency values
above 11 kHz: e.g. Felt Keys requests 15 kHz but actually uses 11 kHz. Accepted
settings are now retained separately from AudioParam.value, which can still
report a platform default on a sleeping or suspended node. Existing setters and
audible defaults are preserved.

The raw source enters `native.synthMix` before the existing shared compressor,
instrument processing, external rack, role mixer/sends and master. A separately
counted input hold wakes only the effects path, keeping legacy oscillators asleep.
Independent holds release once and allow the original effect tails to sleep
normally. Source/tuning changes invalidate the full private preview. Keyboard
and normal playback continue to use their existing implementation.

Shared native pitch/filter wander, vibrato and filter LFO are explicitly
unsupported by this first finite source lease. Non-lowpass voice filters are also
rejected. They must be ported or bridged before claiming whole-preset migration;
eligibility must never silently remove them. The fixed test host explicitly
disables voice wander without editing All's saved settings or defaults.

## Verification and next gate

Actual Wasm tests cover all five variants, off-quantum onset, irregular block
sizes, positive audio, exact save/reload/reset replay, pause, cancellation and
two independent handles in one memory. A real worker thread mixes two pianos,
core, FM and drums through the sidechain master: all eight buses are exact against
the serial executor. Five instrumented piano audits report zero render-time
allocation/reclamation or memory growth; the previous 30 audits also pass.

The broader regression run passes 489 tests / 70 files; a later targeted run
passes 88 tests / 5 files including direct-native capture and existing All and
Instrument behavior. Public package checks pass. See retained reports under
`reports/modular_audio/piano-*` for exact graph versions and browser results.

Final graph `d68f9dc21e528d44`, 348,821 bytes. Seven actual OfflineAudioContext
comparisons pass: four original presets, electric/upright recipe variants and
Felt Keys with its pitch envelope disabled. Maximum relative RMS error is
0.0012690086033075425 (0.1269%); minimum correlation 0.9999991948255997. The
zero-pitch acoustic control has maximum absolute error 4.470348358154297e-8 and
relative RMS error 9.474823546136483e-8. The remaining browser resampling error
is bounded by the explicit 0.5% RMS / 0.99998 correlation gate, not called exact.

The actual browser All-host batch passes all four cases, with matching captured
input hashes by material: 942,000-frame audition and 726,000-frame progression,
each on serial and a real worker. Worker delivery has zero underruns, late or
rejected blocks and bad recycles. Muted cases intentionally have zero analyser
peaks and never claim listening or wet-path acceptance.

A separate audible worker run completes all 942,000 frames with all six source
and channel peaks positive, master peak 0.15849483013153076, zero underruns/late
blocks, and `pass:true`. It includes three owned pianos on the direct native host
effects path, core, FM and Hand percussion. This establishes actual routed audio,
not a human listening verdict or isolated wet PCM equivalence.

`tools/piano-voice.html` is a fixed test surface. One button runs native-versus-
Rust dry voice comparisons; another runs four muted All-host cases (audition and
fixed progression, each serial and one worker). A separate listening button uses
the same six sources and 12 × 512-frame Message-task buffering. It creates an
isolated host and does not save All's song, sounds, mixer or test selections.

Next: collect the new mixed-piano phone listening verdict, then port the missing
shared piano voice modulation and native steal fade before broader normal/live
transport integration. Keep matched/table/measured/classic families distinct.
Phone lock-screen quality, physical listening and isolated wet PCM equivalence
remain separate gates; a counter pass does not establish any of them.

Final fixed-page check at375 CSS pixels: document width375, no horizontal scroll,
all four cases pass,909-character compact report, Copy UI success, and idle reload
with no audio players or report. `piano-fixed-page-browser.json` retains the
summary. Muted case verdicts now use the suite's checks, while audible acceptance
still requires its own positive audio evidence. Comparison players pause on Stop
and release blob URLs on rerun/exit. Native disposal guards prevent late sleep
callbacks or external-hold release from reviving disposed processing.31 targeted
lifecycle/controller/legacy tests and final public package build pass.
