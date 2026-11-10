# Captured-input six/twelve comparison

2026-11-10, after `8c58a8a`. The phone twelve-slot bass run now has clean full
delivery counters and affirmative user listening. Earlier six/twelve phone
trials used different source hashes. This step adds one controlled muted pair;
it does not change playback defaults or claim a browser cause.

## Contract

- All / Setup / One worker offers **Compare 6 / 12 blocks silently**. It captures
  the selected pitched source/score/tuning once under one original source lease,
  serializes that capture once, and loads one engine-asset set. Each trial gets
  an independent parse and fresh prepared Rust worker/worklet route, in fixed
  order **six then twelve**, at the existing 48 kHz / 512 / Message cadence.
  Neither trial re-reads/recompiles the live score or shares mutable Rust state.
- Each trial uses the existing explicit silent probe: own gain zero before
  connection/arming, recovery enabled, at most **96,000 source frames**, plus
  its declared startup delay (64 / 128 ms). Other legacy/shared audio retains
  its controls. Normal song transport is excluded; normal audible preview still
  stops on its first missing span. Source/score/tempo selection changes, Stop,
  Panic, host close and late preparation cleanup abort the pair.
- The original lease stays valid across both trials and releases only after
  overall cleanup. Child leases borrow that guard and do not release it.
  Each prior route disposes before the next starts. Failure or serial startup
  fallback aborts with partial evidence; it never silently substitutes an
  audible or serial trial. Cancellation cannot start a later trial.
- Parent comparison has its own run ID and host **all-preview-delivery-v6**;
  each child retains an independent run ID and complete ordinary probe report.
  Full parent report contains both trials. The source hash covers the same full
  captured plan in both children, even though each plays only its first two
  seconds. `comparison.complete` means both diagnostic windows finished;
  top-level full-score complete/pass remain false and listening unassessed.
  Hash availability/matches are explicit; missing Web Crypto is not a hash match.
- **Copy compact diagnostics** emits one bounded parent report with at most two
  rows: trial identity, input/build, actual capacity/executor, source clocks,
  missing/late/rejected/stale/recovery counters, lead/arrival and worker metrics.
  Full patches/score/trace/publication details remain in the full report. A
  six-slot failure remains visible even if twelve is clean; completion is not
  relabeled as a music-quality pass. This new compact comparison kind is
  `all.source-capacity-comparison.diagnostics` v1; single-run compact v2 remains.
- Fixed trial order is explicit; this is not randomized or a guarantee that
  scheduler/device conditions stay constant across sequential windows. Source
  identity excludes FX/mixer state, which remains user-controlled. The capacity
  selector is untouched by the pair, disabled while active and still resets to
  six/Serial on reload. No saved-layout/setup schema, normal keyboard/MIDI,
  worker scheduling/transport or Rust/engine-asset change. Engine remains
  **d6a0341e5edf2d57**, Wasm **296,101 bytes**.

## Verification and limits

Controller checks cover one original capture/lease, unchanged input despite
later live-score changes, independent graph objects, zero gains, sequential
disposal, two unique trial IDs/hashes, and retention of six-slot misses alongside
clean twelve. Cancellation during preparation/playing, source invalidation and
serial startup fallback stop the pair and preserve partial evidence. Report/UI
checks cover compact copy, separate diagnostic summary, explicit button, normal
transport exclusion, Panic and unchanged selected capacity.

**108 tests / six files pass in 63.04 s**, including real core/FM worker PCM at
six/eight/twelve and generated output/route checks. A final controller guard
checks source validity after each completed window; **11 controller tests pass
in 1.12 s**, including host-close and cancellation exactly at second preparation.
These overlap the main suite and are not added to its count. Public package /
provenance checks pass; final build **36.01 s**. Existing
oversized-chunk warning remains. No engine assets or Rust/Wasm changed.

Actual 390 x 844 desktop browser pair **8750d4f0-d34d-4f59-8081-a4b1ff5e8b3c**:
both six/twelve render **96,000 frames**, zero own-source peak / missing PCM,
distinct child IDs, same captured source hash (independently verifiable from
each full plan). Pair finishes as a diagnostic, not a music pass. The previously
selected **eight** remains selected afterward. Normal/selector controls are
disabled during the pair. Compact combined report is **3,590 characters**.
Stopping a new pair retains one incomplete **11,776-frame** trial and launches
no second trial; normal preview becomes available. Subsequent ordinary Serial
completes **668,956 frames**, three positive signal peaks, first-miss guard true,
complete/pass true and matching input hash. Physical listening is not assessed
by these browser observations.

Reports: `reports/modular_audio/m4a-captured-comparison-desktop.json`,
`m4a-captured-comparison-desktop-compact.json`,
`m4a-captured-comparison-stopped.json`,
`m4a-captured-comparison-serial-after.json`. Screenshot:
`.tmp/m4a-captured-comparison.png`. The page now describes the successful
twelve-slot phone bass run and the earlier six/eight failures separately.

Final-build repeat pair **5c91f82b-d9ef-4423-bbee-80a318e6e807** also finishes
both windows with matching independently hashed inputs and zero source peaks /
misses. Actual copy control reports **Compact diagnostics copied**; visible
textarea JSON matches the compact report. Native clipboard payload readback is
not claimed. Reload selects Serial, clears report and exposes six on choosing
worker; no pair runs automatically. Reports
`m4a-captured-comparison-final-browser.json` and
`m4a-captured-comparison-browser-checks.json`; screenshot
`.tmp/m4a-captured-comparison-summary.png` shows both results and copy status.
QA tab, viewport override and temporary loopback server are cleaned up. Existing
normal-user HTTPS PID8368 stays running, serving the local final package. Phone
captured-pair report is requested and pending; prior clean audible twelve-slot
evidence remains valid but is not relabeled as this new controlled pair.

## Next task

Collect one phone compact comparison from the existing normal-browser LAN HTTPS
page, preserving its exact parent/child IDs and matching hashes. If the same
captured input still misses at six and stays clean at twelve, retain that as
capacity-dependent delivery evidence at this device/context. A smaller-latency
message-leg experiment must preserve these controlled baseline runs. Do not
promote defaults, infer a browser guarantee or broaden migration from one pair.
No deployment, firewall/trust change or native Application Control bypass.
