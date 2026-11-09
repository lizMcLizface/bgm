# M3e: bounded optional worker transport

Implemented 2026-11-09 after the user requested **commit and keep iterating**.
M3d was committed locally as **`fa634f5`**, `Integrate six owned sources into the
Rust audio DAG`. M3e is subsequent working-tree work. No push/deployment.

## Delivered boundary

One dedicated worker exclusively owns the complete prepared six-source Rust
DAG and its Wasm memory. The AudioWorklet consumes published PCM without waiting
for the worker. This is the first bounded executor/transport slice; it does not
split source nodes among a parallel worker pool or migrate the desk effects.
The M3d serial graph and unchanged pinned six-role fixture remain references.

The opt-in page is `http://127.0.0.1:4175/tools/modular-worker.html`, linked from
the original modular harness and the six-role page. It offers worker playback,
the serial reference, explicit startup-fallback testing, a 250 ms scheduling
stall, real worker PCM verification and local fixture save/reload. Playback is
the graph's dry Rust sum/keyed-compressor output, with six raw analyser taps.
It does not reproduce the desk's local/master FX, native mixer or limiter.
All existing workbench routes and fresh-page defaults stay authoritative.

## Transport, ownership and clocks

- Canonical entries: `src/modular-audio/graphWorker.js`,
  `workerOutputProcessor.js`, `workerProtocol.js`, `workerBrowser.js`.
  The graph builder bundles/version-checks worker/worklet assets; both import
  the same versioned canonical Rust graph host runtime. Rust/Wasm DSP is unchanged
  from M3d; no new shared singleton or cross-thread Wasm pointer is introduced.
- A dedicated `MessageChannel` connects worker and worklet directly. The main
  thread handles bounded control/telemetry, not streaming PCM relaying.
  `ArrayBuffer` ownership transfers worker → worklet → worker. No shared Wasm
  memory, atomics, busy waiting or `Atomics.wait()` is used.
- Default **4 × 1024-frame buffers**, eight stereo buses, **262,144 PCM bytes**.
  Allowed blocks 256/512/1024/2048 frames, pool 2–8 buffers. The producer owns
  at most that fixed pool; in-flight slots are tracked and invalid duplicate
  recycles rejected. It renders one bounded block per event-loop task, allowing
  control messages between blocks. No unbounded render/catch-up loop.
- Each block has generation, slot, source frame and valid frame count. The
  consumer validates bounds, exact payload size, non-overlapping publication
  and the final partial block. Old generations, duplicates and malformed blocks
  cannot overwrite current slots. Entirely expired blocks are discarded; a
  partially late block contributes only samples at the current source frame.
- The worklet prepends **4096 silent frames** at defaults, in addition to the
  instruments' original intrinsic latency: **92.88 / 85.33 / 42.67 ms** at
  44.1/48/96 kHz. The serial fallback has the same declared delay. Reported
  `sourceFrame` excludes this delay; `outputFrame` includes it and final quantum
  padding. Device/base/output latency is reported separately, not inferred.
- Startup waits outside playback until the bounded initial pool is primed.
  `process()` never waits, creates a graph, runs a catch-up DSP render, or
  replays the previous block. Missing source spans are zeroed and advance the
  audio clock. Counters distinguish delivered/underrun frames, miss quanta,
  expired blocks, malformed/stale publications and recovery. They are transport
  starvation counters, **not device underrun measurements**.
- This message transport still creates JS messages/typed views and uses
  asynchronous dispatch, including recycling from the worklet. A fixed PCM pool
  is not a claim that the JS/audio thread is allocation-free or jitter-free.
  Rust allocator evidence from M3d remains scoped to Rust DSP only.

## Events, lifecycle and fallback

The immutable prepared instrument configuration and full timestamped score
transfer at initialization. The worker is the sole live event authority and
uses the existing Rust graph event validation/ownership/cancellation. Control
requests carry generation and bounded replies. At most **64 control requests**
can be outstanding, with 3 s timeouts; concurrent duplicate stats requests are
rejected. An event earlier than the next unrendered source frame is rejected,
rather than modifying already-published PCM. Future cancellation is checked
against the serial graph. Effective live
control lead therefore includes render lookahead and message dispatch; these
controls are not advertised as immediate low-latency MIDI.

Reset/reload starts a fresh graph, worker and generation; no concurrent reuse
of owned Rust state. Dispose closes ports and releases/terminates the dedicated
worker off the audio callback. Node-thread tests use an adapter around the
unchanged browser worker entry and real structured cloning/transfers.

Worker/MessageChannel absence, construction/clone/initialization failure or
priming timeout falls back **before playback** to the serial Rust worklet,
exposing requested/actual executor and reason. A runtime worker/processor error
fails the run closed and stops playback. There is no concealed synchronous
state reconstruction in `process()` or seamless runtime handover; the user can
start a fresh serial run. A scheduling stall follows the declared silence/drop/
recovery policy and does not rewind note or source clocks.

This transport requires ordinary same-origin module workers, MessageChannel and
AudioWorklet in the browser's permitted context. It deliberately works without
cross-origin isolation; it does not add hosting headers or enable shared memory.
A later shared-memory/pool executor still needs its own capability/hosting and
real-time publication design. Relevant primary platform references:
[HTML transferable messaging](https://html.spec.whatwg.org/multipage/web-messaging.html),
[HTML workers](https://html.spec.whatwg.org/dev/workers.html), and
[Chrome's worker/audio design discussion](https://developer.chrome.com/blog/audio-worklet-design-pattern).
The latter explicitly describes messaging/allocation/latency limitations; this
prototype makes no throughput improvement claim from moving DSP to a worker.

## Evidence

- [Real Node worker-thread report](../reports/modular_audio/m3e-worker-thread.json):
  three full 17.5 s scores at 44.1/48/96 kHz, **all eight stereo buses exact**
  against serial Rust, including future owner cancellation. Past events are
  rejected, no nonfinite samples or invalid recycles; final blocks are partial.
  Two independent workers/generations also match independent serial graphs.
  Consumer-paced verification does not measure audio callback deadlines.
- Protocol tests cover irregular consumption, all buses, exact startup delay,
  final output clipping, missed-frame silence, expired-block discard, partial
  recovery, stale generations, duplicates, malformed blocks, bounds/disposal.
  Host tests cover explicit serial, forced fallback, missing Worker and worker
  construction failure with the same declared delay and visible reason.
- Full suite **378 files / 2,725 tests passed**, **130.04 s**:
  `.tmp/modular-audio-m3e-suite.log`. Final host/protocol focused rerun **11 tests
  passed** after the UI status/transport metadata refinement:
  `.tmp/modular-audio-m3e-focused.log`. Existing legacy, SIMD/acoustic/FM-bank,
  M1/M2 and M3d compatibility tests remain active.
- Graph Wasm remains **296,101 bytes**, SHA256
  **`a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`**,
  byte-identical to M3d. Worker assets change the full runtime manifest version
  to **`e2a03ea6b3d766e4`**. No new Rust or legacy DSP code changed in M3e;
  native executable tests remain blocked by Application Control as before.
- Final public build passed **44.72 s**, including curated-bank/exclusion and
  new worker-page/asset packaging checks; `.tmp/modular-audio-m3e-build.log`.
  Existing chunk advisory remains. `graph:check` verifies generated bundles,
  versioned runtime imports and Rust/Wasm provenance.

## Actual browser evidence

Chrome 157 on the existing **4175** preview, **crossOriginIsolated=false**,
unchanged fixture SHA256
`77ce180861239426c0c63037235cf98d74a2bbfa09a2a46ee3da3353bb29a7df`.

- [Real browser worker PCM](../reports/modular_audio/m3e-browser-worker-pcm.json):
  all **eight stereo buses exact**, nonfinite count zero, at 44.1/48/96 kHz for
  the complete 17.5 s score including future cancellation and past-event
  rejection. **754 / 821 / 1641** blocks, all final partial blocks included.
  Worker Wasm capacity **5,177,344 / 5,177,344 / 5,570,560 bytes**, plus one
  262,144-byte transferred PCM pool. Consumer-paced, not a deadline test.
- Live [44.1 kHz](../reports/modular_audio/m3e-live-worker-44100.json) and
  [48 kHz](../reports/modular_audio/m3e-live-worker-48000.json) worker playback:
  finite nonzero main/all-six source activity, **zero transport underruns**,
  no expired/stale/malformed blocks, queue high-water 4. Worker and output
  source clocks reach **771,750 / 840,000 frames**, all **357 events** applied,
  expected second/FM 14 steals and no reported graph late/drop/overflow.
  Some full-suite/build background load overlapped these runs; this does not
  establish a controlled stress tolerance. Worker render+copy max was
  **39.5 / 29.8 ms**, illustrating that a bounded reserve can cover occasional
  blocks longer than one block's audio period. These are worker task times,
  not AudioWorklet callback timings or per-process CPU attribution.
- [Injected 250 ms scheduling stall](../reports/modular_audio/m3e-live-stall.json),
  48 kHz: **10,752 missing source frames / 84 miss quanta**, **10 expired blocks**,
  **one recovery**. Delivered **829,248** plus silent **10,752** equals exactly
  **840,000 source frames**. Worker catches up to the full score with **357**
  events and no Rust late/overflow, stale-generation or malformed publication.
  The run passes its explicit stall/recovery policy; it does not claim dropout-
  free audio during a producer stall. Silence and clock advancement prevent
  stale notes/audio from being replayed after recovery.
- [Explicit serial startup fallback](../reports/modular_audio/m3e-live-fallback.json),
  48 kHz: requested worker / actual serial, visible reason, same **4096-frame**
  delay, nonzero main/all-six activity, source **840,000 frames / 357 events**,
  no reported graph late/drop/overflow. A genuine worker-construction failure
  and Worker absence are separately covered by host tests. No runtime state
  transfer or seamless recovery is claimed by this test.
- **Retained failed overload run**:
  [96 kHz during concurrent full suite/build](../reports/modular_audio/m3e-live-worker-96000-stress.json).
  Worker fell behind: **1,619,456 silent frames**, **60,544 delivered frames**,
  **12,652 miss quanta**, **792 expired blocks**, six recoveries. Output source
  clock reaches 1,680,000 but worker DSP is only at **875,520 frames / 326 events**
  when finite playback ends. Max worker block **44.3 ms** against a 10.67 ms
  nominal block period. This is **pass=false** evidence, retained without
  increasing the pool or relaxing pass criteria to conceal starvation. The
  overload was uncontrolled; no precise CPU/root-cause attribution follows.
- [96 kHz repeat after the checks finished](../reports/modular_audio/m3e-live-worker-96000.json):
  **pass=true**, all **1,680,000 frames delivered**, **zero** transport misses,
  expired/stale/malformed blocks; **1641 blocks**, pool high-water 4, full
  **357 events** applied, all six source peaks nonzero, max worker block **11.5 ms**.
  The fixed pool/criteria are unchanged. This foreground run establishes
  working output for this device/session; it does not erase the overload run
  or establish mobile/background/locked-screen headroom.

Fixture save, page reload and restore were verified with audio stopped. New
playback creates a fresh generation/graph. Base/output latency reported by this
browser is 10/40 ms at 48 kHz; declared transport buffering is additional.
Final fallback check uses the final host bundle and identifies actual serial /
no PCM transport. Preview is left **48 kHz, stopped**; screenshot
`.tmp/modular-audio-m3e-browser.png`.

The UI reports missing transport frames explicitly. These measurements do not
count device underruns, physical loopback latency, or locked-phone behavior.
Message dispatch and JS allocation remain real limitations of this prototype.

Commands:

```powershell
npm.cmd run graph:build
npm.cmd run graph:check
npm.cmd run graph:audit-worker
npm.cmd test -- src/modular-audio/workerProtocol.test.js src/modular-audio/workerExecution.test.js src/modular-audio/workerBrowser.test.js
npm.cmd run build:public
```

## Next task

Use this correctness/transport baseline to specify a bounded optional **multi-
worker** source executor. Keep the compiled dependency levels and master/key
dependencies explicit, determine per-worker memory/table ownership and event
fan-out, publish complete frame/generation results, and test nonblocking
consumption, stalls and serial fallback at the chosen added latency. Measure
actual deadline/stall distributions on foreground target devices and compare
equivalent processing jobs. Shared-memory capability/hosting remains a separate
decision. No broad DSP migration, locked-phone investigation or speedup claim
is bundled into M3e.
