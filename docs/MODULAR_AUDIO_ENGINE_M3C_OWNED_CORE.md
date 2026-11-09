# M3c: owned subtractive/core engines

Implemented 2026-11-09, following [owned FM](MODULAR_AUDIO_ENGINE_M3B_OWNED_FM.md).
The [pinned M3a fixture](MODULAR_AUDIO_ENGINE_M3A_BASELINE.md) and existing desk
defaults remain the reference. All six source engines now have owned mutable
Rust state. Pitched DAG integration and optional workers remain unfinished.

This is the historical M3c checkpoint. [M3d pitched DAG integration](MODULAR_AUDIO_ENGINE_M3D_PITCHED_DAG.md)
is now delivered; optional workers remain next. Foundation through M3c was
committed locally as `bc4e35d` before continuing M3d.

## Ownership boundary

`synth-engine/src/engine.rs` contains the original subtractive/core DSP as a
public owned `Engine`. Voice/lane/envelope/note-priority/expression state,
colour processors, output buffers, chorus/filter/DC/headroom, RNG/LFOs, event
queue and optional SIMD frame counter belong to each engine. The scalar and
optional SIMD implementations use these fields, rather than helper globals.
`prepared(sr)` initializes an engine outside rendering; parameter/event/render/
output/stat/frame/panic methods retain the existing semantics and math.

`src/tables.rs` replaces mutable `ADDITIVE` / `ADDITIVE_READY` globals with a
`OnceLock<Box<[f32]>>`. The exact original harmonic accumulation, interpolation
and normalization order is preserved. Table generation happens during prepare,
once per Wasm instance/native process, then callers receive read-only access.
The six shapes × sixteen bands × 2049 f32 entries total **786,816 bytes**.
Render uses `get()`, never lazy initialization or a blocking initialization
operation. The table remains for the instance lifetime when owners are freed;
it is not duplicated for each owner or reclaimed inside rendering.

`src/abi.rs` retains the original singleton and laboratory probes behind
default-enabled `legacy-abi`. Probe outputs use the compatibility engine's
buffers. Scalar and acoustic/SIMD builds retain their original exports. The
graph depends on the core rlib with defaults disabled and colour-coefficient
caching off, matching the existing scalar worklet. No synthesis, edge/filter/
chorus algorithm, preset or automatic latency alignment was changed.

`synth-engine/graph/src/core_abi.rs` exports trusted serialized `core_owned_*`
handles: create/init/free, parameter/event, render/output/stat, panic and frame.
Prepare/free outside process; refresh all views after the last owner is
prepared, since preparation can grow memory. No legacy `engine_*` singleton or
probe exports are linked into the owned graph binary. These pointer handles
do not provide stale-pointer validation or cross-thread synchronization.

The owned pitched adapters remain alongside the reference graph ABI, **not
pitched `Graph::Kind` nodes**. A host can render all six owners in one Wasm
memory, but that does not mean the reference DAG schedules those pitched
branches or implements generic note-owner cancellation. This distinction is
the next integration task, rather than a hidden migration of today's desk.

## Host and audition path

`src/modular-audio/ownedCore.js` is the canonical version-1 contract for the
244 possible global/layer parameter triples, performance, timestamped events
and transitions. It validates scopes/indices, finite f32 values, duplicate
parameters, safe-integer frames, event IDs/kinds/value bounds and resource
limits. The 4096-event queue reserves initial performance and one event per
transition. Save/load validates; reset restores the spec on the same owner;
whole-instance panic clears voices/events and pending transitions.

The existing `PatchTransition` helper and core discrete/log interpolation are
reused, including structural gain dips and event-6 performance changes.
`owned-core-processor.js` prepares three independent owners in one Wasm instance,
refreshes their views after preparation, emits three stereo outputs, handles
the exact final partial quantum, reports named role stats and disposes owners
through the control path. No extra buffered quantum is introduced.

The six-role page adds **All six owned + kick key · M3c**. Lead/rhythm/pad use
the owned trio, second/bass the owned FM pair, drums the existing owned
percussion graph. Existing inserts, desk mixer, real kick detector, compressor,
shared delay/reverb and final limiter are retained. These audition groups use
separate Wasm instances and run serially on the audio rendering thread.
**Compare all owned · all rates** compares this with the existing keyed route.
All prior variants remain available; the fresh-page default stays Current.

Core source/build provenance now includes the extracted engine, ABI and tables.
The graph hashes root core Cargo/source files plus transitive common files;
the host/worklet are copied/versioned/checked like owned FM. The source-inventory
test was extended to include the extracted files, rather than weakened.

## Compatibility and allocation evidence

Before changes, scalar/acoustic Wasm and manifests were preserved under
`.tmp/core-before-m3c/`; an existing named SIMD binary was also preserved.
Original scalar SHA256:
`8e781dcb70d35ae5ce7d0208c5388828c1058b0134fdb9a7f5826a55d02e74e4`.
Versioned original float goldens: `src/modular-audio/coreLegacyPcm.json`.
The audit retains/checks existing goldens and never silently regenerates them.

**75 exact original/rebuilt/owned PCM comparisons** pass at 44.1/48/96 kHz:
all twelve recipes, all six additive shapes, reordered dense stealing, sustain,
pressure, retune, mono/legato/glide, structural oscillator/patch transition and
the full actual lead/rhythm/pad score. Blocks cycle through
128/37/203/1/127 frames, including final partials. The original DSP is the
preserved binary, driven with the same transition contract, not a substitute.
Owned/rebuilt stats agree. [Core compatibility report](../reports/modular_audio/core-owned-compatibility.json).

The current graph also passes the **57** previous FM original/rebuilt/owned
comparisons; the separate [M3c FM report](../reports/modular_audio/m3c-fm-compatibility.json)
preserves the earlier M3b report. FM remains quality 1 / 7.5-frame intrinsic
latency in the pinned score. Core has no new algorithmic buffer latency.

An executable full-score 48 kHz test prepares **three core + two FM + one
percussion engine in one Wasm memory**, refreshes all views, and compares every
raw L/R sample against independent legacy instances for the full 17.5 seconds:
all six maximum differences **0**, all sources audible. Separate trio tests
cover independent reset, panic and disposal without changing peers. Contract
save/load/rejection, first-event silence, actual three-output worklet final
partial quantum and disposal are tested too.

**18 Wasm allocator audits** pass: previous twelve, plus the trio and all six
sources sharing memory, each at three rates. Full score, transitions, panic,
owner cancellation where supported, reset and replay execute with **0 Rust
allocation/reclamation calls and 0 memory growth after preparation**. This
does not count JS/browser allocation or measure callback deadlines.

| Prepared Wasm case | 44.1 kHz bytes | 48 kHz bytes | 96 kHz bytes |
| --- | ---: | ---: | ---: |
| Three owned core handles | 3,014,656 | 3,014,656 | 3,014,656 |
| All six owned sources in one memory | 4,653,056 | 4,718,592 | 5,046,272 |

These are total linear-memory capacities, including the shared table and
runtime storage, not total browser or native memory use. They are not six
separate copies of the shared-instance number.

[Legacy export inventory](../reports/modular_audio/core-legacy-exports.json):
scalar and acoustic each retain the same **22** entries/names/kinds as their
preserved binaries. Rebuilt scalar **379,871 bytes**, acoustic **400,575 bytes**.
Native cargo check passes; Application Control still blocks native test
executables. No security settings were changed or bypassed.

Full suite: **373 files / 2,697 tests passed**, 119.91 s;
`.tmp/modular-audio-m3c-suite.log`. Public build passed **36.05 s** with curated
bank/exclusion checks, `.tmp/modular-audio-m3c-build.log`; existing chunk advisory
remains. Native check log: `.tmp/modular-audio-m3c-native-check.log`. Existing
named SIMD diagnostic artifacts were rebuilt before the full suite.
Graph **279,049 bytes**, version **`1bb61c9f8351fcb5`**.
Durable [allocation report](../reports/modular_audio/m3c-allocation.json).

Commands:

```powershell
npm.cmd run graph:audit-core
npm.cmd run graph:audit-fm -- --out=reports/modular_audio/m3c-fm-compatibility.json
npm.cmd run graph:audit-compressor
npm.cmd test -- src/modular-audio/coreOwned.test.js src/modular-audio/fmOwned.test.js src/modular-audio/sixRole.test.js
npm.cmd run graph:check
npm.cmd run ensemble:check
npm.cmd run build:public
```

## Actual built-browser comparison

Verified the existing **4175** public preview page, including its M3c selector
and comparison button. [Raw actual comparison](../reports/modular_audio/m3c-browser-all-owned-comparison.json):
Chrome 157, non-isolated, keyed legacy versus all-owned, 44.1/48/96 kHz,
three measured repeats each plus one full-score warmup: **18 measured renders,
six warmups**. Pinned fixture/hash and 17.5-second duration are unchanged.
No background load was controlled, and these runs followed the suite/build.

All six post-local-insert stems exactly match direct legacy Wasm in each first
measured case. Repeat stem hashes and keyed/all-owned stems match at every
rate. Full browser mix uses the retained **1e-6** absolute tolerance; actual
max keyed/owned differences at 44.1/48/96 kHz are
**2.9802322387695312e-8 / 2.9802322387695312e-8 / 3.725290298461914e-8**;
RMS differences **1.8083974919965287e-9 / 1.7294683936582454e-9 /
1.9114934320573952e-9**. Largest full-mix repeat difference:
**3.725290298461914e-8**. Complete browser mixes are not claimed bit-identical.

Full-route offline render elapsed milliseconds, median / max:

| Rate | Keyed legacy | All six owned + same kick key |
| --- | ---: | ---: |
| 44.1 kHz | 4693.1 / 4804.8 | 4785.5 / 4834.1 |
| 48 kHz | 5079.6 / 5249.9 | 5222.1 / 5456.9 |
| 96 kHz | 10365.8 / 10747.9 | 10655.0 / 10956.6 |

Prepare medians (keyed / owned): **93.1 / 88.5**, **88.3 / 91.4**,
**92.5 / 99.1 ms**. No speedup was demonstrated. These include full-route
offline capture/stats and are not callback CPU, device-underrun or worker
deadline evidence. The owned groups' readiness handshake includes construction
in prepare timing; original source constructors are not separately observable
and some cost can enter render timing. Warmup does not remove per-instance
setup. Three repeats and uncontrolled background load limit conclusions;
do not compare this as a controlled throughput change against older M3a/M3b
sessions. No physical loopback or production-isolation result follows.

All measured runs have finite output, last-half-second RMS **0/0**, all source
stats present and no reported late/drop/overflow. Second has 14 intentional
release/capacity steals; other sources 0. Owned core roles report latency 0,
FM roles 7.5 frames; no alignment change. The core trio identifies shared
memory **3,014,656 bytes**, FM pair **1,572,864 bytes** in this build. Count
each shared instance once. Actual end frames are exact; legacy source stats
can contain padded final quanta while captured PCM uses the requested duration.

The pinned fixture was saved, the page reloaded, and the saved fixture restored
**stopped**, before explicitly selecting M3c/48 kHz for finite live synthesis.
Versioned packet roundtrip/reset is separately covered by executable host tests.

[Reloaded live output report](../reports/modular_audio/m3c-live-production.json):
48 kHz, M3c, **178** analyser polls, sampled master peak **.11402103304862976**.
All six role peaks are nonzero: lead .10455585, second .06792583, rhythm
.05720391, pad .20691101, bass .04420418, drums .12163707. All five pitched
owners and the percussion graph end at exactly **840,000 frames**, with the
expected 14 second/FM steals, no other steals and no reported late/drop/overflow.
Drum events: **57**. Reported base/output latency **10/40 ms**. The score/tail
finished and AudioContext closed; page left **M3c / 48 kHz, stopped**. Screenshot:
`.tmp/modular-audio-m3c-browser.png`. This is sampled output-path evidence,
not direct listening, physical loopback, underrun measurement or a screen-lock
test. The earlier locked-phone crackling remains deferred.

## Next task

Introduce prepared block-capable pitched nodes into the Rust reference DAG,
retaining the exact core/FM render and transition behavior, sample-timed events,
explicit note ownership/cancellation, declared latency and contiguous insert
batching. Compare the six-source fixture against these owned reference paths
before introducing any parallel executor. Then evaluate optional bounded
workers with actual stalls/deadlines, added latency, hosting/capability and
serial fallback. No worker speedup/headroom, physical loopback, generic live
topology migration or screen-lock fix is claimed by this extraction.
All work remains local and uncommitted; no push or deployment is part of M3c.
