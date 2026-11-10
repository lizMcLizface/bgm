# Explicit reverse-order capacity comparison

2026-11-10, after `50a4fb3`. The phone captured-input six/twelve pair matches
source/build hashes but uses a fixed order. Six misses 36,608 frames while twelve
is clean, both with a 4,864-frame arrival gap. This step makes order explicit so
warmup/order dependence can be checked before changing the transport.

## Contract

- All / Setup / One worker adds **Comparison order**: **6 then 12 blocks**
  (initial choice) or **12 then 6 blocks** (explicit reverse). The compare button
  names that selected sequence. The order selector disables during preparation,
  playback and cleanup. It is transient: reload returns to six first, Serial and
  six-block normal capacity. Changing comparison order does not change the
  ordinary capacity selector or start audio.
- Existing single capture/lease, fresh independent sequential Rust owners,
  worker-only execution, zero gain before connection/arming, 96,000-source-frame
  windows, recovery behavior and invalidation/Stop/Panic cleanup are reused.
  The order API accepts only `six-first` or `twelve-first`, validating before a
  host lease/route opens. A stop retains actual completed/partial trials in their
  execution order and never invents the missing second result.
- Parent full/compact reports now include **comparison.order** and bounded
  **comparison.capacities**, e.g. `twelve-first` / `[12,6]`. Trial arrays and
  human summary follow actual execution order. Compact schema v1 is extended
  additively; old v6 reports retain unknown/null order metadata rather than
  gaining invented recorded order. Their trial rows remain unchanged.
- Host revision **all-preview-delivery-v7**; engine stays
  **d6a0341e5edf2d57**, byte-identical **296,101-byte Wasm**. No worker protocol,
  scheduling, DSP, pool bounds, persistence schema or default changes. Ordinary
  audible preview keeps its first-miss guard; existing legacy keyboard/MIDI and
  explicit twelve / 128 ms option stay operational. No deployment/security change.

## Verification and limits

Controller tests run both orders against one capture, independent graph objects,
zero gains, correct six-slot failure retention and matching hashes; they reject
invalid order before any lease and retain an early reverse stop accurately.
Existing preparation/playback/host-close/fallback/second-boundary cancellation
checks remain. UI checks explicitly select reverse, disable it while active,
Panic and preserve ordinary capacity; reload returns to six first. Report checks
preserve reverse metadata/row order, bound capacities to two, and keep absent
historical metadata unknown. Diagnostic completion stays separate from false
full-score pass and unassessed listening.

**112 tests / six files pass, 60.26 s**, including real selected core/FM worker
PCM and generated output/route regressions. Earlier overlapping focused checks:
**21 / two files, 1.39 s**. Public package/provenance checks and build pass,
Vite **45.88 s**, existing oversized-chunk warning. No engine asset rebuild or
native Application Control bypass.

Actual desktop browser at **390 x 844**, parent
**aa8c2c46-1f85-40ee-9cd5-f627ee167378**:

- Initial order six first; explicitly selected reverse. First live status names
  trial 1 / twelve. Order and other preview controls disable while active.
- Full/compact `order:twelve-first`, `capacities:[12,6]`, actual worker rows
  preserve that execution order. Each consumes/renders **96,000 frames**, zero
  source peak and no missing PCM. Same input hash, separate child run IDs.
- Parent comparison complete true, full-score complete/pass false; listening
  unassessed. Compact **3,647 chars**; copy reports success. Native clipboard
  payload readback is not claimed. Prior selected ordinary capacity **eight**
  remains unchanged.

Reports `reports/modular_audio/m4a-reverse-desktop.json` and
`m4a-reverse-desktop-compact.json`; screenshot `.tmp/m4a-reverse-summary.png`.

Forward pair **f85e6e53-19f9-42d1-9cc1-c341eabb667b**, without changing the
source, records `six-first` / `[6,12]`, both 96,000-frame muted windows clean.
It matches the reverse parent's source hash; independent Node SHA256 over all
four full plans confirms identity. Report `m4a-reverse-desktop-forward.json`.
Stop on a new reverse pair retains one **twelve-slot / 8,704-frame** incomplete
trial, no six-slot trial; order metadata remains `[12,6]`, comparison complete
false. Report `m4a-reverse-desktop-stopped.json`. A partial report does not imply
both trials ran.

Ordinary Serial afterward completes **668,956 frames / 32 events**, normal guard
true, complete/pass true, three positive peaks and matching captured input.
Reload selects **Serial / six / six-first**, clears the report and starts no
comparison. Reports `m4a-reverse-desktop-serial.json` and
`m4a-reverse-browser-checks.json`. QA tab/viewport/loopback server cleaned up;
normal-user LAN HTTPS PID8368 stays running. Browser diagnostics/copy-success
status do not establish physical listening or clipboard payload readback.

## Actual phone reverse pair

Unique supplied parent **f324403f-9835-427b-ae2d-9479bd5691b6**, 10:47:33.291 UTC,
48 kHz / bass / Message / host v7 / engine d6a0341e5edf2d57, retained unchanged
by value in `reports/modular_audio/m4a-phone-reverse-comparison.json`.
`comparison.order:twelve-first`, capacities `[12,6]`; both child source hashes
match the parent. Phone full plans are absent, so hashes are cross-checked,
not independently recomputed. Both source windows render/consume 96,000 frames,
188 producer blocks, and complete as muted diagnostics.

- **Twelve first**, child **431c30e2-88a6-4379-92a0-9f9b6b66d672**: zero missing /
  late/rejected/stale PCM or bad recycles, 188 accepted blocks, minimum steady
  lead **1,152 / 24 ms**, no zero/below-quantum or over-capacity observations.
- **Six second**, child **210a1b44-5b98-4156-a2fe-17a384500760**: **36,608 missing /
  286 quanta**, **19 recoveries**, **67 late / 121 accepted**, first zero lead
  **4,608**, 257 over-capacity quanta. No rejected/stale PCM or bad recycles.
- Both maximum arrival gaps remain **4,864 / 101.33 ms**. Per-capacity delivery,
  lead and arrival counters reproduce the earlier forward pair exactly despite
  reversed order. Pair source hash differs from the earlier forward pair:
  input is controlled within each pair, not identically across both pairs.
- Worker render total/max: twelve **401.90 / 11 ms**, six **382.30 / 25.80 ms**.
  Six's lower total does not prevent misses, and these local wall-time totals
  are not CPU utilization or message-leg attribution. No speedup is inferred.

This makes a simple first-trial warmup explanation unlikely and strengthens
capacity-dependent delivery/headroom evidence for this phone/context. Pool size
and startup delay still vary together. Raw full-score complete/pass remains
false and listening unassessed; the prior full audible twelve-slot run remains
separate. No browser timing guarantee, all-role or lock-screen acceptance.

## Next task

Audit and add an explicit **fixed twelve-slot pool with reduced startup delay**
muted comparison, preserving the current twelve / 128 ms baseline. First target
is twelve-slot render-ahead capacity (6,144 / 128 ms) with **64 versus 128 ms
output startup delay**, holding source, cadence, pool and scheduling constant.
Separate queue capacity/lead budgets from startup delay in contracts/telemetry;
do not silently reinterpret existing `delayFrames` or report reduced startup as
reduced live-event latency. Already-rendered lookahead still constrains edits.
Preserve fresh owners, bounded memory, exact source clocks, normal first-miss
guard and current defaults. Test queue timing and declared latency before
requesting the phone muted comparison; audible listening only after clean
delivery. No promise that this will remove the observed batching, no default
promotion, deployment, security change or broader migration.
