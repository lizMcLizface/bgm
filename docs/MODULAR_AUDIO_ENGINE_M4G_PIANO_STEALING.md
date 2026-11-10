# M4g — prepared native piano voice stealing

2026-11-10. Extends M4e/M4f without changing native playback or All defaults.

## Contract and behavior

`legacy.piano` module/configuration v3 adds explicit immutable per-note `voice`,
`onsetFrame`, nullable `fadeFrame` and `cutFrame`. V1/v2 remain compatible and
continue to reject stealing. V3 retains v2's optional shared controls.

Finite compilation follows the native allocator: choose a free slot round-robin;
otherwise steal the earliest scheduled release (lowest index breaks ties), without
advancing the next-free cursor. A stolen note holds its interpolated gain at
480 frames before the replacement onset, targets zero with a96-frame time
constant, then stops at the replacement onset. The replacement resets owned
source cursors while retaining that slot's filter state. All times are at48 kHz.
The actual replacement counter is exposed through the existing pitched stats.

The ABI accepts lifetimes only for unprepared v3 modules. JS and Rust reject
invalid bounds, overlapping slot lifetimes, mismatched trigger onsets and missing
lifetimes. Serialized state contains no PCM or host references. Preparation owns
all buffers; render, pause, reset, cancellation and panic allocate/reclaim nothing.

These are prepared finite lifetimes. Cancelling a future owner's trigger does
not rewrite an earlier owner's already-prepared fade. Reset retains the prepared
timeline; a fresh compilation is required to change it. Live stealing and edits
after capture remain outside this contract.

## Explicit limits

Same-slot steals less than10 ms apart are rejected, including oversized chords.
Native `cancelAndHoldAtTime` can then cancel an earlier attack before it begins;
support requires a complete per-slot scheduled automation timeline. The exact
10 ms boundary is supported and tested. Native scheduling that occurs too late
to provide the full fade is not represented by this finite prepared slice.

The reference is Chrome Web Audio with `cancelAndHoldAtTime`; the native Firefox
fallback is not a separate parity claim. Native SRC is still approximated by the
owned linear resampler. Live release/pedal/retune and matched acoustic,
calibrated/Iowa/classic piano adapters remain unported.

## Verification

Graph `7f5888b007e0c3b2` (355135bytes) passes18 native dry comparisons. The five
new cases cover one-slot modal stealing, two-slot acoustic stealing, modulated
stealing, a slow-attack interruption and the exact10 ms boundary. Their relative
RMS errors are approximately7.31e-5,0.002504,1.24e-7,3.85e-7 and7.07e-5. All meet
the unchanged0.005 RMS /0.99998 correlation gates. Expected actual steal counts
are3/1/3/3/3. See `reports/modular_audio/piano-native-stealing-browser.json`.

483 tests /67 files pass in the broad modular/All/control regression run. A final
focused run also checks native cursor selection after stealing. Owned playback
tests cover one/two slots, exact save/reload/reset and irregular block rendering,
independent handles/owners, cancellation and rejected schemas. A real worker
publishes exact eight-bus PCM with a stealing/modulated piano, a second modulated
piano, core, FM, drums and the sidechain master.30 existing and8 piano allocation
audits report zero render allocation/reclamation or Wasm memory growth.

The fixed `/tools/piano-voice.html` profile (`piano-controls-steals-v1`) adds
one-voice Rhythm and two-voice Pad. The captured progression books Rhythm every
half second to force stealing. Its muted batch checks both serial and actual
worker paths; compact reports include piano steal counts. The separate
“Listen to stealing stress” button plays this progression with12-block worker
buffering, without navigating All or matching settings. Existing audition stays.

All four browser full-path cases pass:942000-frame audition and726000-frame
progression, each serial/worker. Both progression cases execute three Rhythm
steals. Worker underruns and late blocks are zero. A separate audible progression
also completes726000 frames, three steals and zero underruns, with all six
source/channel peaks positive and master peak0.16128. See
`piano-stealing-full-path-browser.json` and `piano-stealing-audible-browser.json`.
The final focused run passes17 tests; public packaging and provenance checks pass.

Next is the combined modulation/stealing phone listening gate, then matched
acoustic preparation. Earlier M4e phone listening acceptance does not imply
acceptance of this expanded profile. Portable effects/mixer migration and other
families remain later work; existing native/legacy paths are operational.
