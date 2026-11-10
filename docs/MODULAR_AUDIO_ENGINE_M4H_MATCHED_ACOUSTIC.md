# M4h — six fitted acoustic piano variants

2026-11-10. Extends the existing portable acoustic renderer with Ambient, Glass,
Drama, Soft, Subdued and Concert. These are six fitted shapes on the same acoustic
algorithm, not six newly substituted synth engines. Existing kind codes0–4 stay;
the new shapes occupy5–10. Unknown and calibrated kinds still fail closed.

The Rust renderer now preserves fitted bass darkening, fundamental attenuation,
seeded per-partial ripple and low-string stiffness, alongside each shape's hammer,
loss, decay, unison, body and action-noise parameters. Ripple has its own note-owned
random generator. The old three acoustic shapes retain neutral shaping values.
The normal preparation policy remains opt-in; original JS defaults/cache namespaces
and fallback diagnostics remain. Matched strikes use no invented looping body.

Both opt-in native preparation and prepared graph banks accept all six variants.
The existing modulation, slot ownership, pre-onset stealing and persistence
contracts apply unchanged. Read-only fitted constants are portable; all synthesis
and playback state remains instance-owned. Host FX/mixer and unported families
retain their existing implementations.

Preparation Wasm b8a432b4637a68b5 is50306bytes; graph67531999ec42dded is356798bytes.
The expanded preparation audit passes582 strikes (360 fitted-shape cases), with
414 bit-exact strikes and maximum absolute error2.9802322387695312e-8. All108
modal held bodies remain bit-exact. The fitted matrix spans8/24/44.1/48/96/192kHz,
five registers including low bass and the shaping fade-out, varied controls,
maximum unsigned seed, soundboard and wear. See piano-rust-compatibility.json.

All24 native-versus-Rust dry voice comparisons pass, including the six actual
matched presets one octave below the usual diagnostic notes. Matched relative RMS
errors range0.000757–0.002233, within the unchanged0.005/.99998 correlation gates.
See piano-native-matched-browser.json. This is approximate native SRC parity,
not isolated wet PCM equivalence or physical listening.

Tests cover all six prepared graph variants with exact save/reload/reset and
irregular render blocks, independent preparation handles/instances, source capture,
no held body, and the worker preparation dispatch. A real worker publishes exact
eight-bus PCM for modulated Ambient/Concert plus core/FM/drums and the sidechain
master, including prepared stealing.30 existing and14 piano allocation audits
report zero render allocation/reclamation or memory growth.

The isolated fixed page profile is piano-matched-controls-steals-v1: Ambient on
Rhythm (one slot), Soft on Pad (two), Concert on Bass, plus core/FM/Hand. It retains
the fixed modulation and forced-stealing progression. All storage/defaults stay
unchanged. Full-path results and next work are recorded in the handoff.

All four full-path cases pass (942000/726000 frames, serial/worker), including
three actual Rhythm steals in each progression. Worker gaps/late blocks are zero.
The separate audible726000-frame progression has positive peaks on all six
sources/channels and master0.10635 with zero gaps. Evidence is in
piano-matched-{full-path,audible}-browser.json. The broad run verifies534 tests;
one obsolete UI-copy assertion is removed and all11 final focused checks pass.
No functional or numerical tolerance is relaxed. Public packaging passes.

The user's clean phone acceptance is retained for the preceding M4g profile;
it is not relabelled as matched-piano acceptance. Continue the measured-table
family after local verification rather than requesting another tiny checkpoint.
