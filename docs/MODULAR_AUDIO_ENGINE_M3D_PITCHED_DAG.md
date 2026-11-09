# M3d: block-capable pitched Rust DAG

Implemented 2026-11-09 after the user requested **commit then continue**.
The completed foundation through M3c was committed locally as **`bc4e35d`**,
`Add owned modular audio foundations and six-source harness`. M3d is subsequent
working-tree work. No push or deployment was requested or performed.

Historical checkpoint: the next **commit and keep iterating** request committed
M3d locally as **`fa634f5`** before [M3e bounded worker transport](MODULAR_AUDIO_ENGINE_M3E_WORKER.md).

## Graph integration

`legacy.core` and `legacy.fm` are now real version-1 DAG node kinds, backed by
owned Rust engines. Their stereo audio ports and a-rate output gain use the
existing graph contracts. The source's legacy instrument packet/performance/
transition spec lives under module `config`; `config.events` must be empty.
Timestamped notes/controllers live once, in the graph's event authority.

`synth-engine/graph/src/pitched.rs` owns the instrument, prepared settings and
automation, output-gain keyframes, event-owner bookkeeping and cursors. Each
graph render splits at due graph events; pitched nodes render a span once,
then the existing sample graph applies output-gain modulation, mixes, keys and
output. It does not invoke a complete pitched render for every sample.
Audio/control dependencies remain in the compiled topology/levels, including
disabled detector edges. No parallel executor is implied by these levels.

The standalone core/FM legacy DSP still owns note execution/smoothing/voice
allocation. Events are forwarded at their exact graph frame, preserving stable
receive order for identical timestamps. The new sample-boundary segmentation
passes retained original float goldens. Module panic clears that instrument's
pending notes and prepared transition playback; reset restores the prepared
packet/performance/transition cursors and clears graph notes. Reset does not
automatically rebook the patch event list; the host does that for explicit replay.

### Prepared transitions

`src/modular-audio/pitchedCompiler.js` runs the original `PatchTransition`
helper during preparation, outside `process()`. It bakes parameter/performance
updates and segment boundaries, retaining 16-frame control cadence, midpoint/
end boundaries, overlapping edits, discrete/log interpolation and structural
gain dips. Output-gain keyframes retain JS double values; Rust multiplies raw
f32 samples in f64 before rounding to f32, matching the original host helper.
Gain changes do not unnecessarily split the DSP render span per sample.

No JS interpolation, sorting, compilation or keyframe allocation occurs in the
render callback. Canonical host runtime remains in `src/modular-audio/runtime.js`;
the graph builder now bundles its compiler/validation dependencies with the
already-installed esbuild into the public worklet runtime. Provenance checks
compare the generated bundle and version worklet imports. Existing owned
standalone adapters remain available as independent references.

### Note ownership and cancellation

Graph note events carry `frame`, `target`, positive `owner`, `event` (legacy
kind 0–6), `note` (u32 ID), `a` and `b`. Note-on/off/retune require a nonzero ID;
sustain/channel pressure use ID 0. Mode/glide and module panic retain the
legacy channel-wide semantics. A note ID cannot ambiguously belong to two
owners in the same module/patch; IDs remain scoped to their module.

Immediate `cancel(owner)` and timestamped `kind:'cancel'` remove that owner's
queued events across the graph and release only its held notes. Pitched owner
bookkeeping maps note IDs to owners; engine cancellation removes that ID's
pending note events and bypasses sustain for its release. `Notes::cancel`
forgets cancelled mono keys, retaining last-key priority and the remaining
owner's legato/retrigger behavior. Cancellation does not reset already-applied
shared channel controllers or module-level prepared automation. Releasing
tails are allowed; this is not an implicit whole-module panic or output mute.

Core/FM changes add explicit `performance`, `has_note` and `cancel_note` methods
without changing ordinary legacy ABI execution. The compatibility exports and
default routes stay available. The original ABI still does not claim concurrent
singleton safety; owned graph handles require serialized access and off-process
prepare/free, like previous stages.

### Bounds, lifecycle and metadata

- Graph event capacity is now **4096**, up from 256; original fixtures remain
  valid. Eight pitched instances maximum, **4000 pending note/controller events
  per pitched node**, reserving internal queue space for performance automation.
- Up to **65,536 total prepared automation/gain points** per node, at most 32
  performance transitions, bounded by the validated spec. Oversized transitions
  fail preparation rather than allocating or compiling during playback.
- All view refresh/growth happens after preparation. Pause freezes frame/state
  and zeros graph output plus source taps. Reset/panic/cancellation do not grow
  memory or reclaim the prepared stores inside render.
- Descriptors identify prepared-block processing and the configuration contract.
  Core declares no new buffered latency; FM descriptor latency is variable
  (`null`) and queried per prepared instance: quality 1 is **7.5 frames**, quality
  2 **7.75**. No automatic compensation or extra quantum was introduced.

## Six-source vertical slice

`sixSourceDag()` prepares three core, two FM and one percussion source, five
explicit binary mixers, a real kick-keyed stereo compressor and an output:
**13 nodes**. Raw program sum has explicit final gain **1/8**; the actual kick
tap keys the compressor without entering the audible sum except through its
normal drum program route. Sources remain independently owned in one Wasm
instance. Source buffers, actual kick and final Rust output are exposed as
prepared read-only host views; writes remain the graph's responsibility.

`dag-sources-processor.js` owns this single Rust graph, exports six stereo raw
source taps, actual kick and the Rust mix (**eight stereo outputs**), handles
the final partial quantum and reports named instrument plus graph counters.
Percussion uses its actual engine stats; aggregate graph counters are not
misrepresented as drum-only events.

On the same 4175 six-role page:

- **Six-source Rust DAG · M3d** keeps existing channel inserts, desk mixer,
  master delay/reverb and final limiter, fed by the six Rust DAG source taps.
  The actual kick still keys the existing opt-in compressor path. This permits
  a like-for-like full-route comparison with M3c's standalone owned sources.
- **Compare Rust DAG · all rates** compares those two variants with the selected
  repeat count. Current remains the fresh-page default; older variants remain.
- **Play Rust mix (dry)** auditions the graph's own sum/compressor output
  directly, omitting desk channel/master effects. Its role analysers observe
  raw Rust source taps. It is a distinct reference mix, not a claim to reproduce
  the desk's post-insert/pan/fader/master processing inside Rust.

Existing compatible insert batching is retained in the desk path. Broad desk
and cable migration, true-peak/limiter changes, lookahead, arbitrary hot topology
replacement and worker scheduling are not part of this stage.

## Executable evidence

- **132 exact pitched-DAG / original float PCM comparisons** at 44.1/48/96 kHz,
  against retained pre-extraction core/FM goldens: all earlier recipes, additive
  shapes, voice/pressure/sustain/mono/glide/retune/stealing and prepared structural
  transitions, irregular/final partial blocks, and actual six-role pitched parts.
  [DAG report](../reports/modular_audio/m3d-pitched-dag-compatibility.json).
- Rebuilt standalone legacy and owned adapters separately pass **75 core + 57
  FM** original-binary PCM comparisons: [core](../reports/modular_audio/m3d-core-compatibility.json),
  [FM](../reports/modular_audio/m3d-fm-compatibility.json). No old reports/goldens
  were overwritten. [Binary identity inventory](../reports/modular_audio/m3d-legacy-binaries.json)
  records which artifacts differ from the M3c commit; compatibility is based on
  actual PCM/ABI checks, not an assertion that all rebuilt bytes are unchanged.
- New tests cover full six-source DAG stereo output and exact pitched taps at
  three rates, prepared config persistence/replay, pause, owner conflicts,
  sustain bypass without releasing peers, cancelled mono fallback/priority,
  source output-worklet clipping/disposal and the original M1/M2 behavior.
  Browser route construction separately checks Current, M3c and M3d: M3d must
  instantiate one eight-output source worklet, connect all six role ports, route
  kick port 6 to the external desk compressor and expose Rust mix port 7.
- **21 Rust allocator audits** pass, including the entire six-source DAG score,
  transitions, live enqueue, owner cancellation, reset, pause and replay: **0
  allocation/reclamation calls and no memory growth after preparation**.
  DAG capacity **5,242,880 / 5,242,880 / 5,701,632 bytes** at 44.1/48/96 kHz.
  [Allocation report](../reports/modular_audio/m3d-allocation.json). JS/browser
  allocation and callback deadline timing remain outside that instrumentation.
- Full suite: **375 files / 2,710 tests passed**, 129.74 s;
  `.tmp/modular-audio-m3d-suite.log`. Optional scalar/SIMD/acoustic/FM-bank paths
  remain tested; their existing named artifacts were rebuilt where required.
- Final public build passed **about 69 s** while the full suite ran concurrently;
  curated-bank/exclusion checks passed;
  `.tmp/modular-audio-m3d-build.log`. Existing chunk advisory remains. Native
  cargo check passed; native test executables remain blocked by Application
  Control and were not bypassed. Independent compressor equations still pass.
- Graph **296,101 bytes**, version **`eb07d368174d0159`**, rustc 1.99.1
  (58cf8f9c3 2026-10-13). Legacy defaults and sounds remain the compatibility
  baseline. `.tmp/modular-audio-m3d-native-check.log` and other stage logs retain
  local details; durable reports are linked above.

Commands:

```powershell
npm.cmd run graph:audit-dag
npm.cmd run graph:audit-dag-alloc
npm.cmd test -- src/modular-audio/pitchedDag.test.js
npm.cmd run graph:check
npm.cmd run ensemble:check
npm.cmd run build:public
```

## Actual browser comparison

Verified on the existing `http://127.0.0.1:4175/tools/modular-ensemble.html`
preview, Chrome 157, non-isolated. The pinned fixture/hash is unchanged:
`77ce180861239426c0c63037235cf98d74a2bbfa09a2a46ee3da3353bb29a7df`.
[Durable browser report](../reports/modular_audio/m3d-browser-dag-comparison.json).

- **18 measured renders plus 6 full warmups**: M3c owned sources versus the real
  M3d source DAG, three rates × three measured repeats. All six post-local-insert
  stems match direct original legacy Wasm exactly in each first measured case;
  repeat/reference stem hashes match. All six DAG role stats identify actual
  DAG owners, with separately named aggregate graph telemetry.
- Full desk mixes retain the **1e-6** absolute tolerance for native Web Audio
  floating-point variability. Actual maximum source-variant difference is
  **2.9802322387695312e-8 at every rate**; largest repeat difference is the same.
  These are not claims of bit-exact complete browser mixes.
- Finite audio, nonzero six stems, last-half-second tail RMS **0/0**, no missing
  source stats or reported late/drop/overflow. At 48 kHz all six engines and
  the graph reach **840,000 frames**, **357 graph events**; expected second/FM
  **14 steals**, all others zero. The real kick is nonzero; both graph and desk
  keyed compressors report external-key connection, missing-key false.
- Full offline median render ms (17.5 s audio), M3c / M3d:
  **6993.1 / 5749.7** at 44.1 kHz, **5214.3 / 5856.7** at 48 kHz,
  **9509.0 / 10404.6** at 96 kHz. Background load was uncontrolled; the full
  suite overlapped part of this run. Three repeats are a small sample. These
  include 16-channel capture/stats, existing local/master FX, native mixer and
  limiter. M3d additionally computes the Rust reference sum/compressor even
  though the comparison listens to the same external desk route. Preparation
  scope also includes different ownership/handshake work. This is correctness
  evidence and an elapsed-time observation, not a controlled speedup, callback
  deadline, device underrun or worker benchmark.

The first attempted browser comparison failed before final verification: the
new selector was missing source-DAG construction and skipped the external desk
compressor, so it silently created legacy sources with the wrong master route.
Both were fixed, and the new route-construction regression covers that failure.
The passing report above is from the corrected complete all-rate rerun; no
agreement tolerance or reference PCM was changed to obtain it.

Saved the pinned fixture locally, reloaded the page and restored it with
playback stopped. Both subsequent finite live runs stopped and closed their
contexts automatically at 48 kHz:

- [Desk route](../reports/modular_audio/m3d-live-desk.json): **177 analyser
  polls**, sampled main peak **.11402103304862976**, all six role peaks nonzero.
- [Direct Rust mix](../reports/modular_audio/m3d-live-rust-mix.json): **177 polls**,
  sampled main peak **.05186479538679123**, all six raw source peaks nonzero.
  The Rust source graph and all six sources reach **840,000 frames**, with
  **357** applied events, no late/drop/overflow and the expected FM steals.
  The disconnected external desk compressor correctly remains at frame 0;
  `sourceDag` compressor 17 is the actual audible direct-mode compressor.

Reported base/output latency is **10/40 ms** in both runs. These are analyser/
source-timing observations, not direct listening, device loopback, measured
device underruns or screen-lock evidence. The user's earlier foreground-phone
listening passed; locked-phone crackling remains deferred with cause unproved.
The same preview is left **M3d / 48 kHz, stopped**. Screenshot:
`.tmp/modular-audio-m3d-browser.png`.

## Next task

Specify and implement a bounded **optional** worker executor against this serial
Rust DAG/reference, with explicit frame/generation publication, owner and event
transfer, added buffering/latency, nonblocking consumption, stale/missed-result
policy, capability/hosting requirements and a tested serial fallback. Benchmark
actual timing/stalls/underruns rather than inferring speedup from worklet count
or these offline elapsed times. Keep the six-role fixture and existing defaults
authoritative; no broad migration or screen-lock investigation is bundled in.
