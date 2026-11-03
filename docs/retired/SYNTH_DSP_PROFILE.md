# DSP profiling — 18 October 2026

Latest checkpoint: an opt-in bounded Rust/Wasm percussion source and separate 808-inspired kit now replace future native drum graphs with queued events. Native remains the default. See the final checkpoint for sound/cancellation gates, measured complete-graph costs and physical-device limits. Earlier checkpoints and the initial DSP baseline below are historical.

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

## Low-power Chrome follow-up — 19 October 2026

Reported devices: Pixel 8 and Surface Pro 6 / i7-8650U / 16 GB, both Chrome. The Surface is borderline in the foreground; the Pixel is worse when locked. Measurements below are still from the desktop Ryzen 3950X, **not those devices**.

### Shipped changes

- Exact-silence FM fast path: an empty instrument with no event due in the block skips the repeated voice scan. An exactly empty FIR/DC state skips zero convolution until the first nonzero sample. Clock, smooth parameters, LFO phases, FIR position, headroom state and event boundaries continue advancing. There is no new silence threshold or tail truncation. The `fm_idle_mode(0)` audit export retains the original path for regression comparisons; normal worklets use the optimized default.
- The existing Light reverb preference now reaches Wasm instruments in the main page **and labs**. Mobile already defaults to Light. It selects 8 rather than 16 FDN lines, preserving requested decay, stereo width, sends, private room ownership and per-instrument delays. Exported/designed patches are unchanged. This reduces room processing, not its allocated buffer footprint.
- **Wasm synthesis → Economy** is an explicit, saved device option in the main Audio/Performance menu and lab Keyboard & settings → Audio performance. It caps FM at 1×. Full remains the default and keeps the patch's requested quality (usually the approved 2×). Economy can increase aliasing on bright/high notes and can alter texture; it is not claimed to sound identical. Changes use the existing patch-transition path immediately without replacing the source, releasing held keys or reconnecting MIDI. Subsequent expression/wander edits keep the cap; choosing Full restores designed quality. Offline renders capture their quality on creation.
- The lab arpeggiator now shares the main transport's Worker-based ticker. Hidden tabs book up to four seconds ahead, bounded by chord size/event count and a short scheduling time budget. Visibility changes refill the window immediately. Blur still releases manual inputs, but does not panic a running captured/latching arpeggio. Stale ticks rebase without replaying missed notes. This addresses ordinary timer throttling, not operating-system suspension or an arbitrarily frozen page. The main transport's existing longer hidden lookahead is unchanged.

### Results and limits

Six alternating before/after direct-kernel runs, 48 kHz, two audio seconds per run: empty FM median **19.0 → 2.5 ms** (87% less work). Busy plain/coloured FM and Air Choir remain within roughly ±2% in the same run; this is **not a busy-voice speedup**. Both Chrome and Firefox also pass 100 captured before/after fixture comparisons with zero sample differences. The permanent reference-path regression covers 44.1/48/96 kHz, all FM quality tiers, delayed starts, glides, live quality changes, panic, ringing output and different render block sizes with byte-identical PCM.

Actual seeded native-showcase exports, 24 audio seconds, 48 kHz, one warm-up per mode and three alternating measured repetitions per mode:

| Preset | Full / 16 lines | Full / 8 lines | Economy / 8 lines | Combined wall-time reduction |
| --- | ---: | ---: | ---: | ---: |
| Glass Conservatory | 4,151 ms | 3,890 ms | 3,497 ms | 16% |
| Tine and Tide | 7,341 ms | 6,732 ms | 5,331 ms | 27% |
| Lantern Circuit | 8,943 ms | 8,286 ms | 6,909 ms | 23% |

These mode comparisons preceded the idle optimization. A separate Full/16-line repeat after it gave 3,876 / 7,103 / 8,997 ms respectively. The quiet opening benefits; the busy result does not establish an improvement. Do not combine percentages from separate runs. Exports include composition, preparation, native processing, Wasm sources/effects, progress suspension/resumption and PCM packing; they do not measure audio-thread CPU, hardware underruns or sustained physical-phone headroom. All outputs remained non-silent and bounded. Glass Conservatory's quiet opening does not exercise every FM voice audibly.

Coefficient caching, cached band reciprocals, sparse FM routing and additional scalar fast paths were tried against retained kernels. The alternating timings did not show a sufficiently reliable overall gain and some configurations regressed; these experiments were removed. Fractional envelopes and busy acoustic/FM voices remain optimization targets.

Reproduce complete graphs with the dev server running:

```powershell
npm run audit:wasm-playback -- --seconds=24 --repeats=3
```

`SYNTH_LAB_URL`, `SYNTH_BROWSER_PATH` and `SYNTH_AUDIT_DIR` select the server, Chrome executable and report directory. `--presets=tine-and-tide` narrows the suite. The report retains build identities, protocol, individual runs, level checks and environment. For direct attribution use the earlier profiler instructions and rebuild named artifacts first. Do not run timings alongside other heavy tests/builds.

Local evidence under this task's `outputs/`: `performance-ab.json`, `performance-graphs-before-idle.json`, `performance-graphs-after-idle.json`, `performance-parity-{chrome,firefox}.json`, `performance-ui-{dev,production}.json`, and `playback-tool-smoke/chrome.json`. The baseline kernels are retained in the repository's ignored `.tmp/performance-before/` and correspond to release dd66803. Intermediate experiment results in `performance-before/` and `performance-after/` are not the final shipped optimization.

Validation: 827 tests / 128 files, production build and source/artifact checks pass; Chrome development/production controls, live held-note switching, wander policy, navigation persistence and narrow layout pass. A Pixel user-agent check confirms Light rooms with original 2× FM by default; it is not a Pixel performance test. Existing ambience chunking warning remains.

Phase: sound-engine performance validation / music Phase 5. Remaining: physical Pixel locked-screen and Surface sustained/thermal tests, busy FM/acoustic/envelope costs, room-pooling integration and legacy wet-effect parity. Direct next step: profile busy native FM/choir render loops at Full quality and make a measured Rust optimization. Repeat physical-device Full/Economy playback separately, using the load/silence report to distinguish sustained DSP overload from scheduling gaps. Wasm remains opt-in.


## Busy FM and subtractive follow-up — 19 October 2026

This pass profiles **both engines**, at the original Full quality. The native held cases use eight notes, original operators/layers/chorus/acoustic settings and 2× FM. Separate fixtures isolate additive organ/reed waves, multi-layer/unison, colour and released notes. No patch was retuned to obtain a gain.

### Attribution and measurement boundaries

The profiler now has 62 cases. `synth:profile-build` still creates named builds with production-identical code sections. `node tools/buildSynthProfile.mjs --sections` creates a separate `.tmp/dsp-sections` diagnostic build with selected helpers marked no-inline at the Rust level. V8 can inline these helpers again, so `audit:synth-profile --attribution` additionally disables Wasm JIT inlining **only in its diagnostic browser** and collects no timings. These samples perturb call cost and describe attribution leads, not production CPU percentages. Ordinary timings always use the normal production modules with normal JIT settings. All named/diagnostic comparisons are checked against production PCM.

The 21-case initial pass uses 48 kHz, four audio seconds, one excluded captured warm-up and five unprofiled repetitions. Eleven ordinary-JIT diagnostic CPU captures and six no-JIT-inline captures are retained. Sampling runs sustained state after warm-up; they do not measure the first attack or the whole released-note lifecycle. Release throughput cases use fresh instances with note-off at 0.4 seconds.

Findings:

- Native Tine Keys, Bowed Glass and drawbars cost about 537–550 ms per four seconds in this baseline. Native Air Choir costs 969 ms versus 550 ms with only acoustic mixes disabled. Rosin silk costs 312 ms versus 194 ms without its acoustic mixes. The isolation changes are diagnostic, not alternate production presets.
- The no-inline diagnostic separates sine lookup, envelopes and expression from the remaining FM loop. Tines show about 27% in sine lookup and 68% in the remaining render body; Choir exposes substantial Colour/Band work. This does **not** establish those percentages in the normally inlined production kernel.
- The subtractive diagnostic exposes meaningful oscillator/BLEP and filter work in the heavy lane case; additive-wave lookup is also measurable. Rosin is dominated by acoustic colour. Plain/layered source loops are worth optimizing independently of FM.
- The deliberately long all-operator fractional-envelope fixture still spends most sampled time in `powf`. That result should not be generalized to the sustained native FM recipes, whose envelope cost is much smaller after attack.

### Subtractive experiment: rejected after complete-graph checks

A candidate calculated static unison detune factors and base-pan positions once per render call, and the identical amplitude product once per voice/layer/sample rather than once per unison lane. It also skipped zero-mix sub waveform arithmetic while advancing phase. Floating-point order and sample-timed expression/glide events were preserved. **The candidate was removed:** the isolated source improvements below did not reliably carry through Chrome AudioWorklet graphs, and a common plain case regressed. Its temporary audit export/tests were removed too.

Matched before/after source timings below use 48 kHz, three audio seconds, six alternating old/new fresh-instance passes, with captured warm-ups excluded. Each browser runs separately. Full quality and all patch controls match. Positive percentages mean less render wall time; small differences should be treated cautiously.

| Case | Chrome before → after ms | Reduction | Firefox before → after ms | Reduction |
| --- | ---: | ---: | ---: | ---: |
| Plain subtractive / 16 notes | 209.8 → 168.9 | 19.5% | 230.5 → 190.5 | 17.4% |
| Dual layer / four unison / 16 notes | 1130.2 → 915.0 | 19.0% | 1222.0 → 1124.5 | 8.0% |
| Additive organ wave / 16 notes | 207.9 → 185.0 | 11.0% | 289.5 → 257.5 | 11.1% |
| Eight-voice silk | 125.2 → 108.6 | 13.3% | 132.0 → 110.0 | 16.7% |
| Layered noir | 212.5 → 181.9 | 14.4% | 244.5 → 233.5 | 4.5% |
| DCO chorus | 114.3 → 108.4 | 5.1% | 155.5 → 118.0 | 24.1% |
| Sync sweep | 121.7 → 117.8 | 3.2% | 151.5 → 129.5 | 14.5% |
| Independent poly motion | 162.7 → 148.9 | 8.5% | 172.0 → 159.5 | 7.3% |
| Rosin silk | 274.0 → 275.6 | −0.6% | 299.0 → 282.5 | 5.5% |

These are **experimental, rejected-candidate timings**, not a claim about the current kernel. Rosin/colour did not get the same gain as the plain loop. Matched FM controls varied about ±4%, without a new busy-FM speedup. Both final production source code sections now match the kernels retained at the start of this slice. The earlier exact idle-FM optimization remains.

### Rejected experiments

An FM zero-output/disabled-operator shortcut preserved PCM and helped released tines, but slowed other busy recipes by roughly 3–6%; it was removed. Sharing identical stereo acoustic-band reciprocal calculations also preserved PCM but did not improve Choir materially and regressed subtractive Rosin by about 8.5% in the paired run; it too was removed. These are measured rejections, not pending production features. Earlier persistent reciprocal/scalar/routing caches remain rejected. Do not reintroduce them based only on a reduced arithmetic count.

### Complete-graph checks changed the decision

Chrome complete offline graphs render eight seconds at 48 kHz, with three measured runs after one warm-up per kernel/configuration. Graphs include the existing worklets, native processing, instrument inserts and local/shared room paths as applicable. A second pass reverses old/new order. Source/effect settings stay unchanged; these are fixed windows, not full late-tail tests or hardware underrun counts.

| Candidate graph | First before → after ms | Reverse-order before → after ms |
| --- | ---: | ---: |
| Four plain subtractive instruments × eight notes | 1064 → 1159 | 1093 → 1182 |
| Four dual-layer / two-unison instruments × eight notes | 3815 → 3482 | 3812 → 3477 |
| Five-family mix, inserts/local echoes/shared room | 2598 → 2626 | 2750 → 2758 |
| Five-family mix with acoustic/expression | 3805 → 3456 | 3904 → 3431 |

The layered and acoustic graphs improved, but the plain graph consistently regressed about 8–9% and the shared-room mix was essentially unchanged. A narrower single-lane cache variant still regressed the plain graph about 7%; retaining only the zero-mix sub shortcut regressed it about 17% in its check. All were removed. All graph outputs remained finite/non-silent/below full scale, with complete source telemetry and zero late/drop/steal counts. Direct synchronous main-thread Wasm throughput is therefore insufficient as an acceptance gate for AudioWorklet changes. The precise JIT/register/layout reason for this difference is **not yet established**; trace the actual worklet rather than assuming a cause or shipping the microbenchmark winner.

### Validation and retained evidence

**828 tests / 128 files, production build, source/artifact checks and diff checks pass.** Final regular and diagnostic profiler smoke checks also pass, including released-note validation and attribution-only null timing fields. The rejected full invariant candidate passed **155** before/after PCM comparisons in each of Chrome and Firefox, with zero sample differences. Coverage includes source profiling fixtures, all standalone recipes at 44.1/48/96 kHz, live acoustic edits, and held subtractive model/unison/detune/width/pan/mix/pressure/sub/modulation edits at 127- and 2048-frame blocks. Correctness alone did not establish a performance benefit. Final production code-section hashes match the start-of-slice core/FM references; only optional profiling annotations are retained. No approximation, quality reduction or release truncation is introduced.

Local evidence under this task's `outputs/`: `busy-sections/chrome.json` and eleven profiles; `busy-attribution/chrome.json` and six profiles; `busy-ab-2.json`, `busy-ab-firefox.json`, `busy-parity-{chrome,firefox}.json`, `colour-ab.json`, `busy-graphs.json`, `busy-graphs-repeat.json`, `busy-graphs-final.json` (narrowed cache candidate) and `busy-graphs-sub-only.json`. `busy-ab-1.json` records the rejected FM shortcut. Reference kernels/source are retained in ignored `.tmp/busy-baseline/`; `core-amplitude.wasm` / `core-cached-all.wasm` retain the rejected invariant candidate. The final tool smoke checks are in `busy-final-smoke/` and `busy-final-attribution/`. These local artifacts are not portable committed references; preserve them when moving this work.

Reproduce current profiling after rebuilding named artifacts:

```powershell
npm run synth:profile-build
npm run audit:synth-profile -- --cases=fm-tines,fm-glass,fm-drawbars,fm-choir,core-silk,core-noir,core-chorus,core-sync,core-rosin --seconds=4 --repeats=5 --no-samples
node tools/buildSynthProfile.mjs --sections
npm run audit:synth-profile -- --attribution --cases=fm-tines,fm-choir,core-noir,core-rosin --profiles=fm-tines,fm-choir,core-noir,core-rosin --seconds=4
```

Use `SYNTH_PROFILE_DIR` to retain separate timing/attribution runs. For ordinary Firefox timing, set `SYNTH_BROWSER=firefox` and `SYNTH_BROWSER_PATH`; attribution mode intentionally requires Chrome. Rebuild diagnostic artifacts too after changing Rust. Do not benchmark alongside builds/tests/listening.

Phase: full-quality sound-engine performance validation alongside music Phase 5. Busy FM and subtractive attribution are covered; this slice retains profiling tools/fixtures and rejects changes that regressed complete graphs. Remaining: successful busy FM/subtractive/acoustic/fractional-envelope optimization, live/physical-device/thermal tests and room pooling. Direct next backend step: capture Chrome CPU/JIT attribution on the actual AudioWorklet source graph (plain and layered subtractive, native FM) and resolve the measured kernel/worklet throughput difference before selecting another production change. Keep matched source PCM, normal Full/2× settings and complete-graph timings as separate gates. Bound error explicitly for any mathematical approximation.


## Actual AudioWorklet traces and fluid opt-in — 19 October 2026

### Product change

The main page's fluid background now defaults **off on every device**, including desktop. Existing explicit `bgm-backdrop` choices remain remembered; the default is not written as an implicit preference. With no saved choice the Backdrop component/solver is not mounted. The visual menu still offers opt-in, and the tour/README describe it. Chrome development and built-page audits verify fresh desktop/mobile defaults, opt-in starts the solver, opt-out disposes it and both explicit choices survive reload. The small existing support probe remains separate from running the simulation. Benchmark pages already request zero fluid.

### New reusable worklet profiler

`npm run audit:worklet-profile` captures Chrome tracing CPU profiles from the **Offline AudioWorklet thread** or **Realtime AudioWorklet thread**, separately from the page isolate. It retains the raw trace and ordinary `.cpuprofile` files plus the exact graph/patch/voice/effect fixture and build hashes. Trace chunks are joined by process/profile identity to their owning `Profile` event; the thread emitting a chunk is frequently a profiler helper, not the sampled worklet. Two regressions cover that ownership, cross-process ID collisions and incomplete data.

Untraced timings use the normal production kernels and are collected in a separate page before sampling. The sampled graph uses named release kernels with identical code sections. Both pages use normal browser JIT settings by default. Sampling includes preparation and rendering and is never treated as an untraced timing result. The CLI supports explicit local kernel overrides, recorded with their actual hashes, and diagnostic forced baseline/optimizing V8 tiers. Those compiler flags are laboratory controls, not a production browser policy. The source-quality settings come from the requested case, with no automatic reduction.

### Findings in the normal browser

Desktop Ryzen 3950X / Chrome 155, 48 kHz, eight-second fixed offline windows, one warm-up and three measured production-kernel runs, sequential cases/browsers and no fluid:

| Graph | Untraced median render ms | Largest sampled worklet self weights |
| --- | ---: | --- |
| Four plain subtractive instruments × eight notes | 1058 | Engine render 81%; low-pass 6.8%; waveform 6.3% |
| Four dual-layer / two-unison instruments × eight notes | 3617 | Engine render 85%; low-pass 9.3% |
| Four six-operator / 2× FM instruments × eight notes | 4357 | FM render 96.5%; remaining named power helpers about 2.7% |
| Five-family acoustic/expression mix with inserts, local delays and room | 3357 | FM render 52.6%; subtractive colour 10.7%; subtractive render 8.9%; room 7.5%; insert delay 6.9%; insert render 5.0% |

These are self weights among active **V8** samples, not percentages of a hardware audio deadline or a complete native CPU breakdown. Inlined helpers can be charged to render; `program`/`other` samples do not resolve native processing versus idle time. The dry offline graphs have only about 0.2–0.6% of these active V8 weights in JavaScript. This makes the Rust hot loops a better target than rewriting the already thin JS bridge. It does not establish that native sources/effects are free or that scheduling can never be a problem on a locked phone.

Normal realtime traces also capture the expected **Realtime AudioWorklet thread**. An eight-second foreground observation after two seconds of warm-up gives untraced clock/wall ratios of **1.0006** (plain subtractive) and **0.9994** (six-operator FM), with complete source telemetry and zero late/drop/steal/missed-cycle counters. The clock comparison covers the full roughly ten-second session including warm-up. Realtime samples still put most active V8 weight in Engine/Fm render. These desktop observations do not certify Pixel 8 locked playback, Surface thermal headroom or hardware underruns. The first live JSON inherited the offline `repeats:3` metadata label; execution was one observation window per graph, as its recorded seconds/stats show. The CLI now reports that count correctly.

### Controlled compiler and fixture checks

An experimental **Rust opt-level 2** build is byte-for-byte PCM compatible across 155 Chrome reference comparisons at the existing rates/lifecycle fixtures. It is not an across-the-board improvement in the actual worklets:

| Graph | Normal opt-level 3 ms | Experimental opt-level 2 ms |
| --- | ---: | ---: |
| Plain subtractive | 1058 | 1238 |
| Dual-layer / two-unison | 3617 | 3334 |
| Six-operator / 2× FM | 4357 | 4509 |
| Acoustic/expression mix | 3357 | 3293 |

The smaller subtractive build leaves the envelope evaluator out of line, where it becomes visible in samples; in the standard build it is inlined. The layered gain does not justify the common plain-case regression. **Production remains opt-level 3.** Build variants live only in ignored `.tmp/dsp-opt-2`; their helpers/build metadata are kept for future controlled experiments. No production patch/quality/decay or kernel code changed in this slice.

Matching the rejected invariant candidate to the actual stress patch, note onset/off timing and eight-second duration still yielded a direct single-source gain in one run: 249.4 → 225.7 ms, with exact PCM. However, a fresh browser run of the same single-source fixture measured 259.9 → 310.0 ms; four interleaved instances measured 1041 → 1263 ms. The layered case still improved. Thus the ranking difference is **not uniquely attributable to AudioWorklet**, nor explained simply by using a different phrase or by four-instance interleaving. Browser/compiler/call-site warm state remains a confounder. Preserve these contradictory controls instead of choosing the favourable run.

A forced optimizing-tier worklet check measured 1250 → 1279 ms for the original/candidate plain graph. It did not rescue the candidate, and disabling baseline compilation was not faster than the earlier default-browser result. The controls do not establish a single JIT cause. Production uses normal browser settings; no warm-up workaround or forced-tier claim is adopted.

### Reproduction

With the development server running:

```powershell
npm run synth:profile-build
npm run audit:worklet-profile -- --cases=sub-voices,sub-layers,fm-six,mixed-acoustic --repeats=3
npm run audit:worklet-profile -- --mode=live --cases=sub-voices,fm-six --seconds=8
```

`SYNTH_PROFILE_DIR`, `SYNTH_LAB_URL` and `SYNTH_BROWSER_PATH` select output/server/Chrome. Run experiments sequentially without simultaneous builds/tests/auditions. Raw trace duration and sampled weights carry profiler overhead; only the separate untraced run is a throughput/clock observation. Live runs keep fluid disabled and monitor output silent while processing upstream sources/effects.

To reproduce the rejected compile configuration without changing production:

```powershell
node tools/buildSynthProfile.mjs --opt-level=2
npm run audit:worklet-profile -- --core=.tmp/dsp-opt-2/core.wasm --fm=.tmp/dsp-opt-2/fm.wasm
```

`--wasm-tier=optimizing` / `baseline` are optional diagnostic controls; their results are explicitly labelled non-default-browser measurements. Do not compare them as if a deployed page could require those flags. Experimental opt-level `s` is supported by the builder but was **not tested** here.

Local evidence in this task's `outputs/`: `worklet-current/`, `worklet-live/`, `worklet-o2/`, `worklet-o2-parity-chrome.json`, `worklet-matched-kernels.json`, `worklet-interleaved-kernels.json`, `worklet-forced-optimizing-{current,candidate}/` and `fluid-opt-in-{dev,production}.json`. Raw traces and CPU profiles are retained alongside each graph report. Kernel overrides reference the retained rejected candidate in `.tmp/busy-baseline/`; preserve that ignored directory when moving work.

Validation: **830 tests / 129 files**, production/source-artifact checks and Chrome development/built-page fluid audits pass. All measured offline graphs are finite/non-silent/below full scale with complete telemetry and zero late/drop/steal counters. The existing ambience chunking warning remains. No commit, push or deployment.

Phase: sound-engine performance validation alongside music Phase 5. Actual offline/realtime worklet attribution is now implemented and exercised for both engines. Remaining: a successful busy-source optimization, physical-device/thermal/locked playback checks, room pooling and legacy compatibility work. **Direct next step:** isolate a smaller FM voice/operator render kernel from the large lifecycle/control loop, retaining identical state/feedback order, then compare it using the new normal-browser worklet harness, matched PCM and fresh-browser repetitions. Keep a change only if complete graphs improve without common-case regressions; source-only or forced-tier wins are insufficient.


## Exact FM acoustic coefficient reuse — 19 October 2026

### Retained change

The FM acoustic layer now reuses its vowel/body/noise filter coefficients while their smoothed controls are unchanged. It still evaluates control smoothing on the original 32-sample cadence, refreshes every changed intermediate value, detects formant/body enable-threshold crossings, and invalidates on clear or sample-rate changes. No coefficient approximation, envelope change, oversampling reduction, release truncation or preset retuning is involved.

This is the FM crate's default `cache-colour-coefficients` feature. It remains disabled in the subtractive crate: enabling the same change there slowed the plain graph by about 5%, the layered graph by 2.3% and native Rosin by 1.9% in the measured Chrome run. The final subtractive Wasm code section matches the preceding reference. Final normal artifacts are core 307,441 bytes and FM 91,341 bytes; FM grows by 139 bytes from this slice's reference. The earlier exact idle-FM optimization remains.

### Complete worklet measurements

Windows / Ryzen 3950X, Chrome 155 and Firefox 158, 48 kHz, eight-second fixed OfflineAudioContext windows, original patch quality, zero fluid. Each case has one excluded warm-up per version and three measured repetitions with alternating before/after order and the measured page foreground. Cases/browsers/builds run sequentially. Values are median render milliseconds, including complete source/effect graphs and existing output diagnostics.

| Graph | Chrome original → cached | Firefox original → cached |
| --- | ---: | ---: |
| Native Air choir, eight held notes | 2079.7 → 1959.9 (5.8% less) | 1895 → 1841 (2.8% less) |
| Native Air choir, 32 held notes | 7930.3 → 7519.9 (5.2% less) | 7239 → 7136 (1.4% less) |
| Five-family acoustic/expression mix, inserts, local delays and room | 3226.7 → 3160.2 (2.1% less) | 2890 → 2845 (1.6% less) |

Native fixtures preserve the complete recipe, carrier/operator settings and release metadata, with polyphony set to the requested note count. Fixed windows can truncate the measured tail; full-tail duration/truncation is recorded in each fixture. Rendering and source telemetry remain finite, non-silent and below full scale, with zero late/drop/steal/missing counters. These are desktop offline wall times, not audio-thread deadline percentages, physical Pixel 8/Surface results or locked-screen certification.

This is a targeted acoustic gain with small compiler/layout tradeoffs. Dry six-operator FM varied from a 3.6% gain in the first Chrome run to essentially unchanged in a fresh browser; Firefox was 0.9% slower. Bowed glass varied around its reference. Tine keys were 1.5–1.9% slower in two Chrome comparisons (the repeat was 1073.4 → 1093.4 ms). Retain that small cost in future/device checks; do not advertise a universal FM speedup. A fresh Chrome choir repetition also improved by about 6%, corroborating the targeted result.

### Trials rejected in this slice

All these candidates passed the initial 155 exact Chrome PCM cases; correctness alone did not make them worthwhile:

| Candidate | Actual normal-browser worklet result |
| --- | --- |
| Extracted per-voice operator helper | Six-op FM 3.7% slower; bowed glass 9% slower. |
| Const-generic four/six-operator render loops | Four-op 7% slower; six-op 2% slower. |
| Mirrored contiguous reconstruction-FIR history | About 1.5% slower on six-op; no consistent native gain. |
| One-wrap phase advance for already bounded phases | Approximately noise level: six-op 0.1%, choir 0.4% gains. |
| Voice-major 128/64-sample segments split at events | About 2.6–2.8% on synthetic FM; 64-sample variant regressed dense native choir by 1.9%. Extra control buffers/renderer complexity removed. |
| Coefficient cache in both engines | FM choir improves, but the subtractive regressions above prevent enabling it there. |
| Outlined acoustic tick with the cache | About 5% choir gain and 1% slower tines, but the mixed-graph gain fell to 0.4%; no robust advantage over coefficient reuse alone. Removed. |

The final FM operator/lifecycle renderer is the preceding reference, including idle optimization; only the shared acoustic implementation and FM feature selection change. Keep the retained ignored experimental binaries/sources when moving this work rather than recreating results from memory.

### Correctness and reproduction

173 before/after DSP comparisons per browser cover the expanded fixtures, all native recipes at 44.1/48/96 kHz, acoustic automation, tiny enable thresholds, held edits, live quality changes and 127/2048-sample callbacks. Every PCM difference is zero. Additional permanent acoustic tests cover settled controls, disable/re-enable, threshold crossings and live quality/callback independence; existing lifecycle/legato/sustain/panic/tail tests remain in the full suite.

Rebuild current named modules and an original uncached FM reference without editing production source or public artifacts:

```powershell
npm run synth:build
npm run synth:profile-build
node tools/buildSynthProfile.mjs --uncached-colour
```

The reference lives in `.tmp/dsp-colour-reference`; its FM code section matches this slice's original FM reference. Its metadata explicitly records the disabled cache. The ordinary named build matches production code. The new flag cannot be combined with compiler/section variants. Production Full/2× settings remain unchanged.

For repeatable current/reference worklet tracing with the existing stress graphs:

```powershell
$env:SYNTH_PROFILE_DIR='.tmp/worklet-colour-current'
npm run audit:worklet-profile -- --cases=fm-six,mixed-acoustic --repeats=3
$env:SYNTH_PROFILE_DIR='.tmp/worklet-colour-reference'
npm run audit:worklet-profile -- --fm=.tmp/dsp-colour-reference/fm.wasm --cases=fm-six,mixed-acoustic --repeats=3
```

These sequential commands reproduce graph/trace fixtures; the acceptance measurements above used the separate alternating A/B harness. Current native direct fixtures remain available with `audit:synth-profile -- --cases=fm-choir,fm-tines,core-rosin --no-samples`. Diagnostic section builds must be regenerated separately after this source change.

Local evidence under this task's `outputs/`: `fm-colour-refresh-ab-chrome.json`, `fm-colour-fm-only-ab-firefox.json`, the one-case tines repeat `fm-colour-fm-only-ab-chrome.json`, `fm-colour-outlined-ab-chrome.json`, the rejected `fm-*-ab-chrome.json` trials, and `production-colour-parity-{chrome,firefox}.json`. The fresh five-case Chrome repeat's console medians were retained in the task history; its JSON was subsequently replaced by the explicitly labelled tines repeat. Experimental kernels/sources are in repo `.tmp/fm-kernel-experiments/`; the local `work/ab-fm-worklet.mjs` and `work/fm-variant-parity.mjs` retain exact A/B/native-fixture setup. Preserve those ignored/task-local files when handing off.

Final production-kernel live checks also pass: six-second foreground observations after two seconds of warm-up give clock/wall ratios 0.999996 (six-op FM) and 1.000478 (mixed acoustic), with complete telemetry, no source errors and zero late/drop/steal/missed-cycle counters. Raw actual realtime worklet profiles and the separate untraced observations are in task `outputs/colour-live/`. These remain desktop observations, not hardware-underrun or locked-phone certification.

One useful next profiling lead: at the end of the mixed live fixture, FM and subtractive sources report zero active voices while their peak readings remain around 1e-43. Investigate remaining post-release filter/DC work before changing any tail cutoff. In FM the existing exact-zero fast path requires zero reconstruction history and DC state; a tiny residual DC state may keep reconstruction work running. This is a source-review hypothesis to measure, not a demonstrated speedup or permission to truncate tails.

832 tests / 129 files and production/source-artifact checks pass. No commit, push or deployment. Phase: sound-engine performance validation alongside music Phase 5. Remaining: post-release residual work, larger busy-source/fractional-envelope gains, physical-device/locked/thermal verification, compatible room pooling and legacy sound parity. Direct next step: profile zero-active-voice FM reconstruction/DC tails and test an exact way to skip redundant FIR work; then trace actual main-page showcases and pool only compatible rooms, preserving private pad/drone rooms and per-instrument delays. Retain tines and plain subtractive as regression gates.

## Actual showcase graphs and compatible room pooling — 19 October 2026

The marginal scalar-kernel gains warranted checking the real integration before another Rust micro-optimization. Added `npm run audit:playback-profile`: actual main-page `renderPcm` exports, source/event/peak-active telemetry, patch/build provenance, separate actual-worklet V8 traces and explicit diagnostic ablations. It includes planning, graph creation, native processing, worklet DSP and PCM packing. Muting colour/rooms/inserts or flattening envelopes changes sound and is only a profiling experiment.

### Where the time goes

Full synthesis/2× FM and Full 16-line rooms, Chrome 155, Ryzen 3950X desktop:

| Actual preset opening | Full export | No room send | Observed active worklet samples |
| --- | ---: | ---: | --- |
| Glass Conservatory, 60 s | 9,563 ms | 6,728 ms | effects about 42%, subtractive render 29%, acoustic colour 16% |
| Tine and Tide, 60 s | 18,934 ms | 16,214 ms | FM render about 60%, effects about 37%; math helpers about 1.7% |
| Lantern Circuit, 60 s | 28,052 ms | 23,177 ms | source synthesis and effects both remain material |

These 60-second numbers are single diagnostic runs, not acceptance medians. A separate three-repeat 24-second Glass pass measured Full 3,560 ms, no-colour 2,997 ms, linear-envelopes 3,604 ms, no-rooms 2,777 ms, no-inserts 3,533 ms and dry 2,126 ms. Flattening the envelopes did not improve this workload. Earlier deliberately heavy fractional-envelope fixtures remain valid stress cases, but they do not establish the dominant cost of these real scenes.

**Coverage limit:** seed 42's openings in these exports have no lead/choir note events, despite all parts being unmuted. Peak-active telemetry shows pad/bass and, for Lantern, counter. These results are not all-voice steady-state coverage. All sampled Wasm processors run on one audio render thread; more processors do not automatically distribute work across CPU cores. Scalar source cost still scales with active voices, layers/unison and FM operators/oversampling. V8 does not attribute native Web Audio DSP here. Physical Surface/Pixel performance and locked playback remain unmeasured.

### Integration fix and acceptance measurements

The Wasm adapter ignored the existing **Share matching reverbs** preference, including its mobile default. Main-page and lab-runner instruments now lease owner-scoped compatible FDN rooms. Matching covers decay, size, damping, predelay, width, modulation, quality and return mode. Dry/send levels and individual native delays stay per instrument. Explicit private rooms and differing response settings remain isolated; a private room's requested decay also contributes to export preroll bounds. Standalone keyboard audition retains an independent room so runner stop/mute does not cut it off.

Room sends receive matching role tone/fader and the existing pan/volume control signals. The first pooling prototype duplicated wander modulation sources and made Glass about 13% slower; it was rejected. The accepted version shares control signals through lightweight audio followers, with no additional LFOs, random walkers or wave shapers. A voice panic clears its own source/delay; owner Stop clears the common rooms once. Reference-counted leases handle concurrent loading, replacement, failure and disposal. Desktop opt-in and mobile defaults remain the existing preference policy.

Sequential Chrome comparison, same 24-second seed-42 score, one warm-up per path and three alternating old/new repetitions, Full synthesis/Full rooms:

| Preset | Previous median | Pooled median | Wall-time change | FDN instances |
| --- | ---: | ---: | ---: | ---: |
| Glass Conservatory | 3,695.2 ms | 3,742.7 ms | 1.3% slower, approximately flat | 4 → 2 |
| Tine and Tide | 6,491.5 ms | 5,702.4 ms | 12.2% faster | 4 → 1 |
| Lantern Circuit | 7,846.2 ms | 6,981.4 ms | 11.0% faster | 4 → 2 |

Each effects instance has 6,946,816 bytes of Wasm linear memory: four to one saves 20,840,448 bytes (20.8 MB), not a measurement of total browser RAM. Source patches/events, oversampling, room quality and decay are unchanged. Shared post-fader sends/common wet returns alter topology and are an optional approximation; **mixed PCM is not bit-identical** to separate per-instrument returns. RMS/peak remain close in these exports (Tine RMS 0.0139709 → 0.0139972, peak 0.14084 → 0.14151). No physical-device fix or universal speedup is claimed.

### Reproduction and retained evidence

```powershell
$env:SYNTH_PROFILE_DIR='.tmp/actual-playback'
npm run audit:playback-profile -- --presets=glass-conservatory --seconds=24 --repeats=3 --trace
# Full graphs with the sharing preference honored:
npm run audit:playback-profile -- --shared=1 --modes=full --seconds=24 --repeats=3
# Matched comparison requires the captured preceding Vite modules:
npm run audit:playback-profile -- --shared=1 --compare-pool --old-sources=.tmp/perf-actual-baseline/modules --seconds=24 --repeats=3
```

`--trace` requires fresh code-matching named modules from `npm run synth:profile-build`. `--seed` selects the scene seed. The old-source comparison intercepts captured modules, not arbitrary Git revisions. Retain `.tmp/perf-actual-baseline/` with its original modules/binaries when reproducing the historical comparison. The control-signal change was subsequently made transactional before committing replacements; DSP topology is unchanged from the measured candidate.

Task-local outputs: `actual-playback/`, `actual-playback-full/`, rejected `pooled-playback-ab/`, accepted `pooled-followers-ab/`, `room-pool-ui-{chrome,firefox}.json` and `room-pool-extra-{chrome,firefox}.json`. Both-browser UI audits cover control mirroring, private rooms, ownership/clear behavior, engine switches, mobile Light-room defaults and explicit opt-out. Additional checks exercise runner replacement/muting/disposal, independent held audition, production playback/button/hotkey/lab keyboard and 64-second two-chunk export with a private 20-second room. The exports contain exactly 3,072,000 frames at 48 kHz, finite bounded PCM and no worklet/page errors; sampled channel steps at the 60-second join are 0.000153 Chrome and 0.001984 Firefox. This is a discontinuity smoke check, not proof of identical stereo/tail motion across chunks or browsers. 847 tests / 131 files and production/source-artifact checks pass. Rust and public kernels are unchanged in this routing slice.

**Phase:** sound-engine performance validation alongside music Phase 5. **Remaining:** source scaling, broader musical/seed coverage, physical Pixel 8 locked/Surface thermal validation, native-fallback room parity and legacy listening. **Direct next step:** prototype batching/SIMD across voices in the measured source loops, using FM tines and plain/layered subtractive as gates; compare actual full graphs as well as kernel throughput. This is a proposed experiment, not an established speedup. Worker render-ahead is a separate, larger scheduling option if single-thread deadlines remain inadequate. Keep the residual FM FIR/DC lead, but do not prioritize it over measured active-scene cost or truncate tails.

## SIMD voice/operator prototypes and their practical limit — 19 October 2026

Implemented original explicit Wasm SIMD128 prototypes for **both** sources, under the opt-in Cargo feature `simd-voices`. Scalar artifacts remain separate. No relaxed SIMD, lower oversampling, reduced voice count, envelope simplification or tail cutoff is used. SIMD operates within one audio render thread; it does not provide multicore scheduling or require SharedArrayBuffer/COOP/COEP.

FM packs four independent voices, operator phases, feedback rings and envelopes across a render block. Integer segment counters and original per-voice feedback delays are retained. Events flush packed state before note/pressure/glide/panic handling, then repack it. Carrier/voice accumulation stays in original order. Fractional operator curves stay scalar. Three or more active voices use voice batching; a separately measured low-polyphony path groups independent `(voice, operator)` units by routing-DAG depth, using ascending nonzero input order. Its heterogeneous envelope/shape parameters, velocity/pressure updates and sparse feedback are preserved. Single voices and insufficiently parallel graphs retain scalar execution. These are experimental duplicated render paths; shared lifecycle/control logic needs consolidation before any default promotion.

The subtractive prototype stages oscillator/filter work and keeps independent phase/filter state packed across the block. It handles ordinary sine/triangle/saw/pulse oscillators, SVF and ladder filtering. Additive waves, hard-sync/moving-duty edge tracing and low-budget configurations retain scalar fallback. Packing/scattering every sample was rejected; keeping state packed produced useful dense-case wins. Its **scalar fallback can still be slower inside a SIMD-compiled module**, so no subtractive SIMD asset is selected by normal site playback.

### Measurements: large kernel wins do not imply large song wins

Sequential desktop warm-ups and three alternating scalar/candidate repetitions, requested Full quality, 4 seconds at 48 kHz:

| Fixture | Scalar median | SIMD median | Change |
| --- | ---: | ---: | ---: |
| FM tines, 8 notes, final Chrome build | 556.8 ms | 365.7 ms | 34.3% faster |
| FM choir, 8 notes, final Chrome build | 917 ms | 702.6 ms | 23.4% faster |
| Subtractive, 16 notes × 2 layers × 4 unison, final Chrome build | 1,364.9 ms | 929 ms | 31.9% faster |
| FM tines, 8 notes, final Firefox build | 534 ms | 347 ms | 35.0% faster |
| FM choir, 8 notes, final Firefox build | 989 ms | 697 ms | 29.5% faster |
| Subtractive, 16 notes × 2 layers × 4 unison, final Firefox build | 1,457 ms | 893 ms | 38.7% faster |

Chrome complete-graph checkpoints before the final low-polyphony/FIR refinements measured six-op FM 4,257.8 → 2,818.8 ms (33.8% faster), mixed acoustic 3,170.8 → 2,756.5 ms (13.1% faster), layered subtractive 3,497 → 3,283.5 ms (6.1% faster), but plain subtractive **1,005.1 → 1,163.9 ms (15.8% slower)**. That last regression rejected general subtractive promotion.

Occupancy matters. A four-voice threshold barely ran SIMD in actual songs. A three-note Chrome fixture improved about 22%, but two-note voice batching was roughly flat. The final operator-DAG path improved two-note Chrome fixtures about 5–8%, while final Firefox two-note fixtures regressed about 5–9%. Single-note operator batching regressed and is excluded. Even scalar fallback in a SIMD-enabled module can change compiler/JIT results; automatic vectorization off was also tested, with additional regressions. Do not turn these measurements into a universal default or a browser-name performance rule.

Actual main-page exports, **FM-only** candidate (scalar subtractive retained), Full synthesis/Full shared rooms, seed **7**, 24 seconds, one warm-up and three alternating repetitions, preceding scalar FM versus final SIMD + exact FIR-idle correction:

| Arrangement | Previous median | FM trial median | Change |
| --- | ---: | ---: | ---: |
| Tine and Tide | 6,488.1 ms | 6,362.4 ms | 1.9% faster |
| Lantern Circuit | 6,697.2 ms | 6,515.3 ms | 2.7% faster |

These are modest desktop results, **not a fix for the Surface/Pixel reports**. Seed 7 exercises lead notes (9 and 11 respectively) and Lantern counter notes (5), unlike the earlier seed-42 opening. Source telemetry shows many one-/two-note instances, so lane occupancy, scalar control/body work, mixed effects and per-instrument isolation limit the arrangement gain. Preserve this negative/limited result alongside the dense wins. First voice-only comparisons were also only about 1–3% faster on these scenes.

### Exact idle FIR correction, separate from SIMD

Zero reconstruction history and nonzero DC-removal state were coupled by the old idle guard. FM now skips the FIR convolution when the whole history is exactly zero while continuing the **unchanged DC recurrence**, clocks, events, modulation and headroom. The guard becomes false immediately when nonzero source output arrives; it does not introduce a silence threshold. The existing full-reference mode still computes everything. Retained in scalar and SIMD paths after exact parity checks. Matched Chrome scalar tests: busy tines/choir roughly unchanged (under 1% measured improvement), release fixtures about 2.3–3.0% faster. This is a small independent correction, not the explanation for the dense SIMD gains.

### Local FM trial and validation

`?wasm=1&simd=1` requests **FM SIMD only**, on the main page or labs (`simd=1` alone in labs). Omission/`simd=0` selects scalar. The choice survives share/address rewrites and lab settings updates, is captured for the visit, and never writes a device preference. Reload to change it. Unsupported SIMD, a missing optional asset or a compile failure falls back to scalar. Worklet metadata/counters identify the module/path actually used. Browser support is not a performance guarantee; the trial remains off by default. The subtractive experiment remains a profiling build.

866 tests / 134 files and production/source-artifact checks pass. Numerical PCM parity covers **57 source fixtures × 3 sample rates** (0.6-second windows), 28 low-polyphony topology/shape/envelope/modulation combinations, 24 rate/block-size lifecycle cases, six-second release/tail windows, and the existing idle-reference matrix. Events include stealing, holes, sustain, mono/legato, glides, live quality/patch changes and panic. Both browsers pass development and production FM link selection, actual vector execution, unsupported/missing-asset fallback and lab keyboard checks. Public and named FM SIMD code sections match. Physical devices, thermal workloads, locked playback and long audible sessions remain open.

Current artifacts: scalar core 307,441 B, scalar FM 91,455 B, optional FM SIMD 145,123 B; effects/inserts unchanged. The checked runtime does not download the optional module unless requested. The ordinary core binary is unchanged; scalar FM changes only the exact FIR-idle path. No sound presets or generation rules were retuned.

```powershell
npm run synth:build
node tools/buildSynthProfile.mjs --simd
npm run test:synth-simd
npm run audit:synth-simd -- --scope=kernels --cases=fm-2,fm-3,fm-tines,fm-choir,core-lanes8 --seconds=4 --repeats=3
npm run audit:synth-simd -- --scope=graphs --fm-only --cases=fm-six,mixed-acoustic --repeats=3
npm run audit:synth-simd -- --scope=playback --fm-only --cases=tine-and-tide,lantern-circuit --seconds=24 --seed=7 --repeats=3
```

Use `SYNTH_BROWSER=firefox`, `SYNTH_BROWSER_PATH` if needed, and `SYNTH_PROFILE_DIR` for separate outputs. `--artifacts` selects a retained candidate directory. `--baseline-fm=.tmp/simd-fir-reference/fm.wasm` reproduces the preceding-scalar comparison; `--scalar-only` isolates the FIR correction. `buildSynthProfile --simd --no-auto-vectorize` is a rejected diagnostic variant, with its own output directory. Builds/PCM checks/timed comparisons run sequentially.

Retain repo `.tmp/simd-prototype/history/`, `.tmp/simd-fir-reference/`, `.tmp/dsp-simd/` and task-local `outputs/simd-*`: initial gather/packed/envelope/dispatch/auto/low-polyphony trials, `simd-operators[-cached]/`, `simd-final-chrome/`, `simd-final-firefox/`, `simd-fir-scalar/`, `simd-final-playback/` and `simd-ui-*.json`. Results record hashes, flags, actual source telemetry and limits. The reference directory includes the preceding binaries and three FM source files; it is not a Git revision.

**Phase:** performance validation alongside music Phase 5. **Remaining:** useful low-polyphony/full-arrangement gains, subtractive regressions, shared render-loop maintenance, physical Pixel 8 locked/Surface thermal checks and sound compatibility. **Direct next architectural experiment:** a multitimbral source bank that batches independent voices across instrument instances, partitioned by synthesis/quality, with separate outputs, headroom, controllers, per-instrument delays and private/shared room ownership. Measure a representative arrangement before undertaking a full migration. The current prototype demonstrates both the benefit of occupied lanes and the limit of isolated per-instrument batching. No commit, push or deployment.


## Multitimbral FM source bank — 19 October 2026

The preceding SIMD trial left lanes underfilled because each instrument rendered in a separate instance. The new original bank batches independent operator units across **up to four FM instruments**, with four separate stereo outputs in one AudioWorklet. It is a single-thread throughput/layout change, not multicore scheduling.

### Architecture and compatibility

Each `Fm` now owns its acoustic-colour array and output buffer. Patches/routing, per-instrument note IDs/polyphony/stealing, pressure, sustain, legato/glides, expression/random state, LFOs, FIR/DC state and headroom remain separate. The normal scalar/independent-SIMD artifacts also receive this ownership refactor; numerical output comparisons against retained preceding binaries pass. No shared global clipping stage or combined dry sum is introduced. Instrument inserts, individual delays, compatible/private rooms and their owner cleanup are unchanged.

The bank packs heterogeneous `(instrument, voice, operator)` units by routing depth, preserving the checked original per-voice feedback delay and ascending carrier/voice accumulation order. Reusable scratch storage and an active-voice list avoid large per-sample clears/scans. Model storage is reserved at initialization; the lifecycle matrix checks that rendering does not grow linear memory. Events flush/repack state at their sample boundary. Parameter transitions retain one transition/gain per instrument and split rendering at the earliest pending boundary.

Final dispatch groups sparse instruments with one or two active notes, compatible sample clocks and matching oversampling. Three or more voices in an instrument retain its existing voice-vector path; fractional operator curves stay on the independent path. A source can change quality while held. This hybrid avoids routing dense chords through the slower heterogeneous operator loop. Bank registration/disposal uses slot generation tokens; stale messages cannot clear a reused slot. Different contexts, full banks or different offline stop frames allocate separate banks. There is no render-time Promise/acknowledgement dependency that could stall OfflineAudioContext setup.

`?wasm=1&bank=1` on the main page or `?bank=1` in labs requests the optional bank. It takes precedence over `simd` for FM; omitting `bank` retains the earlier independent path. Reload to change it. Unsupported SIMD, an unavailable optional module or registration failure falls back to independent FM. A processor failure reports to all members of that bank; seamless recovery of already-playing notes after such a failure is not implemented. The flag survives URL/share rewrites without saving a device policy. The optional module is not fetched by normal playback.

### Measurements

Ryzen 3950X desktop; one warm-up and three rotating scalar / per-instrument SIMD / bank repetitions. Measurements are sequential and unprofiled. Full/2× synthesis and Full shared rooms are retained, with fluid off. Full export timing includes planning, construction, DSP and PCM packing. Seed 7 includes lead events, unlike the sparse seed-42 opening recorded earlier.

| Arrangement / browser | Scalar | Per-instrument SIMD | FM bank | Change versus scalar |
| --- | ---: | ---: | ---: | ---: |
| tine-and-tide / Chrome | 6,499.2 ms | 6,252.6 ms | 5,772.7 ms | 11.2% faster |
| lantern-circuit / Chrome | 6,632.1 ms | 6,498.6 ms | 5,913.9 ms | 10.8% faster |
| glass-conservatory / Chrome confirmation | 4,127.8 ms | 4,158.7 ms | 4,197.4 ms | 1.7% slower |
| tine-and-tide / Firefox | 4,130.0 ms | 4,109.0 ms | 3,772.0 ms | 8.7% faster |
| lantern-circuit / Firefox | 4,946.0 ms | 4,852.0 ms | 4,400.0 ms | 11.0% faster |

Glass is approximately flat and does not establish a universal gain: its substantial subtractive/acoustic work is not banked. Early pre-dispatch Chrome arrangement checks measured roughly 13–15% gains; the final instrument-occupancy dispatch and telemetry above are the acceptance measurements. Keep the difference between preliminary and final runs visible.

Final isolated Chrome four-second fixtures at 48 kHz:

| Fixture | Scalar | Per-instrument SIMD | Bank | Change versus scalar |
| --- | ---: | ---: | ---: | ---: |
| sparse-two | 200.3 ms | 188.5 ms | 157.4 ms | 21.4% faster |
| sparse-four | 477.1 ms | 455.0 ms | 337.0 ms | 29.4% faster |
| duets-four | 757.4 ms | 861.6 ms | 562.3 ms | 25.8% faster |
| dense-four | 2,404.4 ms | 1,740.7 ms | 1,771.5 ms | 26.3% faster |
| mixed-quality | 422.5 ms | 393.9 ms | 313.0 ms | 25.9% faster |

The first heterogeneous prototype regressed (about 12% in the four-instrument sparse case); removing per-sample scratch clears and inactive scans produced the useful gains. An earlier Firefox checkpoint improved sparse two/four/duet fixtures about 14–22%, but its dense heterogeneous loop was slower than independent voice SIMD. That motivated the final sparse/dense dispatch, rather than a browser-name rule. Same-module independent rendering is also retained in the kernel reports to expose compiler/module-layout differences.

For four instruments, observed bank linear memory is 2,162,688 B versus 4 × 1,245,184 = 4,980,736 B independently: 2,818,048 B (2.8 MB) saved. Two instances save less, and an isolated single bank has higher linear-memory cost than one independent instance. These are source linear-memory numbers, not total browser RAM. The bank artifact is 183,105 B; scalar FM is 91,356 B and independent SIMD FM is 145,064 B. Core/effects/inserts remain unchanged. Full room and instrument delay buffers are not counted in these source numbers.

### Validation, limits and reproduction

883 tests / 136 files and production/source-artifact checks pass. The matrix compares preceding scalar PCM against refactored scalar/SIMD sources across the existing FM fixtures. Bank output is checked independently per instrument across 44.1/48/96 kHz, blocks of 1/65/128/2048 frames, mixed qualities, pressure, sustain, glides, mono handoff, stealing, live quality/operator-count/fractional-curve changes, slot panic/release/reuse and six-second release/DC/colour windows. Tests also check slot capacity/context/lifetime separation, failure cleanup, stale-message rejection and public/measured bank code identity.

Chrome and Firefox development/production audits cover live source selection, actual cross-instrument vector execution, independent panic, keyboard audition, URL retention, untouched device preference and unsupported/missing-module fallback. Matched full exports retain finite non-silent bounded output and zero recorded dropped/late events. Desktop offline throughput and smooth live audition do not measure hardware underruns or establish physical Pixel 8 locked-screen / Surface Pro 6 thermal performance. Those checks, wider seeds/sections and longer audible sessions remain open. No quality reduction, shortened releases, preset retuning, commit/push or deployment is included.

```powershell
npm run synth:build
npm run test:synth-bank
npm run audit:synth-bank -- --seconds=4 --repeats=3
npm run audit:bank-playback -- --presets=tine-and-tide,lantern-circuit,glass-conservatory --seconds=24 --seed=7 --repeats=3
npm run audit:bank-ui
# Firefox timing: $env:SYNTH_BROWSER='firefox'; UI: --firefox
```

`synth:bank-build` writes isolated scalar/SIMD/bank artifacts and source/build hashes to `.tmp/fm-bank/`. It retains an existing `.tmp/bank-baseline/`; a fresh checkout captures its checked-in reference modules. The public optional bank is built/checked/versioned with the other kernels by `synth:build`. `SYNTH_PROFILE_DIR` separates reports; `SYNTH_LAB_URL` selects the development or built-site origin. Retain `.tmp/bank-baseline/` and task-local `outputs/fm-bank-*` for the historical comparison, including rejected first versions, final kernel/playback reports, the Glass confirmation and development/production UI checks.

**Phase:** performance validation alongside music Phase 5. **Remaining:** subtractive/acoustic source scaling, shared render-loop maintenance, broader scenes/sections and physical-device/locked/thermal listening. **Direct next backend step:** profile the remaining subtractive/acoustic work in Glass and prototype that family's cross-instrument layout, requiring per-output parity and actual-arrangement gains before any general migration. The FM bank remains optional. Chip articulation remains excluded.


## Perf bundle and selective acoustic SIMD — 19 October 2026

`?perf=1` is a temporary full-quality A/B bundle, with a live **Perf: on/off** main-header button. It enables Wasm, the FM source bank/eligible voice SIMD, four-mode acoustic filter SIMD, compatible room pooling and pauses fluid rendering. It does not change saved preferences, oversampling, patch recipes, expression, tails, individual delays or private rooms. It retains the user's Full/Economy and Full/Light selections, rather than silently counting a quality reduction as a kernel optimization. `perf=0` supersedes older `simd`/`bank` flags but retains Wasm and the saved room/background policy. Default visits retain the earlier opt-in policy. Switching briefly rebuilds the graph and resumes the current bar.

### Attribution and implementation

A fresh seed-7, 24-second Glass Conservatory profile with shared Full rooms measures full 4210.8 ms versus 3735.7 ms without acoustic colour (11.3% diagnostic ceiling for removing that sound). Active worklet samples attribute 48.2% inclusive to subtractive render, 15.4% to Colour::tick, 34.2% to effects and 15.8% to FM. Inclusive percentages overlap. This does not identify a hidden 10× optimization in the filters; much of Glass remains ordinary synthesis and effects.

The accepted `simd-colour` feature stores four independent formant/body resonators in persistent SIMD state, computes exact coefficient reciprocals on refresh and retains the original scalar accumulation order. It is used by `core-acoustic.wasm` only when an active architecture layer requests body/formants, and by `fm-fast.wasm` alongside the multitimbral bank. Ordinary subtractive voices retain `core.wasm`. Module caches and bank pools distinguish variants, so live on/off swaps cannot reuse the wrong kernel. Missing/unsupported optional modules fall back to independent/scalar sources. The ordinary scalar binaries remain available as the numerical reference.

### Rejected compiler variants and controlled kernel evidence

Four-second/48-kHz/128-frame direct fixtures, one warm-up plus three alternating repetitions. Chrome's initial all-purpose acoustic build slows plain/layered sources by 19.6%/29.2%. Disabling compiler auto-vectorization then helps those Chrome fixtures by 9.6%/11.6%, but slows Firefox by 9.4%/6.0%. Neither plain variant is included in Perf mode; there is no browser-name dispatch. Candidate files remain only under `.tmp`, outside shipped public assets.

The accepted acoustic build improves Chrome Rosin/body/vowel/all-colour fixtures by 9.5%/15.8%/12.7%/10.7%; Firefox by 8.3%/11.2%/9.6%/8.0%. FM choir improves 4.1%/7.0% in Chrome/Firefox; tines are approximately flat in Chrome and 4.3% slower in that Firefox isolated fixture. The latter is a complete FM-bank build/compiler-layout comparison, not a guaranteed gain for a patch with no active acoustic modes. Actual arrangement results below therefore gate the bundle as well as direct DSP evidence. Plain subtractive keeps precisely the baseline module in the final selection.

Evidence is retained in the task workspace under `outputs/perf-bundle-glass-baseline`, `perf-colour-kernels`, `perf-colour-noauto`, and `perf-colour-firefox-final`. The latter direct-kernel report preceded rejection of the plain compiler variant; its plain rows are rejected candidates. `perf-bundle-playback-chrome` and `perf-glass-final` are earlier selection checkpoints, not the final accepted bundle. The aborted Firefox arrangement pass is not a result.

Final accepted arrangement runs and verification are recorded below. Desktop offline throughput remains distinct from live callback deadlines and physical Pixel 8 locked-screen/Surface Pro 6 thermal behavior.

### Final accepted full-arrangement bundle

Full/2× source quality, Full rooms, fluid off in all variants, seed 7, 24-second exports, one excluded warm-up and three rotating scalar/bank/Perf repetitions. Both sides already share matching rooms, so this table does not count the earlier room-pooling saving again. Report `runs` retain exact event counts, bounded PCM and source statistics. All variants schedule the same events; observed late/drop counters and page/worklet errors are zero.

| Arrangement | Chrome scalar → Perf ms | Change | Firefox scalar → Perf ms | Change |
| --- | ---: | ---: | ---: | ---: |
| glass-conservatory | 4182.8 → 4161.8 | 0.5% faster | 3203.0 → 3166.0 | 1.2% faster |
| tine-and-tide | 6684.8 → 5886.0 | 11.9% faster | 4131.0 → 3735.0 | 9.6% faster |
| lantern-circuit | 6740.6 → 6029.2 | 10.6% faster | 4855.0 → 4452.0 | 8.3% faster |

Glass is approximately flat. FM-heavy arrangements gain meaningfully from banking, while the final bundle's added acoustic build does not consistently beat the bank-only checkpoint: Lantern bank-only versus Perf is 5959.1 versus 6029.2 ms in Chrome and 4358 versus 4452 ms in Firefox. Treat these as modest/compiler-sensitive differences rather than adding isolated fixture gains together. Wider seeds, longer busy passages and actual-device deadline checks remain necessary before default promotion. Final raw evidence: `outputs/perf-bundle-accepted/{chrome,firefox}-playback.json` in the task workspace. The Chrome report's original protocol order label predates the tool-label correction; `bundle: true` and its three run arrays are scalar/bank/Perf.

### Reproduction and next work

With development port 5173 running, run these sequentially, without auditions or builds during timings:

```powershell
npm run synth:build
npm run audit:synth-colour
npm run audit:bank-playback -- --bundle --presets=glass-conservatory,tine-and-tide,lantern-circuit --seconds=24 --seed=7 --repeats=3
npm run audit:perf-mode
```

Set `SYNTH_BROWSER=firefox` for timing tools, or pass `--firefox` to `audit:perf-mode`. Set `SYNTH_PROFILE_DIR` to retain each run separately and `SYNTH_LAB_URL` for development/production UI checks. `audit:synth-colour -- --reference-dir=.tmp/perf-bundle-baseline` uses the retained pre-change modules; its default uses current checked-in scalar/bank references. `--unshared-baseline` on the arrangement tool includes the matching-room routing change as well, and must be reported separately.

**Phase:** sound-engine performance validation alongside music Phase 5. **Remaining:** ordinary/layered subtractive source cost, experimental render-path consolidation, wider arrangements and physical locked/thermal validation. **Direct next step:** attribute the remaining subtractive oscillator/control work in Glass and prototype cross-instrument batching for that family with plain/acoustic regression gates. The current filters alone cannot deliver a large whole-scene gain. Chip articulation remains excluded.


Validation for this checkpoint: **905 tests / 140 files** pass, along with production build/source-artifact checks. Acoustic SIMD retains exact checked source PCM/statistics across 44.1/48/96 kHz fixtures, heterogeneous FM-bank outputs, six-second release windows and live threshold/colour/quality changes. Scalar code-section hashes remain identical to the retained pre-change reference; the reproducible suite compares current scalar versus accelerated builds. Live module/bank caches are tested across Perf toggles. Chrome and Firefox development/production audits pass live main-header on/off, `perf=1` alone on an ordinary preset, unchanged saved preferences/quality, actual bank-vector execution, paused fluid, missing/unsupported SIMD fallback and lab URL retention. Reports: task workspace `outputs/perf-ui-dev` and `outputs/perf-ui-production`. These checks do not replace physical-device validation.


## Deployed Perf build and subtractive stage profiling — 19 October 2026

The preceding Perf-mode checkpoint was deployed to GitHub Pages using `npm run deploy` after its **905 tests / 140 files**, source checks and production build passed. Live HTML serves `main-Bv-p7EGs.js`; the new `fm-fast` manifest/hash and the live header toggle, link-only override, actual vector execution, saved-preference retention, fluid pause, unsupported/missing-asset fallback and lab navigation checks pass at calmbgm.com. Initial verification began during Pages propagation and timed out; repeating after the live HTML/manifest appeared passed. Evidence: task workspace `outputs/perf-deploy.log` and `outputs/perf-ui-live/chrome.json`.

Device test links: [Tine and Tide](https://calmbgm.com/?preset=tine-and-tide&perf=1), [Lantern Circuit](https://calmbgm.com/?preset=lantern-circuit&perf=1), [Glass Conservatory](https://calmbgm.com/?preset=glass-conservatory&perf=1). Use the header Perf toggle or `perf=0` for optional-path comparisons while retaining Wasm. This publication does not make Perf the default. Subsequent profiling builds below remain local; no further runtime changes were published.

### Finer attribution, without modifying the source kernel

Existing no-inline helper profiles leave roughly 49–64% of their sampled self time in the large subtractive renderer. `tools/buildSubtractiveStages.mjs` now makes an inspectable isolated copy under `.tmp/dsp-stages`, outlining four blocks as no-inline closures: per-layer envelopes/modulation, control-rate lane setup, per-sample oscillators/edge corrections, and filters. Anchors fail closed on upstream source changes. The canonical Rust files and public binaries are not edited. `profileSynth.mjs --artifact-dir=...` accepts this named diagnostic build only in attribution mode; it is never a production timing source.

Chrome attribution-only, six-second fixture passes, at least three seconds of sampling after warm-up, Rust diagnostic helpers plus Wasm JIT inlining disabled. The following are inclusive shares **within this perturbed diagnostic source**, not production CPU budgets or percentages of a complete scene. Helpers inside a stage must not be added again to its inclusive percentage.

| Fixture | Oscillators | Modulation/envelopes | Filters | Control-rate lane setup |
| --- | ---: | ---: | ---: | ---: |
| core-8 | 30.4% | 19.2% | 16.8% | 3.4% |
| core-lanes8 | 42.5% | 7.5% | 23.6% | 3.1% |
| core-dco | 31.8% | 17.8% | 17.5% | 3.2% |
| core-rosin-dry-colour | 23.8% | 31.0% | 14.5% | 2.8% |

Oscillators are the largest outlined block in the plain/DCO and dense lane fixtures; envelope/modulation work is larger in Rosin with colour disabled. The 16-sample coefficient/frequency setup is only about 3% in these diagnostic builds. This shifts the next experiment toward per-sample oscillator processing and batching rather than another coefficient-cache or special math-helper pass. It does not prove a particular bank design or a corresponding full-scene speedup. Reports/profiles: `outputs/subtractive-attribution` and `outputs/subtractive-stages`.

### Isolated unused-sub experiment

Source review found the sub-oscillator waveform evaluated even when its mix is exactly zero. The `--unused-sub` builder makes a separate ordinary scalar trial under `.tmp/subtractive-unused-sub`, guarding that pure waveform evaluation while continuing its phase clock. No voice thresholds, quality, envelopes, RNG advancement, events or tails change. This is a measured experiment, not a production implementation. It has not been added to the public Rust source, artifacts or Perf selector.

The initial single-warm-up timing run showed large sparse Chrome regressions. A follow-up explicitly warms each module for at least 500 ms, yields 50 ms for compilation, then records three alternating repetitions. The decision uses those warmed runs; earlier `*-dense`/`*-sparse` reports are checkpoints. Dense fixtures render four seconds, sparse fixtures eight seconds with one voice. Timings exclude initialization and source PCM copying. Reports preserve binary hashes, every repetition and exact validation PCM. No benchmark ran concurrently with builds, tests or auditions.

| Fixture | Voices | Chrome baseline → trial ms | Change | Firefox baseline → trial ms | Change |
| --- | ---: | ---: | ---: | ---: | ---: |
| core-8 | 8 | 131.8 → 125.5 | 4.8% faster | 159.0 → 155.0 | 2.5% faster |
| core-layer2 | 16 | 462.1 → 442.6 | 4.2% faster | 505.0 → 496.0 | 1.8% faster |
| core-lanes8 | 16 | 1368.8 → 1249.0 | 8.8% faster | 1455.0 → 1389.0 | 4.5% faster |
| core-dco | 16 | 225.0 → 210.3 | 6.5% faster | 301.0 → 287.0 | 4.7% faster |
| core-rosin | 8 | 316.8 → 327.8 | 3.5% slower | 342.0 → 336.0 | 1.8% faster |
| core-sync | 8 | 148.7 → 147.3 | 0.9% faster | 169.0 → 164.0 | 3.0% faster |
| core-8 | 1 | 63.8 → 66.4 | 4.1% slower | 70.0 → 68.0 | 2.9% faster |
| core-layer2 | 1 | 91.5 → 92.9 | 1.5% slower | 105.0 → 101.0 | 3.8% faster |
| core-dco | 1 | 61.6 → 63.5 | 3.1% slower | 70.0 → 68.0 | 2.9% faster |
| core-rosin | 1 | 116.6 → 112.6 | 3.4% faster | 118.0 → 119.0 | 0.8% slower |

Decision: **do not promote the guard globally**. Dense layered/unison improves 8.8% in Chrome and 4.5% in Firefox, but dense Chrome Rosin slows 3.5%, and warmed one-voice plain/DCO slows 4.1%/3.1%. Firefox's one-voice Rosin is roughly flat (0.8% slower), with other sparse gains around 3–4%. Numerical parity alone is insufficient to justify the branch in every patch. No whole-arrangement speedup is claimed for this rejected candidate. Any future specialized/banked version must pass sparse, dense, acoustic and real-arrangement gates, not select only its best fixture. The new guard changes the compiled render function, so it is not valid to attribute every timing difference only to the omitted arithmetic.

The diagnostic and trial artifacts retain source PCM/statistics across all controlled subtractive fixtures at 44.1/48/96 kHz, six-second acoustic release, and live zero/nonzero sub-mix changes (its phase clock continues while inaudible). The canonical scalar/acoustic/FM binaries remain untouched. Public defaults and the deployed Perf bundle retain the previously accepted implementation.

### Reproduce this profiling slice

```powershell
npm run test:synth-stages
node tools/profileSynth.mjs --attribution --artifact-dir=.tmp/dsp-stages --cases=core-8,core-lanes8,core-dco,core-rosin-dry-colour --profiles=core-8,core-lanes8,core-dco,core-rosin-dry-colour --seconds=6 --profile-ms=3000
node tools/auditColourSimd.mjs --core-candidate=.tmp/subtractive-unused-sub/core.wasm --acoustic-candidate=.tmp/subtractive-unused-sub/core.wasm --cases=core-8,core-layer2,core-lanes8,core-dco,core-rosin,core-sync --seconds=4 --warmup-ms=500
node tools/auditColourSimd.mjs --core-candidate=.tmp/subtractive-unused-sub/core.wasm --acoustic-candidate=.tmp/subtractive-unused-sub/core.wasm --cases=core-8,core-layer2,core-dco,core-rosin --voices=1 --seconds=8 --warmup-ms=500
```

Use separate `SYNTH_PROFILE_DIR` directories and run sequentially; set `SYNTH_BROWSER=firefox` for repeated unprofiled timings. The stage wrappers deliberately change code layout and call costs, and their timing is prohibited by the harness. The rejected trial has no no-inline stage wrappers. `test:synth-stages` recreates both isolated artifacts before its parity tests; a plain clean-checkout test run skips only those artifact-dependent tests until the tool is run.

**Phase:** sound-engine performance validation alongside music Phase 5 compatibility/listening. **Remaining:** useful subtractive source batching, experimental-path consolidation, broader real arrangements and physical Pixel 8 locked/Surface Pro 6 sustained/thermal tests. **Direct next step:** prototype a shared subtractive source bank with canonical per-instrument state/output ownership, using the oscillator block as the first batching target. Keep patch dispatch outside the sample/lane loop where possible, preserve modulation/RNG/phases and compare both sparse and dense cases before live adoption. Worker render-ahead stays a distinct scheduling option; no chip-articulation work is included.


Final local validation for this profiling slice: **915 tests / 141 files**, production build and Rust/artifact checks pass. The dedicated `npm run test:synth-stages` command also rebuilds both isolated crates and passes all 10 stage/trial parity tests. The extended voice/warm-up/candidate audit path passes a one-voice smoke with matching source-state counters. The built runtime asset names remain identical to the published checkpoint. New tooling/tests/docs are local; no rejected kernel was deployed.


## Background clocks, idle shutdown and load reporting — 19 October 2026

The user reports Pixel 8 Chrome deteriorating after time in the background/locked, including sparse and native-FM scenes, and Firefox mobile showing around 90% load even paused. These reports changed the immediate priority from source batching to lifecycle/timing correctness. No physical phone is attached; desktop/synthetic evidence below does not certify mobile thermal/OS behavior.

### Concrete issues and corrections

- **The header's old estimate can count device waiting as DSP.** It treats short inter-callback wall-clock gaps as rendering time. A paced browser delivering one block at a time can consequently report close to 100% on an idle graph. The meter now requires observable bursts, idle gaps and usable millisecond resolution. It reports an unavailable dash for paced/coarse-clock callbacks rather than fabricating utilization. Measurable values are labelled estimates. This is capability/behavior detection, not Firefox-name dispatch; it cannot distinguish a fully saturated non-bursting renderer either.
- **Realtime sources aligned their event clock only on their first callback.** If callback frames subsequently differ from the privately accumulated render clock, future absolute-time note commands can remain delayed. Subtractive, independent FM and FM-bank processors now align to the authoritative `currentFrame` on realtime callbacks; offline timelines are unchanged. `resyncs` counts alignment corrections, and `skippedFrames` counts positive gaps only. These are source-clock diagnostics, not hardware-underrun counters. Real-Wasm synthetic tests skip one second and verify a freshly scheduled note plays immediately for all three paths; offline tests ignore the realtime frame.
- **Pause left the context running.** After one second of exact master-output silence, the main page now suspends only when music, ambience, held live keys, stop-fade and pending auditions are all inactive. Silent musical rests and held keys do not suspend playback; quiet nonzero reverb tails remain awake. Play, audition and MIDI/keyboard entry already resume the context. A race-safe suspender resumes again if new activity races an in-flight suspension. Meter state clears on suspend/resume and displays Idle when suspended.
- **A Worker timer could queue unlimited wake-up messages while the page was delayed.** It now permits one outstanding pulse until the main thread acknowledges it, with cleanup/exception/stop handling. This prevents a recovery message storm; it does not defeat OS freezing or promise lock-screen scheduling.
- **Recursive state can get stuck in subnormal floats indefinitely.** Forty-second release/impulse observations show source DC and insert EQ output at roughly 1e-43/1e-45 with no active voices. The combined insert chain becomes slower late in that state. A shared helper flushes only IEEE subnormal recursive state, below approximately -758 dBFS, at render boundaries; delay writes also reject subnormal residue. It preserves source/effect clocks, all normal values, patch parameters and audible envelopes/tail lengths. Scalar/SIMD/banked variants receive matching handling. The FDN and its existing sleep/long-tail design are unchanged.

The Audio menu's **Copy diagnostics** now works even with no recorded silence and includes context state/rate, visibility, source frame/recovery/late/drop counters and current engine/role data. It is user-initiated, local clipboard output; nothing is uploaded. Source stats are periodic snapshots, not simultaneous hardware measurements.

### Long-tail observation

48 kHz, one short released source note or insert impulse, then forty consecutive one-second DSP windows in the same instance. Table values are medians of windows 31–40, excluding source construction, and are desktop direct-DSP observations rather than realtime deadlines. Earlier and later windows must not be compared as if they had the same active notes.

| Quiet case | Chrome before → after ms/window | Firefox before → after ms/window |
| --- | ---: | ---: |
| core-8 | 4.1 → 3.2 | 5.0 → 4.0 |
| fm-tines | 2.7 → 1.2 | 3.0 → 1.0 |
| insert-eq | 3.5 → 2.3 | 4.0 → 3.0 |
| insert-all | 13.3 → 8.5 | 14.0 → 9.5 |

After cleanup, the observed late output is exact zero. Normal source samples in retained-reference tests remain identical above 1e-20; the complete six-second source comparisons differ by less than 1e-34. The old-bank release reference now explicitly accepts differences only when **both** compared samples are subnormal; normal sample equality remains strict. Existing scalar/SIMD/acoustic matrices still pass exact comparisons using the new matching builds. This is a documented numerical-floor change, not infinite-bit parity with the previous kernel's persistent DC dust.

Evidence: task workspace `outputs/idle-dsp-before`, `idle-dsp-after`, `.tmp/idle-before` retained public kernels in the repository, and tests `denormalTail`, `workletClock`, `loadMeterProcessor`, `idleContext`, `tickerWorker`, plus the generator/host-meter regressions. The first full suite had the expected old-bank mismatch `0` versus `-1.057327896e-38`; the revised tail-specific assertion reflects the deliberately changed floor without relaxing ordinary samples.

### Graph and background checks

Before the fix, Chrome Tine and Tide stays hidden for 120 seconds with stable three-node ownership, falling JS heap and audio/wall ratio 0.99996, but its context is still running four seconds after Pause. The updated production build repeats that hidden run at ratio 0.99996 with stable nodes, then suspends after Pause and resumes on Play. Its source reports small clock alignment corrections (12 corrections / 896 positive frame gaps across the observed run); these are not proof of an audible or OS dropout. They show why assuming the private clock never differs is unsafe. Mobile occurrence/severity still requires the new diagnostics.

An initial sixteen-second Glass old/new kernel comparison produces identical 16-bit output hashes across repetitions, with roughly 2% slower wall time. Twenty-four-second Glass is roughly 1% slower, but that full native/ambience graph is not hash-repeatable even within either variant (RMS differs around 1e-10). The hash mismatch therefore does not isolate a cleanup regression and is not used as a bit-parity claim. Direct source tests provide the numerical comparison. No active whole-scene speedup is claimed from the idle/lifecycle corrections.

Further browser and publication validation is recorded below. Physical Pixel locked-screen, long thermal runs and Surface performance remain open; correct clocks cannot create audio that was never rendered during a missed deadline.


Production validation: **943 tests / 148 files** and build/source-artifact checks pass. Chrome and Firefox Perf-mode audits pass live toggles/preferences, actual vector execution, missing/unsupported fallback and lab URL retention. Chrome Tine (120 s), Firefox Tine (60 s) and Chrome Glass (60 s) actual hidden-tab runs retain stable nodes and an audio/wall ratio near 1, suspend after Pause, and resume on Play without page errors. Separate Chrome/Firefox UI checks hold a live key past the idle threshold, verify the context keeps running, then verify Idle and copied recovery counters after release/stop. Evidence: workspace `outputs/background-after`, `outputs/background-ui`, repository `.tmp/idle-input`.

Reproduce sequentially, without concurrent builds or benchmark runs:

```powershell
node tools/auditIdleDsp.mjs
node tools/auditBackgroundAudio.mjs --preset=tine-and-tide --seconds=120 --require-idle
node tools/auditBackgroundAudio.mjs --firefox --preset=tine-and-tide --seconds=60 --require-idle
node tools/auditMainIdleInput.mjs
node tools/auditMainIdleInput.mjs --firefox
```

Use separate `SYNTH_PROFILE_DIR` directories and frozen production preview for UI/background runs; the actual-arrangement exporter uses the development entry for its explicit render hook. The Copy diagnostics snapshot includes URL, seed, quality/Perf selection, browser/context state and recovery counters. A phone result is needed to determine whether remaining degradation follows source discontinuities, transport tick gaps, graph growth or sustained compute/thermal limits.

Phase: sound-engine performance validation alongside Phase 5. Remaining: device reproduction, useful subtractive batching, source-path consolidation and broader scenes. Direct next: device diagnostics and sustained budget investigation, followed by the gated subtractive source bank. No claim is made that desktop lifecycle tests resolve every mobile lock-screen problem.


Actual 24-second Tine and Tide Perf graph, seed 7, one warm-up and three alternating matched exports: Chrome median 5770.6 → 5884.0 ms (2.0% slower), Firefox 3723 → 3708 ms (0.4% faster, effectively flat). Firefox output hashes match all six runs; Chrome native/full-graph hashes differ within each variant with RMS differences around 3e-8. Together with Glass's roughly 1% cost, this slice is accepted for bounded timing/lifecycle and idle correctness, not an active-render throughput gain. Evidence: workspace `outputs/background-arrangements/{chrome,firefox}-idle-playback.json`.


Publication confirmed: `npm run deploy` reran **943 tests / 148 files** and production/source checks successfully. GitHub Pages run [39269171526](https://github.com/lizMcLizface/bgm/actions/runs/39269171526) completed successfully; live HTML serves `main-BaKn0xi2.js` and the versioned load-meter contains the paced-callback correction. Live Chrome and Firefox both pass held-key protection, Pause → Idle and copied diagnostic-counter checks (`outputs/background-live-input` in the task workspace). No source commit/push was made; publication pushed the deployment branch only. Retest [Tine and Tide with Perf](https://calmbgm.com/?preset=tine-and-tide&perf=1) on the physical Pixel and copy diagnostics if degradation returns.


### Phone follow-up: visibility handoff and scheduler evidence — 19 October 2026

Physical feedback after the idle/clock deployment: Pixel Chrome's brief gaps recur only when backgrounded/locked (around 15+ seconds apart); foreground is fine. Firefox can play on the public site, and the local Perf link briefly plays before garbling/stopping. The phone diagnostics are pending, so neither a certificate/autoplay failure nor a DSP overload has been established. Local/public engine and stored quality can differ by origin; compare the actual snapshot rather than assume identical setups.

A concrete handoff gap is corrected locally: visibilitychange previously topped up only when returning to the page. It now fills the existing longer hidden scheduling window as the page leaves the foreground, before the first potentially throttled timer wake. No source, sound quality or lookahead limits changed. Copy diagnostics now includes a bounded 32-entry scheduler history (wake gaps, late rebases and budget-limited fills), maximum tick gap/duration, first unbooked beat time relative to the audio clock, secure-context/worklet availability and source kind/loading/error. The horizon is a beat-booking boundary, not a hardware buffer fill measurement. This does not guarantee continuous audio through OS freezing or realtime DSP overload.

Validation: **101 targeted tests / 4 files**, production build/source checks, and a real HTTPS preview desktop Chrome hidden run with mobile defaults (45 seconds) pass. Stable three-node ownership, max tick 15 ms, no budget hit/rebase, audio/wall ratio 0.99965, then Pause suspends and Play resumes. This is mobile policy coverage on desktop, not phone hardware testing. Firefox desktop also produces nonzero audio for 15 seconds through the same self-signed HTTPS preview after a real Play click without an autoplay override; the observed resume had active user activation. The reported phone garbling is not reproduced there.

The local HTTPS preview on port 5176 serves this new production build (`main-6CZc6Mtq.js`); reload the page to use it. No new public deployment or source commit/push in this follow-up. Evidence: task workspace `phone-preview/start-firefox.json`, `outputs/phone-scheduling-background/chrome-tine-and-tide.json`, repository `.tmp/phone-scheduling-{tests,build}.log`.

Phase: engine performance validation alongside music Phase 5. Remaining: diagnose actual Pixel Chrome background gaps and Firefox garbling/silence, sustained/thermal validation and subtractive batching. Direct next: inspect physical-device Copy diagnostics just after failure; distinguish exhausted note scheduling from source errors/callback discontinuities or sustained DSP load before changing sound quality or architecture.


### Firefox phone snapshot and reachable diagnostics — 19 October 2026

The supplied physical Firefox/Android 17 Rainy Cafe snapshot is from the preceding build (no version/transport/output fields). It shows a running 48 kHz context at 14.403 s; latest source frames 672000 (14 s), zero reported source resync/skipped/late/dropped events, and nonzero Reed Lead/Thump Bass source peaks. Felt Piano is a native compatibility source, so null Wasm stats are expected. One 0.25-second silence entry occurs at start/resume and is insufficient to identify the later garbling. This evidence does not establish successful hardware playback or exclude DSP deadlines, and does not justify blaming the note queue. The user reports that turning ambience off makes no difference. Chrome background diagnostics are pending.

The local version-2 snapshot now captures bounded 32-window master peak/RMS/nonfinite/output-frame history, optional platform output timestamps/playout stats, master/generator gains, media-session helper state, shared/private FDN and insert output/error stats, native-source activity and source-report times. These reuse existing worklet status messages and the master meter, with no extra audio node or recording/upload. The meter performs bounded extra sample arithmetic, so this is diagnostic visibility rather than a throughput improvement. Runtime errors after an async preset replacement are also retained. Unknown sound-booking information is labelled unavailable rather than NaN.

The phone Audio menu had used large viewport units/content-box sizing, leaving bottom controls outside the visible viewport, and Chrome's expanded horizontal layout viewport could widen the fixed panel. It now uses dynamic viewport height, explicit viewport width, border-box sizing and constrained grid tracks; Copy diagnostics is at the top. Portrait 360×640/412×740 and Chrome touch landscape 844×390 checks verify the copy button, visible panel bounds, no internal horizontal overflow and access to the bottom controls. Screenshots were inspected; Firefox portrait checks pass too.

Validation: **46 targeted tests / 8 files**, production build/source checks, Chrome/Firefox copied-output/held-key/idle checks, and real preview output windows/room stats pass. Evidence: task workspace `phone-preview/menu-{chrome,firefox}.{json,png}`, `outputs/phone-output-input`; repository `.tmp/phone-output-{tests,build}.log`. The local HTTPS preview on port 5176 serves the update; reload before collecting version-2 diagnostics. No public redeployment or source commit/push. Phase: engine performance validation alongside Phase 5. Remaining: isolate actual Firefox phone garbling and Chrome background gaps. Direct next: inspect refreshed physical captures, separating final digital output from effects failure and platform scheduling/compute limits.


### Physical Firefox output isolation — 19 October 2026

The version-2 physical capture is ambience-only (`playing:false`, `ambience:true`), on Pixel 8 built-in speakers. Across ten seconds the final master meter records steady finite output: RMS about 0.0185–0.01924 (roughly -34.7 to -34.3 dBFS), peaks about 0.077–0.096, no nonfinite samples; master/generator gains are 1. Native Felt Piano is idle/disconnected, core voices have zero active notes and no reported late/drop/resync/skip, and the one shared room is sleeping with zero reverb frames. This makes music-note scheduling and active synth/effects load poor explanations for that particular failure. It does not measure the actual hardware stream or prove zero idle Worklet overhead. The helper's time 0.308 s with duration 10 s can be a normal loop wrap; it is not evidence the helper stalled.

Local diagnostic additions:

- `?mediaHelper=0` temporarily disables only the silent media-session audio helper; metadata/action handlers remain registered. The override survives preset and encoded-share URL rewriting, is never stored, and defaults remain unchanged. `mediaHelper=1` explicitly retains it. A paused helper is not repeatedly played during metadata refreshes. Snapshot diagnostics include helper selection and rejected play requests. Restricted artwork conversion resolves without an uncaught error; this is ancillary robustness, not an identified sound fix.
- `/tools/audio-output.html` compares the same deterministic gentle stereo PCM through a native looping AudioBufferSource with no worklet/synth, the same plus the helper, a WAV in an HTMLAudioElement with no AudioContext, and a native MediaStreamDestination → audio-element bridge. The page records bounded output/clock state. It loads no synth/room/Wasm; inspection asserts no Wasm requests. Its buffer selector is explicitly a request, not a guaranteed device buffer size. Pause/close other playing tabs before isolating output paths.

**Physical result reported by the user:** Firefox pops on all paths except ordinary media-file playback. The media-stream bridge has rare pops and performs much better than the main page, but is not clean. This reproduces a Firefox/device Web Audio output problem independently of our synth and the silent helper; the helper is not a sole cause, and a universal real-time synth downgrade is not justified. Do not present the stream bridge as a complete fix. This also does not settle Chrome's separate background-only gaps.

Mozilla previously documented simple Android AudioContext output crackling and callback-latency problems: https://bugzilla.mozilla.org/show_bug.cgi?id=1893939 . That historical issue is closed WORKSFORME and is context, not identification of the current Firefox 158 bug. The current latencyHint implementation issue https://bugzilla.mozilla.org/show_bug.cgi?id=2020377 remains NEW with proposed patches; do not promise that increasing the page's requested numeric buffer changes Firefox's hardware configuration.

Validation: **39 targeted tests / 5 files**, production build/source checks, and all four desktop Chrome/Firefox output-path + helper-off main-page checks pass. Native paths have one running context, file playback has none, and only the intended media element is playing. Snapshot levels are nonzero and temporary helper state remains in the URL. Phone-sized screenshot inspected. An initial Firefox automation failure was an init-script SecurityError during transient non-HTTPS document navigation; restricting the test-only initializer to HTTPS removes it without suppressing page errors. This is not the phone audio failure. Evidence: workspace `phone-preview/output-{chrome,firefox}.{json,png}`, `.tmp/output-path-{tests,build}.log` in the repository. Local preview only; no public deployment/source commit/push.

**Phase:** engine performance/output validation alongside Phase 5. **Remaining:** reliable Firefox output, Chrome background diagnosis, sustained/thermal budget, then useful subtractive batching. **Direct next:** validate 30–60 seconds of an actual arrangement rendered with the existing offline renderer and played by an ordinary media element. Suspend/stop the live graph and helper while listening so it is a genuine output-path comparison. Treat it as a finite buffered preview first. Only then design continuous buffered generative playback; preserve the realtime path for keyboard/MIDI.

For continuous playback, do not assume WAV blobs can be appended to MediaSource or that swapping blob URLs is gapless. Check real browser container/codec/encoder support, continuity of planning/notes/FX state, chunk seams and render-ahead CPU/memory/lock-screen refill deadlines. A buffered media path trades interaction latency for resilience and cannot compensate for slower-than-realtime rendering or arbitrary OS freezes. The less-clean stream bridge remains a diagnostic, not an adopted default.

Control confirmed by the user: all other CalmBGM pages were stopped during the physical output comparisons, including Chrome in the background. The native-buffer pops therefore were not attributed to a simultaneously playing main-page graph.


### Firefox Android compatibility notice — 19 October 2026

The user also reproduced crackling, dropouts, large latency and instability on unrelated Web Audio synths and the previous liz.moe synth, and chose a browser warning instead of continuing to build around Firefox Android. A dismissible native dialog now appears on the main page and the common labs entry for Firefox + Android user agents, independently of the selected synth engine. It explains the possible failures and suggests Chrome for better audio compatibility without promising perfect playback there. Continue anyway leaves playback available. Dismissal lasts for the current tab session across main/labs navigation; the explicit Don't show this again checkbox saves a persistent browser opt-out. Both storage paths fail safely if unavailable. Desktop Firefox, Chrome Android and Firefox iOS are not targeted. Diagnostic comparison pages remain unobstructed.

Validation: **7 targeted tests / 2 files**, production build/source checks and Chrome/Firefox production-preview browser audits pass. Browser audits use the Android Firefox UA to test notice targeting on desktop, checking native modal focus, phone-sized bounds, Escape/Continue, session dismissal, labs coverage, persistent opt-out across tabs, and absence on desktop Firefox/Chrome Android. Screenshot inspected. These checks are UI validation, not renewed physical audio certification. Reports: task workspace `phone-preview/firefox-notice-{chrome,firefox}.{json,png}`; repository `.tmp/firefox-notice-{tests,build}.log`. Served by the existing local HTTPS preview on port 5176. No new public deployment or source commit/push.

Phase: sound-engine performance/output validation alongside Phase 5. Firefox Android's immediate mitigation is complete; realtime reliability there remains best-effort and is not an optimization acceptance target. A dedicated buffered-media workaround is deferred, rather than the automatic next slice. Remaining priorities: Chrome's locked/background gaps, Surface/Pixel sustained DSP budget, useful subtractive batching and source-path consolidation. Direct next: resume Chrome background investigation using the richer device diagnostics and continue the existing profiling/batching plan, without treating Firefox's native-output failure as a subtractive/FM regression.


## Chrome rare background interruptions and monotonic source clocks - 19 October 2026

Physical Pixel 8 Chrome result: the user heard only one or two very brief dropouts over the entire run, including while locked. This is a substantially better reliability baseline than the earlier repeating gaps, but is not a clean long-duration acceptance pass. Keep Full/2x FM, Perf, Light shared room and the 100 ms requested buffer for comparison; the snapshot explicitly retained mediaHelper=1. Chrome's reduced UA says Android 10/K and does not identify the actual OS/device.

Snapshot: seed 86768787, four FM-bank roles, ambience off, context time 105.227 s. Scheduler max gap 101 ms, max tick 1 ms, no budget hits or recoveries. Chrome reported zero underruns over its reported 31.5655 s stats window, not necessarily the whole run. Estimated load was 29%; this is a burst estimate rather than a hardware utilization counter. Master output stayed finite. One one-second window ending at 100.104 s had RMS 0.000529 versus adjacent 0.01371/0.01645. It is a quiet mix window, not proof of a hardware dropout. The snapshot does not retain the exact first-beat audio time or a user-marked heard-gap timestamp, so do not label it either a compositional rest or an identified fault from this alone.

The four roles report the same bank-wide 94 resyncs / 7296 forward frames: do not sum them across roles. A 115-second desktop Chrome reproduction of the exact encoded settings and seed, with temporary processor interception, exposed repeated browser frame stamps: three successive callbacks reported 1404160 after our internal clock had reached 1404288, followed by a catch-up to 1404672. Another repeat/catch-up pair occurred later. Six old recovery corrections, no page errors. Each callback still rendered 128 samples. The previous recovery path rewound the kernel event clock on every repeated stamp, then counted the catch-up as a forward gap; this counter was therefore not a reliable dropout count.

Fix: once aligned, realtime subtractive, standalone FM and FM-bank clocks only resynchronize forward. A repeated/older browser stamp leaves the already-rendered sample clock intact; a genuine forward gap still aligns the kernel and pending event execution. Startup alignment and offline rendering are unchanged. No synthesis parameters, quality, room tails or latency policy change. No Rust DSP change; worklet cache identities refreshed through synth:build.

Validation: 62 targeted tests / 6 files pass (source clocks, core/FM stress, bank PCM/lifecycle/pool and transport). New captured-shape fixtures check monotonic kernel clocks and exact uninterrupted PCM with note-on/off events crossing repeated stamps in all three processors, plus genuine forward-gap recovery. Production build and source/artifact checks pass. Raw desktop evidence: workspace outputs/phone-clock/chrome.json and phone-preview/audit-clock.mjs. This establishes a clock-recovery defect; it does not establish that it caused the user's remaining one or two physical interruptions.

Phase: engine performance/output validation alongside music Phase 5. Remaining: physical Chrome locked/thermal validation, sustained Surface/Pixel DSP budget, subtractive batching and source-path consolidation. Direct next: repeat the same phone setup after reload with the monotonic-clock build; correlate any remaining brief gap with a fresh snapshot before lowering quality or changing output architecture. Firefox Android compatibility warning remains the agreed mitigation, and a buffered-media workaround remains deferred. Local preview only; no public deployment or source commit/push.


Production-preview follow-up: 45-second hidden-tab desktop Chrome check with phone defaults passes. Zero source resyncs/skipped frames/late or dropped events, zero scheduler recoveries/budget hits, 0.99982 audio/wall-clock ratio, three nodes before and after; Pause suspends the context and Play resumes it. No page errors. Evidence: workspace outputs/phone-clock-after/chrome-tine-and-tide.json. This is a desktop lifecycle/background check, not a physical Pixel lock-screen or thermal acceptance test.


## Chrome single locked interruption: output-history attribution - 19 October 2026

Next physical Pixel Chrome run: immediate transition to lock, one brief audible dropout several seconds later (not at the lock transition). Seed 125752911, context 40.603 s, Full/2x, Perf, one Light shared FDN room, 100 ms requested/base 101 ms buffer, helper explicitly on, ambience off. All shared FM bank roles now report zero resyncs/skipped frames. Scheduler max gap 171 ms, no recoveries, one background-fill budget yield at audio 3.243 s with 8.768 s already queued toward the 20 s target; this is not evidence of scheduling starvation. The largest tick took 43.9 ms. One-second master windows ending 9.104 through 40.104 s remain finite and audible (RMS >=0.012), which does not rule out a short sub-window interruption. Chrome's zero-underrun counter covers only its current 6.201 s reporting window. The old silence-log entry at 15:41 is historical startup evidence from a previous run, not the newly heard gap.

Do not label the remaining gap a DSP overload, a main-thread underrun, or a media-helper fault from these counters. Keep source quality/routing unchanged. Direct A/B test: same scene/settings with mediaHelper=0 to isolate the independent silent looping media element. The temporary switch already survives URL rewriting and is not stored. This does not pre-emptively remove media-session support or change defaults.

Diagnostics version 3 adds:

- Wall-clock time and longest callback interval to each existing one-second master-output window. No extra PCM tap or recording.
- Rare callback-gap events (>=250 ms or twice reported base latency, whichever is larger), kept in a bounded 32-event main-thread history alongside context and visibility transitions. These are callback pacing evidence, not automatically counted as audible dropouts. Explicit context-state reset clears the pacing baseline, so an intentional Pause does not create a false callback-gap report.
- Platform output timestamps/playout or playback stats alongside the bounded 32 output windows, collected on receipt rather than only at Copy time. Separate observed-at times expose delayed main-thread delivery; a frozen main thread cannot retrospectively sample platform counters for every rendered window. Unsupported/throwing platform getters remain nonfatal.

23 targeted tests / 5 files and production build/source-artifact checks pass. New fixtures cover non-silent callback pauses, pause/reset exclusion, bounded retained events, per-window historical platform counters and unsupported getters. Worklet URL cache identity advanced to output-4; no Rust/DSP or quality change. Existing production background audit can now assert --media-helper=0 or =1.

Phase: engine performance/output validation alongside Phase 5. Remaining: rare physical Chrome interruptions and sustained device budgets; subtractive batching remains separate. Direct next: helper-off physical locked comparison, then inspect fresh version-3 diagnostics for any remaining gap before proposing another audio-path change. No public deployment or source commit/push.


Version-3 production-preview validation: helper-off selection survives address-bar rewriting; the media session remains playing with helperEnabled=false and no helper element. Hidden/visible events and enriched output fields are present, source resyncs remain zero, and Pause/Play suspend/resume correctly. No page errors. Crucially, desktop Chrome playbackStats.totalDuration remained exactly 5.3207 seconds across ten seconds of hidden playback while audio time advanced normally, then increased again after return. Thus these platform counters are demonstrably stale in this background test and cannot certify locked playback. An early visible startup underrun (10 ms) was retained in that run; do not describe the audit as a zero-underrun acceptance pass. Evidence: workspace outputs/phone-helper-off-v3/chrome-tine-and-tide.json. It validates diagnostic collection and helper-off routing on desktop, not the physical phone's remaining gap.


## Physical Android helper-off failure: restore helper-on baseline - 19 October 2026

The user completed the mediaHelper=0 comparison on Pixel 8 Chrome. It is dramatically worse: stuttering begins immediately on lock and music fast-forwards when the page is reopened. This rules out removing the helper as a solution on this device. Keep the existing helper-on default and explicitly use mediaHelper=1 in phone profiling links. No further helper-off physical test is needed. The diagnostic override remains available for isolated output experiments; it is not a recommended listening mode.

Version-3 snapshot seed 700469207, Full/2x + Perf + one Light shared room, 101 ms base latency, master/generator gains 1, ambience off. Chrome reports 101 underruns / 10.2346 s underrun duration, average latency 491 ms and maximum 564 ms. These are substantially worse than the helper-on runs and are not merely a quiet musical passage.

The retained visibility events quantify the clock failure: hidden at wall 1792425979321 / audio 1.749333 s; visible at wall 1792425995944 / audio 6.093333 s. Audio advances 4.344 s over 16.623 wall seconds (0.261x). The rendered windows then advance from audio 6.101333 at wall 1792425995948 to audio 25.104 at wall 1792426000557: 19.002667 audio seconds in 4.609 wall seconds (4.123x catch-up). These are callback-produced output windows, with nearly immediate main-thread receipt, rather than simply a backlog of stale UI messages. Chrome's output timestamp also lags the context by more than two seconds at copy time. This is consistent with browser/output pacing and catch-up; it does not identify a specific Android/Chrome internal cause.

The master remains finite and nonzero and all source resyncs/skipped frames are zero. Scheduler recoveries are zero and the long lookahead remains queued throughout most of the catch-up. The Worker already permits at most one pending wake until acknowledgement. Do not add a note-scheduler burst limiter, reset the kernel clock, or alter tempo to compensate for this trace: it would not stop the already-booked audio from being rendered as the browser advances its context. A hard AudioContext/output reset would be a separate disruptive recovery experiment, not a validated fix. No such automatic reset is added.

The previously observed frozen playbackStats values are not a universal promise that hidden stats never update: this physical run exposes large background/output underrun counters on return. Continue treating platform snapshots as browser-specific, potentially delayed windows and use visibility/wall/audio timestamps for attribution.

No runtime code, defaults, DSP quality, routing or public deployment changed in response to this negative A/B test. Existing helper-on behavior and the monotonic source-clock fix remain in place. The remaining helper-on issue is one or two rare brief interruptions, not the sustained helper-off failure.

Phase: engine performance/output validation alongside Phase 5. Remaining: rare helper-on Chrome interruptions, sustained Pixel/Surface budget and subtractive batching. Direct next: profile the helper-on path and preserve it as the physical baseline; require a concrete measured candidate before asking for another phone comparison. Firefox Android's separately reproduced Web Audio output issue remains covered by the compatibility notice; buffered media is deferred.


## Helper-on repeat and rejected 200 ms buffer trial - 19 October 2026

The next 100 ms/helper-on physical run (seed 356633754, Full/2x, Perf, Light shared room) had two user-heard gaps over about 71 audio seconds. Hidden interval: wall 1792426102120 to 1792426168563 (66.443 s), audio 2.4 to 68.632 (66.232 s), ratio 0.99682. No helper-off-style sustained slowdown/catch-up, source resyncs/skipped frames remain zero and scheduler recoveries/budget hits are zero with music queued. Largest tick 102.2 ms; largest recorded callback interval 155 ms. The browser underrun count was already one at the hidden event and rose to two after return, totaling 0.2026 s. Counters stayed unchanged while hidden, so do not use them to locate the user's two heard gaps. The historical silence-log entry remains unrelated startup data.

User tried 200 ms at our suggestion, with helper on and Light room. It sounds substantially worse on the phone. Actual baseLatency is 0.170667 s, outputLatency 0.36 s, estimated load 36%, source quality still Full. Seed 293169949, context 12.437 s. Callback windows show intervals up to 245 ms, one reported underrun lasting 0.1707 s, scheduler max tick only 21.2 ms, no recoveries or budget hits, no source clock corrections. Hidden interval 5.699 wall seconds / 5.304 audio seconds (0.93069x); this is not the earlier severe helper-off catch-up. These are different seeds and unequal durations, so do not claim a controlled DSP throughput regression or normalize the event counts into an established failure rate. Honor the physical listening result: restore 100 ms and do not continue escalating to 500 ms/1 s as a presumed fix. Larger requested buffers changed actual device/burst pacing and did not improve this device. No default change.

Additional main-thread attribution: two desktop Chrome CPU sampling captures of the exact encoded setup and seed 356633754, helper on, Full/2x and Light shared room, with CDP 4x main-thread slowdown. One uses desktop 10 s lookahead, the other spoofs Android only to exercise the actual 20 s mobile scheduling policy. This does not throttle the audio rendering thread like a phone, model Android power management, or reproduce a physical lock. No runtime source edits were made during the physical buffer comparison.

The 20 s policy capture's longest instrumented tick was 30.1 ms, longest instrumented planBar 9.9 ms, and no rebase occurred. Sampling attributes about 50 ms inclusive across the observation to native drum scheduling and about 48 ms to planning; these are aggregate weighted samples, not per-hit timings or separate additive CPU totals. The 102 ms physical planning tick was not reproduced. The broader main-page samples include timeline drawing while visible, with the page largely idle over the observation. This supports retaining native drum graph construction as a measured main-thread target, but does not identify it as the cause of the two physical audio gaps or justify changing composition/scheduling. Raw profiles and method: workspace outputs/main-planning/{desktop-main.cpuprofile,desktop-report.json,main.cpuprofile,report.json}, phone-preview/profile-main-planning.mjs. No fresh test/build is needed for this profiling-only slice; the served version-3 build remains unchanged.

Phase: engine performance/output validation alongside Phase 5. Remaining: rare helper-on gaps at the 100 ms baseline, sustained Pixel/Surface DSP budget and subtractive batching. Direct next: attribute audio-thread burst/deadline outliers with helper on and the existing 100 ms buffer; distinguish source/room/native graph work from browser/device scheduling before another phone test or runtime change. Keep any native-drum and subtractive-batching optimization behind existing sound/parity and actual-arrangement acceptance gates. No public deployment or source commit/push.


## Full-room 100 ms phone repeat and actual audio-thread attribution - 19 October 2026

Physical Pixel Chrome repeat: requested/base buffer 100/101 ms, helper on, Full/2x sources and now explicitly Full FDN room (quality=1), Perf, seed 293169949. User heard a few gaps after some time locked. Hidden duration is 55.613 wall seconds / 55.488 audio seconds (0.99775x), with no sustained catch-up failure. Source resyncs/skipped/dropped/late are zero; scheduler max gap 107 ms, max tick 25.8 ms, no recoveries, one budget yield with 18.61 seconds queued. Current platform counters show zero but totalDuration is only 5.5852 s and was frozen at 3.2445 s through the hidden interval, so this is not a clean locked-playback acceptance pass. Output remains finite and nonzero; the largest callback interval retained in the final 32 windows is 112 ms. Keep the user's heard gaps as the reliability result. The old stored startup silence entry is unrelated.

Completed a desktop Chrome trace of the actual encoded setup, same seed, 100 ms buffer, helper on, Full synthesis and Full shared room. Android UA selects the 20-second scheduling policy only; no CPU throttling, physical-phone emulation or claim of reproducing its dropouts. Actual Worklet sources and effects are traced, not a synthetic isolated render loop. An untraced 12-second hidden phase precedes a separate 20-second trace. Page remains hidden; settings, phase and graph construction are preserved in the artifact. No runtime source changes.

The sampled AudioWorklet profile assigns about 1492 ms to the FM-bank process, 558 ms to the FDN process and 15 ms to metering. These are weighted active V8 samples, not total audio-thread utilization, exclusive native C++ cost, or additive realtime guarantees. All three share the same AudioWorklet thread. Native render spans show about 201 output requests / 20 s, requesting 4800 frames (100 ms). RequestRender wall p99 37.3 ms / max 43.2 ms in the traced desktop run; individual 128-frame Render quanta p99 1.336 ms / max 4.647 ms. The destination's waiting span is nested around this work, not another 5.94 seconds of CPU. Browser/native processing outside sampled Wasm remains significant; V8 sampling alone does not resolve it. Main-thread sampled activity is only 47 ms over this trace, with clean scheduler/source clocks. This did not reproduce a 100 ms desktop deadline failure or identify the Pixel-specific scheduling cause.

Raw trace/profile evidence: workspace outputs/live-audio-attribution/{audio.trace.json,report.json,0.cpuprofile,1.cpuprofile,2.cpuprofile}; harness phone-preview/profile-live-audio.mjs. A preliminary matched ten-second native-span ablation gives full graph 2492 ms CPU, percussion room removed 2245 ms, all percussion removed 1769 ms. These removals change sound and are attribution experiments, not proposed listening settings or a phone fix. Repeated rotating-order measurement follows with the retained tool below.

New reusable tool: tools/profileAudioBursts.mjs (dev server required). It retains actual Wasm voices, helper-on, Full/2x, the requested 100 ms buffer, and phone lookahead policy; --query accepts the exact encoded setup, otherwise --preset selects a scene. --reverb=full|light selects the existing room quality. --modes=full,no-perc-room,no-perc, --seconds=5..60 and --repeats=1|3|5 control diagnostic removals and rotating order. Each graph has a six-second warmup, runs separately and closes before the next. Raw native traces, audio/wall spans, kernel/worklet cache identities, actual settings/kit/room/role names and scheduler state are saved. Missing native CPU spans or page errors fail the run. The measured RequestRender span includes the complete graph's native and worklet work; nested spans are not summed.


Repeated actual-graph attribution completes successfully: **15 measured runs**, no page errors or timeline recoveries, with raw traces and complete settings. Nine primary runs rotate full / no percussion room / no percussion over three repetitions; then three runs each use a diagnostic fixed 0.4 s lookahead for the full graph and no-percussion control. No CPU throttling or runtime source changes. Syntax/help checks pass. These are traced desktop CPU spans, not unprofiled phone throughput or proof of a physical dropout fix.

| Diagnostic condition | Median audio-thread CPU ms per audio second |
| --- | ---: |
| Full graph, normal 20 s hidden lookahead | 247.41 |
| Percussion convolution room removed, 20 s | 218.99 |
| All percussion removed, 20 s | 174.84 |
| Full graph, diagnostic fixed 0.4 s lookahead | 209.50 |
| No percussion, diagnostic fixed 0.4 s lookahead | 171.60 |

The matched seed/passage retains the same Wasm Glass Bells / Soft Pipes / Tine Keys / Round FM Bass patches and Full shared FDN room. Full versus percussion-room removal saves about 11.5% of the traced graph CPU; removing all percussion saves about 29.3%. These are diagnostic removals, not equivalent-sound optimizations. Sparse lead/counter activity in this actual passage limits generalization to other seeds and dense ensembles.

The normal background queue retains about 208-220 native drum source nodes (active plus future), while the short-window case retains six. Shortening the full graph's window lowers median CPU by about 15.3%; with percussion absent, the change is only about 1.9%. This supports native percussion's ahead-of-time graph construction as a substantial lookahead-dependent cost, rather than attributing the entire difference to Wasm event queuing or to composition generation. The lookahead comparisons ran as separate batches, so residual system/JIT/order variation remains; they are not a claim of sample-level causality or a universal percentage. The eight-second windows contain about 80 render bursts each; their maximum/p99 values are exploratory, not estimates of extremely rare stall probability.

**Do not ship the 0.4 s hidden lookahead as an optimization.** It would give up the resilience the 20 s event queue provides against Android timer freezes. The intended structural next experiment is an event-queued percussion source/backend that stores future hits as data and creates bounded active voice state near their sample frames, rather than hundreds of scheduled native Oscillator/BufferSource graphs. Preserve the existing drum patterns, envelopes, velocity/variation, pan, mute/kit controls, cancellation/seek/stop and room ownership. Keep the native engine as the reference; require dry/wet sound comparisons and timing/lifecycle gates before promoting a new source path. Do not silently remove drum reverb or change drum timbres to claim a CPU gain. Native physical-source fallbacks need the same future-node audit separately.

Evidence: workspace outputs/audio-burst-matched/report.json and nine raw traces, outputs/audio-burst-short-lookahead/report.json and three traces, outputs/audio-burst-short-no-perc/report.json and three traces. Reproduction from the repo: node tools/profileAudioBursts.mjs --seconds=8 --repeats=3 --seed=293169949, using --query with the saved encoded settings for the exact phone fixture. --lookahead is an explicitly diagnostic override; the default retains the current device policy. The running phone preview remains unchanged.

Phase: engine performance/output validation alongside Phase 5. Remaining: rare helper-on physical Chrome gaps, sustained Pixel/Surface budgets, a bounded percussion source path and subtractive batching. Direct next: prototype event-queued percussion with the original sound as the reference, then compare matched complete-graph CPU and cancellation/timing behavior before another physical phone test. This candidate reduces a measured cost; it is not yet an explanation or fix for every locked-screen interruption. No public deployment or source commit/push.


## Physical no-percussion three-minute run - 19 October 2026

A matched phone link was generated with seed 293169949 and the same four Wasm voice presets/settings. It disables every drum kit voice and sets percussion room amount to zero; it does not merely mute the role and does not shorten the scheduling window. A fresh desktop load confirms zero drum sources, kit asleep, percussion reverb disconnected/amount zero, and music playing. Other generated notes match exactly over a 70-second plan. Baseline/no-percussion links and verification: workspace phone-preview/no-perc-link.json, make-no-perc-link.mjs. The ordinary shared legacy hub can still contain two previously initialized bus objects; that alone does not mean the disabled percussion room is connected or active. The validation checks the actual percussion send, not an incorrect global hub-object count.

User supplied the no-percussion physical Pixel Chrome snapshot at 18:01:18 UTC, seed 293169949, context 182.773 s, helper on, Full/2x sources, Full FDN room (quality 1), requested/base buffer 100/101 ms. New silence-log entry at 17:58:15 UTC is 0.1 s at sincePlaySeconds=0, visible; this is startup, not evidence of a later locked dropout. Percussion chain is off in that startup description. The older 15:41 entry belongs to an earlier run.

Hidden event: wall 1792432703851 / audio 8.005333333; visible event: wall 1792432874729 / audio 178.821333333. Audio advances 170.816 seconds over 170.878 wall seconds (0.99964x), with no helper-off-style slowdown/catch-up. Source resyncs/skipped frames/dropped are zero, pad/bass each have one late event (time unknown); source lead steal count is 19 over the run. Scheduler has no recoveries or budget hits, max wake gap 165 ms, max tick 143.8 ms and still 16.16 s queued at copy. The isolated large tick is not proof of an audio dropout.

The latest burst-estimated load snapshot is about 29%, versus roughly 42-44% in earlier percussion-on snapshots, consistent with the measured headroom benefit but not a controlled average CPU comparison across identical phases/thermal state. Master windows remain finite and audible; no additional post-start rendered-silence entry is logged. One retained window has max callback interval 127 ms. Platform underrun count is zero, but its totalDuration is only 11.04 s and remained frozen through most of the hidden run; do not claim that counter certified the entire 171 locked seconds.

**Physical listening result:** the user reports, "I might have heard one very short blip but nothing noticable." Record this as near-clean playback over the roughly three-minute run, with at most one barely noticeable blip; do not upgrade it to strictly glitch-free. Compared with the repeated noticeable percussion-on gaps, this supports percussion processing/future-node cost as a meaningful headroom contributor, alongside the independent repeated native-span measurements. It does not establish percussion as the sole source of residual browser/device interruptions. No percussion sound or patterns have been replaced yet.

No runtime change, rebuild, deployment or source commit/push in this result-recording slice. Phase: engine performance/output validation alongside Phase 5. Remaining: bounded percussion source path, residual physical reliability, sustained device budgets and subtractive batching. Direct next: prototype event-queued percussion with the original drum sound/timing as the reference; keep helper-on/100 ms and the long background queue.


### 19 October 2026 - bounded Wasm percussion and 808-inspired audition

Implemented an original Rust percussion kernel, one persistent AudioWorklet source, an 8,192-event timestamp heap and 64 active hit slots. Future hits allocate no native oscillator, buffer-source, filter, gain or panner graph. The existing composition/patterns, long hidden lookahead, Full melodic quality, media helper and 100 ms phone baseline stay intact. `perc=wasm` ports the current 14 drum recipes; `perc=808` selects a separately labelled original 808-inspired kit. Native remains the default. Options → Sound engine exposes the temporary percussion selector; it reloads the page, survives normal URL rewrites/share links, and does not alter saved composition fields. The existing melodic engine switch remains independent.

`/tools/percussion-engine.html` compares native/current-recipes/808-inspired output with shared playheads and bar labels, individual-slot fixtures, tone/length/room controls, WAV downloads, offline timing/node counts and keyboard/touch pads. Its 808 mode adds longer pitched kicks, two-body snare/noise, multi-burst clap, tuned rim/tom, six-square metallic cymbal/hat voices, cowbell and a short open-hat choke. It is not circuit emulation. The original convolution percussion room remains for source-controlled A/B comparisons; migrating that room is separate work.

Sound/correctness: all 14 slots are finite and finish at 44.1/48/96 kHz in both models; sample-timed out-of-order hits, block determinism, level smoothing, bounded capacity/stealing, full-queue stop acceptance, old-future cancellation/new-hit replacement and repeated/forward worklet stamps are covered. Actual Chrome main-page playback, seek/stop/restart and mixed/drum-only WAV exports pass; stopped active/queued counts reach zero. Offline events are supplied in the processor constructor to avoid a real Chrome message-delivery race. The phone-sized comparison UI has three players/cursors and no horizontal overflow. Final full suite: **998 tests / 156 files pass**, with production build, source/artifact checks and diff whitespace checks passing. Chrome and desktop Firefox main playback, stop/seek/restart, identical pinned percussion plans, exports and comparison UI pass. Additional tone/length extremes at 44.1/96 kHz are finite, and aligned kick/brush/swish through the unchanged convolution room correlate above 0.999999. The actual HTTPS phone preview serves the 84,892-byte kernel and three-player comparison successfully; a desktop browser smoke test of that built page reports nonzero percussion output and no processor/page errors. Physical Pixel locked playback still needs the user test.

Nominal dry source parity at 48 kHz: 13/14 block-aligned single-hit waveforms correlate above 0.999999; the conservatively band-limited square hat is about 0.981 and 0.267 dB quieter. Unaligned pitched attacks differ deliberately: Chrome's native oscillator can use its default 440 Hz for the first partial render quantum before scheduled exponential frequency automation takes over (reproduced in isolation). The port starts at the requested pitch on the exact event sample, instead of emulating that transient. Dynamic filter sweeps update every 16 samples; fractional sample offsets/band limitation can also differ. No claim of bit-identical or universally listening-approved translation.

Matched main-page desktop audio-thread CPU (three rotating-order runs/model, 10 s measured after a 6 s warmup): native **273.79 ms/audio-second**, current-recipes Wasm **233.16** (**14.8% lower**), 808-inspired **229.55** (**16.2% lower**). Native retains 217–229 drum Oscillator/BufferSources at the snapshot; both Wasm paths retain zero and queue 59 hits in one worklet (peak active three). All measured new-source late/dropped/resync/skipped counters are zero. Same seed 293169949, Full/2x melodic sources, Full room, helper on, requested 100 ms, 20 s hidden lookahead. The percussion convolution room is unchanged. This is a structural source improvement, not a phone fix or a same-sound claim for the new 808 model. Evidence: workspace `outputs/percussion-source-bursts/report.json` and nine raw audio traces. Native per-run CPU spans vary; keep the complete range and median, not the fastest run.

Phase: performance/output validation alongside Phase 5. This source prototype and initial desktop gates are complete locally. Remaining: user listening/physical Pixel lock-screen comparison, sustained thermal and older-device budgets, percussion room migration, and the separately planned subtractive batching work. Direct next: try the same pinned seed/kit with `perc=wasm`, helper on and 100 ms, then compare against native; audition `perc=808` separately as a new sound. Do not promote either as the default or claim a phone fix from desktop measurements. No public deployment or source commit/push is part of this checkpoint.

Implementation and reproduction:

- Kernel: `synth-engine/percussion/src/lib.rs`; worklet: `public/synth-lab/percussion-processor.js`; bridge: `src/app/engine/wasmDrumKit.js`. Original code and deterministic generated noise; no external synth core, sample ROM or factory patches. Source/artifact hashes and cache versions are in the normal `npm run synth:build` / `synth:check` workflow.
- Original kit reference: `src/app/engine/drumKit.js`; per-drum recipes, balances, panning and controls retain their existing slot indices. The shared lifecycle avoids constructing 14 unused native strips in the derived source. New engine state uses 2,621,440 bytes of Wasm linear memory at 48 kHz, including preallocated event/voice storage, deterministic noise and band-limited tables. There is no memory growth while queueing or rendering the stress fixture.
- `node tools/auditPercussionEngine.mjs`: native/port single hits including aligned automation, then rotating-order three-run dry electro grooves. Saves `.tmp/percussion-engine/report.json`. This is offline elapsed time, not real-time CPU/deadline evidence.
- `node tools/auditPercussionPlayback.mjs`: actual main source choice/link persistence, playback/seek/stop/restart, mixed and isolated-percussion WAV exports, and phone-sized comparison UI. Saves `.tmp/percussion-playback/report.json` and `phone-comparison.png`.
- `node tools/profileAudioBursts.mjs --seconds=10 --repeats=3 --modes=full,wasm-perc,808-perc --query=ENCODED_QUERY`: same helper-on/100 ms main-page protocol and existing Full-room pinned passage (seed 293169949), 20 s hidden lookahead. `SYNTH_PROFILE_DIR` selects evidence output. Native `AudioDestination::RequestRender` complete-span thread CPU, without summing nested spans; model order rotates. No device/CPU emulation. New stats retain active/queued/peak-active, steals/dropped/late, memory and monotonic clock counters in Copy diagnostics.
- The long convolution room is intentionally retained. CPU reductions isolate source scheduling/rendering; they cannot be added to earlier ablation percentages. The 808 model changes timbre/envelopes/choking and is not a same-sound optimization. The old no-percussion link still removes both the kit and its room and remains a separate diagnostic.
- The implementation uses the [W3C Web Audio filter definitions](https://www.w3.org/TR/webaudio-1.0/#BiquadFilterNode) (LP/HP Q in dB, bandpass Q linear). The sound design takes inspiration from the instrument/control families documented in [Roland's TR-808 technical specifications](https://support.roland.com/hc/en-us/articles/201963539-TR-808-Technical-Specifications); it does not use Roland ACB, copy a circuit implementation, or claim an authentic hardware recreation.


### 19 October 2026 - compact physical-device diagnostics

The user confirms the remaining small hiccup in the first physical `perc=wasm` run occurred **during locked playback**, not on unlock. The supplied partial snapshot is 105.35 audio seconds, seed 370696030, Full sources, helper on, 101.33 ms base latency, one reported 101.4 ms platform underrun and a current burst load estimate around 35.6%. Its four accumulated silence-log entries are visible startup events. The message truncates in output history before transport/source/room counters; no source/scheduler failure can be inferred. Platform coverage is only 11.925 reported seconds and previously freezes while hidden, so it does not certify the whole run. This seed differs from the prior pinned 293169949 comparison. Evidence: workspace `outputs/physical-percussion-wasm-2026-10-19.json`.

The chat message limit blocked sharing the rest. Audio now offers **Copy summary** first (about 3,100 characters on actual dev/HTTPS UI checks), keeps **Copy full diagnostics**, and adds **Save full report** as a local text download for attachment. The summary puts current context/transport and percussion-first source counters ahead of bounded history, includes completed hidden wall/audio intervals and rolling platform ranges, preserves unavailable values instead of turning them into zeros, and explicitly warns that platform counters can freeze while hidden. Full export retains the original complete history. Native drum source counts are now observable too. All formatting runs only on user copy/save; no audio graph, quality, rendering or scheduler change and no automatic upload. The phone menu keeps the buttons visible inside its scroll area.

Validation: 30 targeted diagnostics/load-meter/engine-control tests pass, production build and Rust source/artifact checks pass. Actual Chrome at 412 x 915 verifies compact clipboard text, full clipboard text, complete report file contents and bounded menu layout in both dev and the built HTTPS phone preview; no page errors. This is a diagnostic usability fix, not a playback fix. Phase: physical/output attribution. Remaining: identify the residual locked gap and validate sustained device headroom. Direct next: reload the HTTPS phone page, repeat with helper on / 100 ms, then use Copy summary after a heard gap (or attach Save full report). Avoid further buffer/quality changes until those counters are available.


### 19 October 2026 - first clean matched Pixel lock-screen run with Wasm percussion

User listening result: **"No drop outs"**. This run uses the pinned seed **293169949**, four native-Wasm FM voices plus the **current-recipes Wasm percussion** (`perc=wasm`), Perf on, Full source quality, Full 16-line melodic room, helper on and 101.33 ms actual base latency (100 ms request). Ambience is off. Total snapshot time is 220.2667 audio seconds, including **212.601 wall / 212.568 audio seconds locked** (0.999845x). The audio clock stays essentially in real time across the lock; this is the first unambiguously clean listening report with percussion still enabled on the matched passage. Source/DSP/runtime are the same as the preceding source prototype; the immediately preceding slice only made the diagnostics short enough to send. Do not attribute this success to a new audio fix in the summary controls.

The percussion snapshot has one active voice, 45 queued hits, peak active three, zero native source nodes, zero steals/dropped events/resyncs/skipped frames, and 2,621,440 bytes of Wasm memory. Every melodic source also reports zero dropped events/resyncs/skipped frames and the same frame 10,560,000. Transport has zero recoveries, maximum wake gap 120 ms, maximum tick 101 ms, and one hidden-entry budget hit (25.7 ms, 16.0359 s already booked against a 20 s target). It still has 15.6473 s queued after return. The one shared melodic FDN room is active, four clients, Full quality, decay 6 s. The original percussion convolution room remains unchanged.

Limits: percussion late=2 and pad/bass late=1 each are cumulative without timestamps; the two-voice lead has 19 steals. Do not claim that all source counters are zero or assign those events to startup without evidence. There were no heard dropouts. Current output RMS is 0.0145, output history RMS 0.0122–0.0189 over the retained 32 windows, no non-finite values and maximum recorded callback gap 85 ms. The latest stored silence entry is a visible startup 0.1 s event at sincePlay=0, not a locked gap. The current 42.55% burst estimate is neither a matched average nor proof of a fixed utilization improvement.

Chrome platform underrun counters are zero but cover only **6.953 reported seconds**. They were mostly frozen while hidden (1.9409 s at hide, 2.9032 s at return). The positive full locked-interval result comes from the user's listening report together with the stable clocks, not platform counters alone. This is a successful roughly 3.5-minute physical trial, not certification of arbitrary-duration, thermal, all-preset or all-device reliability. Retain the previous partial one-hiccup report as well; do not erase the remaining intermittent history.

Evidence: workspace `outputs/physical-percussion-wasm-clean-2026-10-19.json`, from the complete compact summary at 18:54:23 UTC and the explicit listening result. Documentation-only checkpoint: no new audio code, quality change, build, deployment, default promotion, commit or push. Phase: bounded percussion prototype and first matched physical listening gate passed. Remaining: longer locked sessions, other/hybrid arrangements and the 808 kit, older-Surface validation; percussion-room migration and subtractive batching remain separate optimization work. Direct next: keep helper on / 100 ms / Full as the working configuration and expand sustained/arrangement coverage instead of repeating buffer experiments.

### 19 October 2026 - percussion as a preset voice

Percussion now exposes **Felt, Crisp and 808 whole-kit voice presets** on the main track. Clicking its track name/pencil focuses the voice selector. Loading/resetting a voice sets its palette, per-instrument balance and room, while preserving track volume, mute/solo and rhythm settings. The current palette has eleven named pads; the fourteen historical recipe/event IDs remain compatibility storage. Felt/Crisp keep their saved IDs and default balances. The appended `tr808` ID is deliberately non-numeric so JavaScript key ordering cannot shift old share-code indices; it fits the existing two-bit kit enum. 808 is marked Wasm-only, with named closed/open hats and cowbell; its cowbell starts at 35% and other metallic extras are balanced below the beat. Detailed controls and edited markers follow the actual selected palette; unused legacy alias controls do not mark a voice edited.

The backend is independent: Native remains the Felt/Crisp default; Options selects Native/Wasm. Choosing 808 prepares a percussion-only Wasm source, preserving melodic engine selection. Once prepared, Felt/Crisp can use the same Wasm source. Existing `perc=808` links migrate to saved `drums.kit=tr808` plus `perc=wasm`, preserving their existing drum edits (rather than silently rebalancing old links). New 808 selections load the balanced preset. Settings/share links, reload, saved setups and WAV rendering carry the voice. A failed explicit load restores the prior voice and edited kit and shows the error.

Wasm resolves each queued logical attack against the voice and tone/length controls current at onset. Already sounding hits retain their source timbre; level controls still smooth as before. Live kit changes retain the persistent source and long queue. Native compatibility rebooks only future hit nodes at their original times; active hits retain their tails. Switching Native to 808 transfers remaining future bookings after module readiness, fades/disposes the old source, and leaves transport/planning intact. Stop/seek cancellation and offline constructor-message initialization remain in place. No source default promotion, lookahead shortening, melodic-quality change or percussion-room migration is included.

`/tools/percussion-engine.html` now selects the voice separately from the live backend, labels all eleven actual instruments and offers a plain fixed groove by default with explicit variation. Felt/Crisp render two matched Native/Wasm players; 808 renders one Wasm player. Shared cursors, live touch/home-row pads and WAV downloads remain. The raw fourteen-slot reference fixtures and busy automated-reference groove remain available to source audits. The separate `/tools/percussion.html` historical groove-review page remains unchanged.

Validation: **1,011 tests / 158 files** pass; 32 focused tests pass again after the final edited-marker refinement. Production build and source/artifact checks pass. Actual Chrome playback verifies Native→808 preparation, all three voices, retained plan/transport, no dropped events/resyncs, stop/restart/seek, finite unclipped full/solo exports, share/reload and old-link migration. A 20-second test queue retains the same Wasm source and 56–60 future hits through Felt→Crisp→808→Felt, with zero native hit sources/dropped/resyncs/skipped frames and unchanged 2,621,440-byte memory. Eleven-pad Native/Wasm voice sweeps correlate 0.9980 (Felt) / 0.9975 (Crisp), RMS differences under 0.01 dB; this is a waveform check, not a listening verdict. All fourteen raw reference recipes, twelve extreme-control/rate cases and three wet parity cases pass. Mobile-width bench has correct names, player counts and no horizontal overflow. Built HTTPS phone UI preserves 808 on reload, selects Wasm and disables incompatible Native, with no page errors.

Evidence: workspace `outputs/percussion-voices/report.json`, `long-queue.json`, `playback/report.json`, `raw-parity/report.json`, `production.json`, phone screenshots, `vitest.txt` and `build.txt`. Current percussion kernel: 85,619 bytes, Wasm SHA-256 `0d1007956f64faef71b6a90f869d7c13ee24b2dccb34b928a8be3c8d85756b53`. Source controls changed since the earlier clean physical Pixel run; that positive listening result remains historical evidence, not a fresh physical certification of this build. Timing collected during functional audits is not used for a new speedup claim.

Phase: percussion voice/preset cleanup implemented and validated locally; the HTTPS phone preview has the new build. Remaining: listening/balance across styles and longer locked sessions, hybrid arrangements and Surface coverage; percussion room migration and subtractive batching remain separate optimization work. Direct next: reload the phone preview, keep helper on / 100 ms / Full, choose Felt/Crisp/808 as voices and compare their sound in the same passage before expanding the kit library. No commit, push or public deployment in this slice.

### 19 October 2026 - hand-kit foundations, then new groove families

Completed the kit foundation first: **Hand percussion** is the fourth whole-kit voice, Wasm-only and independent of the melodic engine. Its eleven logical pads are Low conga, Muted conga, Seed shaker, Woodblock, Tambourine tap, Tambourine shake, Bongo, Palm clap, Cabasa, Seed sweep and Claves. New source model 2 uses modal sine bodies/wood tones, a quiet filtered contact layer, softened jingle clusters and seed textures. The preset lowers metallic/wood extras and uses 10% room. The same 64-voice / 8,192-event worklet, onset-time controls, cancellation, offline constructor initialization and original convolution room remain. No additional native future-hit nodes or separate per-pad worklets. Existing Felt/Crisp/808 recipes remain unchanged. MIDI now supports standard bongo/conga, woodblock/claves and tambourine notes, with appropriate Hand cabasa/open-shake routing; existing mappings and note velocity remain. Main Hear the kit auditions the eleven logical roles once, while raw fourteen-recipe reference fixtures remain available.

Then added five style families, each with three variants: **Bossa / light Latin** (two-bar clave/syncopated bass/shaker), **Jazz lounge** (ride pulse/triplet skips/brush comping), **Broken beat** (displaced kicks/backbeats and hat gaps), **Ambient percussion** (sparse four-bar taps/swells, no repeating backbeat or generic drum fill), and **Hand-percussion groove** (interlocking low/high drums, wood and seed shaker). Styles adapt to all five supported meters and obey section thinning/release, phrase/ending boundaries and bounded ornaments. They use a separate deterministic random stream. Main-generator tests preserve the melodic note plan across the new styles. The new styles work in Latest and Original without changing the older styles; ambient gets a soft closing swish instead of a generic final kick. Pattern edits still apply to unbooked bars, so an existing long background queue can delay the audible pattern change; this slice does not shorten/rebuild that scheduler window.

The bench now exposes **Groove variant 1/2/3 or From seed**, meter and seed, plus explicit ornament variation. Changing controls pauses old players and clearly marks them outdated until a new render. Player headings retain their rendered style/variant. Hand and 808 render one Wasm player; Felt/Crisp keep matched Native/Wasm players. Main rulebook style choices use the full friendly labels and survive rulebook/share reloads.

Compatibility: saved kit ID `hand` appends to the existing two-bit enum (now all four values are used). Do not widen/reorder that enum for a future fifth kit; append an extension. The old three-bit style field is frozen to its first eight IDs. A new four-bit full-style field is appended after every previous music field, preserving old link decoding and later fields such as independent harmony/tonality. Default links still omit unchanged data. Current rulebook codec stores style values as strings, so no rule ID or wire format changes were needed. Old released phone-link fixtures and all kit/style combinations round-trip in tests.

Validation: **1,020 tests / 160 files** pass, including deterministic/distinct variants in every meter, bounded finite events, section/anchor protection, seed repeatability, old links, independent melodic planning, kit preparation and MIDI mapping. The source kernel exercises all fourteen IDs in all three models at 44.1/48/96 kHz, queue/lifecycle and control changes. Actual Chrome runs 24 finite unclipped palette/control renders: all four kits across five new styles, plus Hand extreme tone/length at 44.1/96 kHz. Main playback retains the same Hand worklet across fresh 20-second-lookahead starts for each style and Felt/Hand switching, with zero native hit sources/dropped events/resyncs; stop clears hits, and all five solo style exports are finite/nonzero/unclipped. Main Hand initialization leaves the melodic engine in Previous. Hand kit/style/10% room survive share reload; a real rulebook Jazz choice also survives reload. Phone-width bench has eleven correctly labelled pads, proper 6/8 cursor geometry, one player and no horizontal overflow. The rebuilt HTTPS phone preview also renders Hand in seeded 5/4 and retains Hand + Bossa through a real rulebook selection/reload while the melodic engine remains Previous; incompatible Native percussion is disabled. Production/source checks pass; functional audit timings are not a new speedup claim.

Evidence: workspace `outputs/percussion-foundations/report.json`, `phone-hand.png`, `vitest.txt`, `build.txt` and raw-reference results; reproducible `npm run audit:percussion-palette`. New kernel: 89,373 bytes; SHA-256 `16b01482b6d162600d6fccc60151723689344d919eaa7c7225b1f893674e2e58`. The earlier clean physical Pixel listening run remains historical evidence for its build, not physical certification of this new palette.

Phase: requested kit-foundation and style slices are implemented and validated locally, and the phone preview build is refreshed. Remaining: listening/balance feedback, longer locked sessions across kits/arrangements and older-Surface checks; percussion-room migration and subtractive batching remain separate performance work. Direct next: audition Hand Percussion on its own, then compare Bossa, Jazz, Broken, Ambient and Hand styles at the same tempo/seed; retain helper on / 100 ms / Full for the next phone session. No commit, push or public deployment in this slice.


### 19 October 2026 — percussion scene integration checkpoint

Main-track whole-kit selection and twelve original/revised scene pairs are implemented and validated locally. Original scenes are retained unchanged; **Updated** is last in the browser, paired selections retain the seed, and Sounds/Composition apply percussion voice versus groove separately. Existing pad balances transfer by logical role; kit-only 808 revisions compensate for their longer sustained body. Full tests (1,009 / 162 files), changed-area tests, production/source build, 27 actual Chrome audio renders and rebuilt HTTPS preview checks pass. No DSP kernel change or new speedup/physical lock-screen claim. Details, scene list, evidence and listening next steps: [music-generation checkpoint](MUSIC_GENERATION_PLAN.md#19-october-2026--main-track-percussion-voices-and-scene-comparisons). Direct next: listen to Updated pairs and extend helper-on / 100 ms / Full locked tests. Room migration and subtractive batching remain separate; no public deployment or commit in this slice.


### 19 October 2026 — Hand source level correction

Dedicated per-pad Hand gains correct low source energy; Morning coffee · Bossa also has stronger scene-specific kit trims. Its percussion stem is approximately 10 dB stronger than the prior revision, with matched transient peak and about 3 dB less RMS than the denser original Lo-fi beat. Felt/Crisp and 808 remain exact in 84 PCM fixtures. Affected tests, finite/unclipped Chrome ensemble/control renders and production/source checks pass; the HTTPS preview is rebuilt. Kernel: 89,506 bytes / `ed267d4cd7461d1ca0badfc03abed50f9f3c69d61c8e6001f42a933e761894f1`. Details and evidence: [Hand balance checkpoint](MUSIC_GENERATION_PLAN.md#19-october-2026--hand-source-level-and-morning-coffee-balance). Direct next: reload and reselect the revised Morning preset, listen to Hand/Felt with the same beat, then resume physical locked coverage. No speedup or new phone stability claim; room migration and subtractive batching remain separate. No public deployment or commit.
