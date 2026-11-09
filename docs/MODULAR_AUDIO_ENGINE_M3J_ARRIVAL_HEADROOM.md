# M3j: packet-arrival gaps and explicit PCM headroom

This step follows M3i (`b358bd9`). The opt-in worker harness now measures source
frames advanced between valid PCM-publication callbacks, alongside the existing
per-worker/coherent ready-lead measurements. A separate headroom control tests
larger PCM pools at the same producer cadence. Existing profiles, timer default,
fresh Default / 48 kHz, private owned Rust engines and legacy desk DSP remain.

## Measurement contract

- Each worker queue records valid publication callbacks, including expired
  packets. Malformed/duplicate/stale-generation rejections are excluded. Existing
  accept/drop/recycle/consume behavior remains unchanged. Per-queue publication
  count equals accepted blocks plus expired blocks; the pool's any-group count
  equals the sum of its queues. Expired traffic is identified separately.
- Before the first active quantum, arrivals only prime the baseline. No startup
  frames advance the source clock. Consumer-paced PCM verifiers do not create
  active-quantum observations or measured gaps.
- After active observation begins, a callback closes the source-frame distance
  since the previous valid callback. Same-source-frame callbacks are counted
  separately from positive gaps. At each active quantum entry, also measure the
  source span through that quantum's end since the latest callback; this retains
  an open gap even if no further callback arrives before score completion.
- Per-queue values identify a particular worker. Pool values use **any** group's
  callback and do **not** imply all groups are ready. Existing coherent minimum
  lead and all-program/kick silence remain the readiness contract.
- Steady/drain windows use remaining source frames >=/< configured capacity at
  the observation/callback. Gap windows classify at the closing callback, even
  if the span crosses a boundary. Exact maxima and totals remain available.
  Positive-gap histograms use 129 fixed bins of 128 frames; the last is overflow
  **>=16,384 frames**, with exact maxima retained. Absent observations are null.
- A prepared Float64 trace retains the **first 32** increasing gap maxima and
  insufficient-lead episode starts. Extra records increment a dropped counter.
  Events carry source/packet/span frames and group/lead where applicable.
  All hot-path storage is prepared; no sort, clock, packet copy or trace-object
  allocation is added during observation. Snapshot serialization can allocate.
  Per recorder: 2 × 129 Uint32 bins plus 32 × 7 Float64 trace values = **2,824
  typed-array bytes**, excluding objects. Four pool recorders total **11,296**.

These are **source-frame distances, not elapsed wall time or CPU attribution**.
Converted milliseconds mean audio duration at the actual sample rate. Delayed
workers, browser message delivery and burst consumption can all affect them.
Expired callbacks need not add ready audio. A measured maximum does not establish
a universally safe capacity or a cause of physical phone/headphone crackles.
The unavailable worklet clock still cannot measure this instrumentation's cost.

## Headroom contract

`extraBlocks` is explicitly **0 / 2 / 4**, adding that many fixed PCM slots to
each worker's original four. Producer block size and source groups are unchanged.
Startup delay increases by the same number of frames as capacity; no hidden
latency reduction or automatic tuning. Bounds remain at most eight slots.

For Short / 96 kHz, the choices are **4 / 6 / 8 × 256 frames**, capacity/delay
**1,024 / 1,536 / 2,048 frames**, **10.67 / 16 / 21.33 ms**, pool PCM
**192 / 288 / 384 KiB**. Other profiles report their own exact delay/memory.
Old sessions default to zero extra blocks; explicit save/load validates and
restores the choice with audio stopped. Fresh pages use original capacity.

The new headroom batch fixes selected profile/rate/scheduling and runs one full
warmup per capacity followed by three rotated measured repeats per capacity.
Failures remain; wrong executor/rate/mode/capacity is excluded from pass/lead
evidence. Profile comparisons also keep headroom capacities separate. The UI
shows exact latency, ready minima and maximum per-group source span; none is an
audible-quality verdict. No new shared-memory or hosting requirement.

## Verification and measured results

- **21 files / 128 modular tests pass**, **176.48 s**:
  `.tmp/modular-audio-m3j-modular-tests.log`. Includes both scheduling modes'
  original three-rate worker/pool PCM/control and independent instances, the
  existing 27 percussion goldens, real sidechain and actual worklets. New
  timer-scheduled six/eight-slot tests retain strict raw **same-cadence maximum error 0** at
  44.1, 48 and 96 kHz, full 17.5-second scores at 96 kHz, future controls and
  independent capacities/generations. Old cross-cadence diagnostic limits stay.
  No new whole-repository run is implied; M3h's full run remains historical.
- Unit checks cover startup/unobserved/null data, partial/open spans, drain,
  malformed/stale/duplicate exclusion, expired publication accounting,
  any-group versus a missing worker, 129-bin overflow, 32-record truncation,
  headroom bounds/latency/memory, rotated order, old/explicit session load and
  wrong-capacity/rate/mode exclusion. Full public build/provenance/package checks
  pass, Vite **33.63 s**, existing chunk advisory. Runtime **`5e3eede4bd16e076`**;
  graph still **296,101 bytes**, SHA256
  `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`;
  pinned fixture `77ce180861239426c0c63037235cf98d74a2bbfa09a2a46ee3da3353bb29a7df`.
  Rust/legacy DSP unchanged. Native runner restriction unchanged, not bypassed.
- `m3j-session-reload.json`: old saved session loads zero extra slots; explicit
  Short / 96 kHz / +4 save; fresh Default / 48 kHz / timers / zero extra slots;
  explicit stopped Load restores +4 and correct **21.33 ms / 384 KiB** info.
  Capacity selector is disabled during the live comparison.
- `m3j-headroom-96000.json`: same three-worker plan and full source score,
  **timer** scheduling, **3 warmups + 9 measured repeats**, rotated order;
  non-isolated Chrome 157 desktop preview on port 4175. Build/test work finished
  before playback. External system load uncontrolled. All rows remained visible,
  complete **1,680,000 frames / 357 events**, six/main analyser peaks nonzero;
  worklet wall clock unavailable throughout. The known-failing baseline keeps
  the aggregate **`pass:false`**. No row is relabeled or discarded.

  | Short / 96 kHz | Added buffering | Measured delivery passes | Measured missing frames | Minimum steady ready lead |
  | --- | --- | --- | --- | --- |
  | Original four blocks | 10.67 ms | 0/3 | 169,728 | 0 frames |
  | +2 blocks (six total) | 16 ms | 3/3 | 0 | 512 frames / 5.33 ms |
  | +4 blocks (eight total) | 21.33 ms | 3/3 | 0 | 1,024 frames / 10.67 ms |

  Both larger-capacity warmups also pass. Original measured runs each miss
  **56,576 frames**, with **18** expired blocks summed across the three groups
  and three runs. Both larger capacities have no expiry or steady lead below
  one producer block. Each run has **13,125** active observations; planned drain
  counts **7 / 11 / 15** respectively. Maximum per-group closed gap **and**
  consumed span is **1,024 frames** for every capacity, with no over-capacity
  quanta. Thus **span <= capacity alone does not certify readiness**: a callback
  can replenish only part of the queue. The first baseline warmup trace records
  a shortage at source **1,280**, span **512**, lead **0**; later shortage starts
  repeat at **5,632 / 9,472 / 13,312...**. Larger pools retain ready audio in
  these trials; this does not prove a browser/device cause or universal margin.
  All arms use identical instrumentation; it can influence observed scheduling.
- `m3j-arrival-invariants.json` independently validates all 12 batch rows:
  publications/expiry, histogram sums, steady/drain/active counts, shortage-to-
  underrun equality, trace bounds, actual capacities, complete events/clocks.
- `m3j-headroom-message-stall-96000.json`: separate **message-scheduled** Short
  +2 control, 250 ms group-0 stall, complete **1,680,000 / 357**, **23,424**
  coherent silent frames and **one** recovery. Group 0 records **23,936**-frame
  maximum gap/span, **91** expired publications, **175** over-capacity quanta,
  and **one** histogram-overflow entry. Other groups have no expired blocks or
  overflow. This verifies bounded diagnostic/recovery behavior; it is not a
  timer-mode stall claim or a gap-free run.
- `m3j-headroom-fallback-48000.json`: explicit Short +2 pool fallback reports
  actual serial, **1,536 frames / 32 ms** buffering, **840,000 / 357**, complete
  clocks/events and six/main peaks. `m3j-default-48000.json`: unchanged Default /
  timers / no extra slots, **840,000 / 357**, zero misses, steady ready minimum
  **2,816 frames**, maximum group span **1,408 frames**, no expiry/overflow.
  `m3j-controls-invariants.json` validates these controls. Page and saved session
  left **Default / 48 kHz / timers / no extra headroom, stopped**.
  Screenshots: `.tmp/modular-audio-m3j-headroom-browser.png` and
  `.tmp/modular-audio-m3j-browser.png`.

Commands: `npm.cmd run graph:build`, `npm.cmd run build:public`,
`npm.cmd test -- src/modular-audio --maxWorkers=4 --minWorkers=1`.

## Limits and next task

Keep original defaults and the user's listening report. Use repeated desktop
and target-device delivery/listening evidence before selecting a smaller safe
capacity; avoid auto-promotion from one environment. Next add an explicit local
listening verdict/export tied to the exact fixture/build/rate/profile/headroom/
scheduling and delivery/lead/gap data, so target-phone Short / 96 kHz +2 can be
compared with its original-capacity control without replacing earlier feedback.
The desktop zero-miss result does not establish clean phone/headphone audio or
locked/background behavior. Shared memory, distributed
event owners, arbitrary repartitioning and broad workbench migration remain
separate. No push/deployment or native Application Control bypass.
