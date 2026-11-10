# All percussion boundary audit

2026-11-10, after `2d3ca5f`. Independent audit begun while the phone's full active
pitched probe was pending; clean muted and audible reports arrived during the
audit, with listening feedback still pending. **No percussion adapter or UI
eligibility change is implemented by this checkpoint.** Longer phone lookahead
remains acceptable; startup-delay work stays deferred.

## Current authorities and incompatible families

- `src/synths/all/host.js` creates `new Generator(settings)` with the existing
  percussion default. `src/app/Generator.js` selects native Web Audio for Felt /
  Crisp unless an explicit backend choice or a Wasm-only palette requires Wasm.
  Current All does not pass the front page's query-string percussion override
  into its Generator. Do not suggest `?perc=wasm` as an All backend switch.
- The Scene kits label is presentation, not engine identity. A scene can resolve
  to a basic percussion palette or its own classic machine. `setDrumSound`
  resolves this before setting the actual instrument. Inspect the ready
  instrument and `roles.perc.machine`, not just `loaded.perc.synth`.
- **Basic kit `tr808`** (the Rust percussion model's 808-inspired palette) and
  **classic machine `tr808`** (the separate classics kernel's track/parameter
  implementation) are distinct. Classic TR-808/909/707/606 values, extra tracks,
  accent/parameter-lock behavior cannot be replaced by a basic kit model.
- Native `DrumKit`, `WasmDrumKit` and `ClassicsInstrument` have different source
  seams. Existing `sourceStemTap` recognizes only ready core/FM `voice.sourceInput`;
  Drums correctly remains unsupported. First finite kit slice should accept
  only the actual ready Wasm basic-kit instrument. Native and classic machines
  stay named unsupported. No automatic sound change just to make it eligible.

## Event path

1. All's scheduler (`AllPage.jsx`) takes `project.patterns.perc` at the absolute
   progression step. Role mute/solo excludes bookings before compilation.
2. `drumStepEvents` (`drumSteps.js`) delegates to shared `seq/core.js` expression:
   probability, loop conditions/fill, velocity, ratchets, nudge, swing and flam.
   It preserves the hit's semantic drum index, optional classic track key,
   duration-in-steps, variation and carried parameter locks. Reuse this function
   with captured deterministic randomness/cycle/fill policy for a finite pass;
   do not build a second expression engine. Report finite first-pass limits.
3. `host.drum` prefers explicit track identity or `DRUM_TRACKS` for a classic
   `hitTrack`; its optional `params` reach that machine's per-hit implementation.
   Otherwise it calls `scheduleNote(drum,time,duration * stepSec,velocity,vary)`.
   Basic native/Wasm kits currently do not receive the remaining per-hit sound
   params. Timing/velocity expression is shared; do not newly reinterpret basic
   kit tune/decay/accent locks as if the legacy path already honored them.
   Report ignored capabilities honestly, or reject an unsupported request.
4. `percussionVoices.js` maps 14 append-only historical drum slots through a
   palette (Felt, Crisp, basic 808, Hand). Crisp maps kick/brush/hat to
   punch/snare/sizzle; existing mapped IDs normalize first. Wasm `voice_preset`
   applies that mapping and model at attack time, with current tone/decay and
   on/level state. `WasmDrumKit.scheduleNote` also checks the mapped kit's on
   state before incrementing its hit counter and booking.
5. Duration, variation, tone/decay, model and hit ID reach the existing Rust
   `Hit` contract. Hit ID affects deterministic noise/oscillator phase. Capture
   a deliberate private hit-number policy and its provenance; do not mutate
   the live kit's counter or claim continuous live-state equivalence on reset.

## Existing owned graph gap, measured

`legacy.percussion` currently prepares an owned Engine with unit levels/raw
palette mode. Its graph parameters are **gain, mute, soloExcluded, ghost**;
the graph ABI exposes **graph_hit / graph_percussion_stat**, not selected kit
configuration. Tone/decay/model can be encoded in individual raw hit events,
but there is no per-drum level preparation or palette authority. Supplying a
`config` object on this module is currently not interpreted by preparation;
it cannot be treated as a supported saved kit contract.

Reproduce with `node tools/auditAllPercussionSeam.mjs`. It compares current
legacy Wasm versus current owned graph, **48 kHz / 48,000 stereo frames**,
hit at frame **6,000**, different **113 / 509-frame** render partitions.
All graph clocks finish exactly, one event applied, no late/overflow/nonfinite.
Seven intentionally positive/negative comparisons are retained in
`reports/modular_audio/m4c-percussion-seam-audit.json`:

| Case | Exact source PCM | Meaning |
| --- | --- | --- |
| Raw default | yes | Existing kernel boundary stays correct |
| Fixed Felt at unity | yes | Neutral palette raw attack agrees |
| Crisp semantic kick sent as raw kick | no | Missing slot resolution changes sound |
| Crisp explicitly resolved punch | yes | Actual palette mapping restores raw equality |
| Hand semantic kick sent with default model | no | Wrong source model changes sound |
| Hand explicitly resolved model 2 | yes | Actual model restores raw equality |
| Felt per-drum level 0.25 passed as unsupported graph config | no | Legacy peak 0.137166 vs graph 0.546370 |

These are boundary experiments, not a complete All kit or listening acceptance.
The negative cases are expected missing capability, not a new legacy regression.
`node tools/auditPercussionOwned.mjs` also passes **27** existing exact stereo
PCM/golden comparisons across **44.1/48/96 kHz**, models 0/1/2, dense and reordered
events. **30 existing tests / five files (11.58 s)** pass: All drum expression
and lane identity, palette mapping, all-slot/model finite output, future-attack
remapping and classic per-hit behavior. No product code or generated asset
change, no native test executable/AC bypass, no new browser/build/device run.

## Route and lifetime contract for the next slice

- All already moves kit room into its external percussion rack and sets the
  source kit room to zero. `setupMixer` routes **role gain → percussion insert
  rack → mixer rack → wander → desk channel → shared headroom/master**. A private
  kit source should connect once at the host's explicit dry percussion role
  input before those external inserts/mixer controls. Its raw PCM must already
  include per-drum kit state; avoid duplicating room, fader, inserts or the
  private reference sum. Audit and require the dry-room invariant in its lease.
- Do not merely tap `WasmDrumKit.bus`: inherited `DrumKit.scheduleSleep`
  disconnects its output based on legacy `soundUntil`. Private test notes do
  not update that clock. A host-owned role input avoids depending on unrelated
  live-kit sleep/wake timers and does not keep the legacy source artificially
  awake. Existing source and keyboard/drum pads remain connected.
- A percussion lease captures actual instrument identity/source revision,
  ready/error/disposed state, voice/model and cloned sanitized per-drum kit
  state. Source, palette, kit or host edits stop the whole finite set. External
  mixer/FX controls remain live. Dispose only private routes/taps/gains; legacy
  pads and their own Stop/Panic retain their existing behavior.
- Transport already supports **source ID 6** for percussion, per-source PCM,
  actual kick bus and owner-specific events/statistics. Reuse these; general
  worker distribution is unnecessary. Existing All compiler/controller/UI /
  compact reports cap at five pitched roles and must be deliberately extended;
  do not silently drop a sixth report stem. No new sidechain route is required.
- Budget **notes * 2 + hits <= 4,000** under existing graph max 4,096, and retain
  finite 48 kHz / one progression / 120 s bounds. Recalculate the combined end
  from expanded hits plus source tail (existing percussion bound 8.1 s), include
  last partial blocks and zero-output terminal drain. No phantom note-offs for
  hits. All-muted/empty/effect-tail-only cases must remain explicit.

## Next bounded implementation

1. Add versioned **immutable preparation configuration** for an owned basic
   kit: sanitized 14 on/level/tone/decay entries and selected palette/model.
   Validate it in Rust and JS, expose an owned ABI/config authority, persist /
   reload it, preserve absent-config raw fixture behavior and reset semantics.
   Do not add new global mutable state. Keep the legacy singleton ABI unchanged.
2. Prove exact source PCM against the actual configured legacy Wasm kit:
   all palettes, mapped historical IDs, non-unit/disabled levels, tone/decay,
   swish duration, hat choke, deterministic hit IDs, reordered simultaneous
   hits, reset/save/reload and independent instances. Check no allocation or
   growth in prepared render. This foundation can proceed independently of
   pending phone pitched listening; it is not All integration acceptance.
3. Then add a **Wasm-kit-only** host lease and finite drum compiler using the
   actual All expression path, dry per-role input and source ID6. Expose honest
   native/classic exclusions, source signatures, events/hit counts, all-six
   stem reports, coherent Stop/invalidations, legacy pad coexistence and the
   current explicit worker/twelve option. Defaults remain unchanged.
4. Verify real browser silent full multi-source fixture first, then guarded
   audio and phone run-bound listening. Preserve the current pitched audition
   gate; no normal transport migration, fixture substitutions, latency chase,
   deployment or claim of native/classic equivalence.
