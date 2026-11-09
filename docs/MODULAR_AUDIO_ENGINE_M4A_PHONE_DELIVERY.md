# M4a correlated phone delivery failure

2026-11-09, after phone usability commit `fe52433`. The user successfully posts
the compact report for run **`e0382044-e0e8-4aec-8538-7ce9c084f14b`**, started
at `2026-11-09T22:32:35.883Z`. Preserve the exact supplied payload in
`reports/modular_audio/m4a-phone-worker-delivery-gap.json`. This is new run-bound
evidence; do not retroactively attach it to the earlier listening report.

## What the report establishes

- Actual worker, no fallback, Bass, Message tasks, 512-frame producer blocks,
  six slots / 3,072 frames / 64 ms, stop-on-underrun enabled. Host
  `all-preview-delivery-v1`, runtime `2dd834c6b07330cb` identify the tested code.
- The supplied user-agent identifies mobile Chrome 156 on Android. It is a
  reported UA string, not a verified device model or precise OS version.
  Output route, foreground/lock state, thermal/load state and listening verdict
  for this exact run remain unspecified. The adapter requires 48 kHz, but the
  compact v1 report does not independently carry an observed sample-rate field.
- The first zero lead occurs at source frame **4,608**. All **nine accepted
  512-frame blocks** cover exactly these 4,608 frames; the next **128 frames**
  are missing. Source clock advances to **4,736**, output clock to **7,808**.
  Output minus source equals the declared 3,072-frame initial delay. Using the
  adapter-required 48 kHz rate: first missing source time is **96 ms**, missing
  duration **2.67 ms**, and stopped output clock **162.67 ms**. These are audio
  frame-clock conversions, not measured elapsed wall time.
- The guard stops after **one missing quantum**, zero recoveries, incomplete
  score, `pass:false`. No serial replacement occurs. No rejected/stale/late
  packet, bad recycle, late event or event overflow is recorded. A zero late
  packet count does not mean the absent packet met its deadline: it had not
  been accepted at all when output stopped.
- Maximum recorded arrival gap is **1,792 source frames**; maximum consumption
  since an arrival is **2,944 frames**, close to 3,072-frame capacity. The latter
  includes the open span without a subsequent arrival. `overCapacityQuanta:0`
  does not imply sufficient ready PCM: it measures span versus nominal full
  capacity, while queue lead depends on the actual packets available.

## Cross-thread audit and limits

`WorkerOutput` stops its source clock and ignores later block arrivals after
the first miss. `createWorkbenchPreview.finish()` then fades for 30 ms and
requests independent worker/output statistics before disposing the route.
The graph worker can render during that interval as recycled slots return.
Its **15 blocks / 7,680 rendered frames** therefore need not have existed at
the missing quantum. Do not subtract nine accepted from 15 rendered and call
the difference six packets already waiting at the failure.

Worker render/copy wall time totals **7.20 ms**, maximum **1.30 ms/block**,
versus a 512-frame / 48 kHz period of **10.67 ms**. This does not establish CPU
headroom at the deadline: the metric excludes task waiting, recycle/message
delivery, output worklet copying, existing FX and device output, and the
snapshot is later than the consumer failure. Message tasks yield one render
block per posted task; a depleted pool waits for direct worklet-to-worker
recycles. Main-thread host work is not a relay for normal PCM packets.

The new evidence establishes **PCM transport starvation for this run**, not
whether worker task scheduling, recycle delivery, PCM delivery, render/audio
callback bursts or device contention caused it. It neither proves a Bluetooth
cause nor guarantees a larger buffer would fix the problem. Earlier phone
serial success and desktop worker success remain user observations. This exact
compact report retains `listening:"not assessed"`.

## Verification and next task

Read the actual queue/worker/worklet/host lifecycle and independently check the
supplied report's block/frame/delay/failure accounting. No runtime/default,
buffering, DSP, layout or public build change is made by this evidence step.
Accounting checks pass via `node .tmp/check-phone-delivery.mjs`; their scoped
results are retained in `reports/modular_audio/m4a-phone-delivery-accounting.json`.
That accounting pass does not alter the original run's `pass:false`.
The previously checked public build remains served by the existing HTTPS LAN
preview. No replay of the bad audio, deployment, firewall/trust change or native
Application Control bypass is needed.

**Next bounded implementation:** add producer task-wait/recycle-wait observations
and the last accepted packet's producer snapshot to failure diagnostics, with
explicit sample scope. This must distinguish the failure-time consumer state
from later worker statistics, remain bounded and preserve PCM/control behavior.
Only then use a deliberately selected experiment to compare delivery under the
same captured source/rate/cadence. Do not silently change the working serial
choice, promote worker, retune default buffering or migrate more roles.
