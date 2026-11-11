# Owned measured-string preparation

This standalone crate ports the actual measured cello table/model and realtime
preparation algorithms. It is separate from the generator Karplus–Strong source,
Iowa preparation, modal/acoustic piano banks and the native oscillator/FM voice.
No player, Graph descriptor, All route or default backend changes here.

## Actual source scope

The numeric reference is `stringModel/model.js`, `sourceFilter.js`, `tuning.js`,
`realtime.js`, `synth.js`'s release/wake/convolution helpers and the exact FFT in
`pianoModel/dsp.js`. All four original tables remain the source of measurements:
Cello Long, Live, Short and Pizzicato. Each has49 pitches from36 to84, three
measured strength identities40/80/127, up to186 cells, seven24-point envelope
rows, ten release times and seven25-band bed rows. The two bowed tables also
hold925 fine-body points.

The port preserves actual missing data: Short lacks40-strength rows at74–77
and84. Level/shape pooling skips missing layers; envelope/onset fallback follows
the original available-layer selection. No measurements are manufactured.
Nullable cells in envelope, release and bed rows keep the original null blending.

Implemented preparation includes:

- `modelFor`: absolute-frequency pooling, low-harmonic correction, low noise,
  level/strength interpolation, vibrato and nullable envelope/release/bed fields.
- All three source-filter fit identities (`tilt`, `source`, `both`): original
  observations, normal-equation update order, regularization and Cholesky solve.
- Tuned full/smooth/residual model arithmetic and metadata overrides.
- Realtime bright/dark4096-sample tables: original body division, harmonic cap,
  seeded per-note phases, oscillator recurrence and **each f32 accumulation**.
- Original measured release curve and fixed reference-level gain.
- Body curve,65536-point minimum-phase body IR, seeded wake IR and the original
  FFT convolution/truncation, as distinct immutable preparation outputs.

Realtime `phase:'pulse'` and `'minimum'` both use zero harmonic phases in the
actual `realtime.js`; this behavior is preserved. The offline renderer's
minimum-phase harmonic path is a different algorithm and is not substituted.
Short/Pizzicato's actual player uses `renderDecay`, which remains a separate
port. Matching their numeric table preparation does not replace that player
with the bowed realtime voice. `renderSustained`'s long offline buffers also
remain outside this slice.

## API and ownership

New crate: `synth-engine/string-preparation`. Adapter:
`src/modular-audio/ownedStringPreparation.js`.

`MeasuredStringTable(engine, raw)` owns a detached, frozen complete table and
an immutable Rust resource. It exposes `modelFor`, `fitLayer`, `tunedModel`,
`bodyValue`, `bodyImpulse`, `realtimeBank`, `referenceGain`, `save` and idempotent
`dispose`. Each returned array/object is detached from Wasm memory and remains
valid after the resource is disposed. Fit caches belong to that resource;
there is no global current table or global scratch switching.

`createRustStringPreparation(module)` creates independent memory and exposes
`createTable` and `prepare`. `loadStringPreparation()` caches verified compiled
code, then creates fresh instance state. Default assets are
`public/string-preparation/{prepare.wasm,build.json}` after explicit publication.

`measuredStringPreparationSpec(table, rate, tuning, notes)` stores version1,
the full actual numeric table, complete tuning and up to128 uniquely identified
`{id,midi,velocity}` requests. Here velocity uses measured1–127 units. The
`save/load/validateMeasuredStringPreparationSpec` helpers preserve that full
configuration. `prepareMeasuredStringSpec` returns the separate body IR,
reference gain and bright/dark/release/vibrato banks. Save/reload means
deterministic re-preparation, not an AudioContext or active-voice snapshot.

Input limits are checked before unbounded allocation:64 pitches, at most three
recognized strength identities with each represented somewhere,256 cells per
layer,64 envelope/release time points, seven matched envelope/release rows,
16×32 bed maximum,16 vibrato depths with consistent dimensions,2048 fine-body
points,200 model harmonics,4MiB bounded numeric upload and16MiB JSON limit.
Actual optional metadata is bounded and preserved; unknown fields fail closed.
Raw model requests permit custom f0 at10–12000Hz. Tuned/realtime requests cover
MIDI24–96 and sample rates8000–192000Hz. Body/wake requests retain the actual
native65536-point cap and allow the UI's0.05–1.2s wake range. Nonfinite prepared
IR output is rejected. Preparation intentionally allocates off the callback;
this crate does not make a zero-allocation rendering claim.

The numeric ABI has explicit upload/seal/free and prepared-output lifetimes.
Prepared models retain their originating resource identity; another resource
cannot accidentally consume them to prepare a different body/table combination.
The adapter copies data before freeing temporary output handles. Upload views
are valid only before sealing; output views are valid only before their free.

## Reference proof

```
node tools/buildStringPreparation.mjs
npm.cmd exec -- vite-node tools/auditStringPreparation.mjs
npm.cmd test -- --run src/modular-audio/ownedStringPreparation.test.js
node tools/buildStringPreparation.mjs --check
```

`--publish` writes only this standalone asset directory. Source provenance hashes
the crate/lock/adapter, all actual reference algorithms and all four full tables.
The actual realtime methods run against a detached buffer destination in the
reference harness; no browser audio routing is replaced to obtain numeric proof.

The expanded reference matrix passes576 raw-model cases (maximum field error
5.684341886080802e-14),36 full fit comparisons bit exactly,144 tuned models
(maximum field error8.810729923425242e-13),120 realtime bank cases across six
rates/four tables bit exactly for both bright/dark f32 arrays, and72 body/wake
IR cases. Final build is `75424d620f95653a`,87874bytes. Of the72 IR cases,
20 are bit exact; worst sample error is3.637978807091713e-12, worst relative
RMS9.965171565107063e-12, and worst body-curve error7.105427357601002e-15dB.
The largest prepared IR is327680 samples, preserving the original truncation.
Declared limits are1e-9 numeric-field error and1e-7 maximum PCM/
relative RMS error. No limit was widened. The final run's exact build/hash and
per-case IR differences are recorded in
`reports/modular_audio/string-owned-preparation.json`. Seventeen permanent
checks cover actual tables, missing rows, fits, six-rate PCM, body/wake,
independent complete save/reload, detached ownership and raw/schema bounds.

## Next independent gate

The original realtime dry worklet has24 voices, a shared per-instance LCG and
unseeded `Math.random` only for each note's initial LFO phase. A reproducible
owned source must capture that actual phase explicitly or reject a missing
capture. It must not invent a seed and claim it reproduces an existing voice.
The shared noise RNG advances **voice-major over a complete128-frame callback**,
so canonical128-frame processing is necessary when an executor requests other
block sizes. Original start/off/panic messages have no timestamps; faithful
captured import uses their actual callback boundaries.

The dry mono sum then enters one native `ConvolverNode` with `normalize=false`
and the original master gain. This preparation ports the numeric IR; it does
not port native convolution execution, its routing, cache lifetime or message
delivery. Dry voice/phase/ownership tests and an explicit native convolution
comparison remain separate before any physical source adoption.
