# M3i: opt-in worker message-task experiment

Delivered locally after M3h (`c8ff2bb`). The worker harness now offers **Worker
scheduling: Timers · existing default / Message tasks · experiment**. Timers
remain the default. The message-task experiment **did not remove Short / 96 kHz
transport misses** and one measured Default trial also missed a quantum; no
performance or audible-quality improvement is established. The user's listening
report and all failed experiment reports remain intact. Desk/legacy DSP and
fresh Default / 48 kHz buffering remain unchanged.

## Final contract

- `workerOptions.scheduling` accepts `timer` (default) or `message`; other values
  are rejected. Only the explicit message option creates a private task channel.
  The original timer pump is retained for default complete-graph and pool workers.
- Message scheduling has at most **one pending task or explicit stall timer**.
  One task invokes the existing pump once and renders **at most one block**
  before yielding. Full PCM pools/end of score schedule nothing. Requests
  coalesce; there is no spin, microtask chain, blocking wait, catch-up render
  loop or additional PCM capacity. Controls have an opportunity between blocks;
  browser priority, deadlines and background execution are not guaranteed.
- Positive timers remain for explicit stalls; the deadline is checked before
  rendering. Native timer calls use arrow wrappers to preserve their normal
  receiver. Disposal/failure cancels waiting timers and closes both private
  ports; already posted work cannot render after disposal. Scheduler snapshots
  report kind and pending state, plus message task/stall timer counts. These
  are not CPU measurements. The private channel adds JS/browser overhead.
- Owned Rust state, groups `[[1,5],[2,3],[4,6]]`, PCM bounds, coherent program/key
  silence, time advancement, stale-data rejection, event-owner bounds and serial
  fallback remain unchanged. Serial fallback reports no worker scheduling.
- The selector is disabled while running/verifying a batch. Reports identify
  requested/actual scheduling; summaries exclude wrong-mode pool results.
  Save/reload includes scheduling. Old version-1 sessions without the field
  restore timers. Fresh pages use timers; explicit Load remains stopped.
  No shared-memory, isolation or hosting requirement is added.

## Why test another pump?

The existing pump schedules another zero-delay timer from a timer callback when
free PCM buffers remain. The [HTML timer contract](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timer-initialisation-steps)
raises sufficiently nested timer delays to at least 4 ms; Short / 96 kHz has a
256-frame producer period of 2.67 ms. Removing that dependency was a testable
scheduling hypothesis. The negative live result below means it is **not an
established explanation or fix** for the observed starvation or device crackle.
The experiment is therefore available explicitly instead of replacing defaults.

## Retained candidate evidence

All JSON under `reports/modular_audio/` retains original values/pass flags and
runtime provenance. These were same-session non-isolated Chrome 157 desktop
trials on port 4175, document-visible throughout, after build/test work finished.
External system load was uncontrolled; there is no physical output capture.

- Initial candidate **`7e61362bc8730c4d`**: initial single/pool Short / 96 kHz
  failures retained under `m3i-initial-*.json`. The explicit stall exposed an
  **Illegal invocation** from calling a native timer as a class method;
  `m3i-initial-stall-failure.json` retains that failed attempt. Arrow wrappers
  corrected the receiver; regression coverage and actual recovery follow.
- Corrected candidate **`a3994fb2118b6908`**, before adding the opt-in selector:
  `m3i-medium-96000-stall.json` completes **1,680,000 frames / 357 events**,
  with six/main analyser peaks. The explicit group-0 250 ms stall produces
  **23,296** coherent silent frames and **one** recovery, then complete delivery.
  Only group 0 reports a stall timer (**one**). Each group finishes **3,282**
  blocks/tasks, no pending task/timer, zero bad recycles and no executor error.
  This is expected silence/recovery, not gap-free delivery.
- `m3i-single-short-96000.json`: corrected candidate, complete clocks/events,
  **56,320** missing frames, minimum lead 0, **`pass:false`**. **6,563** blocks
  and message tasks, no timer. The first pool candidate also misses **56,064**
  frames. Removing timers alone does not remove the delivery problem.
- `m3i-live-profiles-96000.json`: corrected candidate, **3 warmups + 9 measured
  full scores** with the same profile order as M3h. All score clocks/events
  complete, all six/main analyser activity, worklet clock unavailable.

  | Measured 96 kHz profile | M3h timer passes | Message-task passes | Message-task missing frames | Exact minimum ready frames |
  | --- | --- | --- | --- | --- |
  | Default | 3/3 | 2/3 | 128 | 0 |
  | Medium | 3/3 | 3/3 | 0 | 768 |
  | Short | 0/3 | 0/3 | 168,192 | 0 |

  Each Short measured repeat misses **56,064 frames / 438 quanta**, exactly the
  earlier measured count; its warmup also fails. The Default miss is retained,
  not discarded as an outlier. This observational batch cannot establish a
  regression cause, callback margin, speedup or audible quality. Aggregate
  `pass:false` remains intact. The selector was added after this negative result.
- `m3i-invariant-comparison.json` passes accounting checks for all **14**
  corrected-candidate live rows, preserving the distinct delivery failures:
  histograms, active/drain quantum counts, shortages equal actual underrun
  quanta, complete frames/events and scheduler counts/bounds. Before/after
  totals are retained. Screenshot `.tmp/modular-audio-m3i-candidate-browser.png`.
- Candidate modular suite **18 files / 105 tests**, **40.84 s**, and candidate
  public build passed after the timer correction. M3h's preceding full suite
  remains **385 files / 2,755 tests** passing; it is not relabeled as a later run.

## Limits and next task

Measure source-frame consumption **between packet-arrival callbacks**, per
queue/coherently, using bounded counters and a small diagnostic event trace.
This can reveal required ready capacity when several quanta are consumed before
more messages are received. It cannot alone attribute gaps to worker CPU,
browser delivery or device scheduling. Compare explicit extra headroom against
Short / 96 kHz while preserving its original profile and stating latency.

Correlate target-device listening with exported rate/profile/executor/scheduling
and optional output-route context. Keep short buffering and message scheduling
experimental. Physical output, locked-phone/background scheduling, resampling
and Bluetooth remain unmeasured. Shared memory, distributed owners and broad
workbench migration remain separate. No default switch, push or deployment.

## Final opt-in delivery verification

- **18 files / 116 tests pass**, **98.65 s**:
  `.tmp/modular-audio-m3i-optin-modular-tests.log`. Both timer and message modes
  run real full-score single/pool workers at 44.1, 48 and 96 kHz, exact PCM,
  future controls and independent generations. Shorter profiles also run with
  explicit message mode. Five scheduler tests include default/enum validation;
  session tests cover old defaults, explicit mode roundtrip and wrong-mode
  summary exclusion. No new whole-repository run is implied.
- `npm.cmd run build:public` passes, Vite **39.86 s**, existing chunk advisory;
  `.tmp/modular-audio-m3i-optin-public-build.log`. Final runtime
  **`44de39f7ca5b0904`**, same **296,101-byte** graph and Rust SHA256 above.
  Native Application Control restriction unchanged; no native bypass attempted.
- `m3i-optin-session-reload.json`: visible UI old-session load retains timers;
  explicit Short / 96 kHz / message save; fresh page returns Default / 48 kHz /
  timers; explicit Load restores the experimental settings with audio stopped.
  The scheduling selector is visibly disabled during playback.
- `m3i-optin-medium-96000-stall.json`: final runtime requested/actual **message**,
  full **1,680,000 frames / 357 events**, six/main analyser peaks; injected
  250 ms group-0 stall gives **25,088** coherent silent frames and **one**
  recovery, then completion. One stall timer only in group 0, **3,282** tasks /
  blocks per group, zero bad recycles and no pending work/timer or executor
  error. This verifies the corrected native-timer path, not gap-free delivery.
- `m3i-default-timer-48000.json`: final runtime requested/actual **timer**, full
  **840,000 frames / 357 events**, six/main analyser peaks, **zero** missed
  frames, minimum steady lead **2,816 frames / 58.67 ms**, all three scheduler
  snapshots `kind:timer`, no pending timers. UI and saved session finally left
  **Default / 48 kHz / timers, stopped**.
- `m3i-optin-final-invariants.json`: both final live reports pass independent
  histogram, active/drain, shortage/underrun, event/frame and actual-mode checks.
  Physical output remains unmeasured. Screenshot `.tmp/modular-audio-m3i-browser.png`.

Commands: `npm.cmd run graph:build`, `npm.cmd run build:public`,
`npm.cmd test -- src/modular-audio --maxWorkers=4 --minWorkers=1`.
