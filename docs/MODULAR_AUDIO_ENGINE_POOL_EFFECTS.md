# Source-pool effects and prepared latency boundary

Updated 2026-11-11. This is an explicit experimental graph path. Existing native
DSP routes, buffering defaults, song data and default PDC policy remain unchanged.

## Prepared latency contract

`graphWorker.js` queries `ReferenceGraph.latency(id)` after preparing its graph.
Its ready response and later statistics include `sourceLatencies`, keyed by the
actual source IDs owned by that worker. Values are finite f64 frame counts in
`0..262144`, including fractional values such as FM's actual `7.5` frames. These
are measured prepared graph metadata, not descriptor guesses or worker transport
latency. The query occurs during preparation, outside rendering.

`planSourcePool()` preserves an explicit `latencyCompensation` flag on every
source graph and the dependent master. `preparePoolMaster(plan, ready, contracts)`
returns `{patch, sourceLatencies}`. With PDC enabled it requires exactly the source
IDs assigned to each ready response. Missing, extra, nonfinite, negative or
out-of-range values reject. It configures each corresponding `host.audio` node as
`{version:1, latencyFrames:value}`; the percussion kick host ID 7 carries zero.
This host declaration reports already incurred source latency; it does not delay
that bus again. Without PDC, the existing master object is returned unchanged and
no latency response is required.

The PDC browser route prepares all source workers before constructing the master.
Producers may fill only their existing bounded PCM pools while the master is
being prepared. Their queued ports are then transferred to the output worklet.
The non-PDC route preserves its original master-first startup sequence.

The first PDC implementation compensates **integer path differences**. Equal
fractional absolute source latency is retained exactly. Unequal fractional path
differences reject with a clear error; values are never rounded to an assumed
integer delay. Prepared FM edits that change intrinsic quality latency are also
rejected by graph preparation when PDC is enabled.

## Dependent master effects and controls

The fixed six-source partition now retains `legacy.inserts`, `legacy.effects`,
`graph.delay`, `rack.*`, `voice.shimmer` and prepared `desk.*` nodes in the dependent master, alongside its
mixers, compressor and output. Source FX distribution and arbitrary graph cuts
are not implemented. Existing canonical 128-frame effect processing and declared
latency are preserved by the graph adapters.

Prebooked master events remain in the master's timeline. Their owners belong to
the explicit `MASTER` domain; an owner cannot span source workers or cross the
source/master boundary. Live pool `enqueue()` continues to target owned sources.
It does not silently send master controls through a source worker.

`executionPolicy.js` rejects any descriptor marked `execution:'worker-only'` on a
serial realtime route. `voice.freeze` is also explicitly guarded before its graph
descriptor exists. A requested worker route whose preparation fails cannot
silently run these modules in serial realtime; ordinary patches retain existing
serial startup fallback. Worker-only nodes cannot occupy the dependent realtime
pool master. Direct/offline `ReferenceGraph` remains usable for measurements.
The native Freeze capture-copy deadline limitation remains documented in
`MODULAR_AUDIO_ENGINE_OWNED_VOICE_FX.md`.

## Exact verification

Run:

```powershell
npm.cmd test -- src/modular-audio/poolPlan.test.js src/modular-audio/poolBrowser.test.js src/modular-audio/workerBrowser.test.js src/modular-audio/poolEffects.test.js src/modular-audio/poolExecution.test.js
npm.cmd exec -- vite-node tools/auditPoolEffects.mjs
```

`reports/modular_audio/pool-effects-latency-parity.json` records the exact graph
build, Wasm hash, host-source hashes, counters and nonzero PCM peaks. Nine
fixtures produce eighteen actual one/three-worker comparisons: 44.1/48/96 kHz at
512 and 1024 frames, an equal-fractional-FM fixture at 48 kHz/512 frames, and
48/96 kHz dependent-master Rack Pitch/Shimmer cases at 512 frames.
They exercise saved/reloaded settings, unequal master branch delays, inserts,
reverb/delay send inputs, compressor key input, source cancellation, and three
prebooked master controls. All eight buses are bit exact at matching cadence;
the audit also records cross-cadence comparison separately. All rendered buses
are nonzero, source latency maps agree with direct prepared graphs, master/source
event totals agree, and queue underrun counts are zero. The extended master
applies five prebooked controls and reports 512 frames of adapter/path latency.
Rack Pitch's wet dual-tap delay remains time-varying; its declared 128 frames
cover the canonical adapter alone and do not claim wet/dry phase compensation.

The core fixture reports 256 frames at its output. The equal-FM fixture reports
7.5 frames on each joined pitched source and 263.5 at output; its zero-latency
percussion still renders but is deliberately not joined to a fractional path.
The unmodified mixed core/FM fixture with PDC enabled rejects unequal fractional
differences before either verifier starts a thread. Both verifiers release
partial graphs/channels/workers if preparation fails.

These are consumer-paced Node thread/Wasm functional checks. They do not measure
physical listening, AudioWorklet scheduling deadlines, throughput or speedup.
Desktop/browser realtime checks and later worker-pool partition expansion remain
separate integration work.
