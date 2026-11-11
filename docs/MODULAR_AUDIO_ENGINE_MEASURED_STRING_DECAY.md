# Owned measured-string Short and Pizzicato preparation

This standalone slice ports the actual finite `StringPlayer` Short/Pizzicato path into portable Rust. It preserves the original measured tables, tuning, deterministic note seed, rendered wake and native reference-level gain. Existing players, Graph, All routing and default audio backends are unchanged.

## Actual source boundary

The reference is `src/app/engine/stringModel/{player,model,tuning,synth,analysis,render.worker}.js` and the FFT in `pianoModel/dsp.js`. Short and Pizzicato use `renderDecay`, then apply the patch's reference-level gain, copy the result into a mono AudioBuffer and play it through unity per-note/master gains. Note-off does nothing for these finite buffers. The bowed realtime body's native convolver is not part of this route.

The renderer includes the actual seven-band envelope interpolation and nullable-band fallback, 170.7 ms spectral normalization, harmonic pruning and float32 gain grids, Chebyshev tonal synthesis, all three offline phase modes, line flares, periodic/low noise, shaped seven-stretch noise bed, fast noise floor, ongoing xorshift32 wake convolution, 150 ms ending fade and 4 ms onset fade. Offline minimum phase uses the original 16,384-point cepstrum; the separate realtime phase behavior must not be substituted. The original 12 kHz harmonic-count limit also remains at low sample rates.

The original velocity cache can produce strength 0 or 126: `round(clamp(velocity*127,1,127)/6)*6`. Exact mode instead produces 1..127. Pitch is clamped to 36..84, or 24..84 for smooth material, exactly as `StringPlayer.start` does. Saved specs retain requested pitch/velocity, actual cached strength, fractional seed input and normalized uint32 seed. The frozen model-preparation ABI accepts strengths 1..127; its strength-1 model is mathematically identical to strength 0 because both use the same original lower measured strength. Only that metadata is restored to 0; the note RNG still uses the actual cache-0 seed. A permanent test compares the two original JS models field-for-field with zero difference.

`without` removes the requested measured pitch only while preparing the note model. Reference-level gain still comes from the full original table. Complete actual patch tuning is supplied in comparisons; no replacement measurement data or revised presets are used.

## Ownership, memory and lifecycle

The new crate is `synth-engine/string-decay`; it reuses the frozen `string-preparation/src/fft.rs` read-only. All DSP state and samples belong to their preparation/player handles. The only shared mutable value is a PCM-byte reservation counter within one Wasm memory, not a signal resource or RNG.

Preparation validates a bounded numeric packet before heavy FFT allocation: 8..192 kHz, 0.2..4 seconds, at most 200 harmonics, seven envelope rows with at most 64 time points, a bed of at most 16 rows by 32 bands, bounded controls, and at least two harmonics for minimum phase. Noise negative infinity retains its original zero-power meaning. The maximum mono buffer is 768,000 float32 samples. Aggregate immutable PCM reservations are limited to 64 MiB per Wasm memory. The calculated logical preparation workspace is separately limited to 64 MiB before expensive allocation. This is a preparation-workspace estimate, not a claim that the complete Wasm heap or host copies fit within 64 MiB.

To avoid keeping every flare buffer, preparation records its actual starting RNG state while advancing the main stream by the exact original draw count. It later regenerates one flare at a time from that snapshot and checks its final state. Tonal phase draws, later noise and wake remain on the original main stream. Complete PCM and final RNG proofs cover this optimization.

Preparation and copying allocate off the audio callback. `createRustStringDecay` owns a reusable preparation instance; each `createPlayer` uses a fresh slim Wasm instance and owns a sealed PCM copy, avoiding retention of that preparation heap in each voice. The fixed player renders 0..2,048 frames to owned stereo buffers (identical mono channels), zero-fills after EOF, and continues its monotonic consumed-frame counter. Reset rewinds to frame 0 without allocation, freeing or memory growth. Disposal releases its PCM reservation. Call `refresh()` after externally growing a shared Wasm memory; render rejects stale views.

This is fixed-buffer playback at the prepared sample rate. Timestamped multi-note scheduling, voice stealing, resampling, Graph registration, worker-pool adoption and default live capture remain subsequent integration tasks.

## API and persistence

`stringDecayConfig.js` provides `nativeStringDecayKey`, `stringDecaySpec`, `validateStringDecaySpec`, `saveStringDecaySpec` and `loadStringDecaySpec`. Version 1 `measured-string.decay` specs contain the complete original table, complete tuning, sample rate, request, cache/seed identity, omission, duration and floor. Load revalidates all fields and recomputes the expected native key/seed; incomplete tuning and unknown fields fail closed. Saved JSON is bounded to 20 MiB.

`ownedStringDecay.js` provides:

- `renderStringDecayModel(engine, model, rate, options)` for already-prepared actual models, returning detached samples and preparation/RNG statistics.
- `prepareStringDecay(engine, preparationEngine, spec)` for complete table/tuning specs, returning version 1 `measured-string.decay-prepared` resources.
- `OwnedStringDecayPlayer(engine, samples, sampleRate)` with `render`, `reset`, `refresh`, `frame` and `dispose`.
- `createRustStringDecay(module, preparationEngine)` with `prepare`, `createPlayer`, `preparePlayer` and `dispose`.
- `loadOwnedStringDecay()` for hash-verified private assets, pinned to the accepted preparation build.

Rust ABI version 1 exports preparation `string_decay_new/input/prepare/samples/stat/free`, fixed-player `string_decay_player_new/input/seal/render/reset/frame/output/free`, and `string_decay_owned_bytes`. Audit builds additionally expose allocation watch/count. Preparation stats include frames, final RNG state, semantic draw count, initial RNG state, reference gain, rate, duration and logical workspace bytes.

## Verification at 2026-11-11 08:00 UTC

Production build `4ba147459341ae53` is 64,750 bytes; audited build `2a6017c00760d13f` is 77,428 bytes. Both pin preparation `75424d620f95653a`. Source, unchanged JS reference, adapter, preparation and binary hashes are in the build manifest; private published assets are `public/string-decay/{decay.wasm,build.json}`.

The full compatibility matrix passes 60 cases: Short/Pizzicato, 8/24/44.1/48/96/192 kHz, five profiles each, and four seconds per note (16,484,000 total frames). Profiles cover cache strength 0, fractional pitch, exact 127, nonexact 126, all phase modes, missing-pitch interpolation, smooth/residual material, tilt/evenness extremes, flare/bed/noise and wake variations. Thirty cases are bit exact; worst maximum error is 3.637978807091713e-12 and worst relative RMS is 8.659888228788433e-13. Original predeclared maximum/RMS limits remain 1e-7.

The RNG observer wraps the original JS closure, returning each original draw unchanged. Its complete PCM matches a direct unchanged `renderDecay` import bit exactly in every case. Rust's initial/final xorshift state and semantic draw count match that observer exactly. All 60 complete saved specs reprepare exact identical PCM.

The audited 60-case playback matrix passes with two independent fixed players, arbitrary 113-frame partitions, EOF and reset: zero allocation/reclamation calls and no memory growth while watched. Maximum logical preparation workspace is 55,042,360 bytes. Maximum playback Wasm memory for the two slim players is 7,340,032 bytes, excluding the separate preparation instance and host copies. Seventeen focused permanent tests pass against both production and allocation-audited Wasm, including malformed specs/model packets, cache/seed mismatch, aggregate PCM budget rejection and reservation release.

Evidence: `reports/modular_audio/string-decay-owned-compatibility.json` and `string-decay-owned-allocation.json`.

Commands (run from repository root; builds need authorized write access):

```text
node tools/buildOwnedStringDecay.mjs
node tools/buildOwnedStringDecay.mjs --audit
node tools/auditOwnedStringDecay.mjs
node tools/auditOwnedStringDecay.mjs --allocation
npm.cmd exec -- vitest run src/modular-audio/ownedStringDecay.test.js
node tools/buildOwnedStringDecay.mjs --publish
node tools/buildOwnedStringDecay.mjs --check --publish
```

For the audited permanent tests set `STRING_DECAY_WASM=.tmp/string-decay-audit/decay.wasm` before the same Vitest command. The full reference matrix intentionally runs separately from the small permanent test suite.

## Actual browser gate

`tools/string-decay.html` and `stringDecayReview.js` provide a fixed, settings-free actual native comparison: two tables across the six rates, native `StringPlayer.start` against two independent owned AudioWorklet players, the second re-prepared from the complete saved spec. All start at exact frame 1,024. The batch checks prepared and rendered PCM at the unchanged 1e-7 limits, exact independent/saved replay, prefix/EOF silence, cache identity and callback completion clocks. The worklet performs only owned fixed-buffer playback; no fitting/FFT runs in `process()`.

Full JSON is available in readonly DOM field `#report` and Download full report; `#result` is compact. Revision is `string-decay-native-v1`. Optional listening plays one Pizzicato note at gain 0.35. Actual built-in browser acceptance passes all 12 cases on production `4ba147459341ae53`: Short/Pizzicato across all six rates, including the cache-0, exact-127, nonexact-126, fractional-pitch, missing/smooth and residual profiles described above. Worst prepared and rendered sample error is 1.8189894035458565e-12; worst relative RMS is 8.080312178920371e-13. Exact start/completion clocks, saved re-preparation, independent players, prefix/EOF silence and cache identity pass. Original 1e-7 maximum/RMS limits remain unchanged. Evidence is `reports/modular_audio/string-decay-native-first.json` and its PNG. No phone listening acceptance or default player change is claimed.

The next integration task is a finite measured-string source contract with owner/timestamp routing, immutable prepared-bank identity, bounded voice allocation and exact native finite note-off behavior. Keep this distinct from the pending Graph bowed-string source and its separate native-body/convolution path.
