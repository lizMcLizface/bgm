# M3h: contiguous ready queue lead

Delivered locally on 2026-11-09, following M3g. The opt-in worker harness now
records clock-independent queue lead for the complete-graph worker and each of
the three source workers, plus the coherent minimum consumed by the Rust master.
Existing graph ownership, PCM consumption, buffering defaults, source groups,
key/program alignment, serial fallback and legacy DSP remain unchanged.

The user's latest listening report is retained verbatim in
[`m3h-user-listening-feedback.json`](../reports/modular_audio/m3h-user-listening-feedback.json):
**Short / 96 kHz crackles; the other tested combinations work well.** The current
device, executor, output route and cause were not supplied. Do not infer them
from earlier phone/Bluetooth reports. Selecting Short / 96 kHz shows this
feedback in the harness; no automated transport result overrides it or claims
the crackle is fixed. Default remains 4,096 frames / 48 kHz on a fresh page.

## Measurement contract

- Sample immediately before each active source-consumption quantum. Startup
  buffering and the padded portion of the last quantum are excluded.
- Count only consecutive ready source frames from the current source frame.
  Packets beyond a gap contribute no lead. Partially consumed packets count
  only their remaining frames. Inspect existing slots without sorting,
  recycling, changing clocks or allocating during observation. Each queue has
  at most eight slots, so inspection uses at most 8 × 8 comparisons. The pool
  records each queue and their minimum before the coherent fill.
- Keep **steady** observations where remaining source frames are at least the
  configured capacity separate from the final **drain** window below capacity.
  Otherwise a successful finite score would always appear to approach zero
  buffering at its planned end. A short score can have only drain observations.
- Each window reports exact minimum/maximum, sample count, zero-lead quanta,
  lead below the actual needed quantum, lead below one producer block, first
  zero source frame, needed-frame bounds and a fixed histogram. Bins represent
  `[128k, min(capacity, 128(k+1)-1)]` frames, at most 129 bins. No clock is needed.
- Aggregation uses steady samples for exact minima and p05 **frame ranges**;
  convert frames to milliseconds at the actual rate. Drain samples and drain
  shortages remain separately available. Matching capacities are required.
  Missing/unobserved data has null minima/percentiles, never a fabricated zero.
  Consumer-paced PCM verifiers do not produce audio-quantum lead observations.
- For actual output-worklet runs, steady + drain `belowQuantumQuanta` must
  match existing underrun-quanta counters, both per group and coherently.
  Future packets after a gap cannot hide a shortage. Recovery still advances
  source time and trims/discards late PCM without replaying stale programs/key.

The profile batch now uses the **selected rate**, rather than forcing 48 kHz.
It retains one warmup/profile and three rotated measured repeats/profile.
Wrong-rate results and serial fallback are excluded from pool pass/timing/lead
evidence. The UI calls these delivery passes and states that no audible-quality
verdict follows. Raw reports retain per-run and per-group histograms.

## Verification and retained evidence

- Focused checks: 4 files / 20 tests pass, including read-only inspection,
  gaps with future packets, coherent silence/current-frame recovery, histogram
  accounting, drain-only short scores, unavailable observations, actual worker
  and Rust-master worklets, selected-rate filtering and feedback scope.
- Full suite: **385 files / 2,755 tests pass**, **308.91 s**, with
  `npm.cmd test -- --maxWorkers=4 --minWorkers=1`;
  `.tmp/modular-audio-m3h-suite-retry.log`. The initial default-concurrency run
  ended with an unexpected test-worker exit, retained in
  `.tmp/modular-audio-m3h-full-tests.log`; no cause is assigned. The retry ran
  after the public build, separately from live delivery measurements.
- `npm.cmd run build:public` passes, including current legacy/graph/fixture
  checks, all synth pages and public-package/bank/exclusion checks. Existing
  chunk-size advisory remains. Graph **296,101 bytes**, SHA256
  `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`,
  runtime **`8c06ec0578a84abf`**. Rust, legacy DSP and the pinned fixture are
  unchanged. The native test-runner Application Control restriction remains;
  no bypass attempted. Existing Node/Wasm tests still cover three-rate exact
  stems, full worker PCM/control and independent generations/state.
- [`m3h-session-reload.json`](../reports/modular_audio/m3h-session-reload.json):
  UI save of Short / 96 kHz; fresh Default / 48 kHz; explicit stopped restore,
  including visible feedback note. No automatic restore or playback.
- [`m3h-short-48000.json`](../reports/modular_audio/m3h-short-48000.json):
  full **840,000 frames / 357 events**, nonzero main and all-six source
  analyser peaks, zero misses. **6,563** active observations: **6,555** steady
  with minimum **512 frames / 10.67 ms**, and **8** drain observations with
  minimum **64 frames**. No steady lead below one producer block.
- [`m3h-short-96000-stall.json`](../reports/modular_audio/m3h-short-96000-stall.json)
  retains a **failed** run: **1,313,536** coherent missed frames, **99**
  recoveries, complete output/master clock but group 0 only **1,028,608 /
  1,680,000** rendered frames; all **357** events still applied. First zero
  lead at source frame **1,792**, before the injected group-0 stall at worker
  frame **379,136**. This is **not an isolated stall-recovery proof**; ordinary
  starvation predates the injection. Visibility stayed visible. Keep the
  failure; do not infer a phone/Bluetooth cause or relabel this a pass.
- [`m3h-live-profiles-96000.json`](../reports/modular_audio/m3h-live-profiles-96000.json):
  **3 warmups + 9 measured runs**, non-isolated Chrome 157 desktop preview on
  port 4175; all document-visible throughout, external system load uncontrolled.
  Default and Medium each pass **3/3** measured runs, zero missing/expired
  frames/blocks. Short passes **0/3**, each with **56,064 missed frames / 438
  missed quanta / 437 recoveries**, **168,192** measured missing frames total;
  its warmup also fails with **56,576** missing frames. All batch runs finish
  **1,680,000 frames / 357 events** and show all six/main analyser activity.
  Aggregate/failed rows remain `pass:false`; expired blocks are zero, so their
  absence alone does not certify complete delivery.

  | 96 kHz profile | Exact steady minimum | p05 frame range | Steady lead below one producer block |
  | --- | --- | --- | --- |
  | Default | 2,304 frames / 24 ms | 2,560–2,687 | 0 |
  | Medium | 768 frames / 8 ms | 896–1,023 | 0 |
  | Short | 0 frames | 128–255 | 5,244 quanta |

  Each run has **13,125** active observations, with planned drain counts
  **31 / 15 / 7** respectively. Worklet clock unavailable in every row;
  duration/over-quantum fields null. No physical audio capture or audible verdict.
- [`m3h-lead-invariant-check.json`](../reports/modular_audio/m3h-lead-invariant-check.json)
  validates all **14** live rows, including failures: histogram/sample counts,
  exact active/drain quantum counts, and per-group/coherent shortage predictions
  equal actual underrun-quanta counters. This audit passes while preserving
  the distinct delivery failures. Screenshot `.tmp/modular-audio-m3h-browser.png`.

## Limits and next task

Ready lead measures PCM already published to the worklet. It excludes work in
flight, future worker scheduling, device/OS queues, resampling and physical
headphone output. Sampling adds bounded JavaScript work; the unavailable worklet
wall clock cannot establish its CPU cost or callback margin. Worker task timers
still exclude scheduling, transport and dependent master processing. Foreground
desktop results cannot certify target-phone or locked/background playback.

Keep smaller profiles experimental and preserve the listening report. The next
step is a bounded scheduling experiment: replace recursively scheduled zero-delay
worker timers with one pending MessageChannel task and at most one render block
per task; retain real timers only for the explicit injected stall. The current
pump calls setTimeout again from its timer callback. The [HTML timer contract](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timer-initialisation-steps)
clamps sufficiently nested timers to at least 4 ms, whereas a 256-frame block
at 96 kHz lasts 2.67 ms. This is a concrete scheduling risk and a testable
hypothesis for the observed delivery starvation, not an attribution of the
user's device crackle. Compare unchanged PCM, bounded work/control fairness,
96 kHz delivery and stall recovery before accepting the change. Do not change
buffering defaults or introduce automatic switching. Shared-memory hosting,
distributed owner transactions, arbitrary repartitioning and broad desk
migration remain separate work.
