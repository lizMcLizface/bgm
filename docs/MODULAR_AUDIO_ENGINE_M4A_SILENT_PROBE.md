# Short muted worker delivery probe

2026-11-10, after `52ba7b7`. Six and eight phone slots both accept nine packets
and stop at source 4,736. Their last accepted packet aligns at output 4,864
despite different startup delays. This batching clue is not an established
browser cause. The next measurement must observe what happens after that first
miss without repeatedly playing the broken source.

## Contract

- All / Setup / One worker offers a separate **Silent 2 s delivery probe**.
  It is never automatically selected or run. It captures the same selected
  source/score, but ends at min(original end, **96,000 source frames**), plus
  the selected declared startup delay. The existing six/eight capacity selector
  still applies; serial/six remain the defaults.
- The probe's own inlet gain is **zero before connection/arming**, ahead of the
  existing role FX/mixer. It does not disconnect/mute the legacy input, keyboard
  or shared tails. The normal song transport is excluded while active, as with
  ordinary preview. Stop, Panic, source/score invalidation and late preparation
  cleanup remain operational. A serial startup fallback is rejected for this
  worker-specific probe before connection/arming.
- Only this explicit muted probe sets `stopOnUnderrun:false`, exercising the
  existing worker recovery/expired-packet handling for a bounded interval.
  Ordinary audible preview keeps `stopOnUnderrun:true`. No worker/worklet/PCM/
  scheduling implementation or buffering default changes in this step.
- Probe completion is **reason:probe-completed**, with a separate
  `diagnosticProbe:{muted,targetFrames,complete}`. Its top-level `pass` is always
  false: finishing a muted partial probe is not a full-score/audio quality pass.
  Full-score completion/event checks retain their original scope. The dedicated
  UI summary reports probe target, missing frames/recoveries and unassessed
  listening; it does not relabel a diagnostic as successful music playback.
- Compact v2 retains source identity, producer/consumer timing scopes, capacity
  and actual sample rate. For probes only, up to three existing bounded arrival
  trace entries are copied as **[sourceFrame, spanFrames, readyLeadFrames]**;
  fields are sanitized finite nonnegative integers or null. Histograms, patches
  and score arrays remain in the full report only. Host revision is
  **all-preview-delivery-v4**; engine stays **2f9eed09e9122592**.
- Setup lays out executor/capacity labels vertically on narrow screens. Human
  summaries round latency to two decimal places; captured numeric latency stays
  exact. This does not alter saved layouts, IDs, setup schemas or legacy DSP.

## Verification boundary

Controller tests assert zero gain before connection, a 96,000-frame target,
recovery enabled only for the probe, captured misses/recoveries retained,
incomplete full score and no ordinary pass. Normal audible gain/guard remain;
serial/serial-fallback probe requests fail before playback. UI tests distinguish
the explicit probe button from normal preview and keep normal transport excluded.
Report tests label probes separately and bound their trace. Existing generated
output-worklet tests verify ordinary first-miss stopping and default recovery.

All/controller/report/generated-output/route checks: **96 tests / five files
pass**, **58.40 s**. Targeted overlapping controller/report checks: **13 / two**,
1.08 s. Public build/package/provenance checks pass, Vite **44.30 s**. Engine
assets and the 296,101-byte Rust/Wasm remain unchanged from the measurement
step. This is a bounded host-side measurement facility, not a worker quality fix.

Actual desktop browser at **390 x 844**, 48 kHz, Message tasks, six slots:

- Probe `c3eb0af2-79b0-41b2-8a29-23595c1c7732` finishes **96,000 source /
  99,072 output frames**, **188 packets**, no missing PCM. Source/channel/master
  peaks are **zero**. Reason `probe-completed`; probe complete true, full-score
  complete/pass false. Applied events are **3 / 16**, without late/overflow.
- Ordinary playback immediately afterward completes **668,956 frames / 16
  events**, no misses, guard true, ordinary complete/pass true. Source peak
  **0.3450**, channel/master **0.09314**. Its full captured source/score fingerprint
  matches the muted probe; the probe does not modify the captured full plan.
- A repeat muted probe finishes at 96,000 with zero source peak/no misses.
  Reload returns to Serial, clears the report, and choosing worker exposes six
  slots. No probe runs automatically. Narrow Setup shows separate labels,
  explicit probe control, run identity and dedicated completion summary.

Evidence: `reports/modular_audio/m4a-silent-probe-desktop.json`,
`m4a-silent-probe-desktop-compact.json`, `m4a-silent-probe-normal-after.json`,
`m4a-silent-probe-browser-checks.json`; screenshot `.tmp/m4a-silent-probe.png`.
These are actual browser callback/DOM reports, not physical audio listening.
Worklet monotonic timing remains unavailable, represented as null, not zero.
Compact traces retain null lead for arrival-gap records that have no lead field.
The existing normal-user LAN HTTPS server remains running; only the temporary
loopback QA server/tab and viewport override are cleaned up. Phone v4 muted
probe evidence follows; no mobile quality fix is claimed.

## Actual phone probe: recurring recovery, not a stuck producer

User-supplied unique run **34cae2c4-49bc-4044-b421-077d96bfdaab**, Android-reported
Chrome 156, 48 kHz / six / Message, retained in
`reports/modular_audio/m4a-phone-worker-silent-probe.json`. Host v4 / engine
2f9eed09e9122592. Probe completes **96,000 / 99,072 output frames**, rendered
96,000 / **188 blocks**. It records **36,608 missing frames / 286 quanta**,
**19 recoveries**, **67 late blocks**, **121 accepted**, zero malformed/stale
packets or bad recycles. The first zero lead is again **4,608**. Largest measured
arrival gap / consumed since arrival is **4,864 frames / 101.33 ms**, exceeding
the 3,072-frame capacity. Compact trace includes first insufficient lead and a
later arrival at source **6,656** after a 4,864-frame span. This proves that
delivery repeatedly resumes; it is not permanently stuck after packet nine.

Worker total render **407.60 ms / max 7.90 ms**, sampled ready-task wait max
**2.10 ms**, pool wait max **75.80 ms**, slot RTT max **137 ms**. These maxima
are not synchronized one-way message latency, physical device timing or CPU
utilization. Last packet at source 94,208 has two free / four in flight, later
all recycles reach 95,999. Worklet timing remains unavailable. This is one muted
partial run, **full-score complete/pass false; listening unassessed**. Its source
hash differs from earlier phone runs, so there is no exact-input pair.

## Next measurement

The measured gap now exceeds both six/eight capacities. Next implement an
explicit **12-slot / 128 ms** comparison at the same 512-frame cadence, above
the observed 4,864-frame gap, retaining serial/six defaults. First request a
muted phone probe at twelve; only if its delivery counters are clean request
ordinary guarded listening. A capacity experiment tests whether headroom covers
these observed bursts; it cannot identify a browser message leg or guarantee
future/lock-screen delivery. Preserve failed results, exact source/run identity,
normal guard and working serial path. No deployment, trust/firewall change or
broad migration.
