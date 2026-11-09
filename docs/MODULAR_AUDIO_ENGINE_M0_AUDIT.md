# M0 boundary audit and M1 contracts

Historical pre-M2 inventory. The owned percussion extraction and graph sidechain
are now delivered; see the latest M2 checkpoint in
[the plan](MODULAR_AUDIO_ENGINE_PLAN.md) and
[handoff](MODULAR_AUDIO_ENGINE_HANDOFF.md). Native Application Control remains
unchanged; Wasm allocation instrumentation now supplies independent render-path
evidence. The old limits below describe the M0/M1 checkpoint.

Audited 2026-11-09 in the existing checkout, HEAD
`58ff48dff30e7fb9800343653542e6a35dbcbe44`. The starting changes were the two
workbench plans plus the untracked modular engine plan/handoff. They were
retained. No legacy DSP, workbench source, preset, saved setup or legacy Wasm
asset was replaced. M1 adds an opt-in reference, not a migrated instrument.

## Existing boundaries

| Boundary | Finding | Next extraction constraint |
| --- | --- | --- |
| `synth-engine/src/lib.rs` | `Engine` plus separate mutable `ENGINE`, per-voice `COLOURS`, L/R/probe buffers; mutable additive tables and readiness flag. The legacy `engine_*` ABI owns a singleton, timestamped events and a sample counter. | Move all voice/colour/RNG/output state into an owned adapter. Prepare additive tables safely before sharing; wrapping `Engine` alone is insufficient. |
| `synth-engine/fm/src/lib.rs`, `src/bank.rs` | `Fm` is an extraction seam, but `FM`, SIMD counters and bank `ENGINES`, enable flags, model and statistics are global. | Preserve bank batching/legacy ABI. Separate per-instance state, immutable resources and bank host ownership before concurrency. |
| `synth-engine/percussion/src/lib.rs` | Owned `Engine` already exists behind global `Option<Box<Engine>>` and a global planar stereo buffer. Events use absolute frames; setters and hit locks have different roles. | A plausible small first adapter; preserve hit ownership/variation and output offsets, remove the ABI singleton from the reusable API. It is not yet an adapter in M1. |
| `synth-engine/classics/src/lib.rs`, `wt.rs`, `vs.rs` | Mutable `HOST` and effect `BUFFERS`; wavetable/vector tables, build flags, hashes and FFT scratch are also mutable globals. | A `Host` move alone does not establish instance independence. Audit wave commits, initialization and scratch ownership. |
| `synth-engine/inserts/src/lib.rs` | `Inserts` has useful owned coefficients/history, but its render method reads/writes global `INPUT`/`OUTPUT`; global `FX` wraps it. | Introduce slice/bus-based processing before calling it reusable. Retain coefficient caches and contiguous insert batching. |
| `synth-engine/effects/src/lib.rs` | Global `FX`, six input planes (program and space sends), stereo output. Render reads those statics directly. | Preserve send semantics and tails; six planes are not an implemented compressor detector. |
| `public/synth-lab/*-processor.js` | Separate `WebAssembly.Instance` per processor isolates each legacy singleton. Subtractive/FM queue timed Rust events; patches are split/interpolated by the JS transition bridge. Inserts have untimed scalar setter messages. | Do not share one legacy instance across logical modules, and do not call multiple worklets a worker pool. Existing 2048-frame buffers/128-frame fast views are not the new graph's block contract. |
| `public/synths/classics-processor.js` | Timed note/control events are sorted and split in JS; times are seconds on the AudioContext clock. Untimed parameter messages apply on a block boundary. | Normalize time units at the adapter. Do not assume every legacy core already consumes audio-rate control buffers. |
| `src/synths/effects/graph.js`, `workbenchRack.js` | JS owns serial/three-bus topology, asynchronous preparation, fades and disposal. Contiguous compatible inserts share a masked kernel; delay/reverb may be independent. | Keep the rack authority until an explicit adapter migration. Preserve independent bus instances and fades. |
| `src/synths/all/mixerAudio.js` | Native Web Audio gains, filters, pan, width and sends surround Wasm. The separate desk limiter has its own worklet/latency. | Native parameter smoothing and current fader/solo/mute behavior are compatibility requirements, not silently replaced by reference modules. |
| `src/seq/useModulation.js` | 20 ms host timer evaluates external modulation and restores bases. Synth-internal Rust LFOs are separate. | M1 proves a new audio-rate LFO target; it does not make existing external destinations sample accurate. |

No exported legacy ABI changed. `synth:check` and `synths:check` still verify the
existing source/artifact hashes. Baseline hashes of six legacy Wasm binaries,
hardware and Node version are in `.tmp/modular-audio-baseline.json`.

## Baseline scope and hosting

- Host: Windows x64, OS `10.0.26200`, AMD Ryzen 9 3950X, 32 logical CPUs;
  Node `v24.18.0`. Local Cargo `1.99.1`, rustc
  `1.99.1 (58cf8f9c3 2026-10-13)`, target `wasm32-unknown-unknown`.
- Browser evidence uses the app's supported computer-use browser, Chrome 157
  on Windows. No Puppeteer/CDP runner was launched.
- The existing `ensemblePlan.js` supports counts 2/4/8 and only subtractive/FM
  parts. It is reproducible but **not** the requested six actual lead/second/
  rhythm/pad/bass/drum engines. M1's two deterministic tones are synthetic too.
  No six-real-engine CPU/deadline/worker baseline has been measured here.
  The old profiling tools remain available for a later authorized browser-tool
  workflow; their existence does not authorize bypassing browser restrictions.
- The dev and built-preview harnesses reported `crossOriginIsolated: false`, with no COOP, COEP or
  CORP response headers. Production headers could not be fetched by the local
  Node request (`TypeError: fetch failed`); production browser isolation and
  production worker support remain unverified. No hosting policy was changed.
- Offline render wall times include preparation, direct Wasm comparison and
  two worklet renders. They are not callback timing or real-time headroom.
  Device-loopback latency, listening, deadline distributions, sustained UI-load
  performance and CPU attribution remain unmeasured.

## New reference contracts and API

`synth-engine/graph` is a dependency-free `rlib`/`cdylib`. `Graph` owns nodes,
phase, gates, bases, buffers, connections, queue, clock and statistics. There
are no mutable production globals or browser dependencies in the core.

- `Graph::new(rate, max_block)`, `add_node(id, kind, algorithm_version)`,
  `set_base`, `connect`, `prepare` build a stopped graph. Topology validation and
  allocation happen before `render`. A prepared topology is immutable.
- `Kind::{Tone,Lfo,Vca,Mix,Output}` have stable `ref.*` types, algorithm version
  1, numeric codes, port IDs and parameter IDs. The tone's L/R are sine/cosine
  quadrature, amplitude in linear PCM; the LFO is mono bipolar sine in Hz.
- Rust `descriptors_json()` describes directions, families, stereo/mono bus
  widths, units/reference, audio rates, normalization, fan-in, required inputs,
  parameter bounds, zero smoothing, latency/tails and reset/bypass capability.
  The build reads it from the **compiled Wasm** through an owned descriptor
  handle and emits `public/modular-audio/contracts.json`. The JS host consumes
  those descriptors; a regression checks agreement with the actual Wasm.
- `Link::Audio { input }` retains input identity through execution. VCA and
  Output use input 0. **Only Mix sums** its `a.in`/`b.in` stereo buses, then
  applies its linear gain. No automatic mono/stereo conversion or hidden sum.
  Detector inputs are not advertised before their DSP exists.
- `Link::Mod` carries target parameter, signed depth, offset and explicit
  bipolar/unipolar mapping. Per sample:
  `gain = clamp(base + sum(offset + depth * mappedSignal), 0, 2)`.
  Multiple modulation edges sum deterministically in patch connection order.
  Disabling a modulation edge restores the saved/current base contribution;
  generated modulation never overwrites the base.
- The validator rejects unsupported versions, duplicate IDs/input fan-in,
  unknown endpoints/ports/parameters, missing required buses, incompatible
  signal families, non-finite/out-of-range values, resources and cycles.
  Exactly one output is required. Both host persistence validation and Rust
  preparation validate DAGs; the native caller does not depend on JS checks.
- Limits: 64 nodes, 128 edges, 256 immediate events, 1–2048 maximum block
  frames, sample rates 8–192 kHz. Oscillator frequency must be below Nyquist.
  Actual `render` frame counts can be 0 through the prepared maximum.
  Bounds/errors are returned, not silently truncated.
- `schedule()` exposes stable IDs, dependencies and topological levels,
  including modulation dependencies. This is a preparation/scheduling seam;
  no threads or worker executor exist. All current module latency/tails are 0;
  there is no general latency-compensation implementation yet.

### Events, clock and lifecycle

`Event { frame, target, owner, action }` uses **absolute graph-local samples**,
not seconds or UI ticks. Supported actions are parameter base changes, mono
tone gates and modulation-edge enable/disable. The JS boundary accepts safe
integer frames through `2^53-1`. Source phases run from graph sample zero even
when their gate is closed. There is no tempo/sync LFO or sustain/MIDI adapter.

Events execute before the specified output sample. Same-sample receive order
is stable. Late events clamp to the next unrendered sample and increment `late`.
A full queue rejects the new event and increments `overflow`; it does not
overwrite a note release. Hosts must handle rejection (e.g. cancel its owner).
Gate-off only releases the matching current owner; `cancel_owner` removes that
owner's queued events and held gates. This is a monophonic reference gate,
not a polyphonic note allocator or sustain implementation.

Pause emits silence and freezes graph time/phases; reset clears time, phases,
gates, events and stats, retaining current bases and modulation-enable state.
Recreating a graph from its patch starts the saved timeline afresh. The worklet
reports its first processed AudioContext frame separately as `contextOrigin`;
creation time is only `contextCreatedFrame`. Pause/reset need host remapping
before converting subsequent context timestamps to graph-local events. The
harness prebooks its fixture; it is not a general live MIDI clock bridge.

Rendering and queue insertion use preallocated memory and bounded loops. No
render-path locks, I/O, table initialization, allocation or reclamation exist
in the Rust implementation. A counting-allocator test is included but **could
not execute under Windows Application Control** (error 4551). Native graph
tests and actual Wasm PCM tests did execute. Do not report the allocator test
as passed. Normal worklet `process()` copies into browser output without
creating views/messages; ready/stats/disposal run in constructor/port handlers.
Exceptional errors may post an error message. Final output stops exactly at
`stopFrame`, zero-filling the rest of a host quantum.

The Wasm ABI uses trusted-host opaque owned pointers: create/free exactly once,
serialize access, never reuse a freed handle. JS `dispose` is idempotent and
rejects subsequent use. Preparing another graph in the same Wasm memory may
grow memory: call `refresh()` on existing graphs **before** rendering them
again. The worklet uses one instance/graph and does not grow memory in render.
Unchanged-instance hot swaps, state transfer, tail retirement, fades and worker
publication remain future work; M1 stops/disposes whole graphs off `process()`.

### Persistence and compatibility

`public/modular-audio/reference-patch.json` is patch schema 1, independently
versioned from each DSP algorithm. Stable numeric module/edge IDs, base values,
typed connections, mapping depth/polarity/offset and timestamped events persist.
Layout is separate. `loadPatch`/`savePatch` validate before accepting a patch.
JSON persistence is host-side; native callers use the portable typed builder.
This is a restart/replay patch, **not** a snapshot of oscillators, transport,
queued live edits or tails. Hosts must explicitly put new edits into their
patch authority before saving. It does not migrate workbench setup files.

The harness uses only `bgm.modular-audio.reference.v1` in localStorage and starts
stopped. Existing desk storage, default Starmap Void/Dark/muted-Dry setup, legacy
DSP IDs/ABIs, caches and audio routes remain in use on existing pages.

## Reproduction

```powershell
npm.cmd run graph:build
npm.cmd run graph:check
npm.cmd test -- src/modular-audio/reference.test.js
npm.cmd run graph:render
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/tools/modular-audio.html`. Verify runs actual
OfflineAudioContext worklets at three rates; Play connects stereo output to an
AudioContext destination and records analyser peaks; Save/Load operate on the
editable patch. Reload restores stopped. No workbench defaults opt into it.
The public build also includes this explicit tool URL.

`graph:render` writes `.tmp/modular-audio-reference.wav` (48 kHz, stereo PCM16;
Wasm tests use original float PCM) and `.tmp/modular-audio-pcm.json`.
`graph:build` hashes all crate Rust/TOML/lock inputs recursively and publishes
the Wasm, contracts, fixture and runtime/worklet cache version. The worklet's
transitive runtime import is versioned too. Normal/public builds run
`graph:check`. Legacy build helpers and binaries are unchanged.

Native tests use the local toolchain:

```powershell
$env:CARGO_HOME = "$PWD/.tmp/rust-tools/cargo"
$env:RUSTUP_HOME = "$PWD/.tmp/rust-tools/rustup"
$env:PATH = "$env:CARGO_HOME/bin;$env:PATH"
cargo test --manifest-path synth-engine/graph/Cargo.toml --test reference
```

The four native reference tests passed. `npm.cmd run graph:test` attempts the
entire native suite; this machine blocks the empty library test runner and
allocation test executable with Application Control error 4551. Native
descriptor helper execution was also blocked later in the session, which is
why the normal build generates contracts from Wasm. No security settings or
execution policies were changed.

## Next concrete task

M2: extract one real legacy synth into owned reusable state without changing
its exported legacy ABI/PCM; percussion is a small candidate, or audit the full
subtractive Engine/colour/table seam if DI-Poly is chosen. Add its declared
audio-rate target and a separate stereo program/detector compressor module,
preserving input identity and including key dependencies in the DAG. Use source
selectors and a post-mute/pre-solo/pre-fader kick tap before cable UI. Verify
anti-phase key detection, missing-key release, latency-aligned blend, owner
release/repatch, persistence and old PCM at three rates. Then establish the
actual six-engine fixture/cost baseline before M3's optional workers. Do not
infer workers, sidechain DSP or migrated legacy modulation from M1's seams.
