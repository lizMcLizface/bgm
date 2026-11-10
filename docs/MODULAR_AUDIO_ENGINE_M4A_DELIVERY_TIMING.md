# M4a producer waiting and publication-bound diagnostics

2026-11-10, following `1b14989`. With LAN access working again, the user reports
that one worker **"still fails at roughly the same sample count as before"**.
This is a repeatability observation, not another exact run/counter snapshot.
The retained first phone report remains runtime `2dd834c6b07330cb`, first zero
lead 4,608 / stopped source 4,736 / 128 missing frames. Do not relabel it with
the new build or infer that a fixed failure count establishes a cause.

## Contract

- All's opt-in source adapter requests **deliveryDiagnostics** explicitly.
  Generic worker routes, standalone/pool harnesses and old init messages default
  it to false. The flag is validated and actual executor reports it; serial
  reports false and has no producer/queue timing. Buffering, Message scheduling,
  48 kHz, 512 x six / 64 ms, first-miss stop and initial serial choice stay.
- A worker-local observer records the wait from a ready scheduling request to
  its render task starting, preserving the earliest coalesced request. Explicit
  injected stall waits are excluded from that metric. It also records a full
  pool's no-free-buffer interval until a valid recycle, and each slot's elapsed
  time from publication to valid recycle. Times use only that worker's monotonic
  clock; unavailable clocks are null, never zero CPU evidence.
- Pool waits and recycle round trips include consumer buffer holding, initial
  delay, startup/arming and message scheduling. They are not one-way network
  timings or isolated recycle-delivery delays. Maxima can be dominated by
  startup; compare last values, counts and `lastRecycleConsumerFrame`. That
  consumer field is the queue's source-frame cursor *inside release*, before
  its consume-loop increment (e.g. the first 512-frame release is 511).
- Each diagnostic packet carries a bounded scalar producer snapshot at send:
  produced frame/blocks, free/in-flight slot counts, elapsed/task/pool/recycle
  observations and the last block's render/copy time. The current packet counts
  as in-flight. No PCM, event/control ordering, task cadence, extra render work,
  pool capacity or shared state changes. Diagnostics add a fixed per-slot
  timestamp array and per-packet metadata/allocation only in the opted-in path.
- The consumer retains a sanitized **last accepted packet** snapshot, including
  packet start/length and its source cursor at arrival. Invalid, stale, expired
  and post-stop packets cannot replace it. Optional malformed timing metadata
  becomes null without rejecting valid PCM. No growing traces/score/patch data
  cross this reporting boundary. On the guarded miss, the consumer stops and
  ignores further packets, retaining this publication-time evidence.
- Compact diagnostics are **version 2**, host **all-preview-delivery-v2**, and
  include actual context sample rate. `lastPacket.producer` is state at that
  accepted packet's send; `worker` and `producerLater` are queried later, after
  the host's stop/fade, and are explicitly labeled. No synchronized cross-thread
  snapshot or shared clock is claimed. Optional output process wall-time
  availability/max/over-period counts are included without histograms. Historical
  reports still render with unknown/null missing fields; original failures and
  listening verdicts stay unchanged. Full report and compact manual copy remain.

## Verification and limits

The user supplies compact v2 phone run **98e7ef6f-cee4-4c47-baf7-bc0f190736fa**,
48 kHz, same actual worker/Message/512 x six. It reproduces the first v1 report
exactly in accepted packets (9), zero lead (4,608), stopped source (4,736),
output (7,808), missing frames (128), and arrival-frame distances. Retain its
original `pass:false` and `listening:not assessed` in
`m4a-phone-worker-delivery-timing.json`; this is not a phone fix.

The last accepted packet starts at 4,096 and arrives at source cursor 1,792.
At its send the worker has produced 4,608 frames, no free slots / six in flight,
and only handled recycles through 1,535. Sampled task wait max is **0.30 ms**,
last render **0.20 ms**, prior render max **2.40 ms**. Later statistics show
15 blocks / 7,680 frames and handled recycles through **4,607**, with task wait
max **0.40 ms** and an open no-free-buffer interval **35.70 ms**. This narrows
the next experiment to the recycling/holding/delivery path; it does not isolate
which message leg or browser scheduling boundary delayed progress. Output
worklet wall time is unavailable. The **125.50 ms** pool-wait and **211.10 ms**
recycle maxima include startup/holding; they are not measured missing-buffer
requirements or a reason to set latency to those numbers.

Next controlled implementation: an **explicit six-versus-eight-slot** All
comparison at the same 512-frame producer cadence, with **64 vs 85.33 ms**
declared capacity. Preserve six as default, serial as initial route, existing
guard and exact captured source/score identity. Do not present this comparison
as an established cure before a target-device result.

Modular plus All regression: **233 tests / 30 files pass**, **178.26 s**, including
actual timer/message single and pooled workers at 44.1/48/96 kHz, independent
generations, raw PCM/control/default recovery, and the legacy owned core/FM /
percussion goldens. Targeted candidate checks: **24 / four**, 1.09 s, overlap
the broader run. Public build/package/provenance checks pass, Vite **47.50 s**.
Runtime **`2f9eed09e9122592`**, host **all-preview-delivery-v2**. Rust/Wasm remains
**296,101 bytes**, unchanged SHA256
`a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
Native Application Control restrictions are not bypassed.

Real desktop All Bass worker run `8bda97c4-85a0-4191-baf4-ccd12037afe6` completes
**668,956 frames / 18 events**, **1,307 accepted packets**, zero missing/late/
rejected/stale packets and zero late/overflow events, with all three signal
taps nonzero. Compact v2 text is **2,724 characters** and matches the full run.
The last packet carries produced frame 668,956 at send and consumer frame
666,496 at acceptance; its last recycle cursor is 666,111, while the later
worker snapshot reports 668,955. This visibly verifies the snapshot distinction.
Desktop task-wait maximum **0.20 ms**, pool-empty maximum **79.70 ms**, recycle
round-trip maximum **129.90 ms**, last-block render **0.10 ms** / maximum **1.10
ms**. Startup/holding contributes to these maxima; they are not phone or
deadline headroom evidence. No physical listening verdict is inferred.
Evidence: `m4a-delivery-timing-desktop-{worker,compact}.json` in
`reports/modular_audio/`; screenshot `.tmp/m4a-worker-delivery-timing.png`.
Desktop serial independently completes the same **668,956 frames / 18 events**,
three nonzero taps, diagnostics false and null last-packet data. Reload retains
object IDs/poses, clears transient reports and returns to serial. Continuous
reload still regenerates notes; no exact score-file roundtrip is claimed.
`m4a-delivery-timing-desktop-serial.json` and `m4a-delivery-timing-browser-checks.json`
retain these results. Copy UI reports success; native clipboard readback was
not verified. The isolated QA tab is closed; normal-user LAN server remains.

Deterministic checks exercise actual generated worker scheduling branches with
delayed task service and buffer returns. They verify bounded pending work, slot
round trips and immutable prior packet metadata while the worker advances.
Generated output-worklet checks stop on the first missing quantum, retain the
last accepted producer snapshot, ignore later publications, and never render
DSP on the output side. Actual core/FM threaded checks retain raw-exact source
PCM and zero unused buses with diagnostics on. Default worker and independent
instances retain their existing execution paths with diagnostics off.

This is a measurement step, **not a phone fix**, scheduling speedup or CPU
headroom claim. Worker waiting does not identify why the browser withheld work;
the last accepted packet cannot describe a later packet that never arrived.
Instrumentation can perturb scheduling. No default buffer increase or automatic
serial reconstruction is introduced. Rust/Wasm and native Application Control
restrictions remain unchanged.

**Next:** the new phone report above is retained; implement the explicit
six/eight-slot comparison at unchanged cadence, with captured provenance and
declared latency. Preserve working serial, six-slot default and the guard.
Do not expand roles or silently retune buffering. Keep the normal-user HTTPS
preview running; do not launch it inside the sandbox or deploy for testing.
