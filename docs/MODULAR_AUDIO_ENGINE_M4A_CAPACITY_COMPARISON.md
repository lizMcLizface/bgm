# All explicit six/eight-buffer comparison

2026-11-10, after measurement commit `758a19e`. The compact v2 phone run exactly
reproduces the 4,608-frame zero-lead failure. Its last accepted producer packet
has no free slots and only three handled recycles; later worker statistics have
handled all nine releases. Short sampled task/render times focus this experiment
on buffer holding/recycling/delivery. They do not isolate a cause or prove a
larger pool will fix the phone. Keep both original failed phone reports.

## Boundary

- All / Setup / One worker offers **Worker PCM capacity**: existing **6 blocks /
  64 ms** or explicit **8 blocks / 85.33 ms**. Both remain 48 kHz / Message tasks /
  **512-frame cadence**. Eight adds **1,024 frames / 21.33 ms** and raises the
  eight-stereo-bus transferable pool from 196,608 to 262,144 bytes. No bounds are
  widened; eight slots already exist in the worker protocol.
- Six is the initial capacity and serial is the initial route. Capacity is
  disabled while preparing/playing/stopping. The experiment is transient and
  reload returns to serial/six; no setup or preference schema changes. Switching
  explicitly to serial uses six even if eight was selected for worker. A worker
  startup fallback retains its selected delay, as before. There is no runtime
  serial reconstruction, adaptive buffering or retry after a delivery miss.
- Status and report use actual executor latency, including fallback. Compact
  v2 includes `sourceFingerprint`: SHA256 of UTF-8 `JSON.stringify` of the
  captured source plan (actual source parameters, tuned notes/events, part,
  tempo and sample rate). Executor capacity and counters are excluded, so
  unchanged source/score runs at six/eight produce the same hash. Existing FX /
  mixer live state is not fingerprinted; keep that unchanged during comparison.
- Hashing begins outside the audio processing path and settles before report
  delivery; audio cleanup does not wait for it. Unavailable Web Crypto produces
  null identity, never an invented match. Input plan is not mutated. Continuous
  reload still regenerates notes: compare in one page session and inspect the
  fingerprint rather than assuming exact input after reload.
- Host revision is **all-preview-delivery-v3**; compact format remains v2;
  engine is unchanged **2f9eed09e9122592**. Serial, generic harness defaults,
  worker timing scope/guard and legacy DSP remain operational. This is an
  explicit comparison, not a promoted default or established quality fix.

## Verification

Controller checks prove six/eight use the same cadence and matching source
fingerprints, explicit serial stays six, and unsupported capacities fail before
opening a lease. Source-plan checks verify exact-copy hash equality, event-edit
inequality and null on unavailable crypto. Actual core and FM workers render
raw-exact selected-source PCM and zero unused buses at both six and eight with
diagnostics enabled. UI checks cover explicit selection, active-run disabling
and reload resetting experiments. Prior measurement regression remains
233 tests / 30 files; it is not relabeled as a capacity-step run.

Capacity-step All/controller/source/real-worker/report checks: **86 tests / five
files pass**, **63.06 s**; targeted overlapping **21 / four**, 1.24 s. Public
build/package checks pass, Vite **50.12 s**. No graph asset/Rust changes in this
step; the preceding diagnostic runtime remains `2f9eed09e9122592`.

Real desktop browser at **390 x 844**: six and eight each complete **668,956
frames / 22 events**, no transport/event misses, three nonzero taps. Their
source fingerprints match **755df7b575c14ba579c642b248ea414ab767bbeb667f8777626bb9d4843ab997**;
independent Node SHA256 verification matches each captured plan. Eight correctly
reports 4,096-frame capacity, 85.33 ms, 262,144 bytes, and a **2,787-character**
compact report. Capacity is disabled while running; status says 85.33 ms.
Reload returns to serial/six and preserves object IDs/poses. Transient reports
clear and Continuous notes regenerate as before. Evidence:
`m4a-capacity-desktop-{six,eight,eight-compact}.json`,
`m4a-capacity-browser-checks.json`, screenshot `.tmp/m4a-capacity-comparison.png`.
The isolated QA tab/server are closed, viewport reset, normal-user LAN HTTPS
server retained. Desktop transport passes are not phone quality evidence.

## Next target-device check

### Target result: eight does not move the source failure

The user returns the same unique run twice through two pending questions;
count it once: **12ad3fdc-f878-4277-a59e-032b29bc6dc5**,
`m4a-phone-worker-eight.json`. Actual 48 kHz / Message / 512 x **eight** /
**85.33 ms**, no fallback. It still accepts **nine** packets, reaches zero lead
at **4,608**, and stops at source **4,736** with **128 missing frames**. Output
advances to **8,832** (exactly source + 4,096), rather than six's 7,808.
The extra 21.33 ms changes the output startup delay, but does not improve the
observed source delivery. Preserve `pass:false` / listening not assessed.

Only one buffer has been recycled at the last accepted send (cursor **511**,
eight in flight), compared with three (cursor 1,535) in the preceding six-slot
run. Zero free slots is normal producer backpressure, not itself a bug. Packet
4,096 arrives at source **768** versus six's **1,792**. Adding each route's
declared delay gives the same active output cursor **4,864 / 101.33 ms**.
This is an observation consistent with output-clock-aligned batching, not proof
of a browser defect or a 100 ms guarantee. No matched six-slot v3 phone source
fingerprint was supplied; the earlier v2 source hash is unknown, so this is not
an exact input-controlled six/eight phone pair. The eight-slot input hash is
retained; the desktop pair does match exactly.

The later worker stats (17 blocks / 8,704 frames, recycles through 4,607) remain
post-stop evidence. Small task waits and last-block render do not locate which
message/consumer scheduling stage delayed the loop. Output wall time remains
unavailable. No further default/capacity increase follows from this result.

**Next bounded task:** an explicitly muted, short delivery probe using the
existing recovery path rather than stopping on the first miss. It can observe
later arrival/recovery cadence without repeatedly playing broken audio. Keep
normal preview's first-miss guard and six-slot/serial defaults. Do not promote
eight as a cure. The ordinary guarded comparison remains available explicitly.

The existing guard still stops normal six/eight runs on their first miss. Any
future controlled repeat must retain both compact reports and matching captured
input hashes, without editing FX. The next implementation is the short muted
probe above. Keep normal-user HTTPS preview running; no deployment, firewall /
trust change, native Application Control bypass or broad migration.
