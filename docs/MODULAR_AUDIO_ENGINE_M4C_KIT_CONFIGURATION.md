# Owned basic-kit preparation configuration

2026-11-10, after `57f00ee`. Implements the prerequisite identified by
[the percussion seam audit](MODULAR_AUDIO_ENGINE_M4C_PERCUSSION_AUDIT.md).
This is a working portable Rust/JS graph configuration slice. All's Drums
eligibility, source backend, ordinary transport, UI defaults and saved workbench
schema are unchanged. Phone three-voice acceptance remains the earlier v9 /
d6a0341e5edf2d57 test material, not a drum acceptance or this new build's
device verdict.

## Owned contract

`legacy.percussion` **module version 2** requires `config` with **exactly** `version:1`,
`voice` and `drums`. The voice is `felt`, `crisp`, `tr808` or `hand`; the array
contains exactly **14** append-only historical slots in `DRUMS` order.
Each row contains exactly `on` (boolean), `level` (0..2), `tone` (-1..1), and
`decay` (0.5..2); all numbers must be finite. Room/FX and classic machine values
are outside this source contract. Unknown keys, malformed/partial rows, wrong
versions/voices and invalid ranges are rejected rather than ignored/clamped.

| Voice | Owned/legacy code | Attack model |
| --- | --- | --- |
| Felt | 1 | Original recipes, canonical slots |
| Crisp | 2 | Original recipes, kick/brush/hat resolve to punch/snare/sizzle |
| Basic 808 | 3 | 808-inspired percussion model, brush resolves to snare |
| Hand | 4 | Hand percussion model |

The original engine interprets semantic slots and selected palette at attack
time. Prepared tones/decays override raw event values as the configured legacy
ABI does. Disabled/zero-level mapped slots do not start a voice. Per-drum target
levels use the unchanged **20 ms** legacy smoothing from initial unity levels.
This reproduces a newly initialized configured kernel; it does not transplant
phase, live voice tails, smoothed levels, previous hit counters or a running
kit's current state. Events keep their explicit hit IDs/receive order and
deterministic noise phase, including repeated historical IDs, swish durations,
hat choke, simultaneous and out-of-order future bookings.

**Module version 1 retains raw-hit mode**, with event model/tone/decay and existing
unit-level fixtures, and rejects a `config` field. Module version 2 requires
the complete kit; missing/`null` config or the audit's formerly ignored `voicePreset/levels`
shape is now rejected. No formerly supported kit schema is replaced: there was
no prepared percussion kit config before this step. Module version 2 makes
older runtimes reject a saved configured patch instead of ignoring its kit.
The actual committed **57f00ee / d6a0341e5edf2d57** JS validator rejects it;
its old Wasm accepts raw v1 (status0), rejects configured v2 (status3), and new
JS paired with that old Wasm fails before configuration. This is exercised
against the actual old binaries, not just simulated descriptors. JSON patch
version stays1; module and configuration versions are separate authorities.

Rust `DrumConfig` / `KitConfig` validate a complete typed snapshot. Each graph
node owns its optional configuration separately from the owned DSP state.
`Graph::percussion_config` and `percussion_drum` require an editable graph;
the owned ABI `graph_percussion_config` starts a unity 14-slot kit and
`graph_percussion_drum` supplies validated rows. Wrong kind/ID/version, invalid
voice/slot, non-boolean integer flag (`on > 1`) or nonfinite/range
values fail. Rejected updates leave the previous valid configuration intact.
JS validates the complete snapshot before preparing any kit rows. After
`prepare`, both ABI methods reject configuration changes, including after reset.

`Graph::reset` clears voices, queues/clocks/counters and reapplies the stored
kit with its original unity-to-target smoothing state. It retains the prepared
kit, graph topology and existing base parameters. Save/load persists the
validated snapshot; it is a restartable patch, not a runtime-state recording.
No live kit automation or new mutable global is added. Kick output remains
the actual owned source's existing kick bus, with no duplicate kick synthesizer.

Rust-generated contracts retain the raw v1 module and expose v2 `kitConfiguration`
version, voices, slot count,
ranges, immutable/absent/initial/reset policy. `validatePercussionConfig` consumes
that descriptor. Runtime preparation resolves descriptors by **type and version**,
matching validation. Generated runtime/worklet cache references and build manifests
are refreshed. Graph runtime **62315b4104f2fc7e**, **311,626-byte** Wasm SHA-256
`5338be34dba12ff6adb39b846534b0f4603ddbc22280bb113078fe72a261da32`.

## Measured results

- **322 regression tests / 38 files (110.12 s)** pass, covering portable graph /
  six-source kernels, both worker schedulers, source pool, existing host/All /
  reports/source taps, percussion palette/expression and legacy percussion.
- These include **9 configured-kit checks** (30.31 s of test runtime during
  the concurrent regression run), recording **56 exact
  stereo PCM comparisons**: four palettes x unity/edited kits x ordered/reordered
  bookings x **44.1/48/96 kHz** (48), plus every slot edited/audible and every
  slot disabled at 48 kHz for each palette (8). Each renders **9.25 s**, beyond
  source tails, with **18** semantic hits. Legacy renders in **113-frame**
  partitions; graph renders in **509-frame** partitions. Hashes match exactly,
  final clocks/event totals agree, all samples finite, all source voices and
  queues finish, and no late/overflow/dropped hits occur. Disabled kits remain
  exactly zero despite initial unity smoothing. These checks are part of the
  broad suite; do not add their counts to invent a unique test total.
- Save/load and reset replay the same source PCM exactly in different block
  partitions. Mutation of the caller's original snapshot does not affect the
  prepared graph. A first hit at frame zero agrees with legacy smoothing.
  Independent differently configured handles share one Wasm memory safely;
  one handle's rendering/reset/cancellation does not change the other's clock
  or voices. Direct ABI invalid updates are followed by a real render agreeing
  with the prior valid kit; post-prepare writes fail and repeated reset replay
  stays identical.
- Actual threaded worker, source ID **6**, Message tasks / **512 x 12**,
  **80,037 frames** including a partial final block: drum and actual kick buses
  are raw-exact to serial; all other source/reference buses remain zero.
  Correct common clocks/all **18** events, no late/overflow/recycle/rejected
  events, and positive drum/kick signals. This is worker publication/source PCM,
  not AudioWorklet queue, per-role FX, audible browser or phone acceptance.
- **30 Wasm counting-allocation audits** pass, including **12 configured-kit**
  cases (four palettes x three rates): zero allocation/reclamation calls or
  memory growth after preparation during render, enqueue, cancel and reset /
  kit reapplication. No native executable is run or Application Control bypassed.
- The original **27 exact legacy/raw owned PCM goldens** still pass within
  the broad sidechain suite. Rebuilt legacy percussion ABI binary is
  **byte-identical**, **92,363 bytes**, SHA-256
  `a0137cdb5805902ab3f8e5d67512ed591a32b5c22420fde2c53ab04fb7cb064f`.
  Only its source provenance manifest changes. Legacy processor and asset
  version remain unchanged.
- Updated seam audit now reproduces the formerly missing **0.25-level** Felt
  case exactly (both peak **0.137166**); malformed old config is rejected. Raw
  unmapped Crisp/Hand negative experiments remain intentionally different.
  Historical pre-configuration audit report is preserved separately.
- Final public provenance/package/build checks pass (**47.50 s** Vite;
  existing chunk warning). An initial build correctly rejected stale percussion
  source provenance after a comment edit; rebuilding that manifest resolved it
  with the same legacy binary. Version-2 checks also exposed the old type-only
  preparation descriptor lookup; resolving by both type/version fixed it before
  the final full rerun. No product changes followed that successful build.

Artifacts: `reports/modular_audio/m4c-kit-configured-pcm.json`,
`m4c-kit-allocation.json`, `m4c-kit-old-runtime.json`, and
`m4c-percussion-seam-configured-audit.json`.
Reproduce source checks with `npm.cmd test -- src/modular-audio/percussionConfig.test.js`,
allocation with `npm.cmd run graph:audit-alloc`, and the small boundary case
with `node tools/auditAllPercussionSeam.mjs`. The last command now writes the
configured report; the original audit's negative-level report remains historical.
Normal-user LAN HTTPS PID8368 continues serving the refreshed local build.
No new browser/device run, physical listening, push or deployment is
part of these measurements. Native Web Audio and classic-machine equivalence
are not claimed.

## Next bounded step

Add the actual **ready Wasm basic-kit-only** All lease and finite hit compiler,
using current sanitized kit/palette and the shared `drumStepEvents` expression
path. Capture and report an explicit private hit-ID policy; preserve semantic
and classic-track identities and the legacy basic-kit ignored sound-lock limits.
Use host-owned dry percussion role input before existing external inserts /
mixer, avoiding unrelated legacy kit sleep timers. Keep native/classic machines
explicitly unsupported and never change sounds automatically for eligibility.

Extend the finite group's budget to `pitched note events + expanded hits <=
4,000`, add source ID6 and six-stem hit/identity diagnostics, source invalidation,
whole-set Stop/Panic and legacy drum-pad coexistence. Preserve current one-pass /
48 kHz bounds, longest source tail and the explicit worker/twelve option. Then
verify full silent browser multi-source output before guarded audible phone
listening. No sidechain/UI rewrite, normal-transport migration or latency chase.
