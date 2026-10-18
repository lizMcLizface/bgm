# Synth handoff: sound design and backend optimization

Updated 18 October 2026. Use this as the starting point when resuming either track.

## Where we are

The subtractive and four/six-operator FM engines have their planned feature set, expression, mono/legato/glides, instrument inserts, individual delays, shared/private room routing and specialized-source adapters. `/labs/` now provides the common sound-design workspace: ten families and 138 built-in/library/recipe voices, with keyboard/touch/MIDI input, expression macros, captured-chord arpeggiation, mini pianos and a small generative runner. The main generator has a saved experimental Wasm option, **off by default**. Its scene sounds are translated; full laboratory patch JSON and the generator's flat sound presets remain separate formats.

The common stress matrix and first DSP profiling pass are complete. Latest validation: **795 tests / 120 files**, production build/source-artifact checks and Chrome/Firefox development/production lab audits passed. The earlier main-page opt-in/export audits remain recorded in the plans. This integration does not change Rust kernels. Keep **2× FM** as the working default. Dedicated chip articulation remains excluded; the old engine remains available.

References:

- [DSP profiling: findings, full timings and reproduction](SYNTH_DSP_PROFILE.md)
- [Complete-graph stress results and measurement limits](SYNTH_STRESS_RESULTS.md)
- [Subtractive/backend plan and checkpoints](SYNTH_ENGINE_PLAN.md)
- [FM architecture and plan](FM_SYNTH_PLAN.md)
- [Music-generation and preset-listening plan](MUSIC_GENERATION_PLAN.md)

## Track A — work on the sound now

Sound design can proceed with the current laboratory engines while the optimization work is developed separately. Treat audible character as the reference that optimizations must preserve.

### Immediate next session

Start with sustained strings, textured pads and expressive leads: these were a major reason for building the engine. Bowed glass pad, Rosin silk and Layered noir are useful starting recipes, rather than a requirement to keep their current character. Establish the desired sound by listening before expanding the engine again.

1. Shape the dry source: oscillator/operator balance, envelope, filter, bow/air and body. Audition both low and high registers and soft/hard playing. Check that texture follows the tone instead of becoming detached hiss.
2. Listen to short notes, a sparse phrase and a long held chord. Preserve enough sustain and release to fill long pad bars; expression should not make every note unnaturally short.
3. Test overlapping notes, manual legato, continuous held glides and chord changes. Normal musical transitions and deliberately unsettling pitch motion need distinct patch choices. Choir glides and stronger bends are useful colours, not universal defaults.
4. Add instrument inserts and its own delay, then choose shared or private reverb. Keep the dry tone audible enough to judge it. A pad/drone can request a long private room while drums retain a shorter room; individual delay timing/ping-pong remains part of the instrument's identity.
5. Save promising versions as complete versioned patch JSON, with a short listening note. Compare them on the same notes and at similar perceived level, first alone and then in an ensemble.

For each candidate, retain: name/version, engine and starting recipe, intended role/register/mood, complete patch JSON, a repeatable phrase/seed or note list, room/delay routing, what improved, and remaining problems. Avoid relying only on a screenshot or a recipe index that may change. Record the kernel build identity when retaining reference audio across optimization work.

### Existing listening workspaces

| Workspace | Use |
| --- | --- |
| `/tools/synth-lab.html` | Subtractive architecture, oscillators, envelopes, modulation, keyboard and patch import/export. |
| `/tools/fm.html` | FM routing/operators, sustained glass/strings, expression, keyboard and patch import/export. |
| `/tools/acoustic.html` | Air/bow, vowels and body; check noise balance and sustained character. |
| `/tools/behavior.html` | Overlap, legato, glides, sustain, held patch transitions and manual keyboard checks. |
| `/tools/sources.html` | Piano, plucks, percussion and mixed-source context. |
| `/tools/ensemble-synth.html` | Ensemble/effects-routing context and shared versus private rooms. |

Start at `/labs/all/` for the large categorised picker, expression panel and pinned input preview, or `/labs/strings/` for a family bench. Each bench can select all 138 voices across strings, keys/bells, choir, organs, drones, bass, plucks/mallets, winds/brass, synth leads and pads/textures. Five test arrangements retain their actual scene instruments except for the selected voice under test, which stays fixed across context changes. Search and engine/New badges expose provenance: 27 new Wasm-only lab recipes/variants, five new rounded prepared sources, nine previous-only prepared piano/pluck patches, and 97 existing voices playable with the previous engine or an approximate Wasm translation. These are patches, not 128 separate synthesis models. Both-engine choices expose an engine selector; translations are neither timbre-identical nor level-matched comparisons. Family navigation retains MIDI and shared settings, with fitting test roles and per-family voice/role recall.

Local custom-variant retention, Wasm patch JSON import/export, per-part mutes, a synced timeline and upcoming-chord keyboards remain available. Open the existing synth/FM editors for full patch controls, then import the resulting JSON into a bench. Previous-engine sources support brightness, motion and level; lab patch export and pressure/texture/bend macros require a Wasm source.

Once a small set of sounds has clear musical identities, map them to actual scenes/presets and listen to the generated music. Keep the old sounds as an intentional alternative. Full generator adoption needs the integration step below; designing laboratory sounds does not automatically replace released preset voices.

## Track B — backend work to resume

### What the measurements actually identified

- **Long fractional FM envelopes:** a deliberately heavy all-six-operator curve-1.3 fixture costs about **2.9×** its matching linear fixture in both browsers. `powf` accounts for about **64%** of active Chrome CPU samples in that case. A single short curved attack does not incur that whole multiplier.
- **Common per-note acoustic colour:** all texture mixes cost about **2.93× / 2.25×** plain subtractive in Chrome / Firefox. The held Chrome texture profile attributes about **54% inclusive** to `Colour::tick`.
- **Ordinary synthesis:** cost follows active voices, FM operators/oversampling and subtractive layers/unison. Much of FM remains inlined in `Fm::render`; current samples do not identify one dominant instruction within it.
- **Smaller targets:** colour coefficient refresh is only about 2–3% inclusive in the sampled texture cases. A room's twenty-second decay costs roughly the same per fixed window as eight seconds. More room instances still cost more. Larger direct blocks did not provide a consistent major win.

### Next optimization slices

1. **Shared colour arithmetic, exact first:** investigate caching the per-band denominator/reciprocal currently recomputed each sample from unchanged coefficients. Examine redundant disabled-band/noise-path work next. Preserve coefficient smoothing, pressure response, parameter changes, bypass, ringing tails and voice retirement. Require sample-exact comparisons for changes that only move invariant arithmetic.
2. **Fractional envelope evaluation:** retain the inexpensive existing linear/quadratic paths and investigate a faster arbitrary-curve path. Any approximation needs a declared/measured error bound over the supported curves and very short/long attack, decay and release times. Verify stage endpoints, keyboard-rate scaling, retrigger/legato, pressure/velocity transitions and audible shape. Do not flatten or disable curves to obtain a better benchmark.
3. **FM operator and subtractive lane loops:** obtain deeper attribution or controlled experiments before choosing changes to topology traversal, state/bounds work or specialization. Preserve oscillator/feedback ordering, phase continuity and held patch edits. Static frequency/scaling helpers alone were a small sampled share, so do not assume caching them will solve the plain render cost.

The exact colour change is a practical first implementation slice; the fractional-envelope path is the largest clearly named math hotspot in the heavy curve fixture. Keep them independently reviewable and measurable.

### Validation for each meaningful optimization

1. Retain the preceding kernel/patch/fixture as the comparison reference. Match the fixture and build provenance; regenerate named profiling builds after a kernel change.
2. Run relevant correctness tests and direct-kernel parity/error measurements. Cover 44.1/48/96 kHz and all FM quality tiers where applicable, plus block-size independence, acoustic transitions/tails and the corrected legato handoff.
3. Repeat the matched profiler cases in Chrome and Firefox, sequentially, with warm-up and repeated unprofiled medians. Keep sampled CPU attribution separate from timings. Record any sound/error tradeoff alongside the speedup.
4. Repeat representative complete mixed graphs, private/shared rooms and live fluid cases. Inspect **audio-clock progress as well as event queues and FPS**: oversized loads previously kept smooth graphics and clean queues while audio fell behind.
5. Run the full tests/build before declaring the slice complete, update the plans, and re-audition retained reference sounds.

Do not run timed benchmarks concurrently with sound auditions or other heavy builds/renders. Development of patches and backend changes can overlap, but their listening and measurement sessions should be coordinated so results remain useful.

### Tools and retained evidence

With the development server on port 5173:

```powershell
npm run synth:profile-build
npm run audit:synth-profile
npm run audit:synth-stress -- --suite=core --repeats=3
```

The profiler uses separate named artifacts in `.tmp/dsp-profile`; normal artifacts stay in `public/synth-lab`. Set `SYNTH_PROFILE_DIR` / `SYNTH_AUDIT_DIR` to retain each new result separately. Firefox uses `SYNTH_BROWSER=firefox` and `SYNTH_BROWSER_PATH`. Detailed flags and limits are in the two results documents above.

Original task evidence lives under `C:/Users/rimuru/Documents/Codex/2026-10-16/so/outputs/`: `dsp-profile`, `dsp-profile-extra`, `stress-matrix`, `stress-addendum`, `stress-live-*` and `stress-ui-*`. Seven `.cpuprofile` captures are retained. These are local outputs, not committed benchmark fixtures; retain them when moving work to another machine.

## Bring the tracks together

After measured optimization, repeat moderate loads on **physical phones**, longer audible Firefox sessions and sustained/thermal workloads. A narrow desktop viewport is not a mobile performance result. Direct-kernel throughput is not an AudioWorklet deadline or hardware-underrun measurement.

Use those results to choose conservative quality/polyphony/room budgets before making Wasm the default. An experimental generator-to-backend adapter, native-source fallback and old-engine selection are now implemented, including offline export. Scene-specific voicing, a common saved-patch format for main-page scenes, exact legacy expression/morph parity and automatic room pooling remain further integration work. The benches currently own one room per Wasm instrument (plus the independently playable audition voice), with individual native delays; they do not yet use the ensemble lab's room-sharing policy. Keep sound identity, long pad tails, cohesive expression, delays and room ownership as listening criteria.

## Phase and immediate handoff

- **Current phase:** experimental site integration and instrument audition workspace complete locally, alongside performance validation and music-generation Phase 5 sound/preset listening.
- **Ready now:** `/labs/` with ten families, 138 voices, engine/New badges, faithful backing contexts, live expression/MIDI/arp and retained patches; main-page Wasm opt-in and WAV export.
- **Backend remaining:** targeted optimization, renewed full-graph stress, actual-device/thermal/audible checks, budgets, room pooling and production-quality preset/expression mappings.
- **Next sound action:** audition strings and keys in the new benches, retain stronger candidates and identify missing instrument character before adding scene presets.
- **Next backend action:** prototype the exact shared-colour invariant-arithmetic improvement, then compare PCM and repeated timings before proceeding to fractional envelopes.

This file is a saved roadmap, not a running background optimization job. At the end of each future slice, report the phase, what remains and its direct next step, and update the relevant plans.

### Lab session continuity and expression centring — 18 October 2026

Lab family links and the hub now navigate within one mounted bench. MIDI access, selected device/channel, the running generator, velocity response, expression values and arp settings survive normal family switches and browser Back/Forward. Only the played role's family voice changes, with per-family voice recall. Settings are shared across benches and retained on reload; MIDI device/channel preferences are retained too, while an actual full reload still creates a new MIDI connection session. Direct static URLs and modified/new-tab links remain available.

Expression value buttons and slider double-click reset that control exactly; a Reset expression button restores all six neutral values (level 1, other macros 0). Bipolar controls snap to zero during pointer drags without trapping fine keyboard adjustments. Targeted validation: 18 lab tests and production build/source-artifact checks pass. A Chrome virtual-MIDI audit verifies a single connection/handler across family/hub/history navigation, continued runner playback, settings and family-voice recall, live MIDI after navigation, slider reset/snap/keyboard precision, reload preferences and 390px layout. No DSP change. Phase: lab usability slice complete; Phase 5 instrument listening/tuning and backend/device validation remain. Direct next sound step is still strings/keys audition and retained patch refinement.

### Complete lab catalogue and faithful backing contexts — 18 October 2026

Expanded the common catalogue to 128 voices across ten families: strings, keys/bells, choir, organs, drones, bass, plucks/mallets, winds/brass, synth leads and pads/textures. All built-in calmbgm and non-init unCAGED patches and all subtractive/FM lab recipes are reachable. Original lab IDs and saved custom variants remain supported. Search and dropdowns/cards mark 27 New / Wasm-only recipes or variants, nine Previous-only prepared piano/pluck patches, and 92 Both-engine existing patches. Both means an approximate translation with an explicit engine selector, not identical timbre or matched loudness. These counts describe patches, not separate instrument models. New custom lab imports are marked New / Wasm only too.

Runner contexts now load their actual scene instruments, mixer levels and percussion style rather than generic substitute voices. Only the selected part is replaced by the voice under test; that voice stays fixed when switching contexts. For example, the café backing uses Felt Piano, Reed Lead, Thump Bass and the fallback second lead Soft Flute. Selecting a different part restores the former part's original context instrument. Bass and lead families choose fitting test roles, with per-family role/voice recall and existing MIDI/session continuity. Native backing instruments stay in their previous implementation; no main-page sound or DSP kernel changed.

Validation: 780 tests / 118 files and production/source-artifact checks pass. Chrome and Firefox development audits cover the catalogue, fixed test voice, faithful backing, engine selection, context swaps during playback, family navigation, virtual MIDI continuity and 390px layout; twelve sampled source/engine renders per browser are finite, non-silent and below full scale. Both browsers pass the same production interaction audit. Coverage tests verify every built-in source/recipe is reachable and asynchronous source replacement cannot install a stale pending source after returning to the current voice. Export uses the selected variant even while another audition graph is preparing. These checks do not replace physical MIDI/tablet or subjective listening tests. Existing ambience chunking warning remains.

Phase: lab catalogue/context correction complete locally, within Phase 5 sound/preset listening. Remaining: instrument-character listening/tuning, common scene-patch integration, measured DSP optimization and physical-device/thermal/audible validation. Direct next sound step: audition strings and keys against their actual musical backing, retain improved variants and identify character gaps. Direct next backend step remains exact shared-colour arithmetic optimization before fractional-envelope work. No commit, push or deployment.

### All-instruments iteration workspace — 18 October 2026

Added /labs/all/ as the final hub card and bench tab, with a large searchable picker grouped into the existing ten categories. All 128 built-in voices and retained custom variants keep their New/backend badges. Category filters narrow the cards without changing the selected voice. A separate desktop panel on the right contains expression, engine selection and the part under test; on narrow screens it stacks below the picker. The playable keyboard, velocity/MIDI/patch settings, ensemble context and arpeggiator follow below. A fixed input strip shows the current audition voice and held notes while browsing, with a keyboard/settings jump and Panic.

The workspace uses the same mounted audio/MIDI session as the family benches. Opening it preserves the current test role/voice, engine preference, expression and MIDI settings instead of selecting a family default. Custom imports inherit the selected voice's category. Existing family layouts still use the same shared expression controls, with exact reset and centre snap retained. The input preview is an audition/arp display, not a microphone analyser. No DSP or scene-composition change.

Validation: 781 tests / 118 files, production build and source/artifact checks pass. Chrome and Firefox development and built-page audits cover categories/search, voice changes, backend/New labels, engine switching, expression during held notes, virtual MIDI continuity, fixed input preview while scrolling, keyboard anchor navigation, family transitions/reload and desktop/390px layout. The built route is a real static entry. Existing ambience chunking warning remains; physical tablet/MIDI and longer audible-device testing remain the direct next evaluation.

Phase: audition-workspace slice complete within Phase 5 sound/preset listening. Remaining: instrument listening/tuning, scene-patch integration, backend optimization and device budgets. Direct next step: tablet/piano audition through the all-instruments workspace, retaining promising string/key variants and any device issues.


Deployment requested and completed on 18 October 2026: `npm run deploy` passed all 781 tests and the production/source-artifact checks, then published the current build to GitHub Pages (`gh-pages` commit `5881a2d`). A live Chrome audit at https://calmbgm.com passes the all-workspace picker, engine/expression, virtual MIDI, navigation, reload and narrow-layout checks. /labs/all/ is live for the user's physical tablet/piano evaluation. Source working changes remain local; only the deployment branch was published.

### Legacy-voice compatibility correction — 18 October 2026

User feedback identifies audible regressions in translated Celesta/Bell Lead/Haunted Celesta, classic keys, Rain Drops/Chimes, organs and hollow pads, plus missing or unrounded prepared plucks. These are compatibility defects, not acceptable implicit redesigns. [SYNTH_COMPATIBILITY.md](SYNTH_COMPATIBILITY.md) now defines the original engine as the reference, records the fixes and unresolved feature/effect mappings, and sets the next listening/measurement workflow. Do not infer faithful playback from a Both engines badge or from the new engine having a broad feature set.

Corrected inactive-square-sub injection, custom harmonic waveform loss, non-band-limited translated triangle, default analogue drift/drive, double chorus, legacy envelope and zero-time sustain behaviour, two-voice detune span, main-only unison, secondary oscillator independence, band-pass gain and master high-pass resonance. Haunted Celesta keeps its original inharmonic FM transient/sustained depth and independent detuned high overtone. Source-level calibration brings the dry C4 keys/bells close in level. Effect mapping carries rate/depth/feedback/EQ frequencies and echo tone; expanded chorus/flanger ranges avoid truncation. Known remaining room/modulation/source differences appear on selected translations; these fixes do not establish full parity.

The picker now exposes the five approved rounded prepared-source recipes with Worker preparation/native playback and Wasm effects. It also preserves five oscillator plucks as separate classic variants, rather than hiding them behind the later physical-string adaptation. Total: 138 built-in patches/variants, including 27 new oscillator/FM voices and five new prepared voices. Prepared sources support brightness, additive bend, motion and level; unsupported pressure/texture controls are disabled. JSON retains contact softness/body. First-note preparation is serialized and bounded; release, Panic and disposal cancel pending starts. The old physical-source references remain unchanged.

Validation: 795 tests / 120 files, production/source-artifact/cache-version checks, Chrome/Firefox development and built-workspace checks pass. Both browsers render 13 reported sources in the previous and translated engines plus five prepared sources with finite, non-silent, below-full-scale output and no leftover dry tails; live prepared input, quick release/Panic, JSON contact settings and runner playback pass. A 132-case comparison against the retained preceding kernels keeps every existing standalone subtractive/FM recipe sample-identical across rates/quality tiers. In the shared dry C4 fixture, Celesta/Bell Lead/classic keys/Rain Drops levels are within about 0.2 dB of their references; this is level calibration, not listening approval. Organs/hollow pads and wet effects still require actual-preset listening and broader sweeps.

Core/FM binaries are now 307,128 / 90,007 bytes; effects/inserts are 59,824 / 60,799 bytes (insert bounds changed, despite equal byte size). Additive tables increase core instance linear memory from 1,376,256 to 2,162,688 bytes; FM stays at 1,245,184 bytes. No new phone performance budget is claimed. Versioned Wasm/worklet URLs and source-check validation prevent stale cached kernels from interpreting new waveform IDs incorrectly. Previous profiling remains reference evidence; rebuild named profiling artifacts before timing new kernels.

Phase: Phase 5 legacy-voice compatibility/listening, still in progress. Remaining: original wet-room/modulation character, incomplete legacy FM/filter/tuning/envelope/control mappings, full register/velocity/ensemble sweeps and real-device latency/performance. Direct next step: re-audition the reported keys/organs/hollow pads and rounded plucks in the local all-instruments lab, then address the remaining wet-effect and FM gaps from matched references. This correction is local, not yet redeployed; the preceding workspace release remains live.


### One-click lab engine comparison — 18 October 2026

Replaced the workspace and ensemble engine dropdowns with buttons showing the active engine. Click to switch, or press B to toggle the current voice under test; the shortcut is shown on that voice's button. Single-engine voices display a disabled, fixed engine label. Typing/editing, modifier shortcuts, key repeat and the hidden bench on the labs index do not trigger a switch. Family navigation reads the current family when recording the selection. Switching retains the existing release-and-replace behaviour, saved per-part engine preference and live MIDI connection; held notes are released rather than transferred between engines.

Validation: all 33 lab tests / 11 files, production build and Wasm source/artifact checks pass. Chrome and Firefox audits pass button/hotkey switching, test-part targeting, typing/modifier guards, fixed voices, family/index navigation, MIDI continuity, reload persistence and 390px layout. Existing ambience chunking warning remains. No DSP changes or deployment.

Phase: Phase 5 compatibility/listening remains in progress. Remaining: legacy wet-effect/FM/filter/tuning/envelope/control parity, broader register/velocity/ensemble listening, scene-patch integration and device performance. Direct next step: use the new button/B comparison to re-audition the reported legacy voices against their previous-engine references.


### Chord headroom correction — 18 October 2026

Two-note Organ Whistle feedback exposed an always-on output saturation curve in the subtractive and FM sums and again on the effects return. This adds intermodulation even below digital full scale. Replaced those output curves with shared stereo-linked peak gain protection: unity below a 0.98 sample ceiling, immediate reduction for overload, 50 ms hold and 120 ms recovery. It allocates no render-loop storage and adds no look-ahead latency. FM protection follows the reconstruction FIR/DC filter, avoiding the former pre-FIR saturation and post-FIR hard clip. Intentional oscillator/filter drive and insert distortion remain. Native-engine dynamics and the final multi-instrument destination sum are unchanged; this is not true-peak or full master-bus protection.

The change applies to standalone recipes as well as translated voices. Their parameter defaults are retained, but the unwanted output coloration is intentionally removed; do not reuse the preceding sample-identical-PCM claim. Source-artifact hashes now include common/headroom.rs and versioned browser assets update with each rebuild. Panic/clear reset the protection state. Recovery tracks reduction towards zero to avoid f32 gain recovery stalling near unity at high rates.

Validation: 801 tests / 121 files and production/source-artifact/cache checks pass. Regression fixtures cover organ/bell chord linearity with matching note IDs, dense 32-note core/FM chords, stereo linking, quiet effects-return identity, recovery/reset, callback-size determinism and rates through 192 kHz. In the hard-velocity C4/E4 Organ Whistle fixture, best-fit summed-note residual improves from about -43 dB to -125 dB relative to the chord (source-only, not a subjective approval or a room-match claim). Chrome and Firefox each pass 16 complete two/eight-note organ/bell renders with dry/wet effects and a live Organ Whistle chord; final lab outputs remain below 0.687. Core/FM/effects artifacts are 307,441 / 90,238 / 60,126 bytes. Existing ambience chunking warning remains; no new device-performance certification.

Phase: Phase 5 compatibility/listening remains in progress. Remaining: wet-room/modulation character, incomplete legacy source/control mappings, broader register/velocity/ensemble listening and device performance; final ensemble/master gain staging also needs its own validation. Direct next step: reload the local lab and re-audition Organ Whistle chords at the original playing velocity, then continue the reported instrument comparisons. Local only; no deployment.


### Main-page engine comparison — 18 October 2026

Added a single Previous/Wasm button to the main header and V as its shortcut. V avoids the existing B percussion/snare binding. The control remains available in both hidden-interface modes and uses the same device-persistent opt-in as the existing Options checkbox; the previous engine remains the fresh-visitor default. Header, shortcut and checkbox share one asynchronous controller with preparation/busy/error feedback and protection against repeated concurrent switches. Typing, modifier combinations, repeated keys and modal dialogs suppress the shortcut. Switching keeps the existing Generator semantics: preserve preset parameters/seed and resume at the current bar, with native physical-source/percussion fallbacks retained.

Validation: 804 tests / 121 files and the production/source-artifact checks pass. Chrome and Firefox pass development and built-page audits for button/shortcut/options synchronization, playing/paused state, saved preference/reload, typing/modifier guards, hidden-interface access and 390px layout; the development audit also verifies unchanged seed and voice parameters. The existing Vite dependency cache was refreshed without changing configuration content. The existing ambience chunking warning remains. Release scope includes the accumulated standalone synth/FM/effects engines, instrument labs, compatibility corrections, headroom correction and these evaluation controls.

Phase: Phase 5 compatibility/listening remains in progress. Remaining: original room/modulation character, incomplete legacy source/control mappings, ensemble/master gain validation and real-device performance. Direct next step: compare actual main-page presets using Previous/Wasm and V, retaining specific instrument/effect feedback for the remaining parity work.
