# Explicit twelve-slot delivery comparison

2026-11-10, after `ce4908c`. The six-slot phone muted probe records 19 recoveries
and a 4,864-frame maximum arrival gap (101.33 ms at 48 kHz), exceeding six/eight
capacity. This step tests a bounded headroom hypothesis, not an identified
browser cause or guaranteed mobile fix.

All / Setup / One worker adds **12 blocks / 128 ms / compare**. This is
**6,144 frames**, **393,216 PCM bytes**, at the unchanged **512-frame** cadence,
Message tasks and transferable worker/worklet transport. It adds 64 ms over
six and 42.67 ms over eight. Six and Serial remain defaults; selection is
transient, disabled while active and reset by reload. Silent probe and ordinary
guarded preview use the selected capacity. A serial startup fallback is still
rejected for the worker-specific silent probe.

The shared option validator preserves existing two-to-eight-slot bounds at all
existing block sizes; only the exact **512 / 12** combination is additionally
accepted. Nine, ten, eleven, thirteen or twelve with another block size remain
invalid. No general larger-pool default or harness control is added. Arrays and
buffers allocate at preparation as before; no ownership/recycle/queue/DSP logic
or shared-memory dependency changes. Regenerated worker/output assets identify
runtime **d6a0341e5edf2d57**; the **296,101-byte Wasm** is byte-identical,
SHA256 `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
Host revision **all-preview-delivery-v5** distinguishes this candidate.

## Verification

A deterministic queue model services transfers only between 4,864-frame output
batches, including each selected startup delay. Six/eight miss PCM; twelve
covers this modeled cadence over 96,000 source frames. This is a useful contract
test, not reproduction/proof of phone callback scheduling. Actual threaded
worker tests compare every selected-source PCM sample against independent
serial Rust for core/FM at six/eight/twelve, including producer slot accounting.
Controller/UI tests cover explicit twelve, probe versus ordinary guard, source
identity, disabling and default reset. Generated output and route checks remain.

**97 checks / five files pass in 45.50 s**. Generated three-worker pool protocol,
output and route regression: **eight / three files pass in 0.683 s**. Public
package/provenance/build checks pass, Vite **33.60 s**. Rebuilding the Wasm asset
uses the existing local toolchain; native executable Application Control is not
bypassed. Existing oversized-chunk build warning remains.

Actual desktop browser, **390 x 844**, 48 kHz:

- Muted run **8c675cbd-9242-4732-ae45-994b7362579d** reports actual worker,
  twelve / 128 ms / 393,216 bytes, **96,000 source / 102,144 output frames**,
  **188 accepted packets**, no missing/late/rejected/stale PCM or bad recycles.
  All three peaks are zero; diagnostic complete true, full-score complete/pass
  false. Worklet timing remains unavailable, not a zero-time measurement.
- Subsequent ordinary run **c3d51093-6fac-4326-9836-5f40dd8c03d1** completes
  **668,956 source frames / 16 events**, three positive signal taps, no missing
  PCM, normal first-miss guard true and delivery/signal pass true. Source peak
  **0.38010**, channel/master **0.10056**. Full captured input fingerprints match
  between probe and normal; independent Node SHA256 checks confirm both.
- Reload resets mode to Serial, capacity to six and removes the prior report.
  The narrow UI shows twelve explicitly and identifies host v5 / new runtime.

Evidence: `reports/modular_audio/m4a-twelve-desktop-probe.json`,
`m4a-twelve-desktop-compact.json`, `m4a-twelve-desktop-normal.json`,
`m4a-twelve-browser-checks.json`; screenshot `.tmp/m4a-twelve-slot.png`.
Loopback QA server/tab and viewport override are cleaned up; normal-user LAN
HTTPS stays running. No audible phone run is requested before a clean muted
comparison.

## Phone outcome

Unique phone v5 run **63fa43b8-f202-4794-9833-950a2a8a622e**, 48 kHz / Message /
twelve, retained in `reports/modular_audio/m4a-phone-worker-twelve-probe.json`.
It completes **96,000 source / 102,144 output frames**, **188 accepted blocks**,
**zero missing/late/rejected/stale PCM or bad recycles**, zero recoveries needed.
Steady minimum ready lead **1,152 frames / 24 ms**; no zero/below-quantum lead.
Largest arrival gap remains **4,864 frames / 101.33 ms**, now below capacity;
zero over-capacity quanta. The observed gap remains while the larger explicit
capacity covers this run. This supports the headroom hypothesis, not a proven
browser message-leg cause or permanent fix. The phone input fingerprint differs
from six/eight and the earlier probe; no exact-input phone pair is claimed.

Worker total render **432.90 ms / max 17.80 ms**; ready-task wait max **0.80 ms**,
pool-wait max **176.70 ms**, slot RTT max **281.80 ms**. Startup/holding affects
these maxima; they are not required one-way buffering or CPU measures. The
worklet clock remains unavailable. Probe full-score complete/pass stays false
and listening unassessed, as required for a muted partial diagnostic.

The user additionally reports **“I also ran it with sound and it sounded fine”**,
then supplies that audible run's compact report:
**3c2c7faf-e696-499d-9e57-95493ec3bff3**, started **09:28:49.880 UTC**, retained
verbatim by value in `reports/modular_audio/m4a-phone-worker-twelve-audible.json`.
It is actual worker / Message / 512 x 12 / 128 ms, **ordinary first-miss guard
true**, no probe/fallback, **reason completed, complete/pass true**. Full
**668,956 planned/consumed/rendered source frames** (13.9366 s), **675,200 output
frames**, **16 events applied / zero late/overflow**, **1,307 accepted/rendered
blocks**, zero missing/late/rejected/stale/bad-recycle counters. Minimum steady
lead stays **1,152 / 24 ms**, largest arrival gap **4,864 / 101.33 ms**, no
zero/below-quantum lead or over-capacity observations.

Audible and muted phone reports have the **same source fingerprint**
`c0840313ad73bdd877411106781862d8720d780a25b6f1f788ce1f389f1f27eb`, host v5,
runtime d6a0341e5edf2d57, role, browser UA and executor/capacity. This links the
affirmative listening report to the ordinary full run without modifying either
raw report's automatically generated **listening:not assessed**. It establishes
one clean phone full-score bass run at this explicit capacity, not a clean
six/twelve controlled pair, all-role acceptance or a physical output recording.

Full-run worker total render **2,954.20 ms / max 23.40 ms**, ready-task wait max
**2.30 ms**, pool-wait max **186.20 ms**, slot RTT max **284.40 ms**. These are
producer-local observations including holding/startup; they do not measure a
one-way message leg or establish per-block deadlines/CPU attribution. Worklet
process timing remains unavailable. Lock-screen, long-duration, other roles
and live keyboard latency are unverified for this capacity. No replay was needed
to collect the existing audible report.

## Next target-device check

The full guarded phone run and listening link are now captured. Preserve twelve
as an explicit working 128 ms sequenced-preview option and Serial/six defaults.
Next bounded implementation: repeatable captured-input six/twelve **muted**
comparison, retaining one source/score snapshot across trials, so future capacity
or lower-latency message-leg experiments have controlled input. Assess the
128 ms tradeoff before any default promotion; do not expand the normal live
keyboard path or migrate more roles on the strength of one bass run. Retain all
negative evidence. Lock-screen and longer-session acceptance remain separate.
No deployment, firewall/trust change, Application Control bypass or migration.
