# M3f: measured three-worker source execution

Implemented 2026-11-09, after committing M3e locally as **`646183d`**,
`Add bounded Rust graph worker transport and fallback`. User workflow: commit
at the end of every verified step, then continue. No push/deployment.

Historical checkpoint: M3f was committed locally as **`714ce43`** before
[M3g buffering profiles](MODULAR_AUDIO_ENGINE_M3G_BUFFER_PROFILES.md).

## Execution cut

The pinned six-role graph now has an optional **three-worker source pool**:

| Worker | Owned sources |
| --- | --- |
| 0 | lead/core (1), bass/FM (5) |
| 1 | second/FM (2), rhythm/core (3) |
| 2 | pad/core (4), drums/percussion (6) |

Each worker owns its own Wasm instance and prepared source graph. Each source
is rendered once; sources outside a worker's declared group are not prepared
or rendered there. Core's read-only table is prepared independently in each
Wasm instance. No mutable Rust engine, Wasm pointer or memory is shared.

The dependent **Rust master runs in the AudioWorklet**: six stereo host program
inputs, a separate kick host input, the original five binary mixers, original
kick-keyed compressor and output. Its dependency levels are exposed in executor
metadata: host inputs 1–7; mixers 11/12/13; mixer 14; mixer 15; compressor 17;
output 18. Every stage is compiled/validated by the Rust graph that owns it.
The source graphs expose raw taps; a required output is connected to their
first source, and the remaining sources still belong to Rust's compiled order.
The original full serial DAG remains the exact audio/reference authority.

`poolPlan.js` validates this bounded six-source cut and its master/key edges.
It rejects cross-stage source inputs, non-audio dependencies, unsupported master
module kinds and cross-worker event owners. It is not an arbitrary graph
partitioner, dynamic load balancer or topology hot-swap. The fixed grouping is
an explicit prototype choice, not a claim of optimal hardware scheduling.

## Publication and miss policy

Each worker uses the existing bounded transferable protocol: four 1024-frame,
eight-stereo-bus buffers by default. **Three pools total 786,432 PCM bytes**.
Generation/frame/slot publication and recycled-buffer ownership remain separate
for each worker. The worklet directly receives all three ports. Main-thread
code handles controls/telemetry rather than streaming PCM relay.

`AlignedSourcePool` advances all consumers on one source clock. For each source
sample, it requires a matching-frame result from **every group**. If any group
is absent, **all six program inputs and the kick key are zero for that sample**.
It does not mix an old group's block with newer source frames or replay audio
after recovery. Late blocks are discarded/trimmed as in M3e. The master still
advances through silent samples; compressor state releases according to its
existing DSP. Per-group availability/misses and coherent output misses are
reported separately; availability in one group does not imply delivered audio
when another group is missing.

This is a deliberate whole-mix silence policy, not independent source dropout
concealment. A slow worker can stall coherent delivery even when other workers
have capacity. Chronic producer starvation can leave DSP clocks behind the
finite output clock; counters retain that fact rather than fabricating caught-
up state. Runtime errors stop the run. No render callback waits or performs
source catch-up DSP.

Added buffering stays **4096 frames**, not three times that amount:
**92.88 / 85.33 / 42.67 ms** at 44.1/48/96 kHz. Startup primes all groups before
playback. Intrinsic FM and device latency remain additional. The final output
quantum is padded with zeros. Raw taps are copied **before** Rust consumes and
clears host-input storage; dependent master output is copied after render.

## Event ownership, persistence and fallback

The original prepared configurations, transitions and source event lists are
partitioned once at initialization. Each owner is local to one worker group;
source IDs/note ownership and timestamps remain unchanged. Live source events
route to that group, with the existing 64 outstanding request limit and 3 s
timeouts. A new owner reserves a single group (4096 owner bound). Cross-worker
owners and live master control are rejected by this prototype. Past/lookahead
events are rejected by the owning worker; future owner cancellation is checked
against the original serial graph. No partially accepted distributed cancel
transaction is implied. A later distributed event authority must define that
broader contract explicitly.

Reset/reload starts fresh workers, master and generation. The saved pinned
fixture is the same version/hash as M3a–M3e. The pool plan is derived rather
than persisting runtime ports, buffers, typed views or worker state.

Missing capability, invalid partition, a failed worker among partially prepared
resources, initialization or priming failure disposes all partial pool resources
and starts the existing **serial Rust reference before playback**, with the
same 4096-frame delay and an explicit reason/requested/actual executor. This
fallback preserves prepared score playback, not the prototype's worker-only
live control API. Runtime failure is fail-closed; no seamless state transfer or
blocking serial reconstruction happens in the callback.

## Measurement scope

The same existing **4175** worker page adds **Play three-worker mix**, **Verify
pool PCM · all rates**, **Test pool fallback** and **Compare one / three workers
· 48 kHz**. Comparison runs the same finite score, raw sources, audible Rust
mix/compressor and 4096-frame buffering through both execution paths. Stop also
cancels the remaining comparison run. The original single-worker/serial controls
remain, and all desk/workbench defaults remain intact.

The pool additionally pays for three private Wasm graphs/tables, bridge copies,
three required source outputs and seven host inputs. The single-worker path
keeps the master in its worker; pool master DSP is in the worklet. Worker
render+copy task histograms therefore do **not** measure the entire same CPU
scope, worklet callback duration, thread utilization or end-to-end deadline.
The live comparison reports delivery/miss counts and observed audio instead of
equating summed worker time with speedup. These are foreground session samples,
not controlled target-device performance proof. Message/view allocation and
dispatch jitter remain; no shared-memory or hosting header change is made.

## Executable evidence

- Full-score real Node worker tests match **all eight stereo buses exactly**
  against the original serial Rust DAG at 44.1/48/96 kHz, including future
  cancellation and rejection of events inside rendered lookahead. Applied event
  totals across workers/master equal the serial graph. Two independent complete
  pools/generations pass.
- Protocol tests verify coherent silence with a missing group, clock advancement,
  stale discard and matching-frame recovery. Actual generated worklet tests use
  the real Rust master and cover startup delay, nonzero raw/key taps before
  input clearing, final partial output and disposal. Host tests verify the three
  constructors/ports/master levels, owner locality, explicit fallback and a
  worker failure after partial pool construction.
- [Real Node pool report](../reports/modular_audio/m3f-pool-thread.json) and
  [real browser pool PCM report](../reports/modular_audio/m3f-browser-pool-pcm.json):
  full **771,750 / 840,000 / 1,680,000 frames**, **754 / 821 / 1641 blocks**,
  max difference **0**, nonfinite **0** at 44.1/48/96 kHz. The future cancellation
  at source frame 32768 changes event totals to **289 / 289 / 287** respectively;
  pool totals equal the original serial graph in every case. This cancellation
  is earlier in musical time at higher rates; these are not cross-rate hashes.
  Node tests additionally prove two independent whole pools/generations.
- Full suite **382 files / 2,736 tests passed**, **135.67 s**;
  `.tmp/modular-audio-m3f-suite.log`. Final public build passed **43.36 s** with
  worker asset / curated-bank / exclusion checks; `.tmp/modular-audio-m3f-build.log`.
  Existing chunk advisory remains. Graph/runtime provenance and pinned fixture
  remain checked. Existing scalar/SIMD/acoustic/FM-bank/M1/M2/M3d/M3e tests stay
  active. No new native executable was run around Application Control.
- Rust/Wasm DSP bytes remain unchanged from M3d/M3e: **296,101 bytes**,
  SHA256 `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
  Worker/protocol bundle changes set full runtime version **`ebcf61aba7fd0ac7`**.
- [12 Rust allocation audits](../reports/modular_audio/m3f-pool-allocation.json):
  all three source graphs and the seven-input master at three rates, full-score
  processing plus enqueue/cancel/reset/rebook/pause. **Zero Rust allocation /
  reclamation calls and no memory growth after preparation**. The instrumented
  Wasm was rebuilt with the existing allocator feature. JS/worker messaging
  allocation remains outside that scope; no native test runner was used.

## Live browser comparison

Same existing `http://127.0.0.1:4175/tools/modular-worker.html`, Chrome 157,
non-isolated, original pinned fixture SHA256
`77ce180861239426c0c63037235cf98d74a2bbfa09a2a46ee3da3353bb29a7df`.

[48 kHz one / three worker report](../reports/modular_audio/m3f-live-comparison-48000.json):
one complete finite run each after suite/build work finished. Both deliver all
**840,000 frames**, zero transport misses, nonzero main/all-six analyser taps,
same sampled main peak **.05186479538679123**, all **357 source events**, expected
second/FM 14 steals and no reported late/drop/overflow. Both use the same
4096-frame added delay. Single queue and each pool group high-water stay 4.

Observed single-worker render+copy total / max: **4026.9 / 13.9 ms**. Pool source
workers respectively: **878.4 / 4.1**, **2296.9 / 6.5**, **1275.8 / 4.5 ms**.
Pool master DSP runs in the AudioWorklet and is outside these worker timers;
neither the summed totals nor smaller per-worker maxima are a speedup or
callback headroom result. The session has one sample/path, fixed order, warm
caches and uncontrolled external system load. Worklet callback/physical device
timing and CPU utilization are not measured here.

At 48 kHz the three workers reserve **2,883,584 / 2,883,584 / 4,128,768** Wasm
bytes; master **1,703,936**. Total **11,599,872 Wasm bytes + 786,432 PCM bytes**,
excluding JS objects/code/browser overhead. Single path is **5,177,344 Wasm +
262,144 PCM bytes**. Multiple contexts/table ownership and bridge buffers have a
real memory cost. No memory-sharing or worker-count efficiency claim is implied.

[One delayed pool worker](../reports/modular_audio/m3f-live-pool-stall.json),
48 kHz: a **250 ms** scheduling stall in group 0 (lead/bass) at producer frame
7168 yields **830,016 coherent delivered + 9,984 silent = 840,000 source frames**,
**78 miss quanta**, **two recoveries**, **9 expired group-0 blocks**. The other
groups have all 840,000 samples available, but the coherent master deliberately
silences them during missing group-0 spans. Every worker/master finishes at
840,000; source event totals **104 + 162 + 91 = 357**, no reported Rust late/
drop/overflow or stale/malformed publication. This verifies the declared
silence/drop/recovery policy; silence is expected during the injected stall.

Live pool runs at [44.1 kHz](../reports/modular_audio/m3f-live-pool-44100.json)
and [96 kHz](../reports/modular_audio/m3f-live-pool-96000.json) deliver all
**771,750 / 1,680,000 frames** with **zero transport misses** in every group and
coherent output, no expired/stale/malformed blocks, full **357 source events**,
all six role peaks nonzero. Master/source clocks finish together; no reported
Rust late/drop/overflow. These are finite foreground runs on this device/session.

Saved the pinned fixture, reloaded the page and restored it **with audio stopped**.
[Pool serial fallback](../reports/modular_audio/m3f-live-pool-fallback.json) then
plays all six sources / 840,000 frames / 357 events at 48 kHz, exposing requested
pool / actual serial / zero workers and the explicit reason, with the same
4096-frame delay. Tests separately cover partial-worker construction failure.
The page is left **48 kHz, stopped**; `.tmp/modular-audio-m3f-browser.png`.
Observed analyser/device latency metadata is not direct listening, physical
loopback or locked-phone evidence. Earlier M3e overload/failure reports remain
retained; no old reference/tolerance was changed to obtain this stage's results.

Commands:

```powershell
npm.cmd run graph:build
npm.cmd run graph:check
npm.cmd run graph:audit-pool
npm.cmd run graph:audit-pool-alloc
npm.cmd test -- src/modular-audio/poolExecution.test.js src/modular-audio/poolProtocol.test.js src/modular-audio/poolOutput.test.js src/modular-audio/poolBrowser.test.js
npm.cmd run build:public
```

## Next task

Use retained serial/single-worker/pool evidence for repeated opt-in **buffering/
latency profiles** on the same foreground workload and fixed worker plan. Keep
4096-frame buffering as the default while smaller profiles are measured; retain
misses, stale blocks, event-lead constraints and memory costs. Separate worker
task distributions from worklet/device timing, marking unavailable scopes.
Add an explicit
distributed event/owner transaction only when needed beyond the current group-
local contract. Consider a capability-gated shared-memory transport with tested
non-isolated fallback separately from broad graph distribution. Preserve exact
source/master comparisons, key dependency, bounded memory and honest failure
records. Do not migrate the desk, claim mobile/background headroom or chase
locked-phone crackling as part of this checkpoint.
