# M4k — portable Iowa preparation

2026-11-10 overnight run. `synth-engine/iowa-preparation` now owns the complete
numeric path from measured Iowa/VSCO tables to the immutable Held/Decay specs
consumed by M4j. It covers raw take filtering/level settling, register smoothing,
softening, pitch and twelve-layer velocity blending, held wavetable FFT/morph
tables, seeded noise/burst and decay partial/envelope preparation. All original
45 patches use their real tables and metadata. No replacement preset is used.

This is a separate preparation crate and Wasm memory, outside realtime render.
Owned table and prepared-note handles are bounded and explicitly disposed.
Immutable compiled code can be cached; mutable tables, scratch, outputs and RNG
remain per renderer. Raw-table and already-settled capture modes are explicit,
so the actual All player table is not settled twice. The adapter only serializes
numeric inputs/outputs; it calls no original JS model/FFT preparation function.

The existing native player remains unchanged. Opt-in owned All previews and
their four-case test suite now prepare Iowa banks through this Rust backend.
Each compile uploads its captured table once, prepares its distinct note layers,
copies complete numeric banks into the plan, and frees preparation state. Saved
graphs remain self-contained. Source plans record the preparation engine version.
The pure JS compiler remains available as the reference/fallback boundary.
Existing non-Iowa preview cancellation timing is preserved.

Build `6e0c2bcde51edac3`,115,926bytes. Rust/Wasm/adapter/PATCHES metadata
provenance is checked by `iowa:check`, included in normal/public build checks.
`iowa-preparation-compatibility.json` records405 raw-table cases across45 patches,
44.1/48/96kHz and three measured registers/strengths.282 are bit-exact; maximum
numeric field difference1.3877787807814457e-17, scalar difference0. Raw-vs-settled
capture output is exact. Original long measured Vibraphone input duration is
accepted before preserving the original eight-second output clamp.

18 preparation tests cover six rates, fractional pitch, vibrato, max-u32 seeds,
independent handles/lifetimes, ABI/resource guards and bank→owned graph→save/load
replay for held/decay/roll. Four additional compile-boundary tests verify owned
preparation injection and cleanup on errors. The final integration/controller
run passes47 tests in4 files (1.87s). Native all-targets compilation was checked;
no blocked native executable was run.

Full-path browser verification of this preparation integration is pending the
overnight combined desktop check, and is not relabelled from M4j's earlier
browser/phone evidence. The current worktree also contains independent parallel
effects/mixer/classic work; normal public build is verified at their integration
checkpoint rather than claiming an unrelated unfinished source tree is green.

Next: owned classic wave-table resources and the effects/mixer graph integration.
Live expression, hot topology edits, default backend migration and cables remain
separate. There is no per-preset phone acceptance gate.
