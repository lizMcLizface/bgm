# DSP profiling — 18 October 2026

This is attribution of the current synth kernels before optimization. No DSP implementation, sound recipe, quality default, event ABI or generator backend changed. The normal Wasm artifacts are untouched.

## Method

- Sequential headless Chrome/155.0.8059.84 and firefox/158.0, Windows desktop, AMD Ryzen 9 3950X 16-Core Processor. Other user applications were not controlled.
- 43 controlled direct-kernel fixtures, 48 kHz, six seconds of audio per pass, one excluded validation/warm-up pass and five unprofiled production-module measurements. The table gives medians; JSON retains every run and range. Sources hold 16 notes unless a case says otherwise, with matched velocity/pitch lists. There are no note-offs in these held-source fixtures. Effects receive the same continuously generated deterministic stereo input and remain active.
- Source initialization, parameter setup and Wasm instantiation are outside the timed loop. Source timings include the JS-to-Wasm call per 128 frames but no PCM copying or metering. Effect timings include their required input copies; bypass cases expose that baseline. Larger-block fixtures change 128 to 2048 frames, rather than changing synthesis quality. They do not change the live callback size.
- Named release builds live only in .tmp/dsp-profile. They retain optimization/LTO and add symbols/line tables. All four have byte-identical Wasm code sections to the normal binaries. Every fixture also produced sample-identical named/production PCM in both browsers, finite output and the requested active voice count with zero late/drop/steal counters. The initial Chrome pass has 42 cases; the fractional-envelope addendum supplies the 43rd and its profile.
- Seven separate Chrome CPU profiles request 500 µs sampling. These measure already-warmed held rendering after one six-second pass; envelopes and effect state continue across subsequent passes. Unprofiled medians and sampled percentages are distinct. Inlining can charge work to the caller, inclusive percentages overlap, sampling overhead/OS scheduling add uncertainty, and the effective sample interval can exceed the requested interval. Firefox repeats timings and parity checks; it does not provide these CDP CPU samples.
- This harness intentionally bypasses Web Audio scheduling, MessagePorts, prepared native sources, UI and graphics. It attributes DSP cost; it is not an audio-thread CPU, latency, deadline, thermal or underrun measurement. Keep using the shared stress matrix for complete graphs. These different fixtures' absolute times must not be added to predict a preset's cost.

## Main findings

1. **Long fractional FM envelopes are an identifiable expensive path.** In Chrome, holding all six operator envelopes in a long 1.3-shaped attack/decay costs 4707.2 ms versus 1591.4 ms for the matching linear times (2.96×). Firefox agrees: 4857 versus 1682 ms (2.89×). The separately sampled fractional profile spends about 64% of active sampled time in libm powf. The quadratic case is much cheaper; it must not stand in for arbitrary curve values. This is a deliberately heavy all-operator envelope case, not an assertion that every recipe pays that multiplier. A single short curved attack has a much smaller exposure.
2. **The common per-note acoustic-colour stage is the other clear target.** In Chrome at the chosen mixes, air/bow, vowels and body each nearly double the plain subtractive fixture; all together cost 2.93× its baseline. Firefox measures 1.62–1.77× for the isolated textures and 2.25× combined. In the held subtractive-colour CPU profile, Colour::tick accounts for about 54% inclusive / 51% self of active samples. FM's all-colour fixture costs 1.72× plain FM. Its colour tick is inlined into Fm::render, so that percentage is not independently exposed in its stack.
3. **Active voices/operators/lanes drive plain source cost.** FM 8 → 16 → 32 voices and 1× → 2× → 4× scale roughly with the work requested. In the plain FM sample, more than 99% of active samples lie inside Fm::render. That identifies the render loop as the boundary; it does not prove which inlined operator instruction dominates. The subtractive dual-layer/four-unison fixture costs 5.18× its single-layer/single-lane baseline, rather than a full eightfold because some work is shared. Its lowpass_tick accounts for about 9.5% of active samples, with most other work in Engine::render.
4. **Caching coefficient refresh alone cannot explain most current colour cost.** Colour::refresh, including callees, is about 2.3% of the subtractive-colour sample and 3.3% of the FM-colour sample. Source review shows the per-band tick recomputes a reciprocal from unchanged coefficients each sample; caching that denominator is a concrete candidate inside the larger tick cost. This is a hypothesis for the optimization pass, not a measured speedup.
5. **Rooms and inserts are smaller per instance than these heavy per-note sources.** In Chrome, a 16-line room costs 139.9 ms / six seconds, eight lines 77.4 ms, and a twenty-second decay 141.6 ms. Decay length does not grow the active network. The complete insert chain costs 54.2 ms, versus 7.9 ms bypass including copies. Its Delay::tick is roughly half the sampled insert cost, but half of this small total is still much less than the expensive source paths. Multiple instances still add work.
6. **Bigger direct blocks did not provide a major win.** The 2048-frame variants differ only modestly from 128 here (and do not consistently improve both engines). This does not justify increasing live latency or weakening expression timing.

## Controlled timings

All values below render six seconds. Room settings use one room, inserts one stereo chain. Colour mixes and exact patches/notes/settings are preserved in JSON; comparisons are diagnostic settings, not matched timbre/loudness or hardware emulation.

| Case ID | Chrome ms | Firefox ms |
| --- | ---: | ---: |
| fm-base | 1669.2 | 1618.0 |
| fm-idle | 69.4 | 56.0 |
| fm-8 | 880.6 | 858.0 |
| fm-32 | 3200.8 | 3179.0 |
| fm-4op | 1157.9 | 1186.0 |
| fm-1x | 771.3 | 851.0 |
| fm-4x | 3050.5 | 3262.0 |
| fm-air | 2190.2 | 2466.0 |
| fm-vowel | 2185.4 | 2477.0 |
| fm-body | 2244.1 | 2513.0 |
| fm-colour | 2877.2 | 2928.0 |
| fm-expression | 1698.1 | 1657.0 |
| fm-long-linear | 1591.4 | 1682.0 |
| fm-long-curved | 1603.7 | 1700.0 |
| fm-block2048 | 1579.2 | 1672.0 |
| fm-long-fractional | 4707.2 | 4857.0 |
| core-base | 397.5 | 483.0 |
| core-idle | 19.6 | 24.0 |
| core-8 | 210.5 | 238.0 |
| core-32 | 770.9 | 900.0 |
| core-unison2 | 622.8 | 672.0 |
| core-unison4 | 1041.1 | 1179.0 |
| core-layer2 | 729.3 | 900.0 |
| core-lanes8 | 2057.7 | 2244.0 |
| core-ladder | 505.9 | 524.0 |
| core-dco | 383.8 | 370.0 |
| core-air | 788.9 | 857.0 |
| core-vowel | 791.1 | 782.0 |
| core-body | 804.3 | 857.0 |
| core-colour | 1163.0 | 1088.0 |
| core-expression | 471.5 | 491.0 |
| core-block2048 | 411.6 | 466.0 |
| room16 | 139.9 | 127.0 |
| room8 | 77.4 | 72.0 |
| room20 | 141.6 | 131.0 |
| room-bypass | 6.5 | 5.0 |
| insert-bypass | 7.9 | 9.0 |
| insert-saturation | 12.6 | 15.0 |
| insert-eq | 16.3 | 18.0 |
| insert-phaser | 14.0 | 17.0 |
| insert-flanger | 27.5 | 30.0 |
| insert-chorus | 27.9 | 30.0 |
| insert-all | 54.2 | 62.0 |

## Recommended optimization order

1. Investigate exact or bounded-error fractional envelope evaluation, separating default/linear/quadratic fast paths from arbitrary exponents. Any interpolation/table approximation needs explicit envelope-error bounds, curved-attack/release listening and block-size tests; changing the curve shape or disabling it is not a performance fix.
2. Optimize the shared acoustic tick: begin with coefficient-derived invariant arithmetic (especially the repeated band denominator), then examine disabled-band/noise-path work while preserving parameter smoothing, pressure, tail ownership and transition behavior. Require sample-exact comparisons for algebraically unchanged paths; measure the same cases again. Refresh caching is a secondary improvement given its small sampled share.
3. Profile/experiment further inside the plain FM operator and subtractive lane loops. Standalone control-rate math helpers occupy little of the plain FM sample, so caching frequency/scaling calculations alone should not be sold as the main win. Routing topology, repeated bounds/state work and loop specialization need deeper attribution; any change must preserve operation order/held edits and pass PCM/alias/legato checks. Current samples do not resolve enough inlined detail to promise a speedup from one instruction.
4. Re-run the existing complete mixed and boundary live/fluid cases after each meaningful improvement, then verify actual phones and longer audible Firefox sessions. Retain the approved 2× FM default. Chorus/delay/room micro-optimizations rank below the above hotspots for the tested loads.

## Validation

744 tests across 105 files, production build and source/artifact checks pass. Four new regressions cover fixture isolation, partial-block/input continuity, sample accounting and code-section hashing independent of debug metadata. Both browsers completed all 43 parity/timing cases without errors; seven Chrome CPU captures were saved. Existing build warnings remain.

## Reproduce and evidence

Start the dev server, then:

~~~powershell
npm run synth:profile-build
npm run audit:synth-profile
~~~

The build command requires the existing Rust/wasm32 toolchain and writes separate named artifacts; normal public binaries and Cargo profiles remain unchanged. SYNTH_PROFILE_DIR selects output. SYNTH_BROWSER=firefox plus SYNTH_BROWSER_PATH repeats the timings in Firefox. Options include --cases=id,id, --rate=48000, --seconds=6, --repeats=5, --profiles=id,id, --profile-ms=2500 and --no-samples. Run browsers sequentially and avoid simultaneous builds/benchmarks. Stale production/profile metadata is rejected.

Raw results: this task's outputs/dsp-profile/{chrome,firefox}.json, six Chrome .cpuprofile captures, and outputs/dsp-profile-extra/chrome.json plus the fractional-envelope .cpuprofile. The files can be retained/imported for later CPU-stack inspection; the JSON stores complete fixtures, source/build hashes, code-section identity, parity checks, timings, voice diagnostics and sampling summaries. Named builds are larger because of metadata, not a larger runtime DSP graph.

Phase: sound-engine performance validation. This profiling slice is complete; optimizations have not been applied. Direct next step: improve fractional-envelope and shared colour-tick costs with the above correctness constraints, repeat matched timings and complete-graph stress, then continue physical-device/thermal/listening validation before backend integration. Music-generation Phase 5 remains preset/listening evaluation; chip articulation is excluded.
