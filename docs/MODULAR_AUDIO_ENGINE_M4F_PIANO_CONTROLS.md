# M4f: owned shared piano controls

2026-11-10. Continues M4e after the user's four-case phone report and explicit
"Checks pass and audio is clean" listening reply (commit5195e94). This slice
adds shared pitch/filter control snapshots; native voice-steal fades are next.

## Portable contract

`legacy.piano` v2 adds up to four immutable control snapshots to the existing
owned finite piano voice. V1 remains valid and cannot accept controls. Module and
configuration versions must match; the Rust ABI also rejects control edits on
v1 or after preparation. Each control targets pitch or filter and contains a
phase/frequency, initial/target depth, remaining exponential depth transition,
and bounded points. Sine points are future frequency changes; linear points
are the captured seeded random walk, covering the full120-second source budget.
Each control permits at most128 points. All arrays and mutable graph clocks
belong to their instance. Reset/save/reload replay independently and exactly.

Rust evaluates pitch controls at128-frame quantum boundaries and filter controls
per sample. Random-walk lookup is bounded binary search. No host clock, timer,
AudioNode, RNG closure or shared Wasm memory crosses into the render callback.
Preparation copies the native walk's history and advances a separate RNG to
obtain its future knots; it never consumes or changes the live walk's future.

This is a finite frozen snapshot with a new graph clock, not continuation of a
running keyboard voice or synchronization with subsequent native control edits.
Source leases compare settings and actual pitch wiring, excluding advancing
phase/depth values, so a frozen preview is stable but changed settings invalidate
it. Future native UI/timer changes are outside the captured owner. Normal native
controls, keyboard and defaults remain on their existing implementation.

## Native boundaries found and preserved

Sine phase follows actual voice-control reachability: disconnected sleeping
voices stop pulling their sine oscillators. Metadata tracks awake intervals and
the first input quantum. K-rate detune pulls its control for the entire first
quantum, including the samples before a source's within-block onset. Frequency
changes made through the existing oscillator helper retain its1ms scheduling
offset. Sleeping controls capture their accepted rate and frozen phase rather
than an unprocessed AudioParam default or fictitious elapsed host-time phase.

Native initial piano vibrato has a wiring quirk: with a nonzero initial preset,
the global vibrato connection may already be marked active while buffer-source
pitch wiring is still off. A later off/on edit connects the buffers. Capture
follows the actual uniform per-voice wiring; it does not silently fix that saved
preset. Nonuniform pitch wiring and non-lowpass voice filters remain rejected.

The dry comparison uses a1024-frame native origin after context startup, captures
the native state there, and schedules identical relative notes from that origin.
Cold, already-running and initially-unwired controls are tested separately. It
does not add a probe fanout that would wake an otherwise sleeping oscillator and
thereby change the native phase being measured.

## Verification

Thirteen actual native-versus-Rust dry comparisons pass on graph
`e904b017d4f34cd9` (352592bytes): the seven previous cases plus initial wiring,
live-edited vibrato/filter LFO, warm vibrato/filter LFO, sine wander, Brownian
wander and smoothed Brownian wander. New vibrato cases have relative RMS error
about1.1e-6; sine wander about1.44e-7; Brownian about9.18e-5 and smoothed Brownian
about7.79e-4. The existing explicit0.5% RMS/0.99998 correlation gate is unchanged.
The seven baseline cases retain their earlier approximate SRC tolerance.
See `piano-native-modulation-browser.json` for all metrics and controls present.

Unit/Wasm tests cover phase holds/resume, the k-rate activation quantum, delayed
rate events, independent walk clones, source invalidation, version and bounds,
block-independent control PCM, save/reload/reset and real-worker exact eight-bus
output with two differently modulated pianos, core, FM, drums and sidechain master.
The broader run passes494 tests /70 files; subsequent focused checks cover the
final activation details. Previous30 allocation audits and seven piano audits
(five variants plus sine/walk controls) report zero render allocation,
reclamation or Wasm memory growth.

The fixed full-path page now enables sine wander on Rhythm, Brownian wander on
Pad, and live-edited vibrato/filter LFO on Bass. It still creates its own host,
uses the same presets and12-block worker buffering, and never changes All storage.
The four modulated full-path cases pass (942000-frame audition and726000-frame
captured progression, serial and actual worker). Worker underruns/late blocks are
zero. A separate942000-frame audible run reaches all six sources, channels and
the master with zero underruns; this is measured output, not a new phone listening
acceptance. Full-path and audible evidence use graph `e904b017d4f34cd9`.

Final graph `800313e1223adcff` (352592bytes) additionally accepts the actual native
random-walk endpoint `-1.2000000000000002`, one floating-point epsilon beyond the
nominal1.2 bound. All13 native comparisons pass again on this exact build;32 final
focused tests and all seven piano allocation audits pass. Public packaging passes.
Reports: `piano-modulation-full-path-browser.json`,
`piano-modulation-audible-browser.json`, and `piano-owned-voice-allocation.json`.

Next: port native pre-onset voice-steal fades with explicit prepared slot/lifetime
contracts and forced-polyphony native comparisons. V1/v2 still reject stealing;
live release/pedal/retune and unported matched/sample piano families remain outside
this finite slice. The phone's earlier clean M4e acceptance remains separate.

## Native pitch-envelope clock correction (2026-11-11)

The later plucked-source comparison exposed a distinct intrinsic BufferSource
pitch-envelope boundary that the original small2–3cent piano presets did not
stress. This is separate from the shared sine/walk input-control reachability
described above; those controls and their captures are unchanged.

An independent native AudioBufferSource ramp-position probe uses the actual
1024-frame creation/suspend origin and unchanged setValueAtTime,
setTargetAtTime/start/stop calls. Sixteen measured cases cover onsets37/128/6000/
30000, amounts300/-600cents and decay0.2/5seconds. Its saved BufferSource read
positions show that a fresh intrinsic detune target retains default0 during an
initial partial quantum. The first full absolute128-frame quantum receives the
exact initial amount, and the whole exponential target clock begins there.
The epoch is therefore `ceil(sourceStartFrame/128)*128`; merely zeroing the
partial quantum while aging from the exact onset is insufficient. Evidence:
`reports/modular_audio/plucked-native-pitch-probe.json` and the dedicated plucked
voice document. ConstantSource controls in that probe are not substituted for
the measured BufferSource cursor.

Before changing piano DSP, six actual piano dry-voice comparisons were added:
modal strike-only, acoustic Studio Grand and measured House Piano, each with
positive300cent/0.2s and negative600cent/5s pitch envelopes. Notes start at37,
128,6000 and30000 relative frames. `?suite=pitch` runs only this fixed subset;
the normal comparison batch includes it. All six failed on graph
`f3d4924f4fa41df1`, with worst relative RMS error1.0789777312125743. The original
failure JSON/PNG remain as `piano-native-pitch-before` evidence.

The precise correction in `piano/src/voice.rs` changes only the intrinsic pitch
target epoch and adds read-only first-slot cursor stat9 for regression checks.
It does not change native defaults, bank generation, envelopes, shared controls,
resampling, source wall-clock stops, filter state, body playback or stealing.
Sixteen permanent piano cursor tests compare against the saved independent
native ramp traces, within0.02sample encoded-Float32 measurement tolerance.

All six actual instrument comparisons now pass on graph `ea2845aeebac225a`:

| Native family / envelope | Before relative RMS | After relative RMS |
| --- | ---: | ---: |
| Modal +300c |0.3317535663|0.0003050086|
| Modal -600c |0.9225649440|0.0003918862|
| Acoustic +300c |0.3142798999|0.0001062433|
| Acoustic -600c |1.0789777312|0.0000211994|
| Measured +300c |0.3039228393|0.0000874369|
| Measured -600c |1.0119457145|0.0000231052|

Worst after-error is0.00039188623684348193 and lowest correlation is
0.9999999251524614. The original limits remain relative RMS below0.005 and
correlation above0.99998; no preset or tolerance was altered to make them pass.
After evidence: `reports/modular_audio/piano-native-pitch-after.json`/PNG.
The existing31-test piano DAG suite and51 focused native-cursor/plucked-graph
tests also pass, including all19 piano bank types, modulation, stealing,
independent owners, save/reload/reset and actual mixed serial/worker buses.
These are muted dry-voice/native timing checks, not new phone listening or
physical device deadline claims. Shared FX/default playback remain in place.
