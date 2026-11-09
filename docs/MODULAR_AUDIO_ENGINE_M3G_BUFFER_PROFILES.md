# M3g: opt-in buffering profiles and repeated measurement

Implemented after M3f's local commit **`714ce43`**. The standing user instruction
is to commit each completed verified step. No push/deployment.

## Profiles and unchanged default

The same `http://127.0.0.1:4175/tools/modular-worker.html` harness now offers:

| Profile | Block × pool | Added frames | Added ms at 48 kHz | Three-worker PCM pool |
| --- | --- | --- | --- | --- |
| Default | 1024 × 4 | 4096 | 85.33 | 786,432 bytes |
| Medium, experimental | 512 × 4 | 2048 | 42.67 | 393,216 bytes |
| Short, experimental | 256 × 4 | 1024 | 21.33 | 196,608 bytes |

The existing default stays 4096 frames. All modes, including explicit serial
startup fallback, use the selected profile's declared delay. Source groups,
master/key topology, original score/patches, intrinsic DSP latency and workbench
defaults stay unchanged. These are PCM capacities and transport delays, not
process RSS or measured physical output latency. Actual Wasm capacity is also
recorded; reducing PCM blocks does not remove private engine/table ownership.

Profiles expose block size, pool count and render-ahead capacity. Live event
frames must still be at or after the worker's next unrendered frame, and message
dispatch can advance that boundary. The capacity is not a guaranteed MIDI lead
time. Past events remain rejected; owner locality and coherent program/key
silence on misses are unchanged.

`bufferProfiles.js` owns versioned choices and session validation. Save Session
stores the pinned fixture plus explicit profile/rate. Reload starts stopped
with the original default; **Load Saved Session** explicitly restores settings.
The old fixture-only storage key remains readable. Ports, engine state and
runtime buffers are never saved.

## Repeated live measurement

**Measure buffering profiles · 48 kHz** runs the fixed three-worker plan through
the full 17.5 s score. It performs one full warmup per profile, then three
measured repeats per profile. Measured order rotates:

1. Default → medium → short.
2. Medium → short → default.
3. Short → default → medium.

Every profile therefore occupies every order position once. Each run creates
fresh workers, master, graph generation and context. Warmups are retained but
excluded from measured aggregates. Stop cancels the remaining schedule and does
not start another run. Failures, incomplete DSP, fallback and missing frames
remain in reports; actual serial fallback is not counted as a pool result.
The initial selector settings are restored after the batch.

The visible table shows passed/attempted trials, misses, incomplete runs,
missing frames, expired blocks and timing availability. Raw rows retain all
source/master clocks, event counts, source peaks, histogram bins, memory and
generation data. A completed output clock alone is insufficient: delivery
assessment also requires the DSP/source clocks and applied event total to reach
the complete score. Preparation wall time includes context start/suspend,
registration, private graph initialization and all-group priming, not DSP CPU.

Document visibility at start/end and changes during each run are recorded.
Foreground use and an otherwise idle machine are requested, not assumed from
the fact audio was active. Three repeats and one session cannot establish
mobile/background headroom or justify changing production defaults.

## Timing scopes

Existing worker render+copy timing remains separate for each source group.
Histogram bins are logarithmic microsecond buckets; reported p50/p95/p99 values
are **bucket upper bounds**, not precise quantiles. Source worker timers exclude
queue waiting, postMessage/dispatch and the dependent Rust master in the worklet.

`ProcessTiming` optionally observes worklet `process()` wall time when that
scope exposes a working monotonic `performance.now()`. It uses a prepared
32-bin histogram and records calls, total/max wall time and bodies exceeding
one quantum's nominal duration. If the clock is absent/fails, availability is
false and values are **null**, not zero. Timing failure does not break audio.
This observation includes copying, DSP, observation overhead and preemption;
it is not scheduled-callback lateness, CPU utilization or device underruns.
The telemetry itself adds overhead where enabled. JS messaging/GC and existing
nonblocking silence/discard/recovery remain real limitations.

## Cross-cadence PCM contract

Each profile has a strict raw-sample comparison against the original serial
graph at that profile's **same block cadence**. A second original serial graph
at a fixed **1024-frame cadence** provides a separate diagnostic. Both receive
future cancellation at fixed source frame **32768**. Comparisons include all
six raw stereo sources, kick and final master, every sample of the full score
and final partial blocks. Past/lookahead rejection remains tested. DSP is unchanged.

The initial strict raw check found differences only in IEEE-754 f32 subnormal
tails: see [retained raw diagnostic](../reports/modular_audio/m3g-raw-cross-cadence-diagnostic.json).
The [existing denormal helper](../synth-engine/common/denormal.rs) explicitly
flushes recursive DC state at render boundaries; core/FM already call it at
those boundaries. Changing block cadence therefore changes when subnormal state
is zeroed. The retained 48 kHz short-profile diagnostic has maximum raw sample
difference **1.1506732912535485e-38**, first difference at frame **96000**,
while drum/kick values remain exact. The strict raw diagnostic remains failed.

The tail differences also propagate into the dependent mix: a final sample can
be normal-range while its difference is still a subnormal residual. A check
requiring both final values to be subnormal was therefore insufficient. The
failed fixed-cadence report is retained separately, rather than widening an
amplitude tolerance until it passes.

Acceptance requires **exact raw sample values against the same-cadence serial
graph**, without a tolerance. The fixed-cadence diagnostic retains raw maxima,
per-bus maxima, first difference, normal-range/source-normal-range maxima and
counts where both values are zero/subnormal (absolute value below **2^-126**).
No old golden was regenerated and Rust/legacy DSP was not changed to force a
cross-cadence invariant it does not promise. Do not describe smaller profiles
as raw-bit-exact across different render cadences.

## Executable evidence

- [Node profile PCM report](../reports/modular_audio/m3g-profile-pcm.json):
  **nine full-score three-worker profile/rate combinations**, all eight stereo
  buses **exactly equal to same-cadence serial PCM**, nonfinite 0, complete
  partial-block handling, future cancellation and rejection of past/lookahead
  events. A full short-profile single-worker 48 kHz case also passes strictly.
- [Browser profile PCM report](../reports/modular_audio/m3g-browser-profile-pcm.json):
  the same nine full-score combinations pass with **sameCadenceMaxAbs=0**.
  Fixed-cadence default rows also have raw maximum 0. Smaller-profile cross-
  cadence source normal-range maximum is 0 in these cases; only boundary-flush
  tails and their propagated master residuals differ. Largest raw cross-cadence
  difference **1.1506732912535485e-38**, largest propagated normal-valued master
  difference **1.3484751174136288e-39**. Values/counts are retained per case.
- [Failed cross-cadence classification](../reports/modular_audio/m3g-cross-cadence-pcm.json)
  and the initial raw diagnostic remain **pass=false**. Only their descriptive
  scope was clarified after discovering propagation into the master; experiment
  values and pass flags were not changed. Existing legacy goldens/reports remain.
- Full suite **384 files / 2,749 tests passed**, **126.61 s**:
  `.tmp/modular-audio-m3g-suite.log`. Tests cover selected fallback delay,
  versioned session validation, rotated order, failure/incomplete assessment,
  histogram bounds, unavailable clocks, full 48 kHz profile scores, three-rate
  controls and independent medium/short instances. Existing legacy, optional
  SIMD/acoustic/FM-bank and M1–M3f checks remain active.
- Public build passed with curated-bank/exclusion/worker packaging checks,
  about **67 s**; `.tmp/modular-audio-m3g-build.log`. Existing chunk advisory
  remains. Rust/legacy DSP bytes unchanged: graph **296,101 bytes**, Wasm SHA256
  `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
  Optional worklet timing changes runtime version to **`1c3863ec8913dbd8`**.
  Native executable tests remain blocked by Application Control as before;
  no new native runner or security-policy change was attempted.
- [Short-profile fallback](../reports/modular_audio/m3g-short-fallback.json):
  requested pool / actual serial with **1024-frame / 21.33 ms** added delay at
  48 kHz, all six sources active, **840,000 frames / 357 events**, full completion
  and event checks. Worklet clock availability **false**, all duration fields null.
- [Session reload UI evidence](../reports/modular_audio/m3g-session-reload.json):
  legacy fixture-only load works, new short/96 kHz session saves, fresh reload
  remains default/48 kHz and stopped, explicit Load restores short/96 kHz stopped.
  Selectors were then restored to default/48 kHz before repeated measurement.

## Repeated live results

[Complete live report](../reports/modular_audio/m3g-live-profiles-48000.json),
Chrome 157, non-isolated, same pinned fixture/hash and fixed three-worker plan.
Heavy suite/build/audit/PCM work finished before this batch. Every run reports
document visibility **visible** at start/end with **zero visibility changes**.
External system load was not controlled or attributed.

- **3 full warmups + 9 measured full-score runs**, all pass. Every run delivers
  **840,000 frames**, all **357 events**, nonzero main/all-six source analyser
  activity, complete source/master clocks, no Rust late/drop/overflow. Each
  profile has **3/3 measured passes**, **zero transport misses**, **zero expired
  blocks**, **zero incomplete runs**. No fallback substituted for a pool trial.
- Added buffering remains **85.33 / 42.67 / 21.33 ms**. Actual Wasm capacity is
  **11,599,872 / 11,468,800 / 11,468,800 bytes**; transferred PCM capacities are
  **786,432 / 393,216 / 196,608 bytes**, excluding JS/code/browser overhead.
  Private native engine/table ownership dominates the remaining memory.
- Worker render+copy p95 **bucket upper bounds** by group 0/1/2:
  default **4.096 / 8.192 / 4.096 ms**, medium **2.048 / 4.096 / 2.048 ms**,
  short **1.024 / 2.048 / 1.024 ms**. Observed maximum worker block by group:
  default **3.6 / 6.4 / 4.4 ms**, medium **2.1 / 4.2 / 2.0 ms**,
  short **1.2 / 2.5 / 1.7 ms**. These are different-sized source jobs, exclude
  transport/scheduling/master and do not establish speedup or callback margin.
- Median host preparation wall time **121.5 / 131.2 / 123.0 ms**, three samples
  per profile, including context preparation/private initialization/priming.
  Worklet wall clock is **unavailable in every run**; worklet duration/over-
  quantum fields remain null. Device underruns, CPU utilization and physical
  output latency were not measured.

The smallest profile works in these three foreground desktop trials. This does
not establish target-phone/background headroom or justify changing the default.
Selectors return to **default / 48 kHz, stopped**, with the completed table
visible. Screenshot `.tmp/modular-audio-m3g-browser.png`.

## Verification commands

```powershell
npm.cmd run graph:build
npm.cmd run graph:check
npm.cmd run graph:audit-profiles
npm.cmd test -- src/modular-audio/bufferProfiles.test.js src/modular-audio/profileExecution.test.js
npm.cmd run build:public
```

## Next task (delivered by M3h)

See [M3h queue-lead contracts and results](MODULAR_AUDIO_ENGINE_M3H_QUEUE_LEAD.md).
M3g was committed locally as `733c2e6`. The following was its handoff task.

Add bounded **contiguous queue-lead measurements in source frames** at quantum
boundaries for each worker and the coherent minimum. Use clock-independent
low-watermarks/histograms to measure actual buffering margin across the same
profiles; zero observed misses alone does not reveal proximity to starvation.
Keep default buffering conservative until repeated target-device evidence
supports a change. Shared memory requires its
own capability/hosting/fallback decision; distributed owners, repartitioning
and broad desk migration remain separate. Do not infer a worker speedup from
timers with different CPU scopes or investigate locked-phone crackling here.
