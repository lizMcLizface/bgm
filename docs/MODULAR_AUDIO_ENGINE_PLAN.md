# Modular audio engine and parallel rendering plan

Agreed direction: 2026-11-09. Status: **M0/M1, the opt-in M2 percussion/sidechain
slice, M3a's actual six-role serial baseline, M3b owned FM, M3c owned core,
M3d pitched DAG, M3e bounded single-worker transport, M3f three-worker source pool
and M3g opt-in buffering profiles plus M3h queue-lead observability and M3i opt-in scheduling experiment plus M3j packet-arrival/headroom diagnostics and M3k run-bound listening records delivered**. The [M3 decision gate](MODULAR_AUDIO_ENGINE_M3_DECISION_GATE.md)
led to the [M4a finite All source preview](MODULAR_AUDIO_ENGINE_M4A_WORKBENCH_SOURCE.md).
On 2026-11-10 the user prioritized other voices/full-path behavior over lower
latency, extending the opt-in finite adapter to [M4b pitched sets](MODULAR_AUDIO_ENGINE_M4B_PITCHED_SET.md).
An explicit [selected-patch test-note audition](MODULAR_AUDIO_ENGINE_M4B_VOICE_AUDITION.md)
now activates sparse roles without editing the user's song. Phone Lead/counter /
Bass full diagnostic delivery and listening are clean; other families and
real-song acceptance stay separate gates.
[Owned percussion kit configuration](MODULAR_AUDIO_ENGINE_M4C_KIT_CONFIGURATION.md)
and the [finite All kit lease/compiler](MODULAR_AUDIO_ENGINE_M4C_ALL_KITS.md) are
delivered, with desktop six-source and phone four-source diagnostic gates
passed. Complete captured-pattern playback is next; normal migration stays gated.
Normal transport/default backend migration remains gated.

Verification cadence (user steering, 2026-11-10): automate local per-variant and
per-table checks; port larger batches and commit each verified step. Manual phone
checks are reserved for transport changes, live-path migration or unresolved
sound discrepancies, rather than a gate for each preset or source family.
[M4d piano preparation](MODULAR_AUDIO_ENGINE_M4D_PIANO_PREPARATION.md) now ports
modal felt/electric and base grand/felted/upright note generation into owned
Rust/Wasm, opt-in through the existing native piano worker/voice chain. This is
now extended by [M4e prepared owned piano voices](MODULAR_AUDIO_ENGINE_M4E_PIANO_VOICES.md):
finite per-voice playback, gain/filter envelopes, pitch, stereo-bus output and
owned allocation/release state. [M4f shared piano controls](MODULAR_AUDIO_ENGINE_M4F_PIANO_CONTROLS.md)
adds frozen sine, vibrato, filter-LFO and seeded-walk snapshots to v2.
[M4g prepared voice stealing](MODULAR_AUDIO_ENGINE_M4G_PIANO_STEALING.md) adds v3
slot lifetimes and the native pre-onset fade; same-slot steals below10 ms remain
rejected. [M4h fitted acoustic variants](MODULAR_AUDIO_ENGINE_M4H_MATCHED_ACOUSTIC.md)
adds all six matched shapes to preparation and owned graph playback.
[M4i measured-table pianos](MODULAR_AUDIO_ENGINE_M4I_MEASURED_PIANOS.md) adds the
eight actual measured families, with immutable portable tables and owned note
DSP. Iowa/classic/plucked adapters and live/host-effects migration remain.
All six source engines have owned mutable Rust state; core's read-only additive
tables are safely shared after preparation. External stereo host inputs and
graph program/key compression exist. All six sources now also run inside one
prepared, block-capable Rust DAG. M3e optionally moves that whole graph into one
dedicated worker with bounded PCM publication and serial startup fallback.
M3f partitions the sources across three workers and keeps the dependent Rust
master in the worklet. General graph distribution and workbench migration remain
future work. Foundation through M3c committed locally as `bc4e35d`, M3d as
`fa634f5`, M3e as `646183d`, M3f as `714ce43`, M3g as `733c2e6`, M3h as `c8ff2bb`, M3i as `b358bd9`, M3j as `7dea6bc`. Each completed verified step is committed locally
under the user's standing instruction. No push/deployment.
See [listening records and target-device evidence](MODULAR_AUDIO_ENGINE_M3K_LISTENING.md).
See [arrival/headroom results](MODULAR_AUDIO_ENGINE_M3J_ARRIVAL_HEADROOM.md).
See [opt-in scheduling results](MODULAR_AUDIO_ENGINE_M3I_TASK_PUMP.md).
See [queue-lead contracts and results](MODULAR_AUDIO_ENGINE_M3H_QUEUE_LEAD.md).
See [profile contracts and measurements](MODULAR_AUDIO_ENGINE_M3G_BUFFER_PROFILES.md).
See [three-worker contracts and evidence](MODULAR_AUDIO_ENGINE_M3F_SOURCE_POOL.md).
See [bounded worker contracts and evidence](MODULAR_AUDIO_ENGINE_M3E_WORKER.md).
See [pitched DAG contracts and evidence](MODULAR_AUDIO_ENGINE_M3D_PITCHED_DAG.md).
See [owned core contracts and evidence](MODULAR_AUDIO_ENGINE_M3C_OWNED_CORE.md).
See [owned FM contracts and evidence](MODULAR_AUDIO_ENGINE_M3B_OWNED_FM.md).
See [M3a measurements and limits](MODULAR_AUDIO_ENGINE_M3A_BASELINE.md). Read
[the handoff](MODULAR_AUDIO_ENGINE_HANDOFF.md) and
[the boundary/API audit](MODULAR_AUDIO_ENGINE_M0_AUDIT.md) before continuing.

This document governs the next engine phase. It advances the order in
[the effects plan](EFFECTS_DESK_PLAN.md): establish processing contracts and a
small working graph first, prove modulation and sidechain against them, then
prove six-engine parallelism before broad DSP migration. The device port
catalogue there remains applicable. Existing workbench behavior, saved sounds
and arrangements are the compatibility baseline.

## Outcome and boundaries

Build one portable Rust processing core for instruments, effects, mixing,
continuous modulation and timed events. Browser UI, persistence and device
access remain host responsibilities. An AudioWorklet connects the core to
browser audio; a future native/plugin host can use the same processing API.
Native/plugin integration is future work, not an automatic result of Wasm reuse.

A logical module is not a separate worklet, Wasm instance or operating-system
thread. Many modules should share a runtime and reusable buffers. Existing
complete synths can be composite modules; a later Eurorack interface can expose
oscillator, envelope, filter, VCA and utility modules using the same contracts.
Preserve useful high-level pedal/synth interfaces on today's desk.

Keep the current engine available while opt-in paths prove correctness,
compatibility, performance and latency. Generation/arranging and UI logic need
not move to Rust. Cable physics, electrical CV and a full Eurorack editor follow
later; do not start with a complete rewrite.

## Current implementation facts

- Subtractive, FM, percussion, classics, inserts and ambience/effects already
  contain substantial Rust/Wasm DSP. `public/synth-lab/processor.js` already
  bridges Rust sample generation and scheduled events into an AudioWorklet.
- `src/synths/effects/graph.js`, `workbenchRack.js` and
  `src/synths/all/mixerAudio.js` combine Wasm with native Web Audio gains,
  filters, dynamics and other nodes. Compatible contiguous inserts already
  share a kernel. Preserve such batching opportunities.
- `src/seq/useModulation.js` uses a 20 ms JavaScript timer for external
  sequencer modulation. This is distinct from synth-internal Rust LFOs. The
  limitation is the scheduling/parameter contract, not lack of Web Audio
  per-sample processing. Scalar setters do not automatically consume control
  buffers at audio rates.
- Exported cores include singleton mutable state and buffers, for example
  `static mut ENGINE`, `COLOURS`, `LEFT` and `RIGHT` in the subtractive engine.
  They cannot simply become concurrent instances sharing that state. Separate
  owned instance state from the legacy ABI; audit helper statics and table
  initialization too. Read-only tables can be shared after safe preparation.
- Native compressor has no external key input. Pedal limiter is an
  approximation; the separate desk limiter is sample-peak, not true-peak.

## Architecture

```text
Desk / pedal / future Eurorack UI
              |
Versioned patch model, parameter edits and timestamped events
              |
Validation + preparation + schedule compiler (outside render callback)
              |
Portable Rust modules, buffers, transport and execution plan
              |
Single-thread executor OR dependency-aware parallel executor
              |
Browser AudioWorklet / external audio and MIDI bridges
Future native host / audio-device or plugin integration
```

Keep patch data, prepared DSP state and layout separate. Use one routing
authority; adapt existing serial and three-bus setups into it. Temporary Web
Audio adapters must disclose rate/latency/capability limits and preserve sound.

### Module, parameter and connection contracts

- Stable module type/version, instance ID, port IDs and parameter IDs. Identity
  does not depend on labels, indices or positions. Define a machine-readable
  descriptor boundary so JS and Rust schemas cannot drift.
- Ports declare direction, signal family, channels, units/reference, supported
  rate, normalization, fan-in and semantic role. Detector is an audio role,
  not an audible mix input. L/R/stereo aliases refer to one underlying bus.
- Audio and continuous control can interoperate through declared mappings;
  do not force modulation through MIDI or prohibit audio-rate CV by design.
  Reject unsupported links; require explicit sum/conversion where needed.
- Parameters retain saved base values. Combine base with per-edge
  depth/polarity/offset, apply scaling/clamping and smooth appropriately.
  Disconnect restores base without overwriting it. Declare audio-rate targets
  separately from block/event-rate targets.
- Events carry absolute sample positions and ownership. Define same-sample
  ordering, late-event handling, bounded overflow, sustain/note release and
  route removal. Define tempo/pause/reset and free-running versus synchronized
  LFO behavior. UI refresh and worker wakeups are not signal clocks.
- Use one authoritative sample clock. Sequencer/generator lookahead can remain
  host-side initially, sending timestamped events; modulation/gates execute in
  DSP. Keep long-range arrangement data distinct from immediate render events.
- Processing declares resource bounds, maximum block size, latency, channel
  behavior, reset, bypass, tails and disposal. Handle actual frame counts;
  avoid a hardcoded 128-frame assumption throughout the new core.
- Version patch schema and DSP algorithms separately. Preserve legacy sounds
  until an explicit migration selects new DSP. Persist connections/mappings,
  not every generated LFO sample.

### Real-time and graph lifecycle

Prepare, allocate and validate off the render path. Processing uses bounded,
preallocated memory: no blocking locks, allocation, logging, network, thread
creation or unbounded queues in the audio callback. Prewarm resources. Defer
retired graph destruction and memory reclamation off the callback too.

Publish prepared schedules at defined frame/block boundaries. Preserve state
for unchanged instance IDs; define fades, note releases and effect-tail policy
for edits/removals. Budget temporary transition cost rather than silently
processing two full graphs during every crossfade.

Initial execution is a DAG. Reject unsupported cycles, including detector,
event and modulation cycles. Feedback inside a proven processor remains valid.
Future explicit delay/feedback edges require a suitable scheduler: inserting a
delay object alone does not make a cyclic block schedule executable. Define
minimum delay and sample/block semantics before permitting graph feedback;
zero-delay algebraic loops are out of initial scope.

Track fixed path latency; align parallel program/key and mix paths. Report
scheduler buffering, algorithmic lookahead, device latency and musical lookahead
separately. Phase modulation and changing delay are audible effect behavior,
not something generic latency compensation can remove.

## Parallel rendering strategy

All custom AudioWorklet processors in one AudioContext share its rendering
thread. Multiple Wasm kernels/worklets alone do not provide parallel rendering.
Browser parallelism needs initialized Web Workers, shared memory and an explicit
scheduler. Rust modules remain independent of that host mechanism.

Provide a single-thread reference executor and optional bounded worker-pool
executor. Start with coarse tasks: an instrument plus local effects or another
substantial independent subgraph. Lead, second voice, rhythm, pad, bass and drum
branches can run concurrently until dependencies converge. Mixing/master
inserts follow ready inputs. Sidechain and cross-branch control edges count as
dependencies; tight feedback stays inside one supported processing unit.

Browser workers render a short, bounded distance ahead into shared timestamped
buffers. Worklet output consumes complete matching frames and never blocks
waiting for workers. Use block sequence/generation IDs and explicit buffer
ownership/publication ordering. Never mix an old branch block with new ones.
Define bounded underrun concealment/recovery, report every miss, and avoid
unbounded buffering or silently rescheduled notes.

Do not drop a general-purpose Rayon iterator/join into the callback. Parallel
throughput is not proof of deadline safety. Initialize worker/thread-local state
before playback. Use a small configurable pool informed by measured cost and
CPU availability; logical CPU count is a hint, not permission to occupy every
core. Retain a single-thread/no-shared-memory path with capability detection.

Worker scheduling is less predictable than the audio callback. Buffering may
increase throughput at a live-playing latency cost. At 48 kHz, 256 frames are
5.33 ms and 512 frames are 10.67 ms; these illustrate durations, not selected
defaults or guarantees. Timestamp live MIDI/edits at the earliest valid frame
when audio is already rendered, report late events, and bound buffering per
mode. Live external audio cannot be computed before it arrives.

Shared memory requires cross-origin isolation. Verify dev, preview and actual
production headers/resource policies and `crossOriginIsolated`; do not assume
the current GitHub Pages deployment supplies the needed headers. Investigate
hosting before claiming production threading. A deployment change or service
worker workaround needs its own design; preserve the non-isolated site and
fallback. Future native execution can use an appropriate real-time worker pool,
but still has deadlines, dependency limits and host integration work.

### Performance experiment and decision gate

Use six actual engine instances: lead, second, rhythm, pad, bass and drums,
with representative patches, fixed seeds, realistic polyphony, local effects,
shared mixer/master and a drum-keyed compressor variant. Synthetic sources are
smoke tests, not evidence of real six-engine capacity.

Compare current routing, new single-thread and worker-pool execution with the
same events, DSP, sample rates, buffer policies and quality settings. Separate
algorithm changes from executor changes. Keep reduction/mixing order stable
and RNG instance-owned so worker scheduling does not change sound. If singleton
engines cannot yet be reused, first extract an owned engine API and label the
remaining coverage instead of calling six clones a mixed-engine benchmark.

Record hardware, OS/browser/compiler/build, worker count, frame sizes, warmup
and repeated-run conditions. Measure per-branch/end-to-end duration distributions
(p50/p95/p99/max), total CPU where observable, memory, buffer occupancy, missed
deadlines, underruns, late events and added latency. Sink callback duration alone
hides worker DSP cost. Include dense chords, edits, UI load, silence/tails,
shared-master bottlenecks and live MIDI. Separate offline throughput from
sustained real-time behavior. Test 44.1/48/96 kHz.

Require output agreement with the reference: exact PCM for unchanged DSP and
arithmetic where feasible, otherwise a stated justified tolerance plus timing,
stereo and level checks. Deliberately stall a worker and verify bounded recovery
without deadlock, stale-block reuse or a hidden success report.

Write a measured go/no-go recommendation before broad migration: useful
capacity/headroom gain, extra latency, browser/hosting support and fallback.
Set an explicit workload/latency budget from baseline evidence; do not invent
a universal speedup or guarantee glitch-free worker scheduling.

## Delivery milestones

| Milestone | Deliverable and acceptance |
| --- | --- |
| M0: baseline and seams | Inventory DSP/state/ABI boundaries; establish reproducible current six-engine workload/costs where available. Record toolchain, browser headers and saved fixtures; label unmeasured conditions. |
| M1: contracts/reference graph | Small portable Rust graph with owned state, deterministic source, LFO, VCA, explicit stereo mix/output, timed parameter/gate events, validator and versioned patch fixture. Native tests plus opt-in AudioWorklet harness prove audible modulation and sample timing. No default-page replacement. |
| M2: real synth/sidechain | Adapt one existing Rust synth through owned reusable state while preserving its legacy ABI/sound. Add render-thread modulation of a declared target and stereo-linked compressor with separate program/key inputs and real kick tap. Source selectors precede cables. |
| M3: six-engine parallel prototype | Extend adapters to the actual mixed-engine workload; add bounded optional worker executor. Compare sound, deadlines, latency, hosting and fallback against reference/current rig before broad migration. |
| M4: workbench migration | Incrementally adapt serial/parallel racks, mixer, sends/returns, monitors and sequencer control links to one authority. Preserve IDs, presets, UI and save/reload. Port DSP in tested groups; expose arbitrary instances when lifecycle/routing support them. |
| M5: patch editing | Real connection headers/menus, static cables, safe add/remove/repatch, typed split/mix/conversion utilities. Cables edit the same graph; layout remains independent. |
| M6: modular expansion | Composite synth internals, low-level Eurorack modules, supported feedback/polyphonic CV, then tabletop/cable physics. Native/plugin hosts and electrical CV remain separately scoped. |

M0/M1 are now delivered to the scope recorded below. M2 sidechain precedes
general patching UI; M3 performance evidence precedes broad processor migration.
Keep reporting baseline/browser gaps and update this plan/handoff after each
slice rather than restarting the workbench.

### M0/M1 delivery (2026-11-09)

Historical checkpoint; the M2 record below supersedes current file sizes,
allocation evidence and the next task.

- Audited all six Rust core families, mutable helper tables/buffers, legacy
  Wasm isolation, timed/scalar parameter boundaries, insert batching, rack/mixer
  authority and external 20 ms modulation. See the linked M0 audit for exact
  seams and extraction constraints. Existing Rust/JS audio implementations,
  Wasm assets, default pages and saved-workbench formats are unchanged.
- Added dependency-free `synth-engine/graph`: owned module state, sample clock,
  typed contracts, DAG compilation/validation, resource bounds and a stable
  dependency/level schedule. Separate audio input identities survive execution;
  only the explicit stereo mixer sums them. This reserves the program/key seam
  without exposing an unimplemented sidechain port or worker pool.
- Delivered deterministic stereo tone, mono bipolar LFO, sample-rate VCA,
  two-bus stereo mixer and output. Versioned bases/mappings, signed depth,
  offset, bipolar/unipolar scaling and clamping work in DSP. Timestamped gate,
  parameter and modulation-disconnect/reconnect events execute at sample
  offsets; bounded overflow/late counters, owner release/cancellation,
  pause/reset and disposal have explicit semantics.
- Rust generates machine-readable contracts from the compiled Wasm. Host
  `ReferenceGraph` validates versioned patch JSON and owns trusted ABI handles;
  saved bases/connections/events replay bit identically after reload. Persistence
  is restart/replay, not an in-flight voice/tail/transport snapshot. Rendering
  supports actual block sizes rather than assuming 128 throughout the core.
- Opt-in `/tools/modular-audio.html` works in dev and the public production
  bundle. Verify renders actual AudioWorklets at 44.1/48/96 kHz and compares
  PCM to direct Wasm and save/reload. Play measures live L/R output. No existing
  page selects this reference. `graph:build/check/test/render` are documented
  in the audit; normal/public builds verify source/binary/cache provenance,
  including the worklet's transitive runtime import.

Final verification:

| Evidence | Result |
| --- | --- |
| Full JS/legacy suite | **369 files / 2,664 tests passed**, 109.60 s; `.tmp/modular-audio-suite-verified.log` |
| Focused actual-Wasm/bridge regressions | **10 passed**; independent equations, three rates, varied block sizes, same-instance handles, mappings/clamps, overflow/late events, contracts, persistence and worklet teardown/partial final quantum; `.tmp/modular-audio-focused-final.log` |
| Native reference graph | **4 passed** after the input-bus change; `.tmp/modular-audio-native-reference.log` |
| Full native/allocator instrumentation | **Blocked**, not passed: Windows Application Control error 4551 for library/allocator runners. `.tmp/modular-audio-native.log`, `.tmp/modular-audio-native-allocation.log`. Native descriptor helper was also blocked; normal builds now generate descriptors through Wasm. |
| Public build | **Passed**, 59.66 s; existing large-chunk advisory; 16 YAML banks included, raw banks/recordings excluded. `.tmp/modular-audio-build-public-final.log` |
| Browser worklet PCM, dev and final public preview | **Exact float PCM** versus direct reference and reloaded patch at all three rates; frame 37 first audio, 42022 last audio, 7 events applied, 0 late/overflow; two nodes in one context had 0 silent-branch output |
| Live AudioContext output | 48 kHz, 80 analyser observations, L/R observed peaks **0.16130538 / 0.16797364**, 7 events, 0 late/overflow; reported base/output latency **10 / 40 ms**. No device-loopback or direct-listening claim. |
| Browser persistence | Edited tone to **277 Hz**, saved, reloaded stopped, then verified exact replay at three rates. Restored the default 220 Hz reference fixture afterwards. No workbench storage was edited. |
| Existing effects desk, built preview | Starmap Void, Dark Shape A, wet Chorus/Vibrato/Delay, independent master Delay/Reverb and muted Dry retained. Legacy Chord audition produced scope **L −17.7 / R −17.3 dBFS**, correlation **0.34**. Stopped audio and cleared audition afterwards. |

At 48 kHz the default fixture's offline L/R RMS is
**0.05487677317 / 0.05482676268**, peak **0.16797363758**. The final reference
Wasm is **68,605 bytes**, asset version `9c0a7a88029f513c`; descriptor formatting
code is included, not called in render. `.tmp/modular-audio-reference.wav` is a
stereo PCM16 listening artifact; `.tmp/modular-audio-pcm.json` contains float
measurements. Worklet and reload comparisons use the float buffers.

Limits: reference DSP is synthetic and unsmoothed (0-frame smoothing declared),
with mono gates, zero module latency/tails and immutable prepared topology. No
hot graph/state transfer, sustain/polyphonic events, sync LFOs, legacy synth
adapter, detector/compressor, arbitrary cable UI, latency compensation or
workers were implemented. The counting-allocator native test remains unrun;
source inspection confirms bounded preallocated render code, but is not a
substitute for that test. Dev/preview are non-isolated (no COOP/COEP/CORP).
Production hosting isolation remains unverified; a direct production header
request failed. The current ensemble tool is 2/4/8 subtractive/FM parts, not the
six real-role fixture: its required cost/deadline baseline is still outstanding.
Offline wall times are not real-time performance evidence. No speedup is claimed.

**Next task: M2.** Extract one real legacy synth into an owned adapter while
preserving its ABI and PCM; add a declared render-thread target plus a
stereo-linked program/key compressor and actual post-mute/pre-solo/pre-fader
kick tap. Prove key identity/anti-phase behavior, absence/silence, envelope and
blend latency, owner release/repatch, save/reload and old PCM at three rates.
Use selectors before cables. Then capture the actual six-engine fixture/costs
before beginning M3 workers. No commit, push or deployment was performed.

### M2 delivery and Application Control mitigation (2026-11-09)

Continued without changing Windows Application Control or executing blocked
native helpers. The normal build already reads descriptors through Wasm. Added
an **audit-only Wasm counting allocator** so enqueue/render/cancel/reset can be
instrumented without a generated native executable. Native execution remains
blocked; this is separate Wasm evidence, not a claim of native test execution.

- Extracted the real percussion core into
  `synth-engine/percussion/src/engine.rs`, with public owned `Engine`/`Hit`.
  Noise, tables, voices, queue, serials, smoothing and residuals belong to the
  instance. The default `legacy-abi` feature preserves all original exports in
  `abi.rs`; the graph dependency disables it. The graph Wasm has no legacy
  singleton exports. Legacy percussion Wasm/cache provenance was rebuilt.
- Added `legacy.percussion` version 1 with semantic timestamped hits, separate
  `audio.out` and **actual kick-only `kick.out`**, owner cancellation and reset.
  Receive-order serials are reserved when booking hits, preserving legacy voice
  stealing even with out-of-order future timestamps. The module's output `gain`
  is a declared audio-rate LFO target; it does not silently change the core's
  existing smoothed per-drum level setters.
- The kick tap is post source-mute, pre source-solo exclusion and pre output
  gain/fader/modulation. Explicit Ghost makes it pre-mute. Snare/hats never
  become kick key audio. These policies are implemented in this opt-in module;
  existing desk mixer/track controls have not been migrated to it.
- Added `graph.compressor` version 1 with distinct required stereo program and
  optional detector buses. Internal / External / Auto uses graph connection
  state. Missing External releases reduction and reports `missingKey`; a
  connected silent key remains external. Max absolute L/R detection preserves
  anti-phase keys; one gain is applied to both program channels. Detector audio
  never enters the audible mix unless a separate program route requests it.
- Threshold, ratio, soft knee, attack/release, output, blend, detector HP and
  smoothed bypass work, with real input/key/output peaks, wet reduction and
  missing/external flags. **Zero lookahead/zero module latency** is intentional;
  dry blend and bypass use the same program sample. Output/blend/bypass edits
  smooth over 5 ms; detector repatching follows the reduction attack/release.
  This is not a limiter or a lookahead-compressor implementation.
- Audio edges now retain their source output bus as well as destination input.
  Timestamped connection events can enable/disable a precompiled detector edge;
  its dependency remains in cycle validation/scheduling. Source selection in
  the harness stops/reprepares the graph; arbitrary hot topology swaps and tail
  transfer are not implemented. Key-mode/source selections and automation save
  with the existing patch schema and DSP identities.
- The harness adds **Percussion / sidechain**, real key/source selectors and
  compressor meters in its reports. The original LFO/VCA reference remains the
  fresh-page default. The canonical JS host runtime now lives in
  `src/modular-audio/runtime.js`; the build copies/checks the public worklet
  runtime, avoiding a Vite dev import through the public directory. Transitive
  percussion sources and both fixtures are included in graph provenance.

Evidence and limitations:

- **27 exact stereo-float comparisons** against preserved pre-M2 Wasm, across
  44.1/48/96 kHz, all three models/all 14 drums, dense stealing and reordered
  future bookings. Both rebuilt legacy ABI and graph adapter match. Committed
  golden hashes: `src/modular-audio/percussionLegacyPcm.json`; audit:
  `npm.cmd run graph:audit-legacy`, `.tmp/modular-audio-m2-legacy-pcm.json`.
- **Six Wasm allocation audits passed:** original and sidechain patches at all
  three rates, including live hit enqueue, rendering, owner cancellation and
  reset: **0 allocation/reclamation calls, 0 memory growth** after preparation.
  M1 memory: 1,310,720 bytes; M2: 2,686,976 bytes at 44.1/48 kHz and 3,080,192 at
  96 kHz. This counts the Rust allocator, not JavaScript/browser allocations.
  Command: `npm.cmd run graph:audit-alloc`; evidence:
  `.tmp/modular-audio-allocation-wasm.json`. The instrumented build/probes stay
  under `.tmp/graph-allocation-target`, outside the public runtime.
- `npm.cmd run graph:audit-compressor` passed independent equation checks at
  three rates: an anti-phase unit key gives **~15 dB** reduction; 48 kHz attack
  at 240 frames gives **9.481838 dB** versus **9.481808 dB** expected; missing-key
  release over 4,800 frames gives **3.488067 dB** versus **3.488173 dB** expected.
  Knee at threshold: **1.125 dB**. Stereo linking, detector-HP DC rejection and
  same-sample dry/bypass also passed. `.tmp/modular-audio-m2-compressor.json`.
- **22 focused tests passed**, covering the original reference, real-source
  modulation/taps, owner cancellation, silent/missing/Auto policy, exact event
  disconnect, persistence, validation, channels and independent real instances.
  `.tmp/modular-audio-m2-focused-final.log`. Native
  `cargo check --offline --tests` passed; new native executables were not run.
- Actual built-browser worklets matched direct Wasm/reloaded M2 PCM exactly at
  all three rates, including independent silent-node output of 0. At 48 kHz the
  default M2 fixture peak is **0.14000000060**, L/R RMS
  **0.04447046852 / 0.04480246336**, 7 events, 0 late/overflow. Audio starts at
  frame 37; kick tails continue through the 48,000-frame observation window.
  External + Disconnected was saved/reloaded stopped and verified with
  **missingKey=1, reduction=0**, exact replay and 5 events at all three rates.
  Final browser/build/suite results are recorded in the handoff.
- Final full suite: **370 files / 2,676 passed** (111.02 s),
  `.tmp/modular-audio-m2-suite-verified.log`; public build passed (59.52 s),
  `.tmp/modular-audio-m2-build-verified.log`. Final graph: **119,891 bytes**,
  version **`bc2415256b648fc6`**. Live 48 kHz observed L/R peak **0.14000000060**
  each over 80 polls, 7 events, 0 late/overflow; no device-loopback claim.
  A two-second 48 kHz PCM16 listening artifact is available through
  `npm.cmd run graph:render -- --sidechain`.

At the M2 checkpoint the graph did not yet accept external Web Audio program/key inputs, migrate
existing workbench routing or offer arbitrary live source rewiring. One actual
percussion engine is not the six-engine performance fixture. No worker, CPU
headroom, real-time deadline or physical loopback claim follows from these
audits. Production isolation/hosting remains unverified.

Phone follow-up (user report, 2026-11-09): remote phone access with Bluetooth
headphones produced cut/crackly beginnings/endings in the short harness; the
latest effects page worked cleanly on that phone. Exact device/browser/access
path and asset versions are unknown. Defer this lower-priority audition-boundary
investigation; do not attribute it to Bluetooth or call it a measured DSP
underrun. Abrupt reference gates/timed shutdown are candidate causes to separate
from device behavior in a later lifecycle pass. This user report remains deferred.

### M3a delivery: six actual roles and serial baseline (2026-11-09)

See the [complete baseline](MODULAR_AUDIO_ENGINE_M3A_BASELINE.md) for pinned
patches, score/initialization seeds, capacities, effects/key routing, raw reports,
timing tables and precise measurement limits. M3 overall is still incomplete.

- Added an opt-in six-role harness with actual DI-Poly lead/rhythm/pad, FM
  second/bass and percussion drums. It reuses existing worklets, local inserts,
  six-strip desk mixer, shared delay/reverb and final limiter. The versioned
  17.5-second fixture saves/reloads stopped in a separate local store.
- Added prepared `host.audio` stereo input buffers and the real same-instance
  kick buffer bridge. The current route, owned-drum bridge and kick-keyed
  compressor route all remain serial. No legacy algorithms/defaults changed.
- **27 measured browser runs**, three rates × three variants × three repeats,
  after one warmup each. All six source/local-insert stems exactly match direct
  legacy Wasm. Full mixes use explicit 1e-6 tolerance: maximum current/bridge
  difference 4.47035e-8; largest repeat difference 5.96046e-8. They are not
  bit-identical complete browser mixes.
- 48 kHz full-route offline render medians for 17.5 s of audio:
  current **4101.8 ms**, bridge **4182.9 ms**, keyed **4407.6 ms**. Direct-source
  block timings and 96 kHz offline budget crossings are separately reported;
  these are not device underruns, callback CPU or worker headroom evidence.
- Production preview restored the fixture stopped and passed the selected
  48 kHz keyed check with six exact stems. Live synthesis produced all six
  roles over 178 analyser polls, master peak .1265905350, no reported
  late/drop/overflow, and stopped after its finite score/tail. No loopback claim.
- **371 files / 2,684 tests passed**, public build passed, native cargo check
  passed. **Nine** Wasm allocation audits found 0 allocation/reclamation/growth;
  compressor equation audits passed. Native test executables remain blocked
  by Application Control. Graph **120,773 bytes**, version `394279c8033e0aaa`.

**Next: M3b, owned FM extraction**, preserving original ABI, PCM, event/voice
behavior and quality-1 7.5-frame latency; then owned subtractive/core for the
other three pitched roles. Use this pinned actual workload for comparisons.
Only then add bounded optional workers and measure deadlines, latency, stalls
and non-isolated fallback. Keep the desk authoritative until its migration
milestone. No commit, push or deployment was performed.

### M3b delivery: owned FM adapter (2026-11-09)

The [owned FM record](MODULAR_AUDIO_ENGINE_M3B_OWNED_FM.md) describes the exact
API, host contract, browser evidence and limits. The original scalar DSP now
lives in an owned Rust `Engine`; its default-enabled `legacy-abi` wrapper
retains the existing C exports. Optional bank globals stay behind that ABI.
The graph links the rlib without legacy singleton exports and exposes separate
`fm_owned_*` handles. Two independent owners share one Wasm instance in the
opt-in paired worklet. This is not yet a pitched `Graph::Kind` module: the
sample-oriented DAG and block-oriented pitched scheduling remain separate.

- **57 exact original/rebuilt/owned PCM comparisons** pass at three rates,
  including all recipes, additional quality tiers, dense reordered stealing,
  sustain/pressure/glide/mono/legato, patch transition and actual second/bass.
  Original snapshots and versioned float hashes are retained. FM quality 1's
  intrinsic **7.5-frame** latency is unchanged.
- Shared-instance tests pass through independent reset/panic/disposal; the
  graph binary has no legacy `fm_init` export. Scalar/SIMD/bank/fast legacy
  export sets are unchanged. Existing optional SIMD/bank tests remain active.
- **Twelve Wasm allocation audits** find no Rust allocation/reclamation or
  memory growth after preparation. Paired FM linear-memory capacity is
  **1,507,328 bytes** at all three rates. JS/browser storage is not included.
- Versioned FM packet/performance/events/transitions validate and save/reload.
  Queue bounds reserve initial performance and transition events. The six-role
  page adds **Owned FM pair + kick key · M3b** and an all-rate FM comparison;
  Current remains the default. Existing workbench routes/defaults are intact.
- Full suite **372 files / 2,690 tests passed**, 109.49 s; public build passed,
  31.58 s; native cargo check passed. Old source-inventory and named diagnostic
  artifact checks were updated/rebuilt, not disabled. Native test execution
  remains blocked by Application Control. Graph **163,099 bytes**, version
  **`52ec483d8de9ec1c`**. Browser results are recorded in the linked M3b record.

**Next: owned subtractive/core** for lead/rhythm/pad, then prepared block-capable
pitched DAG nodes with explicit timed note ownership/cancellation and latency
metadata. Keep compatible inserts batched. M3 workers, broad workbench migration
and screen-lock playback investigation remain later; no worker speedup or
deadline claim is made by this extraction.

### M3c delivery: owned subtractive/core (2026-11-09)

See the [owned core record](MODULAR_AUDIO_ENGINE_M3C_OWNED_CORE.md) for exact
contracts, retained references, memory figures and browser results.

- Original scalar and optional SIMD DSP now use per-engine voices, colours,
  outputs, chorus/filter/headroom/DC, RNG, events and counters. Additive tables
  are prepared once with `OnceLock`, then read without mutation or lazy render
  initialization. Default-enabled `legacy-abi` retains the singleton/probes;
  the owned graph build excludes them and exposes `core_owned_*` handles.
- **75 exact original/rebuilt/owned core PCM cases** pass at three rates,
  including all recipes, six additive shapes, note/voice behavior, transitions
  and actual lead/rhythm/pad. The current graph also passes **57 FM** cases.
  Independent trio reset/panic/disposal and versioned spec persistence validate.
- All six actual source engines can coexist in one Wasm memory and match
  independent legacy L/R samples exactly for the full 48 kHz score. This host-
  driven test is not a pitched DAG scheduler or a parallel executor.
- **18 allocation audits** pass: zero Rust allocation/reclamation/growth after
  preparation, including the full score/transitions and reset/replay. Three core
  owners use 3,014,656 linear-memory bytes; six-source totals are separately
  reported for each rate, not multiplied per owner.
- The six-role page adds **All six owned + kick key · M3c** and **Compare all
  owned · all rates** on the same 4175 preview. Existing mixer/local/master FX,
  real key and limiter remain; Current stays the fresh-page default.
- **373 files / 2,697 tests passed** (119.91 s); public build passed (36.05 s)
  with bank/exclusion checks. Native cargo check passed; executable tests remain
  blocked by Application Control. Graph **279,049 bytes**, version
  **`1bb61c9f8351fcb5`**. Scalar/acoustic legacy export sets remain exact.

**Next: block-capable pitched DAG integration (M3d)** with prepared core/FM
configuration, sample-timed notes/controls/transitions, explicit note-owner
cancellation, latency metadata and insert batching. Only after matching the
six-source owned reference should bounded optional workers be evaluated for
actual deadlines/stalls, latency, hosting/capability and serial fallback.
No worker performance, broad migration or screen-lock fix is claimed by M3c.

### M3d delivery: block-capable pitched Rust DAG (2026-11-09)

See [the M3d record](MODULAR_AUDIO_ENGINE_M3D_PITCHED_DAG.md) for contracts,
bounded preparation, exact evidence and browser results. Foundation through
M3c was committed locally as `bc4e35d` at the user's request, then work continued
on M3d. No push or deployment.

- `legacy.core` / `legacy.fm` are owned DAG nodes with prepared instrument
  packets/transitions, timestamped notes/controllers, explicit note owners and
  immediate/timed cancellation. Graph rendering splits at event/configuration
  boundaries and renders pitched spans in blocks. Sustained peers and mono
  fallback keys survive cancellation of another owner. Reset restores prepared
  state; the host explicitly rebooks notes for replay.
- The actual pinned six-role score runs inside one 13-node Rust graph: six
  sources, five mixers, kick-keyed compressor and output. One source worklet
  exposes six raw stereo taps, actual kick and final Rust stereo mix. The desk
  comparison retains existing local/master effects and channel mixing; direct
  **Play Rust mix (dry)** separately auditions the Rust sum/compressor output.
  Current remains the page default; no workbench route/default migration.
- **132 original-golden pitched DAG PCM comparisons**, standalone **75 core /
  57 FM** comparisons and exact legacy export inventories pass. **21 allocator
  audits** pass, including full DAG transitions/cancellation/reset/replay:
  no Rust allocation/reclamation/growth after preparation. FM latency remains
  quality-dependent (7.5 / 7.75 frames), with no new automatic alignment.
- **375 files / 2,710 tests passed**, 129.74 s; public build and curated-bank/
  exclusion checks passed. Native cargo check passed; Application Control still
  blocks native test execution. Graph **296,101 bytes**, version
  **`eb07d368174d0159`**. Durable stage reports are linked in the M3d record.
- Actual browser: **18 measured renders + 6 warmups**, all six stems exact,
  full desk mix difference **2.9802322387695312e-8** at every rate under retained
  1e-6 tolerance. Fixture save/reload restores stopped. Both finite 48 kHz desk
  and direct Rust mix playbacks have nonzero main/all-six source activity and
  finish at 840,000 frames / 357 graph events without reported late/drop/
  overflow. These are analyser/output-path observations, not device loopback.

**Next: bounded optional worker execution**, using this serial graph and the
pinned fixture as reference. Specify frame/generation publication, owned state/
event transfer, added buffering/latency, nonblocking reads, stale/missed-result
policy, hosting/capability checks and serial fallback before measuring actual
callback deadlines/stalls. No worker speedup or device-underrun claim follows
from these offline wall times. Broad migration and locked-phone crackling stay
outside this checkpoint.

### M3e delivery: bounded optional single-worker transport (2026-11-09)

See [the M3e record](MODULAR_AUDIO_ENGINE_M3E_WORKER.md). M3d was committed locally
as `fa634f5` before this iteration. This stage moves the whole serial Rust graph
to one dedicated worker; multi-worker source execution remains next.

- Fixed transferable PCM pool, direct worker/worklet MessageChannel, exclusive
  graph/Wasm ownership, generation/frame/slot publication. Default 4 × 1024
  frames, eight stereo buses, 256 KiB pool; explicit 4096-frame buffering and
  equal-delay serial startup fallback. No shared-memory/header changes.
- Nonblocking consumer: missing spans become silence, expired blocks are
  discarded, partially late blocks are trimmed, source time advances. Startup
  failures expose a serial fallback reason; runtime failures stop the run.
  Future live events retain ownership and sample timestamps; events inside
  rendered lookahead are rejected. Reset/reload creates a new generation.
- Real Node and browser workers match all eight serial Rust stereo buses exactly
  for the full score at three rates, including cancellation/past-event rejection;
  independent worker generations pass. Protocol, fallback and failure tests pass.
  Full suite **378 files / 2,725 tests passed**, 130.04 s; final host/protocol
  focused rerun 11 tests passed. Public build passed; Rust DSP bytes unchanged.
- Opt-in `tools/modular-worker.html` adds live worker/serial/fallback playback,
  stall injection, worker PCM verification and fixture persistence. Live 44.1/
  48 kHz transport runs have no misses. A 250 ms scheduling stall demonstrably
  silences missing frames, discards old blocks and recovers without replay.
  A failed 96 kHz run during concurrent suite/build load is retained: worker
  starvation is observable, not hidden as a claimed speedup or device underrun.
  The 96 kHz repeat after those checks finish delivers all 1,680,000 frames
  with zero transport misses using the same pool/criteria. Save/reload restores
  the fixture with audio stopped. No background/mobile headroom is established.

**Next: measured multi-worker source execution**, with explicit compiled
dependency/master/key levels, per-worker state/table ownership, event fan-out,
generation/frame publication, chosen added latency, tested misses/fallback and
foreground target-device measurements of equivalent processing jobs. The M3e
message transport still allocates JS messages and can suffer dispatch jitter;
consider shared memory/hosting separately. Keep the serial reference and all
workbench defaults. No broad migration or locked-phone fix is claimed.

### M3f delivery: three-worker sources with dependent Rust master (2026-11-09)

See [M3f contracts and evidence](MODULAR_AUDIO_ENGINE_M3F_SOURCE_POOL.md).
M3e was committed as `646183d` before this step; the user's standing instruction
now commits every completed verified step locally. No push/deployment.

- Fixed source groups: lead+bass, second+rhythm, pad+drums, each with private
  Wasm/state. A separate Rust master in the worklet retains original program/
  kick/mixer/compressor/output dependencies. Planner/owner restrictions make
  this a bounded source cut rather than general graph distribution.
- Three fixed pools total 786,432 PCM bytes. Same 4096-frame added latency,
  all-group priming, generation/frame publication and serial startup fallback.
  Missing any group silences all program/key inputs at that frame; clocks
  advance and expired results discard/trim without stale replay.
- Actual Node/browser pools match every original raw source, key and master
  stereo sample at 44.1/48/96 kHz for full scores, future cancellation and
  partial blocks. Independent complete pools pass. Full suite **382 files /
  2,736 tests passed**, 135.67 s; public packaging/build checks pass, Rust/Wasm
  DSP bytes unchanged. Native test execution remains blocked as before.
  Twelve source/master Wasm allocator audits pass with zero Rust allocation/
  reclamation or memory growth after preparation; JS transport is outside scope.
- Live 48 kHz one/three-worker comparison has zero misses and complete source
  events in both paths. Pool 44.1/96 kHz also has zero transport misses. Delaying
  just one worker proves coherent silence/discard/recovery. The pool has a real
  memory cost and different worker-timer CPU scope; no speedup or callback
  headroom claim. Fixture/persistence, serial fallback and existing defaults
  remain authoritative. See the detailed report links and actual limits.

**Next: repeated opt-in buffering/latency profiles** on the same foreground
workload and fixed plan, retaining conservative defaults, misses and memory/
event-lead costs. Separate worker task timings from worklet/device timing and
mark unavailable scopes. Shared-memory hosting, distributed-owner transactions,
adaptive partitioning and broad desk migration remain separate decisions.

### M3g delivery: measured opt-in buffering profiles (2026-11-09)

See [profiles and complete evidence](MODULAR_AUDIO_ENGINE_M3G_BUFFER_PROFILES.md).
Default 4096 frames stays unchanged; opt-in 2048/1024-frame profiles add
42.67/21.33 ms at 48 kHz with the same groups/source/master. Session Save/Load
restores profile/rate explicitly while fresh reload stays default and stopped.
Fallback preserves selected delay; event lead remains worker-boundary based.

- Real Node/browser verification: nine full-score profile/rate cases match all
  eight raw stereo buses against the original **same-cadence** serial graph.
  Fixed-1024 diagnostics retain existing denormal-flush tail differences and
  propagated master residuals; failed initial checks remain failed artifacts.
  No DSP, old golden or amplitude tolerance was changed to force a pass.
- **384 files / 2,749 tests passed**, 126.61 s; public build/package checks pass.
  Rust/Wasm DSP bytes unchanged. Optional worklet timing reports unavailable
  clocks with null values; source histograms have explicit CPU scopes/bounds.
- Live fixed-plan **3 warmups + 9 rotated measured trials** after heavy checks:
  **3/3 measured passes/profile**, zero misses/expired blocks/incomplete DSP,
  full 840,000 frames/357 events, all six source activity, visible document.
  Smallest profile works here at 21.33 ms added buffering; defaults stay unchanged.
  No phone/background/device-underrun or speedup claim follows from this sample.

**Next: contiguous source-frame queue-lead watermarks/histograms** at quantum
boundaries, per worker and coherent minimum, to quantify buffering margin with
the same profiles even without a worklet clock. Keep transport changes, shared
memory/hosting, distributed controls and broad desk migration separate.

### Sidechain acceptance retained for workbench integration

Use owned Rust DSP with a multi-input browser adapter as needed. Internal /
External / Auto selects from graph connection state, not silence. Explicit
External without a key releases reduction safely and shows missing-key status.
Detect stereo magnitude/energy without signed-channel cancellation; apply
linked L/R reduction. Include threshold, ratio, knee, attack, release, output,
blend, detector HP and truthful meters. Align dry blend with declared lookahead
latency. Detector never enters the audible sum accidentally.

Real kick tap defaults post-mute, pre-solo, pre-fader; explicit Ghost can use
pre-mute. Verify anti-phase/stereo keys, silence/absence, envelope timing,
mute/solo/fader behavior, repatching, teardown, persistence and legacy sounds.
Keep native legacy compressor available under its existing DSP identity.

## Future Eurorack compatibility decisions

Reserve explicit pitch units/reference and conversion to a virtual 1 V/oct
representation; no implication of electrical voltage. Distinguish held gate,
trigger pulse and event; declare thresholds/reset. Start with mono pitch/gate
and MIDI chords; polyphonic bundles/voice allocation are explicit extensions.
Synth LFO/envelope outputs need global versus selected/per-voice semantics:
audit each engine rather than assuming all existing LFOs are per-voice. Do not
tie DSP type identity to a pedal face or physical jack position.

## Sources

Primary sources consulted 2026-11-09; recheck platform/toolchain requirements
when implementing. These establish capabilities, not project benchmark results.

- [Web Audio: AudioWorkletGlobalScope](https://www.w3.org/TR/webaudio-1.1/#AudioWorkletGlobalScope): scope/rendering thread per context.
- [Web Audio: AudioParam](https://www.w3.org/TR/webaudio/#AudioParam): per-sample versus block parameter processing.
- [Chrome AudioWorklet design patterns](https://developer.chrome.com/blog/audio-worklet-design-pattern): Wasm, shared buffers, worker scheduling and nonblocking consumption.
- [wasm-bindgen-rayon](https://docs.rs/wasm-bindgen-rayon/latest/wasm_bindgen_rayon/): worker/shared-memory integration, isolation and build prerequisites; not a real-time scheduler endorsement.
- [Web Audio: DynamicsCompressorNode](https://www.w3.org/TR/webaudio/#DynamicsCompressorNode): external sidechain limitation.

## M3h: queue-lead observability delivered (2026-11-09)

See [exact contracts, evidence and next task](MODULAR_AUDIO_ENGINE_M3H_QUEUE_LEAD.md)
and the handoff's final checkpoint. Bounded read-only active-quantum lead
measurement now reports each worker/coherent minimum, separate terminal drain,
null unobserved data and percentile ranges without an audio clock. Selected-rate
profile batches retain failures and user listening evidence separately.

Full suite **385 files / 2,755 tests** and public build pass; Rust/legacy bytes
and fresh Default / 48 kHz remain unchanged. Live Short / 48 kHz passes with
512-frame minimum lead. Three measured 96 kHz repeats/profile: Default and
Medium **3/3**, zero misses; Short **0/3**, **168,192** total missed frames,
with all score clocks/events complete. Independent lead accounting passes all
14 live rows including the retained failed/incomplete stall trial. Short / 96
kHz remains reported as crackly by the user; physical output is unmeasured.

Next: compare a one-pending-task / one-block-per-task MessageChannel pump against
the current nested worker timers, preserving controls, injected stalls,
ownership, PCM, bounds and defaults. Timer clamping is a testable delivery risk,
not a proven cause of the user's output-route symptoms. See M3h for the timer
contract reference and exact acceptance scope.

## M3i: explicit scheduling experiment delivered (2026-11-09)

See [contracts, negative results and final verification](MODULAR_AUDIO_ENGINE_M3I_TASK_PUMP.md).
The harness offers timer/message scheduling, validates and persists the explicit
selection, and separates modes in reports. Existing timers remain the default:
the message candidate did not remove Short / 96 kHz misses (0/3), and Default
had one 128-frame miss (2/3). Medium passed 3/3. There is no established quality
or performance improvement; all failures are retained.

Final runtime `44de39f7ca5b0904`, unchanged Rust/Wasm. **18 files / 116 modular
tests** and public build pass. Both scheduling modes retain actual three-rate
PCM/control/instance behavior. Final live default/48 kHz passes without misses;
explicit message/Medium/96 kHz recovers from the injected stall and completes.
Old-session/default and explicit experiment save/reload pass. See handoff's
final checkpoint for exact scopes/counts and the next bounded packet-arrival
measurement. No default buffering change, push or deployment.

## M3j: packet gaps and explicit headroom delivered (2026-11-09)

See [contracts, exact results and next task](MODULAR_AUDIO_ENGINE_M3J_ARRIVAL_HEADROOM.md)
and the final handoff checkpoint. The worker harness records bounded source-frame
arrival gaps/open spans and a first-32 diagnostic trace, and offers explicit
0/+2/+4 PCM slots at unchanged producer cadence with declared added delay.
Original profile/timer/default and legacy DSP behavior remain preserved.

**21 files / 128 modular tests** and public build pass; larger pools retain
three-rate exact same-cadence PCM/control and independent state. Timer-scheduled
Short / 96 kHz: +2 and +4 each pass **3/3** measured full-score desktop trials,
zero transport misses, at **16 / 21.33 ms** buffering; original capacity passes
**0/3** at 10.67 ms. Source-frame gaps alone do not certify readiness or a device
cause. New accounting, overflow/recovery, explicit fallback, default playback
and session restore are verified. Runtime `5e3eede4bd16e076`; Rust unchanged.

Next: explicit listening verdict/export tied to full run provenance, before any
headroom policy or target-device quality claim. No auto-default change, push,
deployment, shared-memory migration or distributed owner changes.

## M3k: run-bound listening records delivered (2026-11-09)

See [record contracts, target-device feedback and exact verification](MODULAR_AUDIO_ENGINE_M3K_LISTENING.md).
The harness now supports local verdict/context/notes bound to each actual run,
bounded saved-record review and JSON export. Editing playback controls cannot
relabel a completed snapshot; loading history cannot start audio or change the
route. A new run is Not assessed, and subjective verdicts do not rewrite run
check failures or incomplete clocks.

User reports Short / 96 kHz / +2 helps open but remains insufficient locked.
Clarified working lock-screen cases are Default and Medium / 48 kHz / Message
tasks / +2 / three workers, with **128 / 64 ms** buffering versus Short/96's
16 ms. These are uncorrelated reports, not a controlled rate-only comparison.
Unknown device/route/build and 96 kHz worker mode remain unknown.

**28 focused tests / five files** and public build pass. Real desktop Medium /
48 kHz / Message / +2 and unchanged Default/48 complete 840,000 frames / 357
events without misses. Actual edit/save/download-event/reload and early-stop
failure preservation are verified; automation verdicts remain unassessed. No
engine asset changes: runtime `5e3eede4bd16e076`, host `m3k-listening-v1`.

Next: M3 go/no-go decision, then a narrow opt-in 48 kHz sequenced source adapter
into the existing All mixer/effects, preserving current live MIDI/keyboard and
legacy defaults. See handoff for scope, latency caveats and browser download-wait
restriction. No broad DSP migration, push or deployment.

## M4a: finite All source preview delivered (2026-11-09)

The [M3 decision gate](MODULAR_AUDIO_ENGINE_M3_DECISION_GATE.md) is committed as
`3670f50`: GO for a narrow opt-in comparison, NO-GO for defaults/full transport
or an unmeasured CPU-speedup claim. See [M4a contracts, evidence and limitations](MODULAR_AUDIO_ENGINE_M4A_WORKBENCH_SOURCE.md).
All / Setup can render one supported pitched role's actual current progression
through a private scalar core/FM graph and its existing inserts/sends/mixer/
master path. One worker or explicit/startup-fallback serial, 48 kHz, Message
tasks, Medium +2 capacity / 64 ms. Keyboard/MIDI and normal transport retain
their existing engines. Explicit arm, independent Stop, global Panic and
snapshot invalidation are implemented; unsupported sources fail clearly.

Full regression **396 files / 2,815 tests** passes; final follow-up focused
**36 + 81 tests** and public build pass. Actual All worker/core, serial/core and
worker/FM complete all frames/events with zero transport misses and real
source/channel/master activity. Mixer attenuation, source replacement,
keyboard coexistence and normal legacy playback are verified. Wasm/golden DSP
are unchanged, runtime `31d4ba7553a47868`. No physical/locked-phone/CPU guarantee.

Next: run-bound listening evidence for this actual one-role All route, then
bounded eligible multi-role capture with coherent failure and unchanged FX/
owner authority. Continuous transport, drum-kit translation and broad rack
migration remain separate gates. No push/deployment.

The subsequent phone startup investigation found repeated CSS delivery failures
inside ChatGPT's embedded remote preview, independent of Rust/audio. All's page
styles are bundled with its JS and verified unchanged; a shared stylesheet still
fails through that proxy. At the user's request a public-build LAN HTTPS preview
now runs at `https://192.168.0.228:4176/synths/all/`; the user confirms it opens
and works in a normal phone browser after their own certificate-warning action.
See [startup results, negative evidence and LAN instructions](SYNTHS_STARTUP_RECOVERY.md).
The latest 68 focused tests and public build pass; no deployment/firewall change
or new audio-quality verdict. Keep this confirmed access route available for
the next run-bound All listening-evidence step.

### M4a phone usability and guarded delivery follow-up (2026-11-09)

The user reports phone serial works, phone one worker badly breaks up, desktop
one worker works; no matching counters/device/browser are supplied. Full JSON
is too large for chat. [Exact changes/results/limits](MODULAR_AUDIO_ENGINE_M4A_PHONE_USABILITY.md)
record All's anchored Setup dropdown, contained desk navigation, fresh narrow
packing, compact copy/manual text and per-run provenance. Existing saved poses
are preserved; Spread repairs an already-overlapping layout on request.

Only the opt-in All experiment now initially selects serial and requests worker
stop-on-first-missing-span. Generic harness defaults/recovery and legacy DSP
remain unchanged, as do 48 kHz / Message / 512 x six / 64 ms settings. No automatic
mid-run engine replacement. A phone scheduling cause or buffering cure is not
established. Runtime `2dd834c6b07330cb`; Rust/Wasm unchanged. Focused generated
worklet/controller/UI checks and **66 actual worker/core/FM/Effects/host tests**
pass; final public build/package checks pass (**39.56 s**).

Real desktop browser at 390 x 844 has viewport-width document, no fresh-panel
overlaps and a 366 px fixed Setup; camera-only panning and saved pose reload
pass. Final serial completes **668,956 frames / 22 events**, zero late/overflow;
the matching selectable compact report is **986 characters**. Listening remains
unassessed, native clipboard payload readback and physical phone gestures remain
unverified. Next: confirm phone usability and capture compact diagnostics for
the actual guarded worker failure before transport tuning or multi-role work.
Keep the confirmed local HTTPS preview running. No push/deployment.

### M4a correlated phone failure evidence (2026-11-09)

The compact report now captures a real phone PCM delivery gap on the tested
`2dd834c6b07330cb` worker build: nine accepted 512-frame blocks exhausted at
source **4,608**, **128 frames** missing, guard stops incomplete at **4,736**.
Actual Message / six slots / 64 ms; no fallback or packet/protocol rejection.
UA reports Android/mobile Chrome 156. This is not retroactively attached to the
earlier listening failure. [Report, exact accounting and cross-thread audit](MODULAR_AUDIO_ENGINE_M4A_PHONE_DELIVERY.md)
explain why the later 15-block worker snapshot and short render times cannot
locate the delay at the failing quantum. Independent accounting passes while
the original run remains failed. No runtime/buffering/default change.

Next: bounded producer task/recycle-wait telemetry and last accepted packet's
producer snapshot, separated from asynchronous post-stop worker statistics.
Then a controlled explicit delivery comparison; preserve the working serial
phone path and existing legacy/harness behavior. No deployment or broad migration.

Phone navigation remains a gate: the user then reports the mixer can trap the
viewport because gestures over its controls cannot pan. [Panel navigation
follow-up](MODULAR_AUDIO_ENGINE_M4A_PHONE_PAN.md) adds one-finger surface dragging,
two-finger panning over controls and deferred touch-fader jumps, retaining
multi-touch keyboard notes and existing poses. Candidate **111** and final
**15** overlapping UI tests pass; public package checks pass (**36.43 s**).
Native desktop single-pointer panning over the mixer at 390 x 844 preserves
values/poses; physical Android multi-touch remains unverified. Engine/worker/
buffering unchanged. Confirm phone usability, then resume producer-wait telemetry.

2026-11-10: restarted the same public-only LAN HTTPS preview. The mixer now uses
panel-width container queries rather than phone viewport breakpoints, retaining
its 230 px top LCD beside eight knobs and the master beside strips on the fixed
980 px face. Ambience policy, values/poses, engine and worker remain unchanged.
**35 mixer/Effects tests** and public build/package checks (**33.58 s**) pass;
390 x 844 and 1280 x 900 browser geometry agree, no LCD overflow. See the
[display comparison and limits](MODULAR_AUDIO_ENGINE_M4A_PHONE_PAN.md).
Physical phone gesture and worker-wait measurement gates remain. No deployment.

The subsequent phone page-load timeout is resolved: the preview was owned by
the sandbox account targeted by its inbound-block rule. Relaunch through
approved outside-sandbox execution preserves the same HTTPS address/build/cert;
host checks pass and the user confirms **Page loads now**. No firewall rule or
app/audio change. [Launch-context instructions](SYNTHS_STARTUP_RECOVERY.md) and
handoff now require this execution path for future restarts. Resume the existing
phone usability / worker-wait gates; page access is not a listening verdict.

### M4a publication-bound producer timing (2026-11-10)

[Exact contracts, verification and phone repeat](MODULAR_AUDIO_ENGINE_M4A_DELIVERY_TIMING.md)
add opt-in All task/pool/recycle timing, last accepted packet's producer state,
separate later worker statistics, and compact v2 with actual sample rate.
**233 tests / 30 files** plus public build/package checks pass; real desktop
worker and serial complete 668,956 frames / 18 events. Default harness telemetry
is off; six buffers, cadence, initial serial and legacy DSP are unchanged.
Runtime `2f9eed09e9122592`, unchanged Rust/Wasm.

Actual phone v2 reproduces nine packets / zero lead 4,608 / stop 4,736 / 128
missing. Last accepted producer snapshot has no free slots, recycles through
1,535, short sampled task/render times; later stats have handled through 4,607.
This supports a bounded recycling/holding/delivery experiment, not an established
cause or cure. Next: explicit six/eight slots at the same 512-frame cadence and
64/85.33 ms, preserving defaults and run provenance. No deployment.

The [explicit six/eight comparison](MODULAR_AUDIO_ENGINE_M4A_CAPACITY_COMPARISON.md)
is implemented with source/score SHA256 identity and actual-latency reporting;
**86 tests / five files** and public build (**50.12 s**) pass. Desktop six/eight
have matching input hashes and complete clocks/events without misses. Phone
eight still fails at source **4,736**, nine accepted packets and 128 missing;
the last acceptance aligns with six at output frame **4,864** despite different
startup delays. Keep this negative result; phone v3 six input hash is unavailable.
Host v3, engine unchanged, defaults preserved. Next: short muted recovery probe
to observe delivery cadence beyond the first miss, not another default retune.

The [muted two-second probe](MODULAR_AUDIO_ENGINE_M4A_SILENT_PROBE.md) now exists:
host v4, source gain zero before connection, recovery enabled only explicitly,
separate partial diagnostic completion. **96 tests / five files** and public
build **44.30 s** pass. Desktop muted/normal/reload checks pass; matching input
normal playback completes 668,956 frames / 16 events without misses. Actual phone
six-slot probe completes 96,000 frames but records **36,608 missing**, **19
recoveries**, **67 late packets** and a **4,864-frame maximum arrival gap**.
This proves recurring recovery, not a stuck producer; cause/listening remain
unassessed. Next: explicit twelve-slot / 128 ms headroom comparison above that
observed gap, starting muted. Serial/six defaults and ordinary guard remain.

[Twelve-slot headroom comparison](MODULAR_AUDIO_ENGINE_M4A_TWELVE_SLOT.md) is now
implemented explicitly at 512 / 12, 128 ms; protocol extension is limited to that
combination. Host v5 / runtime d6a0341e5edf2d57, identical Rust/Wasm. **97 checks**,
**eight pool regressions**, public build **33.60 s** and actual desktop muted /
normal / reset checks pass. Matching-input normal completes 668,956 / 16 events
with no misses. Actual phone twelve-slot probe now completes 96,000 / 188 packets
with zero misses/late/rejected/stale/bad recycles, 1,152 minimum steady lead, while
the 4,864-frame gap remains. The subsequent ordinary phone run
`3c2c7faf-e696-499d-9e57-95493ec3bff3` now completes **668,956 frames / 16 events /
1,307 blocks**, zero delivery errors, ordinary guard true and complete/pass true,
matching the muted phone input hash. User reports it sounded fine; that statement
is linked separately while raw generated listening remains unassessed. Twelve
is an explicit working sequenced-preview option for this one bass run, not
lock-screen/all-role acceptance. Next implement a repeatable captured-input
six/twelve muted pair before further transport experiments; assess 128 ms cost.
Defaults stay Serial/six. This evidence-only follow-up adds no new test/build run.

The [controlled captured-input comparison](MODULAR_AUDIO_ENGINE_M4A_CAPTURED_COMPARISON.md)
now captures once under one lease and runs fresh six/twelve muted owners in fixed
order. Parent and child IDs/hashes plus both results fit one compact copy; partial
failures remain diagnostic. Host v6, engine unchanged. **108 tests / six files**,
final **11 overlapping controller checks**, public build **36.01 s** and actual
desktop muted/Stop/normal-Serial/reload/copy checks pass. Both trial source hashes
are independently verified; no defaults or keyboard/schema/DSP changes. Actual
phone parent `e8df4d20-35ae-44bf-b146-8023c12d8463` now supplies matching input /
engine for both windows: six has **36,608 missing / 67 late / 19 recoveries**,
twelve **zero missing/late and 1,152 minimum lead**, same **4,864-frame maximum
arrival gap**. Retain raw report/verdicts; no full phone plan bytes were supplied
for independent rehashing. Next implement explicit reverse-order twelve/six
muted comparison with order metadata to check warmup/order before lower-latency
transport work. Pool capacity/startup delay and device conditions remain limits;
Serial/six defaults and explicit twelve/128 ms stay. This evidence-only update
runs artifact checks, not new DSP/browser/build tests.

[Explicit reverse-order comparison](MODULAR_AUDIO_ENGINE_M4A_REVERSE_ORDER.md)
is delivered: six-first initial, twelve-first opt-in; order/capacity metadata in
full/compact reports, invalid-order and partial-stop handling. **112 checks**,
public build **45.88 s** and actual desktop both-order/hash/Stop/Serial/reload
checks pass. Host v7, engine unchanged. Phone reverse pair now reproduces the
same per-capacity counters: twelve first clean / 1,152 minimum lead, six second
36,608 missing / 67 late / 19 recoveries, both gap 4,864. This weakens a simple
warmup explanation, preserving source/device-state limits. Next separate pool
capacity from startup delay in an explicit twelve-slot / 64-vs-128-ms startup
comparison, with accurate render-ahead versus live-event-latency semantics.
Keep defaults, legacy DSP and ordinary guard; no broader migration/deployment.

## M4b: finite pitched sets delivered (2026-11-10)

User accepts longer phone buffering for listening and explicitly prioritizes
other voices, conflicts and full-path behavior. Startup-delay experiments are
deferred. [M4b contracts/results](MODULAR_AUDIO_ENGINE_M4B_PITCHED_SET.md) add an
explicit chosen set of up to five ready core/FM roles: one owned graph/common
clock, stable role/owner IDs, distinct existing per-role source FX/mixer inputs,
shared master, combined 2,000-note budget, coherent invalidation and cleanup.
Mute/solo omissions and intentionally empty/missing patterns are explicit;
unsupported native piano/classics/percussion are shown, not substituted. Default
scope, Serial/six, keyboard/MIDI, transport and setup schemas remain unchanged.

**286 tests / 34 files, 112.66 s** pass; browser found a missing-pattern edge
case, fixed with **24 final overlapping capture/controller/threaded checks**.
Final public build **33.66 s** passes. Five mixed overlapping threaded stems
are raw-equal to independent scalar source graphs; noncontiguous IDs/silent
roles and inactive buses are covered. Host v8, engine d6a0341e5edf2d57 unchanged.
Actual browser all-five-active worker/twelve completes **905,116 / 56 events**,
five independent raw/channel signals, master activity and zero transport misses.
Mixer isolation, keyboard coexistence, source invalidation, original voice/fader
restoration, legacy playback and default/report reset on reload pass. Physical
listening and isolated wet-PCM/setup-file byte parity are not claimed.

Phone set probe `51495cad-3673-4bda-b8f8-ada1ff6f6173` now completes 96,000 frames /
188 blocks without delivery errors, min ready lead 1,152, gap 4,864. Its note
counts are **lead/counter/bass 0/0/8**: Bass and two silent instances, not active
multi-voice/listening acceptance. Raw muted/full-score verdicts are preserved.
Next add an explicit selected-patch audition with reported diagnostic notes,
leaving sparse user scores untouched, to enable actual active-voice phone
coverage. Keep song preview distinct. Then audit real All percussion seam /
kit/hit translation into its owned Rust engine; native piano is a separate gate.
Preserve the finite scope and existing instruments; no default replacement,
latency chase, fixture substitution, deployment or broad migration.

### Selected-patch audition aid delivered

M4b group Material now explicitly chooses captured song or diagnostic test
notes with actual patches/tuning. Individual attacks then shared overlap, one
owned graph/common clock, same existing FX/mixer. No project edits. Silent
audition covers its entire finite plan; captured-score probes remain two
seconds. Reports label material/schedule and keep muted full verdicts false.
Host v9, engine unchanged. **31 focused / 146 regression tests**, public build
and actual browser original three active voices pass: **282,000 frames / 12
events**, worker/twelve **551** blocks, zero delivery/event/recycle errors,
positive audible per-role/master signals. Explicit Serial, legacy keyboard /
private Stop, original source selectors and reload defaults pass. Independent
full hashes prove audition worker/Serial input parity and unchanged original
score before/after. Physical listening unassessed; phone full muted audition
requested. Exact contracts/artifacts/limits are in the linked audition doc.
Next phone active-voice gate, then guarded listening; meanwhile audit the
actual All percussion kit/hit/lock/FX seam before extending the finite adapter.
No defaults/backend/schema/deployment change or latency work.

### M4c percussion audit, before adapter implementation

[Actual All percussion boundaries](MODULAR_AUDIO_ENGINE_M4C_PERCUSSION_AUDIT.md)
are audited after `2d3ca5f`. Raw graph kernels pass existing **27 exact PCM
comparisons**; **30 existing expression/palette/engine checks** pass. Seven
new source experiments demonstrate correct raw/resolved attacks and the
missing per-drum configuration authority. Do not reuse a default fixture kit
or confuse basic 808 with classic TR-808. Next versioned immutable owned kit
preparation with validation/persistence/exact configured legacy parity, then
Wasm-kit-only finite All integration/source ID6. Native/classic paths stay
explicitly unsupported, with dry role input preserving current external FX
and avoiding legacy kit sleep timers. Phone full muted/audible audition reports
arrived clean; subjective listening remains pending separately;
no adapter/default/backend/deployment change is delivered by the audit.

### Phone active pitched audition accepted

Phone v9 full muted and guarded audible runs now match input hash and complete
**282,000 frames / 12 events / 551 blocks**, three actual core voices each two
notes, worker/twelve/128 ms, **zero delivery/event/recycle errors**. Audible
per-role/channel/master signals positive; raw full pass true. User reports
**Clean individual entries and overlap**, saved separately with exact run/hash.
Full audible plan independently rehashed; compact muted and normalized audible
excerpt/provenance retained. Muted verdicts remain false; other engines,
real-song and background/lock-screen acceptance remain separate gates. Exact
evidence is in the audition doc. This clears the requested three-voice
diagnostic gate. Next immutable owned kit preparation and exact configured
legacy parity before Wasm-kit-only All percussion integration.

### M4c owned basic-kit configuration delivered

Module2/config-version1 selected palette + 14-slot on/level/tone/decay snapshots now
prepare in the owned Rust graph, validate in Rust/JS, persist and restart
exactly. Preparation-only ABI rejects edits after prepare. Absent-config raw
module1 fixtures and the byte-identical legacy ABI remain compatible; actual
old JS/Wasm reject module2 rather than silently ignoring its configuration. **56 exact
configured PCM comparisons** across all palettes/slots/44.1/48/96 kHz, reset /
save-reload/independence and actual threaded drum/kick output pass; **30 Wasm
allocation audits**, **322 broad tests** including **9 kit checks**, and public
build pass. [Exact contracts/results](MODULAR_AUDIO_ENGINE_M4C_KIT_CONFIGURATION.md).
Graph version62315b4104f2fc7e; no new All Drums eligibility, defaults or browser /
phone acceptance. Next ready Wasm basic-kit-only finite lease/compiler, dry
existing percussion role input, ID6/six-stem diagnostics and <=4,000 combined
events, then real silent/audible/device gates. Native/classic sources remain
unsupported; no sound substitution or broad migration.

### M4c finite All kit integration delivered

Actual ready Wasm basic kits now join selected and up-to-six-source finite
previews through the current external percussion FX/mixer path. Kit/palette /
source-revision leases, shared drum expression, private hit-ID policy, ignored
sound-lock/track metadata, source ID6 and six-stem reports preserve ownership
and legacy pads. Combined <=4,000 events and existing finite bounds remain.
Native/classic exclusions are explicit; defaults/schema/backend stay intact.
[Contracts and exact results](MODULAR_AUDIO_ENGINE_M4C_ALL_KITS.md): **163 checks**,
build and actual desktop all-six worker/twelve +Serial **706,800 /37 events**,
zero misses, channel isolation, coherent kit cancellation, pad/keyboard coexistence,
score hash/original selectors/default restoration and ordinary Play pass.
Phone three-core+Hand diagnostic **634,800 /29**, zero delivery errors and
user-confirmed clean drum entry/overlap. Raw run-bound evidence retained.
Next complete current-progression selected-source pass; sparse slots and
unsupported native roles must remain explicit. No normal transport migration,
new sidechain/worker pool, latency experiment or deployment.

Current-pattern desktop follow-up after `1df4ab0` passes full **1,001,116 /
54 events /1,956 blocks** with zero delivery errors: selected core slots have
0/0/11 notes and Hand32hits. Sparse sources/native omissions remain explicit.
Source save/reload/independent handles are exact at the same partition. Only
subnormal Bass tail values differ at127 vs509 blocks (max1.07e-38); original
denormal policy stays unchanged and raw-hash limits are documented. This is
evidence-only, not a new runtime change. [Exact result and pending phone
current-progression check](MODULAR_AUDIO_ENGINE_M4C_ALL_KITS.md) are recorded;
await that concrete device test before widening acceptance or migration.

### Reusable tests and fewer device interruptions

The user reports the current progression is fine; no new raw diagnostics were
supplied. Keep qualitative listening separate from prior run counters and close
the repeated phone request. [Reusable source checks](MODULAR_AUDIO_ENGINE_SOURCE_TESTS.md)
now supplies a top-bar test surface, remembered controls and actual Continuous
sound choices, one four-case complete Serial/worker test-note/progression batch,
short chat summary and full report download. Muted checks preserve source capture,
first-miss guarding and honest per-case/fingerprint evidence; they do not assess
wet audio or physical listening. Generated Continuous music remains transient,
finite-song and explicit preset precedence remain intact. Continue larger local
source-integration milestones before requesting a new meaningful audible/device
check. Next native Piano ownership/contract audit; no automatic source replacement
or full transport migration. Exact results/limits are in the linked document.

### M4j — Iowa owned realtime voices (2026-11-10)

[M4j](MODULAR_AUDIO_ENGINE_M4J_IOWA_VOICES.md) delivers the actual Held/Decay/Roll
realtime DSP as legacy.iowa with immutable numeric banks, canonical128-frame note
clocks, owned RNG/voices/roll hits, validation, stereo output/gain modulation and
save/reload. Default/native playback remains.405 original-worklet comparisons
across45 patches/three rates pass (403 bit-exact; max4.656612873077393e-10), nine
new allocation cases have zero render allocations/frees/growth, and mixed one/
three-worker source+sidechain verification is exact. The built-in-browser serial/
worker audition/progression batch and separate audible mixed output pass without
worker delivery gaps. Broad553 tests and focused128/66 overlapping suites pass;
public packaging/provenance pass. There is no new per-preset phone gate.
Next boundary: Rust Iowa measurement interpolation, settling, FFT/wavetable and
noise/burst preparation; existing JS preparation remains explicit outside render.
Live expression, other native families and portable host FX/mixer are still open.

### M4k — portable Iowa preparation (overnight 2026-11-10)

[M4k](MODULAR_AUDIO_ENGINE_M4K_IOWA_PREPARATION.md) moves raw settling,
pitch/velocity interpolation, FFT/wavetable and noise/burst preparation into an
owned Rust preparation crate.405 actual-table cases pass; maximum field error
1.3877787807814457e-17, metadata0. The opt-in All graph preview uses this backend
without changing the native player/defaults; complete numeric banks persist.
47 focused integration/controller tests pass. Parallel classic extraction also
passes1680 exact preset/rate comparisons and36 allocation cases (682cdff).
Remaining: VS/WT resource extraction, effects/mixer graph migration and live
integration. Browser acceptance is recorded at the combined overnight checkpoint.

### Owned effects extraction — overnight 2026-11-10

Existing insert and send-effects kernels now have instance-owned state/buffers,
rlib APIs and preserved default legacy exports.96 exact matching-cadence legacy
comparisons and6 zero-allocation independent-instance cases pass. See
MODULAR_AUDIO_ENGINE_OWNED_EFFECTS.md. Graph adoption is a separate step because
native block-entry behavior must be preserved; no default host route is replaced.

### Mixer/limiter primitives and desktop comparison (overnight 2026-11-11)

Portable strip, stereo matrix, fader and original3ms sample-peak limiter now
exist; native defaults remain.30 focused tests,12 exact original-limiter cases,
12 zero-allocation cases and18 actual-browser strip/matrix/fader comparisons
pass (fixed1e-4 max/relativeRMS limits). Actual headroom/ambience/return/master
insert seams are explicit in mixerGraphPlan. Graph adoption follows; see
MODULAR_AUDIO_ENGINE_M4_MIXER.md. M4k Rust-prepared Iowa also passes the built-in
browser's four serial/worker cases and a separate audible mixed-source run.
