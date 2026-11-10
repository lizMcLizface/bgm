# Modular audio engine handoff

User workflow instruction (2026-11-09): **commit at the end of every completed
step, then continue**. This authorizes local commits of verified steps without
another confirmation. Keep the existing checkout and work; no push/deployment
is authorized. Record verification, limitations and the next task in each step.

**Current priority (2026-11-10):** the user accepts phone lookahead for listening
and wants other voices/full-path behavior first. Lower-startup-delay experiments
are deferred. [M4b finite pitched sets](MODULAR_AUDIO_ENGINE_M4B_PITCHED_SET.md)
now extend the explicit preview; read the latest checkpoint below. Native piano,
classics and percussion adapters/normal transport remain separate gates.
The [selected-patch test-note audition](MODULAR_AUDIO_ENGINE_M4B_VOICE_AUDITION.md)
now activates sparse voices without changing the song. Phone Lead/counter/Bass
delivery and listening are clean for this material; exact checkpoints follow.
[Owned basic-kit configuration](MODULAR_AUDIO_ENGINE_M4C_KIT_CONFIGURATION.md)
now passes configured legacy PCM/persistence/independence/allocation checks.
The [finite All kit integration](MODULAR_AUDIO_ENGINE_M4C_ALL_KITS.md) also
exists. Desktop six-source paths and phone Hand + three-core diagnostic
delivery/listening are clean; current captured-pattern playback is the next gate.

Prepared and implemented through the opt-in M4a finite All source preview on 2026-11-09. Read the working tree, this file and
[MODULAR_AUDIO_ENGINE_PLAN.md](MODULAR_AUDIO_ENGINE_PLAN.md) first. This is an
implementation handoff. **M0/M1, owned percussion/sidechain M2 and the actual
six-role M3a baseline, M3b owned FM, M3c owned core, M3d pitched DAG, M3e single-worker transport, M3f source pool, M3g buffering profiles, M3h queue-lead observability, M3i opt-in scheduling M3j packet-arrival/headroom diagnostics and M3k run-bound listening records now exist.** Read
[the M3 decision gate](MODULAR_AUDIO_ENGINE_M3_DECISION_GATE.md),
[M4a workbench source contracts and results](MODULAR_AUDIO_ENGINE_M4A_WORKBENCH_SOURCE.md),
[listening records and target-device evidence](MODULAR_AUDIO_ENGINE_M3K_LISTENING.md),
[arrival/headroom results](MODULAR_AUDIO_ENGINE_M3J_ARRIVAL_HEADROOM.md),
[opt-in scheduling results and negative experiment](MODULAR_AUDIO_ENGINE_M3I_TASK_PUMP.md),
[queue-lead contracts and results](MODULAR_AUDIO_ENGINE_M3H_QUEUE_LEAD.md),
[profile contracts and measurements](MODULAR_AUDIO_ENGINE_M3G_BUFFER_PROFILES.md),
[three-worker contracts and evidence](MODULAR_AUDIO_ENGINE_M3F_SOURCE_POOL.md),
[bounded worker contracts and evidence](MODULAR_AUDIO_ENGINE_M3E_WORKER.md),
[pitched DAG contracts and evidence](MODULAR_AUDIO_ENGINE_M3D_PITCHED_DAG.md),
[owned core contracts and evidence](MODULAR_AUDIO_ENGINE_M3C_OWNED_CORE.md),
[owned FM contracts and evidence](MODULAR_AUDIO_ENGINE_M3B_OWNED_FM.md) and
[M3a's measured baseline](MODULAR_AUDIO_ENGINE_M3A_BASELINE.md). Preserve
the completed workbench and all existing changes. The original assignment and
historical release notes below are retained; use the delivery checkpoint at the
end for current results and limits.

The user subsequently requested **commit then continue**. Completed work through
M3c was committed locally as **`bc4e35d`**, `Add owned modular audio foundations
and six-source harness`. The later request **commit and keep iterating** committed
M3d locally as **`fa634f5`**, `Integrate six owned sources into the Rust audio DAG`.
M3e was then committed locally as **`646183d`**, M3f as **`714ce43`**,
M3g as **`733c2e6`**, M3h as **`c8ff2bb`**, M3i as **`b358bd9`**, and M3j as **`7dea6bc`**. Each completed verified step
now ends with a local commit under the user's standing instruction; consult
the final checkpoint and local Git log. No push/deployment.
Earlier statements below about no commit describe their historical checkpoints.

The older checkpoints are historical. In particular, M2 rebuilds the percussion
legacy ABI after owned-state extraction and adds Wasm allocation instrumentation;
the M1 statements about unchanged binaries and unrun instrumentation describe
that earlier checkpoint only.

## Original assignment (M1 delivered; see checkpoint)

Start M0/M1: inspect current seams and baseline, define portable contracts, and
deliver a small working Rust graph with an opt-in AudioWorklet harness. Include
owned state, validation, timestamped events, LFO-to-VCA modulation, stereo
mix/output and a versioned save/reload fixture. Test output/timing and independent
instances, not only descriptors. Keep current page defaults/legacy DSP working.
Implement the vertical slice and leave a precise checkpoint, not another plan.

Next: one existing synth adapter plus sidechain (M2), then six actual instrument
engines with optional worker-pool rendering (M3), before broad migration. The
user approved this staged direction; no new deployment or complete algorithm
replacement was requested for this phase.

## Environment and repository checkpoint

- Workspace: `C:\dev\pianote\bgm`, Windows PowerShell. Use `npm.cmd`;
  `npm.ps1` is blocked by execution policy.
- At handoff: `main`, HEAD `58ff48dff30e7fb9800343653542e6a35dbcbe44`,
  `Build synth workbenches and parallel effects rig`.
- That release was already committed, pushed and deployed. Author/account:
  `lizMcLizface` (user writes `lizmclizface`), email
  `121907922+lizMcLizface@users.noreply.github.com`. Remote:
  `git@github.com:lizMcLizface/bgm.git`.
- Earlier `gh-pages` deployment: `c6f01c6cdb358a01b695ccafed3d987f6349e5be`.
  Effects page: `https://calmbgm.com/synths/effects/`.
- Before this write-up, only `docs/EFFECTS_DESK_PLAN.md` and
  `docs/SYNTHS_ALL_WORKBENCH_PLAN.md` were modified, with sidechain/port planning.
  This write-up adds the engine plan/handoff and cross-links the existing plans.
  Preserve all four. Recheck status; never discard newer changes based on this
  historical checkpoint.
- Local Rust tools: `.tmp/rust-tools`; existing build helpers configure
  Cargo/Rustup paths. Do not assume system `cargo` exists.
- No new commit/push/deploy is part of this handoff or the initial local engine
  milestone. Publish only when newly requested.

## Delivered work and limits

All workbench: working mixer/filter/EQ/master, generator sound editors and
replay/persistence, drum expression/locks, scale transposition, independent
movable/rotatable popups and compact physical controls.

Effects desk: 23 effects plus stereo Scope/Spectrum, DI-Poly with one draggable
enclosure, fixed 88-key keyboard, eight-strip mixer appearance, serial routing
and a fixed parallel rig. Default: Starmap Void, Dry muted, wet Dark shape-A
Z-plane/chorus/vibrato/delay, master delay/reverb. Seven sound buttons include
LFO Motion. MIDI permission-based reconnect, ribbon Setup dropdown and custom
modulation-matrix edits were fixed and verified.

Arbitrary cable routing/instances, general auxes, external sidechain, general
sample-accurate external modulation, unified Rust graph and multi-worker DSP
remain planned. Pedal limiter is not true-peak; desk limiter is stereo-linked
sample-peak with 3 ms lookahead.

## Code map

| Area | Start here |
| --- | --- |
| Device ports and sidechain acceptance | Top of `docs/EFFECTS_DESK_PLAN.md` |
| Original plan/history | `docs/SYNTHS_ALL_WORKBENCH_PLAN.md` |
| Rust | `synth-engine/src/lib.rs`, `synth-engine/{fm,classics,percussion,inserts,effects}/`, `synth-engine/common/` |
| Synth browser bridge | `public/synth-lab/processor.js`, related FM/percussion worklets, `src/synths/diy/live.js` |
| Effects wrappers | `src/synth-lab/inserts.js`, `effects.js`, `public/synth-lab/{inserts,effects}-processor.js` |
| Rack routing/state | `src/synths/effects/graph.js`, `workbenchRack.js`, `instances.js`, `driveStage.js`, accompanying tests |
| Mixer/persistence | `src/synths/all/mixerAudio.js`, `setupFile.js`, accompanying tests |
| External modulation | `src/seq/useModulation.js` (20 ms timer), `src/seq/mod.js`; internal Rust LFOs are separate |
| Ensemble experiments | `src/synth-lab/ensemblePlan.js`, `ensembleBackend.js`, `tools/ensemble-synth.html`, `tools/auditSynthEnsemble.mjs` |
| Profiling | `tools/profileSynth.mjs`, `profileWorklet.mjs`, `workletTraceSummary.mjs`, `auditWorkbenchInserts.mjs` |
| Build/cache provenance | `tools/buildSynth.mjs`, `buildClassics.mjs`, `public/synth-lab/*-build.json`, asset version manifests |

Use these as seams, not instructions to restructure everything. Current cores
have singleton mutable state/buffers: audit instance ownership and initialization
before sharing memory or running concurrent engines. Preserve legacy ABIs and
immutable table sharing when extracting reusable Rust APIs. Retain current
insert batching. New Rust sources/dependencies must be covered by source hashes
and appropriate rebuilt Wasm/cache manifests, including transitive inputs.
No new graph crate/harness source directory was created by this write-up;
its naming and exact location remain implementation choices.

## Decisions to preserve

- Contracts first, incremental Rust migration, host-side UI.
- One versioned patch authority; stable IDs independent of layout.
- Single-thread reference plus optional dependency-aware workers.
- Render-thread modulation; explicit target rates/units; saved knob bases.
- Sidechain as the first multi-input feature, before general cable UI.
- Six-engine benchmark uses real lead, second, rhythm, pad, bass and drums;
  synthetic-only results must be labeled.
- Workers require explicit scheduling/shared memory. Never block output waiting
  for them. Report buffering, latency, deadlines and non-isolated fallback.
- Verify cross-origin isolation/hosting. No automatic deployment change or
  service-worker workaround is authorized by the plan.
- Reject unsupported cycles initially. Feedback/polyphonic CV need explicit
  semantics. Do not expose nonfunctional ports.
- Sequencer proposal: eight assignable CV and eight gate/trigger outs; MIDI
  carries chords. Virtual CV does not imply electrical hardware output.

## Verification and working method

Last release checks, before these docs-only changes: **368 files / 2,654 tests
passed**, public production build passed, 16 curated banks verified, raw banks
and recordings excluded. Production browser verification passed. These are
historical results: rerun relevant checks after implementation and record the
new evidence. Old artifacts/logs are in `.tmp/workbench-*` and later feature
specific `.tmp/` files. Insert baseline: `.tmp/inserts-before-workbench.wasm`.

Existing commands to select according to changes:

```powershell
npm.cmd test -- <focused-test-paths>
npm.cmd run synth:check
npm.cmd run synths:check
npm.cmd run synth:build
npm.cmd test
npm.cmd run build:public
```

Use the repository's local Rust setup for native tests/new crates. New graph
tests should cover independent instance state, varied block sizes, sample-offset
events, deterministic modulation, channel mapping, invalid graphs, saved base
restoration, persistence and teardown. M2/M3 add actual key behavior, legacy PCM,
worker stalls, deadline/latency measurements and fallback. See the main plan.

Browser access failed initially in VS Code/plugin integration, then worked
through the app computer-use tools, including production verification. Do not
assume the old failure is still active. Read/apply the computer-use skill when
doing browser work and respect current tool restrictions. Existing audit scripts
may launch Puppeteer; their existence does not authorize bypassing browser
control restrictions. Report missing browser evidence explicitly while
continuing useful portable work.

This docs-only handoff passed local Markdown link checks and `git diff --check`.
No engine tests/build were run; implementation starts in the fresh session.

## Leave a checkpoint after implementation

Record changed APIs/files, completed milestone, exact tests/builds/artifacts,
measured versus unmeasured claims, compatibility risks, opt-in harness usage
and the next concrete task. Update this handoff and the plan. Preserve all user
edits; do not restart the workbench. Claim sidechain, speedups and cabling only
after each exists and is verified.

## M0/M1 delivery checkpoint — 2026-11-09

Implemented in place. No commit, push, deployment, legacy DSP rewrite or
workbench restart. The initial four planning documents and their changes were
preserved. See [the delivery record](MODULAR_AUDIO_ENGINE_PLAN.md#m0m1-delivery-2026-11-09)
and [M0 audit/API/lifecycle details](MODULAR_AUDIO_ENGINE_M0_AUDIT.md).

### Files and API

- `synth-engine/graph/`: dependency-free portable `Graph`, owned nodes/state,
  typed `Kind`/`Link`/`Event`/`Action`, descriptor generator, DAG schedule,
  bounded event queue, native PCM/ownership/validation and allocation tests.
- `public/modular-audio/`: `graph.wasm`, Rust-generated `contracts.json`,
  versioned fixture, checked host `ReferenceGraph`/save/load, opt-in worklet and
  `build.json`. Multiple handles in one Wasm instance work; refresh existing
  buffer views after preparing another handle, before render. Worklets isolate
  one owned graph per instance. Pointer ABI is trusted-host, not safe for
  arbitrary/stale pointers.
- `src/modular-audio/`: actual Wasm and worklet bridge regressions plus browser
  harness. `tools/modular-audio.html` is the explicit opt-in tool, included by
  Vite; existing pages never load it. `tools/buildModularAudio.mjs` hashes all
  Rust/TOML/lock inputs and runtime/transitive worklet assets. Contracts are
  read from compiled Wasm because native helper execution was blocked.
- `tools/renderModularAudio.mjs` produces a stereo WAV and float measurements.
  `package.json` adds graph commands and build checks; `.gitignore` excludes
  the new target directory. All legacy cores, worklets, manifests, caches,
  routing, default sounds and workbench setup formats remain unchanged.

The reference is two stereo deterministic tones, LFO → VCA, explicit two-input
stereo mix and output. Audio-input identities are retained until the processor;
only Mix sums. No detector port is advertised yet. Schedule dependencies include
modulation and expose levels for future worker work, without implementing a
scheduler. All current modules have zero latency/tails and no bypass.

Events use absolute graph-local samples and stable same-sample receive order.
Late events clamp/count; overflow rejects/counts. Gate release is owner matched;
cancel removes an owner's pending events and held gates. Pause freezes time;
reset clears phases/gates/events/stats but retains current bases/link enable
state. The host must remap AudioContext time after pause/reset. Persistence is
validated schema-1 restart/replay, not running voice/transport/tail snapshots.
New live edits must be recorded in the host patch before saving. Zero smoothing
is explicit; this is reference DSP, not a production synth voice/envelope.

### Exact verification and remaining gaps

- Final JS suite: **369 files / 2,664 tests passed** (109.60 s), including legacy
  synth PCM, effects, routing and persistence coverage. Log:
  `.tmp/modular-audio-suite-verified.log`. Final focused **10 passed**:
  `.tmp/modular-audio-focused-final.log`.
- Native reference **4 passed** after preserving input buses:
  `.tmp/modular-audio-native-reference.log`. Full native and counting-allocator
  runners are **blocked by Windows Application Control, error 4551**, not test
  failures and not passes. Logs: `.tmp/modular-audio-native.log` and
  `.tmp/modular-audio-native-allocation.log`. No policy/security bypass.
- `npm.cmd run graph:build`, `graph:check`, `graph:render` passed. Reference
  Wasm: **68,605 bytes**, rustc **1.99.1 (58cf8f9c3 2026-10-13)**, cache version
  **`9c0a7a88029f513c`**. Direct float outputs/PCM16 WAV:
  `.tmp/modular-audio-pcm.json`, `.tmp/modular-audio-reference.wav`.
- Final `npm.cmd run build:public` passed (59.66 s); legacy provenance checks,
  graph provenance and public-bank exclusions passed. Existing chunk-size
  advisory remains. Log: `.tmp/modular-audio-build-public-final.log`.
- Actual Chrome 157 AudioWorklet verification passed in dev and built public
  preview at **44.1/48/96 kHz**, 48,000 frames each. Direct-Wasm and reload PCM
  differences were **0**, events **7**, late/overflow **0**. Audio occupied
  frames **37–42022** exactly; an independent silent node remained exactly
  silent in the same context. Native/Wasm block-partition tests cover
  1/64/127/128/511/2048 and additional irregular sizes.
- Default 48 kHz offline peak **0.16797363758**, L/R RMS
  **0.05487677317 / 0.05482676268**. Live AudioContext output at 48 kHz showed
  peaks **0.16130538 / 0.16797364** over 80 analyser polls; 7 events applied,
  no late/overflow. Reported base/output latency **10/40 ms**; no physical
  loopback, direct listening, deadline/jitter distribution or long-run claim.
- Browser Save/reload restored an edited **277 Hz** base stopped, and its
  rendered replay matched at all three rates. Default 220 Hz fixture restored
  afterwards. Only the new reference storage key was touched.
- The built existing effects desk retained Starmap Void/Dark/muted Dry and
  its wet/master routing. Legacy Chord audition drove the scope to
  **L −17.7 / R −17.3 dBFS**, correlation **0.34**. Audio was stopped and the
  audition cleared without changing sound/layout controls. Browser measurements
  are recorded in `.tmp/modular-audio-browser-observed.json`.
- Dev and preview report **non-isolated**, with no COOP/COEP/CORP headers. A
  local production HEAD request failed; actual production isolation remains
  unverified. No shared memory/workers or hosting changes were attempted.
- M0 finds no existing actual six-role performance fixture: ensemblePlan is
  2/4/8 subtractive/FM. Its source is a seam, not the six-engine benchmark.
  Actual mixed-engine timing/costs, worker deadlines/fallback and speedups remain
  unmeasured. Machine/legacy binary hashes: `.tmp/modular-audio-baseline.json`.

### Run locally and continue

```powershell
npm.cmd run graph:check
npm.cmd test -- src/modular-audio/reference.test.js
npm.cmd run graph:render
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/tools/modular-audio.html`; Verify checks offline PCM,
Play measures actual stereo output, Save/Load persists the editable patch.
Reload is stopped. The final public preview was served on port 4174 from
`dist-public`; it was not deployed. `graph:test` attempts all native tests and
currently encounters the OS restriction; the audit gives the separate local
Cargo command that successfully ran the four reference tests.

**Next concrete task is M2:** extract one actual Rust synth with owned DSP and
unchanged legacy ABI/PCM, then add its declared audio-rate modulation target
and a stereo-linked compressor with separate program/key input plus a real
post-mute/pre-solo/pre-fader kick tap. Test anti-phase/absent/silent key behavior,
envelope timing, latency-aligned dry blend, mute/solo/fader semantics, ownership,
repatch, persistence and legacy PCM. Start with selectors, not cable UI.
Percussion's owned Engine is a small candidate; DI-Poly requires colour and
additive-table extraction too. Capture the six actual engine fixture/costs
before M3. No worker or sidechain capability is claimed by M1.

## M2 delivery checkpoint — 2026-11-09

Continued without changing Application Control or executing blocked helpers.
**M2 now works as an opt-in owned-percussion / kick-sidechain slice.** Existing
workbench audio remains authoritative. No commit, push or deployment. See
[the M2 plan record](MODULAR_AUDIO_ENGINE_PLAN.md#m2-delivery-and-application-control-mitigation-2026-11-09)
for complete contracts and measurements. This checkpoint supersedes M1's old
sidechain/allocator limitations and unchanged-percussion-binary statement.

### Files and processing API

- `synth-engine/percussion/src/engine.rs` exposes owned `Engine`/`Hit`, including
  tables/noise, voices, queue, serials and output/kick residuals. `src/abi.rs`
  preserves original exports/buffer layout under default feature `legacy-abi`.
  The graph dependency disables that feature; graph Wasm has no legacy singleton
  exports. Sample-rate sanitization remains compatible; no algorithm replacement.
- `legacy.percussion` version 1 implements timestamped semantic hits, separate
  program/kick buses and an audio-rate output-gain target for the graph LFO.
  The true kick-only tap is post source-mute, pre solo exclusion/output gain;
  Ghost explicitly makes it pre-mute. Existing desk controls are not migrated.
  Receive-order serials are reserved at booking, preserving legacy voice
  stealing with out-of-order future times. Cancel fades owned voices over
  20 ms; reset clears state without reconstructing tables.
- `graph.compressor` version 1 implements separate program/detector buses,
  Internal/External/Auto from connection state, safe missing-key release,
  max-absolute stereo detection and one L/R gain. Threshold, ratio, soft knee,
  attack/release, output, blend, HP and bypass work, with real input/key/output
  peaks, wet reduction and missing/external flags. Output/blend/bypass edits
  smooth over 5 ms. Lookahead/latency are **0**; dry/bypass use the same sample.
- New ABI/host calls: source-bus-aware `graph_audio_port`, `graph_hit`,
  `graph_detector_connection`, detector-edge events and `graph_meter`. Existing
  ABI calls remain. Disabled detector edges remain dependencies/cycle-checked.
  Timestamped enable/disable retains DSP state; arbitrary source/topology edits
  stop/reprepare rather than claim hot state/tail transfer.
- `sidechain-patch.json` persists hits, source modulation, compressor settings,
  key route and automation. The harness adds M2 and key/source selectors; M1
  remains the fresh default. Canonical host code is now
  `src/modular-audio/runtime.js`, copied/checked into public by graph build.
  This fixes the dev public-directory import stall observed during QA.
- Legacy percussion Wasm/manifest/cache were rebuilt. Build helpers now cover
  extracted/transitive percussion inputs, both fixtures and canonical runtime
  drift. Other legacy DSP/routing/defaults remain unchanged.

### Application Control mitigation and final checks

Native execution stays restricted. Feature `allocation-audit` compiles a Rust
counting allocator and compressor probes into an audit-only Wasm under
`.tmp/graph-allocation-target`. They are absent from the public Wasm. This is
Wasm evidence, **not** native executable test execution.

```powershell
npm.cmd run graph:audit-alloc
npm.cmd run graph:audit-compressor
npm.cmd run graph:audit-legacy
```

- **Six allocation audits passed:** M1/M2 × 44.1/48/96 kHz, including live hit
  enqueue, rendering, cancellation and reset: **0 allocation/reclamation calls,
  0 memory growth** after preparation. M1 memory 1,310,720 bytes; M2 2,686,976
  at 44.1/48 kHz, 3,080,192 at 96 kHz. This counts Rust, not JS/browser allocation.
  `.tmp/modular-audio-allocation-wasm.json`.
- **27 exact stereo-float comparisons** against original Wasm across all models,
  drums, three rates, dense stealing and reordered future bookings. Both legacy
  ABI and graph adapter match. Goldens:
  `src/modular-audio/percussionLegacyPcm.json`; report:
  `.tmp/modular-audio-m2-legacy-pcm.json`; preserved original:
  `.tmp/percussion-before-m2.wasm`. Do not regenerate goldens to hide a mismatch.
- Independent anti-phase/envelope/knee/HP/dry/bypass equations passed at three
  rates. At 48 kHz: attack after 240 frames **9.481838 dB**, expected **9.481808**;
  missing-key release over 4,800 frames **3.488067 dB**, expected **3.488173**.
  Anti-phase key: approximately **15 dB**; knee at threshold: **1.125 dB**.
  `.tmp/modular-audio-m2-compressor.json`.
- **370 files / 2,676 tests passed** (111.02 s), log
  `.tmp/modular-audio-m2-suite-verified.log`; focused **22 passed**, log
  `.tmp/modular-audio-m2-focused-final.log`. Native `cargo check --offline
  --tests --manifest-path synth-engine/graph/Cargo.toml` passed using local Rust
  (`.tmp/modular-audio-m2-native-check.log`). Native test executables were not
  rerun or claimed passed; `graph:test` still attempts that blocked route.
- Public build passed (59.52 s), provenance and all 16 public-bank checks passed;
  existing chunk advisory remains. `.tmp/modular-audio-m2-build-verified.log`.
  Graph **119,891 bytes**, version **`bc2415256b648fc6`**; legacy percussion
  **92,363 bytes**. Same rustc **1.99.1 (58cf8f9c3 2026-10-13)**.
- Chrome 157 actual M2 worklets passed in dev and final public preview at all
  three rates: direct-Wasm/reloaded PCM differences **0**, 7 events, late/
  overflow **0**, independent silent node peak **0**. Default 48 kHz peak
  **0.14000000060**, RMS L/R **0.04447046852 / 0.04480246336**. First audio
  frame **37**; kick tails continue through the 48,000-frame window.
- External + Disconnected saved/reloaded stopped with selectors intact;
  three-rate replay was exact with **missingKey=1**, **reduction=0**, 5 applied
  events, no late/overflow. Default M2 was reloaded for live output checking.
  Dev/preview are non-isolated; production isolation remains unverified.
- Final live M2 playback at 48 kHz produced observed L/R peaks
  **0.14000000060 / 0.14000000060** over **80** analyser polls, 7 applied events,
  0 late/overflow, reported base/output latency **10/40 ms**. Graph reached frame
  **74,880** before disposal; residual wet reduction was **0.01792076 dB**.
  This is output-path evidence, not device loopback. The original M1 fixture
  was saved again as the reload default; M2 was left loaded/stopped for review.
  Browser observations: `.tmp/modular-audio-m2-browser-observed.json`.
- `npm.cmd run graph:render -- --sidechain` writes a two-second 48 kHz stereo
  PCM16 listening artifact `.tmp/modular-audio-sidechain.wav` and float
  measurements `.tmp/modular-audio-sidechain-pcm.json` (96,000 frames/rate).
  Regression/Worklet comparisons use float buffers, not the encoded WAV.

### Review and next task

Verified local public preview:
`http://127.0.0.1:4175/tools/modular-audio.html`; dev is on port 5175. Choose
**Percussion / sidechain**, then Verify or Play. Source selectors hold their
chosen connection for the run, replacing demo connection automation for that
edge. JSON editing is a fixture tool, not a general graph/cable editor.

Limits: no external Web Audio program/key inputs, pitched adapter/sustain,
arbitrary hot source/topology replacement, lookahead, latency compensation,
existing desk integration, worker pool or actual six-engine performance evidence.
The program remains a reference tone; the key/drum engine is actual legacy DSP.
No direct-listening, physical loopback, sustained UI-load deadline or headroom
claim. All changes remain uncommitted and local.

**Next concrete task: M3a.** Version the actual lead/second/rhythm/pad/bass/drum
workload: real sources, patches, seeds, polyphony, local/master effects and key
routing. Measure current routing, then extract remaining owned adapters with
legacy PCM comparisons. Only then add bounded optional workers and measure
sound, added latency, deadlines, stalls and non-isolated fallback. Broad desk
and cable migration remains later.

### User phone listening report — 2026-11-09

The user can currently access the work remotely only on their phone. Through
Bluetooth headphones, the reference harness seems to work somewhat, but the
beginning/end sound cut off or crackly. The latest effects page worked without
issue on that same phone. This is user-reported listening evidence; phone model,
browser, access path and exact tested asset versions were not established.
It does not establish Bluetooth as the cause or show a sustained DSP underrun.

Defer investigation for now, per the user's priority. The harness has abrupt
reference gates and a short timed AudioContext shutdown, so audition boundaries
are plausible contributors; cause remains unverified. At a later audition/
lifecycle pass, compare longer playback and gentle host start/stop fades with
the current fixture, distinguishing source-gate/tail/context boundaries from
device/transport behavior. Preserve deterministic core timing and the clean
legacy effects path. No audio code or security/network settings changed for
this report. At that checkpoint the next task was M3a; its delivery follows.

## M3a delivery checkpoint — 2026-11-09

The [M3a baseline](MODULAR_AUDIO_ENGINE_M3A_BASELINE.md) is the current detailed
measurement record. It supersedes older statements that external host I/O and
the actual six-role fixture do not exist. M3's owned pitched adapters and worker
execution are still unfinished. No workbench restart, commit, push, deployment,
security-setting change or Application Control bypass occurred.

### Implemented seams and files

- Rust `synth-engine/graph`: `host.audio` v1, stereo output, no parameters/events;
  `graph_input_ptr` exposes only its prepared input buffer. `graph_kick_ptr`
  exposes the existing owned percussion kick buffer. Host input is consumed
  once, finite-sanitized and cleared; pause/reset clear it too. The canonical
  `src/modular-audio/runtime.js` refreshes preallocated `inputs` / `kicks` views.
- `public/modular-audio/ensemble-bridge-processor.js`: percussion program +
  actual kick stereo outputs, or external program/key inputs into the Rust
  compressor. Uses actual block/final-partial lengths and finite end frame;
  disposal/reclamation occurs through the control path. Key connection state
  remains an explicit validated detector edge. No silence-based inference.
- `src/modular-audio/sixRoleFixture.js` and generated public fixture pin actual
  lead/second/rhythm/pad/bass/drums, score/initialization seeds, note/hit/control/
  transition events, capacity, trims, local/master effects and key policy.
  Version 1, `six-role-reference-v1`, SHA256
  `77ce180861239426c0c63037235cf98d74a2bbfa09a2a46ee3da3353bb29a7df`.
- `sixRoleKernels.js` directly drives current scalar legacy kernels and local
  inserts; `sixRoleBrowser.js` uses actual existing processors, local inserts,
  desk mixer, shared FX and limiter. Current / bridge / keyed are serial
  variants; keyed routes the actual kick before shared master FX.
- `sixRoleHarness.js` and `tools/modular-ensemble.html`: selected/all-rate
  measurement, finite live synthesis, download, separate pinned-fixture store
  `bgm.modular-ensemble.fixture.v1`. Starts stopped; save stops audio; changed v1
  JSON is refused. Original `tools/modular-audio.html` links to the new tool.
  Vite dev and public-build entries exist; production initialization was tested.
- `tools/buildSixRoleFixture.mjs`, `tools/measureSixRoleKernels.mjs` and
  `src/modular-audio/sixRole.test.js` provide fixture checks, reproducible native
  Node/Wasm timing, and actual source/bridge verification. Build scripts run
  `ensemble:check`. Graph provenance includes fixture and both worklets.
- `legacyPatchTransition.js` is a generated local copy of the authoritative
  `public/synth-lab/patch-transition.js`, which is unchanged. `graph:build`
  copies and `graph:check` checks it; importing the public JS from Vite source
  fails, so preserve this arrangement. No legacy DSP algorithms changed here.

### Exact verification record

- **371 test files / 2,684 tests passed**, 108.68 s;
  `.tmp/modular-audio-m3a-suite.log`. Focused reference + sidechain + six-role:
  **30 passed**. New tests cover fixture/save, three-rate gates/frames, all six
  real outputs, exact legacy drum main and actual kick, single-use host input,
  nonfinite/anti-phase/pause, partial final quantum and bridge disposal.
- Public build passed in **32.07 s**, public exclusions and 16 banks passed;
  `.tmp/modular-audio-m3a-build.log`. Existing large-chunk advisory remains.
- Native `cargo check --offline --tests` passed using `.tmp/rust-tools`;
  `.tmp/modular-audio-m3a-native-check.log`. Native test execution remains
  blocked by Application Control error 4551 and is not claimed passed.
- **Nine Wasm allocation audits** at 44.1/48/96 kHz, original/M2/external-host
  input: zero allocator/reclamation calls or growth after preparation. External
  host graph memory **1,245,184 bytes**. Independent compressor equations still
  pass. `.tmp/modular-audio-m3a-alloc-compressor.log`,
  `.tmp/modular-audio-allocation-wasm.json`. Scope excludes JS/browser allocation.
- Final graph **120,773 bytes**, version **`394279c8033e0aaa`**; rustc 1.99.1
  (58cf8f9c3 2026-10-13). Existing legacy binary provenance remains checked.
- Durable direct-kernel report:
  `reports/modular_audio/six-role-kernel-baseline.json`. Node v24.18.0, Windows
  10.0.26200, Ryzen 3950X/32 logical CPUs; full-score warmup + 3 repeats/rate.
  Deterministic source PCM; zero late/drop; second/FM has 14 intentional
  capacity/release voice steals, all others 0. Detailed timing, memory and
  declared latency are in the baseline. FM quality 1 has **7.5 frames** latency;
  do not silently replace or align it during extraction.
- Durable actual browser matrix:
  `reports/modular_audio/six-role-browser-baseline.json`. Chrome 157,
  non-isolated, **27 measured full-route runs**, three rates × three variants ×
  three repeats, plus 9 warmups. Six post-local-insert source stems exactly
  match direct legacy Wasm in every first measured case; repeat stem hashes
  match. Full native mixer/master output is not bit stable: explicit tolerance
  **1e-6**, measured current/bridge max **4.470348358154297e-8**, repeat max
  **5.960464477539063e-8**. Preserve exact source comparisons independently.
- Full-route 48 kHz offline medians: **4101.8 / 4182.9 / 4407.6 ms** for
  current / bridge / keyed, 17.5 s audio each. Last half-second RMS 0/0 at all
  rates. Original percussion lacks offline final stats (`missingSourceStats`
  explicitly says so); direct source/PCM checks cover it. Owned bridge supplies
  stats. No late/drop/overflow reported by available source counters.
- Final public preview saved fixture, reloaded page, loaded stopped, then
  passed one 48 kHz keyed measurement after warmup: all six stems exact,
  render **4397.5 ms**, peak **.1614825278520584**, zero tail RMS, 57 drum events,
  all source stats present and no reported late/drop/overflow.
- Live production keyed 48 kHz:
  `reports/modular_audio/six-role-live-production.json`. All six role peaks
  nonzero; master peak **.1265905350446701**, **178** analyser polls, base/output
  latency **10/40 ms**, 57 applied drum events, no reported late/drop/overflow.
  Finite playback stopped. This is output-path evidence, not physical loopback
  or direct listening. Browser report downloads succeeded but the automation's
  download-path wait was unexpectedly very slow even with a timeout; do not
  treat that delay as audio render time.

Commands (PowerShell; retain `npm.cmd`):

```powershell
npm.cmd run ensemble:check
npm.cmd run graph:check
npm.cmd run ensemble:baseline -- --repeats=3
npm.cmd run graph:audit-compressor
npm.cmd test -- --run
npm.cmd run build:public
```

Native timing is direct serial source/local-insert elapsed block time, not
pure CPU or full callback cost. Browser timing is full offline route wall time,
not a real-time deadline measurement. The reports include hashes and scope;
do not compare unlike figures. At 96 kHz the direct-source runs exceeded the
128-frame audio duration on **6 / 1 / 3** offline blocks; these are not measured
device underruns. Three repeats do not characterize reliable p95/p99 tails.

### Review and next task

Current production preview:
`http://127.0.0.1:4176/tools/modular-ensemble.html` (left stopped, Keyed/48 kHz).
Dev is on port 5176. The original modular harness has a link to it, so remote
phone access can follow the same host's `/tools/modular-ensemble.html` path.
No network settings or hosting were changed. Production isolation remains
unverified; dev and preview are non-isolated. The phone/Bluetooth report above
is still deferred, not resolved by desktop analyser results.

**Next concrete task: M3b, owned FM extraction first**, since FM is the largest
measured source cost and supplies second/bass. Read the working tree and M3a
baseline, preserve original legacy ABI/binary reference, separate owned state
and helper statics, retain quality 1 and 7.5-frame latency, and compare actual
fixture plus dense stealing/sustain/pressure/transitions at three rates. Verify
independent instances and zero render allocation using the safe Wasm audit
route while native execution is blocked. Then extract subtractive/core for
lead/rhythm/pad and retain contiguous insert batching. Only after six owned
branches match should bounded optional workers be implemented and evaluated
for actual stalls/deadlines, added latency, capability/hosting and serial
fallback. Do not begin broad workbench/cable migration in that task.

### M3a navigation correction — 2026-11-09

The user reported no M3/six-role link at the existing preview URL
`http://127.0.0.1:4175/tools/modular-audio.html`. The source HTML contained the
link, but the built `dist-public` harness did not. The previous assertion that
the served original harness exposed it was not verified and was incorrect.
Rebuilt the public output after making navigation a prominent **M3a · Six-role
audio baseline** link. `tools/checkPublicBuild.mjs` now requires both harness
pages and the built navigation link. Public build passed in 35.78 s, with the
existing chunk advisory; log `.tmp/modular-audio-m3a-navigation-build.log`.
Verified the actual 4175 URL in the browser, followed the link on that same
port, and observed all six roles loaded with **Pinned six-role fixture ready.
Playback stopped.** Screenshot: `.tmp/modular-audio-m3a-navigation.png`.
Direct URL: `http://127.0.0.1:4175/tools/modular-ensemble.html`.
No DSP changed and no measurement reports were regenerated for this correction.

### M3a user listening follow-up — 2026-11-09

After the navigation correction, the user reports that the six-role page works
fine with the page open, but crackles when "locked up" (understood here as the
phone being locked). This adds user listening confirmation for foreground
playback. Exact device/browser, selected variant/rate and output transport for
this follow-up were not specified. Screen-lock/background behavior remains a
separate deferred playback investigation; its cause and avoidability are not
established. Do not treat it as a measured core DSP underrun or assume it is
inevitable. No code, defaults or security settings changed for this report.
M3b owned FM extraction remains the next implementation task.

## M3b delivery checkpoint — 2026-11-09

Read [owned FM contracts/evidence](MODULAR_AUDIO_ENGINE_M3B_OWNED_FM.md) for the
current implementation. M3b extracts actual FM DSP ownership and adds an opt-in
paired worklet. It does not complete M3 or replace the existing desk.

### Files and API boundary

- `synth-engine/fm/src/engine.rs`: original algorithm now in public owned
  `Engine`, with fixed voices/events/output and owned helpers, table, RNG,
  reconstruction/filter/headroom/DC state. `prepared(sr)` prepares it off the
  callback. The optional SIMD counter belongs to each engine.
- `src/abi.rs`: original singleton exports behind default `legacy-abi`.
  `Cargo.toml` supports rlib plus cdylib. `simd_operators.rs` gates the optional
  bank's globals with `legacy-abi`; default feature builds retain the bank.
- Graph dependency: FM defaults disabled, coefficient caching explicitly on.
  `synth-engine/graph/src/fm_abi.rs` exports `fm_owned_*` create/init/free,
  patch setters, event, render/output/stat, panic and frame assignment. Graph
  Wasm contains no legacy `fm_init`. Opaque handles are trusted pointers with
  serialized access and off-callback free. No stale-pointer safety is claimed.
- `src/modular-audio/ownedFm.js`: canonical version-1 host contract for packet,
  performance, safe-integer timestamped events and bounded patch transitions;
  finite f32 values/indices/IDs/kinds/value bounds and queue capacity validate
  before preparation. Reserve one initial performance event and one per edit.
  Save/load validates; reset reuses the owner and restores the original spec.
  Panic clears the instance and its pending transition, not another owner.
- `public/modular-audio/owned-fm-processor.js`: two owned engines, one Wasm
  instance, two stereo outputs. Prepare both, then refresh all buffer views.
  Actual final partial block is clipped at the declared end frame. Stats name
  both roles and identify shared memory, rather than counting it twice.
- `sixRoleBrowser.js`: new `owned-fm` variant substitutes second/bass, retaining
  actual percussion/kick/compressor, local inserts, mixer, shared FX and final
  limiter. Source output-port selection is explicit. Worklet stats requests
  track their roles instead of inferring percussion from output count.
- Six-role HTML/harness: **Owned FM pair + kick key · M3b**, plus **Compare owned
  FM · all rates** (keyed legacy FM versus owned pair, with selected repeat
  count). Current remains the fresh-page default. The original harness's link
  now explicitly names M3a/M3b; continue using the user's port **4175**.
- `buildModularAudio.mjs` copies/checks owned host/transition helpers and hashes
  both new FM assets and transitive FM/common Rust. `buildSynth.mjs` hashes the
  extracted source files for all FM feature builds. `buildSynthProfile.mjs`
  explicitly retains the legacy ABI for its uncached reference build.

Owned FM remains a block-oriented instrument adapter alongside the reference
graph ABI, not a new `Graph::Kind` pitched node. The sample-oriented DAG needs
a deliberate block-capable seam and note-owner cancellation contract. Do not
hide that distinction, render the full FM block per sample, or claim six owned
DAG branches/workers already exist. FM's current internal events and whole-
instance reset/panic are supported; arbitrary hot topology/voice migration is not.

### Exact checks and retained evidence

- Before extraction, preserved scalar/SIMD/bank/fast Wasm/manifests under
  `.tmp/fm-before-m3b/`. Original scalar SHA256:
  `e6f3a72f6977be2df3e5cc4b005c78aad2ae7269eda1be005170b1762389f57e`.
- **57 exact original/rebuilt/owned float comparisons** at three rates:
  `npm.cmd run graph:audit-fm`,
  `reports/modular_audio/fm-owned-compatibility.json`. Covers all 11 recipes,
  additional quality 0/2 cases, reordered dense stealing, sustain, pressure,
  retune, mono/legato/glide, structural quality/patch transition, full actual
  second/bass, irregular 128/37/203/1/127 blocks and final partials. Versioned
  original hashes: `src/modular-audio/fmLegacyPcm.json`; existing hashes are
  checked, never silently regenerated. Original DSP is the preserved binary.
- Actual second/bass retain quality-1 **7.5-frame** latency. Second: 14
  intentional capacity/release steals; bass: 0. Both late/drop 0 at all rates.
  Quality-2 transition retains **7.75-frame** latency. No alignment change.
- **Twelve Wasm allocation audits** pass: previous nine plus two shared-memory
  FM handles at three rates. No Rust allocation/reclamation or growth during
  enqueue/render/panic/reset/replay. Paired memory **1,507,328 bytes** each rate.
  Durable report `reports/modular_audio/m3b-allocation.json`; log
  `.tmp/modular-audio-m3b-allocation.log`. Compressor equation audits also pass.
  This instrumentation does not count JS/browser allocation.
- Scalar/SIMD/bank/fast export sets match original names/kinds exactly,
  respectively 14/15/30/30 entries:
  `reports/modular_audio/fm-legacy-exports.json`. Rebuilt scalar FM is
  **265,096 bytes**. Existing SIMD/bank correctness/lifecycle tests remain active.
- **372 files / 2,690 tests passed**, 109.49 s:
  `.tmp/modular-audio-m3b-suite-verified.log`. New owned-FM tests cover original
  PCM, shared-instance reset/panic/free isolation, versioned spec roundtrip and
  rejection/resource reservation, first-event silence, actual paired worklet
  partial final output and disposal. Initial full run had three stale
  source-inventory/named-artifact provenance failures; updated the inventory
  and rebuilt `.tmp/dsp-simd` / `.tmp/fm-bank` diagnostic artifacts with their
  existing tools. Checks were retained. Initial log:
  `.tmp/modular-audio-m3b-suite.log`; diagnostic build logs:
  `.tmp/modular-audio-m3b-named-{simd,bank}.log`.
- Public build passed **31.58 s**, curated-bank/exclusion checks passed;
  `.tmp/modular-audio-m3b-build.log`. Existing chunk advisory remains. Native
  cargo check passed (`.tmp/modular-audio-m3b-native-check.log`); native test
  executable execution remains blocked by Application Control, not passed or
  bypassed. Graph **163,099 bytes**, version **`52ec483d8de9ec1c`**.

### Next task

**Owned subtractive/core extraction (M3c)** for lead/rhythm/pad, retaining scalar
legacy ABI and preserved original PCM, note behavior, expression/colour/tails
and optional feature paths. Audit all helper mutable state and verify multiple
owners sharing one Wasm instance. Retain same-instance reset/panic and zero
render allocation; keep inserts batched. Then add block-capable pitched DAG
nodes with prepared patch configuration, explicit note ownership/cancellation
and accurate latency metadata. Only after all six owned branches match should
bounded optional workers be implemented and measured for stalls/deadlines,
added latency, capability/hosting and serial fallback. No broad workbench/cable
migration, commit, push, deployment or screen-lock investigation was performed.

### M3b final browser and reload results

Verified the actual existing **4175** public preview, not just source HTML:
`http://127.0.0.1:4175/tools/modular-ensemble.html`. M3b is available under
Variant; the page also has **Compare owned FM · all rates**. Current remains
the fresh-page default. Final tab is left **Owned FM pair + kick key / 48 kHz,
stopped** for review.

- **18 measured actual browser renders**, keyed legacy versus owned FM,
  44.1/48/96 kHz × 3 repeats, plus 6 warmups. All six stems match direct legacy
  Wasm exactly in each first case; repeated hashes and keyed/owned stems agree.
  Full-mix explicit tolerance remains 1e-6; actual maximum keyed/owned and
  repeat difference **2.9802322387695312e-8**. Report:
  `reports/modular_audio/m3b-browser-fm-comparison.json`. Chrome 157,
  non-isolated, pinned fixture/hash unchanged, graph version `52ec483d8de9ec1c`.
- Keyed / owned full-route median render ms for 17.5 s audio:
  44.1 kHz **4360.9 / 4383.6**; 48 kHz **4720.4 / 4773.9**;
  96 kHz **9433.5 / 9578.2**. No speedup was demonstrated. Same-session offline
  wall times include capture/stats, not callback CPU, device underruns or
  worker deadlines. Three repeats and uncontrolled background load limit
  conclusions. Source/hash verification follows timed rendering and briefly
  occupied the UI enough to time out one read at 96 kHz; the same run completed.
- All measured tails' final half-second RMS 0/0, finite output, all source stats
  present, no reported late/drop/overflow. Owned FM frames stop at the exact
  end; legacy source stats can include the padded last quantum while captured
  PCM uses the requested duration. Paired shared memory is counted once.
- Saved the pinned fixture, reloaded page, restored **stopped**, selected M3b,
  then ran finite live synthesis. Raw report:
  `reports/modular_audio/m3b-live-production.json`. Actual 48 kHz, **178**
  analyser polls, master peak **.1265905201435089**, all six role peaks nonzero,
  both FM owners at **840,000 frames**, 14/0 steals, 7.5-frame latency, no
  reported late/drop; 57 drum events and no overflow. Reported base/output
  latency **10/40 ms**. Finite playback stopped. Sampled output-path evidence,
  not direct listening/physical loopback or a locked-phone test. Screenshot:
  `.tmp/modular-audio-m3b-browser.png`.

No old M3a measurements were overwritten. Reports were read from the actual
visible DOM and saved directly, avoiding the earlier slow download-path wait.
Next remains M3c owned core, then block-capable pitched DAG integration; the
phone screen-lock crackling report is still deferred.

## M3c delivery checkpoint — 2026-11-09

Current detailed record: [owned core contracts/evidence](MODULAR_AUDIO_ENGINE_M3C_OWNED_CORE.md).
The original scalar and optional SIMD core now have per-engine mutable state.
All six actual source engines can coexist in one Wasm memory without sharing
voices, notes, expression/colour state, RNG, outputs or lifecycle state.
This completes owned source extraction, not pitched DAG scheduling or workers.

### Implementation boundary

- `synth-engine/src/engine.rs`: original algorithm, public owned `Engine`, with
  colour state and output buffers moved in from helper globals. The optional
  SIMD path uses the same owned fields; its frame counter is per engine.
- `synth-engine/src/tables.rs`: additive tables use safely prepared `OnceLock`
  read-only storage, with original accumulation/interpolation/normalization
  order. **786,816 bytes** once per Wasm instance/native process, retained for
  that lifetime. Render only calls `get()`, never initialization or allocation.
- `src/abi.rs` / root Cargo: rlib plus cdylib, default `legacy-abi` retains the
  original singleton and probe exports. Probe output buffers now belong to
  the compatibility engine. Scalar and acoustic/SIMD exports are preserved.
- Graph links root core with defaults disabled, matching the existing uncached
  scalar path. `graph/src/core_abi.rs`: serialized trusted `core_owned_*`
  handles for prepare/init/free, patch/event/render/output/stat, panic/frame.
  No legacy `engine_*` or probe singleton exports enter the owned graph binary.
  Refresh every owner's output views after the final preparation can grow
  memory. Prepare/free off process; stale raw pointers remain invalid.
- `src/modular-audio/ownedCore.js`: canonical versioned parameter-triple /
  performance / safe-integer event / transition contract, queue reservation,
  finite-f32/index/ID/bounds/duplicate validation, save/load/reset/panic.
  Original `PatchTransition` core interpolation/performance semantics remain.
- `owned-core-processor.js`: one Wasm instance, three independent owners and
  three stereo outputs, exact final partial quantum and named shared-memory
  stats. The audition's FM pair and owned drums remain separate worklets/
  instances. No extra buffered quantum or automatic latency alignment added.
- Six-role page: **All six owned + kick key · M3c**, **Compare all owned · all
  rates** (keyed legacy versus all-owned, selected repeats). Same user port
  **4175**, same pinned fixture/hash, existing inserts/mixer/shared FX/limiter.
  Current stays the fresh-page default; all older variants remain available.
- Builder and source-inventory checks now include extracted engine/ABI/tables
  and copied/versioned host/worklet; no provenance checks were disabled.

The owned core/FM handles are still block-oriented adapters alongside the
graph ABI, not pitched `Graph::Kind` nodes. Today's DAG is sample-oriented.
Do not treat the all-six shared-memory host test as a DAG schedule, infer a
worker speedup, or invoke a full engine block once per sample.

### Verification and artifacts

- Preserved originals under `.tmp/core-before-m3c/` (scalar/acoustic binaries
  and manifests, existing named SIMD). Scalar original SHA256
  `8e781dcb70d35ae5ce7d0208c5388828c1058b0134fdb9a7f5826a55d02e74e4`.
- **75 exact original/rebuilt/owned core PCM comparisons**, three rates, all
  twelve recipes, six additive shapes, reordered dense stealing, sustain,
  pressure, retune, mono/legato/glide, structural oscillator/patch transition,
  full actual lead/rhythm/pad and irregular/final partial blocks. Original DSP
  is the preserved binary. Goldens: `src/modular-audio/coreLegacyPcm.json`;
  report `reports/modular_audio/core-owned-compatibility.json`; command
  `npm.cmd run graph:audit-core`. Existing goldens are checked, not overwritten.
- **57 FM comparisons** also pass in the new graph; report
  `reports/modular_audio/m3c-fm-compatibility.json`. The old M3b report is
  retained; use `graph:audit-fm -- --out=...` for later-stage report destinations.
- Full 48 kHz/17.5-second test: **all six actual engines in one Wasm memory**
  versus six independent legacy instances, every raw L/R sample max difference
  **0**, all six peaks nonzero. Trio peer reset/panic/free isolation, same note
  IDs, spec persistence/rejection and actual worklet partial output also pass.
  Focused core/FM/six-role: **21 passed**, `.tmp/modular-audio-m3c-focused.log`.
- **18 allocation audits** pass with 0 Rust allocation/reclamation and no growth
  after preparation, including full score/transition/reset/replay with six
  owners sharing memory. Trio capacity **3,014,656 bytes** at all rates; six
  source capacity **4,653,056 / 4,718,592 / 5,046,272** at 44.1/48/96 kHz.
  `reports/modular_audio/m3c-allocation.json`,
  `.tmp/modular-audio-m3c-allocation.log`. JS/browser allocation is outside
  scope. Independent compressor equation audits remain passing.
- Exact scalar/acoustic legacy export inventories: **22** each,
  `reports/modular_audio/core-legacy-exports.json`. Current scalar core
  **379,871 bytes**, SHA256
  `b6e0ae61bd441b9747b0ea9182a3eff07d01dc340d4a1610967c44aa6561a50c`;
  acoustic **400,575 bytes**. Default DSP/math remains compatible.
- **373 files / 2,697 tests passed**, 119.91 s,
  `.tmp/modular-audio-m3c-suite.log`. Named SIMD diagnostics were rebuilt with
  their existing builder; optional SIMD/acoustic and FM bank tests stay active.
- Public build passed **36.05 s** with public-bank/exclusion checks,
  `.tmp/modular-audio-m3c-build.log`; existing chunk advisory remains. Native
  cargo check passed, `.tmp/modular-audio-m3c-native-check.log`. Native test
  executables remain blocked by Application Control; not bypassed or claimed
  passed. Graph **279,049 bytes**, version **`1bb61c9f8351fcb5`**.

### Next task: M3d pitched DAG integration

Add prepared block-capable core/FM nodes to the Rust DAG, preserving their
actual render/event/transition behavior, explicit note-owner cancellation,
latency metadata and compatible insert batching. Use these owned/reference
paths and pinned six-role workload for exact source comparisons and existing
browser-mix tolerance. Then, only after the serial graph matches, attempt the
optional bounded worker executor with measured stalls/deadlines, extra latency,
hosting/capability and serial fallback. Existing workbench/cables/defaults remain
authoritative. No commit, push, deployment or screen-lock work was performed.

### M3c final browser/reload results

Verified the actual existing **4175** public preview page and its M3c selector /
**Compare all owned · all rates** button. Final review URL:
`http://127.0.0.1:4175/tools/modular-ensemble.html`, left **All six owned + kick
key · M3c / 48 kHz, stopped**. Original harness navigation also names M3c.

- **18 measured actual browser renders**, keyed legacy versus all-owned,
  44.1/48/96 kHz × 3 repeats, plus 6 warmups. All six post-local-insert stems
  exactly match direct legacy Wasm in each first case. Repeat hashes and
  keyed/all-owned stems match. Full mixes use the retained 1e-6 tolerance:
  actual maxima **2.9802322387695312e-8 / 2.9802322387695312e-8 /
  3.725290298461914e-8** by rate; largest repeat difference **3.725290298461914e-8**.
  `reports/modular_audio/m3c-browser-all-owned-comparison.json`, Chrome 157,
  non-isolated, pinned fixture/hash unchanged, graph `1bb61c9f8351fcb5`.
- Full-route median render ms for 17.5 s audio, keyed / owned:
  44.1 kHz **4693.1 / 4785.5**; 48 kHz **5079.6 / 5222.1**;
  96 kHz **10365.8 / 10655.0**. No speedup demonstrated. These include offline
  capture/stats, not callback CPU or device underruns. Constructor timing scopes
  differ (owned ready handshake versus unobservable legacy construction),
  background load was uncontrolled, and 3 repeats are a small sample. See the
  detailed record; do not infer a controlled throughput change from old runs.
- Every measured tail's last-half-second RMS 0/0, finite audio, all source stats
  present and no reported late/drop/overflow. Core trio shared capacity
  **3,014,656 bytes**, FM pair **1,572,864** in this build; count each once.
  Core declared latency 0, FM 7.5 frames. No new alignment or quantum buffering.
- Saved fixture, reloaded page, restored **stopped**, selected M3c and played
  the finite score. `reports/modular_audio/m3c-live-production.json`: **48 kHz,
  178** analyser polls, sampled master peak **.11402103304862976**, all six role
  peaks nonzero; five pitched owners and percussion at exactly **840,000 frames**.
  Expected second/FM 14 steals, others 0, no reported late/drop/overflow,
  **57** drum events. Reported base/output latency **10/40 ms**. Playback ended
  and context closed. Output-path evidence, not direct listening, loopback or
  a screen-lock test. Screenshot `.tmp/modular-audio-m3c-browser.png`.

Previous M3a/M3b reports were retained. New DOM reports were saved directly,
avoiding the slow browser download-path mechanism. Next is M3d block-capable
pitched DAG integration, followed later by optional measured workers. Locked-
phone crackling remains deferred; its cause is not established.

## M3d delivery checkpoint (2026-11-09)

The user requested **commit then continue**. Completed work through M3c was
committed locally as **`bc4e35d`**, `Add owned modular audio foundations and
six-source harness`, on the existing `main` branch. The working tree was clean
after that checkpoint. M3d below is subsequent uncommitted work. No push or
deployment was performed. Preserve the new working-tree implementation.

Read [M3d's contracts and detailed evidence](MODULAR_AUDIO_ENGINE_M3D_PITCHED_DAG.md)
before continuing. Main changes:

- `synth-engine/graph/src/pitched.rs`: owned core/FM nodes, prepared keyframes,
  original transition semantics, bounded note-owner registry and cancellation.
  Core/FM `cancel_note` removes a named key even under sustain and preserves
  remaining mono priority/legato. Ordinary legacy ABI note execution stays
  compatible. The original retained goldens remain authoritative.
- Graph ABI adds pitched configuration/performance/point/note/stat APIs and
  prepared source views. Graph event capacity 4096, eight pitched nodes max,
  4000 pending notes/controllers/node, 65,536 automation/gain points/node,
  32 performance transitions. Preparation rejects oversized work. Render spans
  split at graph events and prepared config boundaries; gain automation does
  not force a full DSP call for every sample. Pause zeros all taps/freezes time;
  reset restores prepared config, then host explicitly rebooks events.
- `pitchedCompiler.js` bakes the original host transition helper at preparation.
  The graph builder bundles canonical runtime/compiler/validators with installed
  esbuild, versions worklet imports and checks source/runtime/Wasm provenance.
- `sixSourceDag()` uses the pinned real roles in one 13-node graph with explicit
  binary mixing (final sum gain 1/8), actual kick key, compressor and output.
  `dag-sources-processor.js` exposes eight stereo outputs: roles 0–5, kick 6,
  Rust final mix 7. Source/counter stats are actual instrument stats, with
  aggregate graph/compressor telemetry separately named `sourceDag`.
- The six-role page adds **Six-source Rust DAG · M3d**, **Compare Rust DAG · all
  rates** and **Play Rust mix (dry)**. Selected playback/comparison retains the
  existing desk local/master inserts, native mixer and final limiter. Direct
  Rust mix playback deliberately omits those desk effects; it is a separate
  reference sum/compressor, not their Rust migration. Current stays the default.
- Regression coverage checks the actual browser route's selected constructors,
  six port connections, kick port 6 and final mix port 7. The first browser
  comparison caught missing source-worklet construction plus a skipped desk
  compressor in the new option; both were fixed before final verification.

### M3d executable checks

- **132** exact pitched-DAG/original float PCM cases at 44.1/48/96 kHz, including
  legacy recipes, additive shapes, note/voice behavior, prepared transitions,
  irregular/partial blocks and actual pitched score parts:
  `reports/modular_audio/m3d-pitched-dag-compatibility.json`.
- Standalone legacy/owned **75 core + 57 FM** comparisons pass, with separate
  `m3d-core-compatibility.json` / `m3d-fm-compatibility.json` reports. All seven
  rebuilt legacy export sets match `bc4e35d`; most rebuilt bytes differ,
  percussion bytes match. See `m3d-legacy-binaries.json`. Earlier reports and
  goldens were not overwritten to accept changes.
- **21 allocator audits** pass, including full six-source DAG playback,
  transitions, live enqueue/cancel, reset/pause/rebook/replay: zero Rust
  allocation/reclamation and no memory growth after preparation. DAG capacity
  **5,242,880 / 5,242,880 / 5,701,632 bytes** at 44.1/48/96 kHz.
  `reports/modular_audio/m3d-allocation.json`. JS/browser allocation is outside
  this instrumentation. Independent compressor equation checks pass.
- Full suite **375 files / 2,710 tests passed**, **129.74 s**:
  `.tmp/modular-audio-m3d-suite.log`. Optional scalar/SIMD/acoustic/FM-bank tests
  remain active. Public build passed with bank/exclusion checks, about 69 s
  while the suite ran concurrently: `.tmp/modular-audio-m3d-build.log`.
  Existing chunk advisory remains. Native cargo check passed; native test
  executables remain blocked by Application Control and were not bypassed.
- Graph **296,101 bytes**, version **`eb07d368174d0159`**, Wasm SHA256
  **`a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`**,
  rustc 1.99.1. `graph:check`, `ensemble:check` and whitespace checks pass.

### M3d actual browser comparison and reload

Same existing preview: `http://127.0.0.1:4175/tools/modular-ensemble.html`.
Chrome 157, non-isolated, unchanged pinned fixture/hash, graph
`eb07d368174d0159`. `reports/modular_audio/m3d-browser-dag-comparison.json`:

- **18 measured renders + 6 full warmups**, M3c owned source groups versus M3d
  source DAG at 44.1/48/96 kHz × 3 repeats. All six post-local-insert stems
  exactly match direct legacy Wasm on first measured runs and retain identical
  repeat/reference hashes. Actual source stats identify every DAG owner.
- Full desk mix comparison maximum **2.9802322387695312e-8 at every rate**;
  largest repeat maximum the same, below retained **1e-6** tolerance. Finite,
  nonzero audio, every final-half-second tail RMS 0/0, all source stats present,
  no reported late/drop/overflow. Each 48 kHz DAG source/graph ends at exactly
  **840,000 frames**, **357 aggregate events**, expected second/FM 14 steals,
  others zero. Actual key is nonzero and external-key meters are connected.
- Offline median render ms, M3c / M3d: **6993.1 / 5749.7** (44.1),
  **5214.3 / 5856.7** (48), **9509.0 / 10404.6** (96). Uncontrolled background
  load, including partial test-suite overlap; only three repeats. Both capture
  16 channels/stats and run existing local/master FX, native mixer and limiter;
  M3d additionally computes its internal reference sum/compressor. These are
  elapsed observations, not a controlled speedup or callback deadline result.
- Saved locally, reloaded, loaded the pinned fixture **with playback stopped**,
  selected M3d / 48 kHz and played the finite desk route. It stopped and closed
  automatically. `reports/modular_audio/m3d-live-desk.json`: **177** analyser
  polls, main sampled peak **.11402103304862976**, all six role peaks nonzero,
  sources/graph **840,000 frames**, no reported timing/drop/overflow. Reported
  base/output latency **10/40 ms**. This verifies output-path activity; it is
  not direct listening, device loopback or a screen-lock test.
- **Play Rust mix (dry)** also passed a finite 48 kHz run and stopped/closed:
  `reports/modular_audio/m3d-live-rust-mix.json`. **177 polls**, main sampled
  peak **.05186479538679123**, all six raw tap peaks nonzero. All six sources /
  `sourceDag` finish **840,000 frames / 357 graph events**, expected steals,
  no reported late/drop/overflow. Its audible compressor is Rust node 17;
  the disconnected auxiliary desk compressor stays at frame 0 as expected.
  Reported base/output latency 10/40 ms. Same evidence limits as the desk run.
- Preview left **Six-source Rust DAG · M3d / 48 kHz, stopped**, after both runs.
  Screenshot `.tmp/modular-audio-m3d-browser.png`. Original harness navigation
  names M3d. DOM reports saved directly; no slow browser downloads. Earlier
  reports are retained. Locked-phone crackling stays deferred, cause unproved.

### Next task after M3d

Specify and prototype bounded optional workers against this serial DAG and
pinned fixture. Establish frame/generation publication, source ownership and
event transfer, memory/table ownership, added buffering/latency, nonblocking
render consumption, stale/missed-result policy and a tested serial fallback.
Measure actual deadlines/stalls and capability/hosting/non-isolated behavior;
do not infer parallel speedup from source worklet count or offline elapsed time.
Keep compatible inserts batched. No broad workbench migration, complete effect
port, deployment or screen-lock investigation is bundled into this checkpoint.

## M3e delivery checkpoint (2026-11-09)

The user requested **commit and keep iterating**. M3d was committed locally as
**`fa634f5`**, `Integrate six owned sources into the Rust audio DAG`. Working tree
was clean afterward. M3e below is subsequent uncommitted work. No push/deploy.
Read [M3e contracts/results](MODULAR_AUDIO_ENGINE_M3E_WORKER.md) before continuing.

### Implemented

- Canonical `src/modular-audio/graphWorker.js` owns one prepared six-role Rust
  graph/Wasm instance. `workerOutputProcessor.js` consumes eight stereo buses
  through a direct transferred MessagePort. `workerProtocol.js` bounds and
  validates generation/frame/slot/block publication. No cross-thread raw Rust
  pointers or shared mutable engine state. This is one complete-graph worker,
  not yet a parallel worker pool or broad desk/effect migration.
- Default 4 × 1024-frame buffers, 262,144 PCM bytes. Allowed block sizes
  256/512/1024/2048, pool 2–8. Worker renders one block per task, tracking a
  fixed in-flight pool. AudioWorklet never waits or runs catch-up DSP; missing
  frames are silent, expired blocks discarded and partially late blocks trimmed.
  Source clock advances on misses. Generation mismatches/duplicates/malformed
  publications cannot replace current slots. Transport counters are separate
  from graph event counters and are not physical device-underrun measurements.
- Added buffering is explicitly **4096 frames** by default: **92.88 / 85.33 /
  42.67 ms** at 44.1/48/96 kHz, plus original instrument/device latency. Startup
  primes the bounded pool outside playback. Serial fallback prepends the same
  delay. Output clock includes delay and final quantum padding; source clock
  does not. Message dispatch/recycling still allocates JS messages/views;
  fixed PCM capacity does not mean allocation-free JavaScript.
- Worker configuration/score is prepared once; worker owns live graph events.
  Future event/cancellation is sample-timed; frames already rendered into
  lookahead are rejected. At most 64 control requests outstanding, 3 s timeout.
  Reset/reload creates fresh graph/worker/generation. Startup absence/failure/
  clone/priming timeout exposes actual serial executor/reason. Runtime error
  stops the run; no concealed synchronous reconstruction in `process()`.
- `workerBrowser.js` handles preparation/controls/lifecycle; `workerHarness.js`
  and `tools/modular-worker.html` provide opt-in finite dry mix playback,
  reference/fallback, stall injection, real browser worker PCM verification and
  local fixture save/reload. Existing original/six-role pages link to it;
  existing desk routes/defaults remain intact. No shared memory/isolation
  headers or hosting/deployment change. New assets are bundled/version-checked
  by graph builder; public packaging checks require worker page/assets.

### Executable checks

- `reports/modular_audio/m3e-worker-thread.json`: actual Node threads run the
  unchanged browser worker entry using only a Worker API adapter. Full 17.5 s
  workload, all eight stereo buses, **max difference 0 / nonfinite 0** at
  44.1/48/96 kHz, future cancellation/past-event rejection. Two independent
  workers/generations also pass. Consumer-paced, not a deadline benchmark.
- `m3e-browser-worker-pcm.json`: same full-score eight-bus exactness/control
  checks in real browser workers at three rates. **754 / 821 / 1641 blocks**,
  final partial blocks included. Worker capacity **5,177,344 / 5,177,344 /
  5,570,560 bytes**, plus the fixed 262,144-byte pool. Non-isolated Chrome 157.
- Full suite **378 files / 2,725 tests passed**, **130.04 s**,
  `.tmp/modular-audio-m3e-suite.log`; focused final host/protocol checks **11
  tests passed**, `.tmp/modular-audio-m3e-focused.log`. Tests include all bus
  layouts, irregular/final blocks, exact startup delay, stale/duplicate/bounds,
  missing-span silence, late trim/discard/recovery, disposal/fail-closed,
  independent workers and explicit/missing/failed startup fallback. Older
  legacy/SIMD/acoustic/FM-bank/M1/M2/M3d tests remain active.
- Final public build **44.72 s**, packaging/bank/exclusion checks pass,
  `.tmp/modular-audio-m3e-build.log`. Existing chunk advisory remains.
- Rust/Wasm/legacy DSP code is unchanged from committed M3d. Graph Wasm remains
  **296,101 bytes**, SHA256
  **`a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`**.
  Full runtime manifest is now **`e2a03ea6b3d766e4`** because worker assets are
  included in provenance. Prior reports retain their historical versions.
  Native executable tests remain blocked by Application Control, not bypassed.

### Live transport evidence and limits

All reports under `reports/modular_audio/`; original pinned fixture/hash
unchanged. Same **4175** preview; actual worker and serial output paths, analyser
observations rather than direct listening, physical loopback or screen-lock.

- `m3e-live-worker-44100.json` / `m3e-live-worker-48000.json`: finite main and
  all-six source activity, zero misses/expired/stale/malformed blocks, queue
  high-water 4. Both worker and source output end **771,750 / 840,000 frames**,
  **357 events**, expected FM 14 steals only, no reported graph late/drop/
  overflow. Worker render+copy maximum **39.5 / 29.8 ms**, with some concurrent
  suite/build load. No controlled CPU attribution or stress-tolerance claim.
- `m3e-live-stall.json`: 250 ms stall injected at worker frame 8192, 48 kHz.
  **829,248 delivered + 10,752 silent = 840,000 frames**; 84 miss quanta,
  10 expired blocks, one recovery, no stale/invalid publications. Worker catches
  up to 840,000 / 357 events. This passes the explicit starvation/recovery
  policy and deliberately contains silence during the producer stall.
- `m3e-live-fallback.json`: explicit requested-worker/actual-serial startup
  fallback, visible reason, same 4096-frame delay; nonzero main/all six sources,
  840,000 / 357 events and no reported graph late/drop/overflow. Actual missing
  Worker/construction failure is separately tested. No seamless runtime
  handover is claimed.
- **Retained failure** `m3e-live-worker-96000-stress.json`: during uncontrolled
  concurrent suite/build load, worker starvation caused **1,619,456 silent /
  60,544 delivered frames**, 12,652 miss quanta, 792 expired blocks, six
  recoveries. Output reaches 1,680,000 source frames while worker is only at
  **875,520 / 326 events**; max block 44.3 ms. `pass=false` is retained. The
  UI now states missing transport frames explicitly. No pool increase or
  relaxed pass criterion was used to hide this failed run.
- `m3e-live-worker-96000.json`: repeat after background checks finish passes
  with **1,680,000 delivered frames**, **zero misses/expired/stale/malformed**,
  1641 blocks, queue high-water 4, worker **357 events**, all six source peaks
  nonzero, max worker block **11.5 ms**. Same fixed pool and pass criteria.
  This working foreground run does not erase the retained overload failure or
  establish locked-phone/mobile headroom.
- Fixture saved locally, page reloaded, fixture restored **with audio stopped**.
  New playback creates a fresh generation/graph. Base/output latency is
  reported separately (10/40 ms at 48 kHz), with transport buffering additional.
- Final fallback run was repeated with the final host bundle; metadata names
  actual serial / no PCM transport. New page left **48 kHz, stopped** at
  `http://127.0.0.1:4175/tools/modular-worker.html`. Screenshot:
  `.tmp/modular-audio-m3e-browser.png`. User's original modular page links here.

### Next task after M3e

Specify and prototype measured **multi-worker source execution**, using this
serial graph/transport correctness baseline and pinned fixture. Keep compiled
dependency/master/key levels explicit; define per-worker state/table ownership,
event fan-out, frame/generation publication, chosen added buffering, nonblocking
miss/stale policy and tested fallback. Measure equivalent processing jobs on
foreground target devices and retain failures. Shared-memory/isolation hosting
is a separate decision; current transfer messaging still adds JS allocation and
dispatch jitter. No speedup, complete worker-pool migration, broad effect/desk
port or locked-phone fix is established by this checkpoint.

## M3f delivery checkpoint (2026-11-09)

M3e was committed locally as **`646183d`** at the start of this step. The user's
standing workflow now requires a local commit at the end of every verified
step; M3f ends with its own commit after the checks below. Consult local Git
log for that checkpoint ID. No push/deployment. Read
[M3f contracts and evidence](MODULAR_AUDIO_ENGINE_M3F_SOURCE_POOL.md).

### Implemented

- `poolPlan.js` derives a bounded six-source cut: worker 0 lead/core + bass/FM,
  worker 1 second/FM + rhythm/core, worker 2 pad/core + drums/percussion. Each
  owns a private Wasm/source graph; no shared mutable Rust state or raw pointers.
  Source graphs retain IDs, settings, transitions, timestamps and owner-local
  events. Compiled source order includes every owned source, including taps
  outside the source graph's required output connection.
- The dependent Rust master stays in one AudioWorklet: six program host inputs,
  separate kick input, original five mixers, keyed compressor and output.
  Exposed master levels: `[1..7]`, `[11,12,13]`, `[14]`, `[15]`, `[17]`, `[18]`.
  No independent dispatch of dependent program/key/master nodes. Planner rejects
  unsupported cross-stage inputs, non-audio links, unsupported master kinds and
  owners spanning worker groups. This is a fixed six-source prototype, not a
  general graph distributor or adaptive load balancer.
- `AlignedSourcePool` requires matching-frame results from every worker. Missing
  any group silences **all six programs plus kick** at that source sample;
  source/master clocks advance, late blocks discard/trim, and recovery resumes
  the current frame without stale replay. Per-worker availability and coherent
  delivered/missing counters are distinct. No wait or source catch-up in the
  render callback. Raw/key taps are published before Rust clears consumed
  host-input storage; master output is published after render.
- Default pools 3 × 4 × 1024 frames / eight stereo buses = **786,432 PCM bytes**.
  Added buffering remains **4096 frames** (92.88 / 85.33 / 42.67 ms at three
  rates), plus instrument/device latency. Each source/master stage has its own
  prepared Rust memory; core's immutable table is repeated across Wasm contexts.
- `poolBrowser.js` handles all-group priming, per-worker control/telemetry,
  bounded owner locality/requests, lifecycle and explicit serial startup
  fallback. A failed worker after partial construction disposes all resources;
  fallback uses the original serial graph with the same delay and visible
  reason. Runtime failures stop the run; no seamless state reconstruction.
  Live source events/cancellation stay local to an owner group; distributed
  owner transactions and live master controls are not supported.
- Same **4175** worker page adds **Play three-worker mix**, **Verify pool PCM ·
  all rates**, **Test pool fallback**, and **Compare one / three workers ·
  48 kHz**. Comparison uses the same score, audible Rust mix and delay, one
  finite run each; Stop cancels the remaining run. Original modular/six-role
  navigation now names M3e/M3f. Existing defaults/desk effects stay intact.

### Checks and measured evidence

- Actual Node and browser three-worker pools match **all eight stereo buses
  exactly**, nonfinite 0, over the complete 17.5 s score at 44.1/48/96 kHz.
  Future cancellation at frame 32768 and past/lookahead rejection pass. The
  cancellation produces **289 / 289 / 287 applied events**; worker/master
  totals equal the original serial graph. Two independent complete pools /
  generations pass. `reports/modular_audio/m3f-pool-thread.json`,
  `m3f-browser-pool-pcm.json`. Consumer-paced, not deadline measurements.
- Full suite **382 files / 2,736 tests passed**, **135.67 s**:
  `.tmp/modular-audio-m3f-suite.log`. Protocol coherent silence/recovery/stale
  publication, actual Rust master worklet raw/key/final clipping/disposal and
  host three-worker/owner/fallback tests pass. All old legacy, optional SIMD/
  acoustic/FM-bank and M1–M3e tests remain active. Public build passed with
  curated-bank/exclusion and new pool-asset checks, final **43.36 s**:
  `.tmp/modular-audio-m3f-build.log`; existing chunk advisory.
- Rust/Wasm/legacy DSP bytes unchanged; graph **296,101 bytes**, SHA256
  `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
  New worker assets set runtime version **`ebcf61aba7fd0ac7`**. Native test
  executables remain blocked by Application Control; no bypass/new native run.
- `m3f-live-comparison-48000.json`: one foreground path each after background
  checks finished, complete single worker / three workers. Both deliver all
  **840,000 source frames**, **zero transport misses**, all six role taps
  nonzero, same sampled main peak **.05186479538679123**, **357 source events**,
  expected second/FM 14 steals, no reported graph late/drop/overflow.
- Single-worker render+copy total/max **4026.9 / 13.9 ms**. Pool workers:
  **878.4 / 4.1**, **2296.9 / 6.5**, **1275.8 / 4.5 ms**. Pool master runs in
  the AudioWorklet and is not in those worker timers. Fixed order, one sample
  each, uncontrolled external load and different timer CPU scopes: **no speedup,
  CPU-utilization or callback-deadline claim** follows from these numbers.
- At 48 kHz pool worker Wasm **2,883,584 / 2,883,584 / 4,128,768**, master
  **1,703,936** = **11,599,872 Wasm + 786,432 PCM bytes**. Single path:
  **5,177,344 Wasm + 262,144 PCM bytes**. JS/code/browser overhead excluded;
  memory cost of separate contexts/tables/bridges is real, not silently shared.
- `m3f-live-pool-stall.json`: group 0 delayed 250 ms at producer frame 7168.
  **830,016 coherent delivered + 9,984 silent = 840,000**, **78 miss quanta**,
  **two recoveries**, **9 expired group-0 blocks**. Other groups have all samples
  available; coherent policy silences them for the missing spans. Every worker
  and master finishes at 840,000, source events **104 + 162 + 91 = 357**, no
  reported Rust late/drop/overflow or stale/malformed publications.
- `m3f-live-pool-96000.json`: all **1,680,000 frames**, zero transport misses,
  1641 accepted blocks/group, full 357 source events; master at the same frame.
  No stale/expired/invalid blocks, all six source peaks nonzero. Non-isolated
  Chrome 157. This is foreground session evidence, not locked-phone headroom.
- `m3f-live-pool-44100.json`: all **771,750 frames**, zero transport misses or
  expired/stale/malformed blocks in every group/coherent output, full 357 source
  events, all six role peaks nonzero, master/source clocks finish together.
- `m3f-pool-allocation.json`: **12 instrumented Wasm allocator audits** cover
  all three source graphs and seven-input master at three rates, full score and
  enqueue/cancel/reset/rebook/pause. **Zero Rust allocation/reclamation calls
  and no memory growth after preparation**; JS/transport allocations excluded.
  Current source rebuilt with allocator feature, no native test runner.
- Fixture saved, page reloaded and fixture restored **with audio stopped**.
  `m3f-live-pool-fallback.json`: requested pool / actual serial / zero workers,
  explicit reason, same delay, nonzero all-six/main activity, **840,000 frames /
  357 events**, no reported late/drop/overflow. Partial construction failure is
  separately tested. Same preview left **48 kHz, stopped**; screenshot
  `.tmp/modular-audio-m3f-browser.png`. No physical loopback/listening/device-
  underrun or screen-lock claim. Prior M3e overload/failure evidence retained.

### Next task after M3f

Measure repeated **buffering/latency profiles** on the same foreground workload
and fixed worker plan before changing defaults. Compare conservative 4096-frame
buffering with smaller opt-in profiles; retain misses, stale blocks, event-lead
constraints and memory costs. Record worker task distributions separately from
worklet/device timing; mark unavailable timing scopes explicitly. Preserve
sample-exact sources/master, owner-local controls, coherent key dependency and
serial startup fallback. Shared-memory hosting/capability, distributed owner
transactions, adaptive repartitioning and broad desk migration remain separate
tasks. Do not claim background/mobile headroom or chase screen-lock crackling.

## M3g delivery checkpoint (2026-11-09)

Started from clean M3f commit **`714ce43`**. Under the standing user instruction,
this verified step ends with a local commit; consult local Git log for its ID.
No push/deployment. Read
[M3g profiles and exact measurement scopes](MODULAR_AUDIO_ENGINE_M3G_BUFFER_PROFILES.md).

### Implemented and checked

- Same 4175 worker harness adds three explicit profiles: **1024×4 = 4096 frames**
  (unchanged default), **512×4 = 2048**, **256×4 = 1024**. At 48 kHz added
  buffering is **85.33 / 42.67 / 21.33 ms**, with **786,432 / 393,216 /
  196,608 PCM bytes** for three workers. Source groups, program/key/master,
  score, intrinsic latency and production/workbench defaults are unchanged.
  Serial startup fallback preserves the selected profile's delay.
- `bufferProfiles.js` owns choices, bounded schedule and versioned session
  validation. Explicit Save/Load stores pinned fixture + profile + rate;
  fresh reload stays stopped at default/48 kHz. Fixture-only legacy storage
  remains readable. Ports/worker/engine state are not persisted.
- Profile measurement uses the fixed three-worker plan/full 17.5 s score:
  one warmup/profile, then three measured repeats/profile in rotated order
  (default/medium/short, medium/short/default, short/default/medium). Raw warmups,
  failures, incomplete runs, misses, visibility/changes and fallback remain.
  Summaries exclude warmups; fallback is not a pool result. Stop cancels the
  remaining schedule. Initial selector settings restore after the batch.
- `profileMetrics.js` checks complete output **and source/master DSP clocks /
  event totals**, rather than accepting sampled audio or output-clock completion
  alone. Table shows passed/attempted, missed/incomplete runs, silent frames,
  expired blocks and clock availability. Preparation wall time and actual Wasm /
  PCM capacities are separate from worker render+copy timings.
- Optional `ProcessTiming` uses a prepared 32-bin histogram only when the
  worklet has a functioning monotonic performance.now(). Absent/failed clocks
  report **available=false and null durations/counts**, not zero CPU. Failure
  does not affect audio. Body wall time includes observation/copy/DSP/preemption;
  it is not scheduling lateness, CPU utilization or physical device underruns.
  Worker histograms exclude dispatch/postMessage/queue wait and Rust master;
  quantiles are bucket upper bounds. JS/transport allocation remains real.
- Event render-ahead capacity is explicit in metadata. Live events must target
  the owning worker's next unrendered frame; smaller capacity is not a guaranteed
  MIDI lead time because dispatch can advance that boundary. Owner locality,
  past rejection, coherent silence/drop/recovery and generation lifecycle remain.
- Full suite **384 files / 2,749 tests passed**, **126.61 s**:
  `.tmp/modular-audio-m3g-suite.log`. Includes full 48 kHz profile scores,
  three-rate controls, independent medium/short instances, selected-delay
  fallback, session validation, rotated schedule, incomplete/failure assessment,
  histogram bounds and clock absence/failure. Old legacy/SIMD/acoustic/FM-bank
  and M1–M3f tests stay active. Public build/package/bank/exclusion checks pass;
  existing chunk advisory. Rust/legacy DSP bytes unchanged; no native runner
  bypassed Application Control.
- Runtime **`1c3863ec8913dbd8`**; graph still **296,101 bytes**, SHA256
  `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.

### PCM qualification and persistence evidence

- `m3g-profile-pcm.json` / `m3g-browser-profile-pcm.json`: **nine full-score
  profile/rate combinations** on real Node/browser three-worker pools, all
  **eight stereo buses raw-equal against original same-cadence serial PCM**,
  sameCadenceMaxAbs 0, nonfinite 0. Fixed-frame 32768 future cancellation and
  rejection of past/lookahead events pass. Node also checks full short-profile
  single-worker 48 kHz; separate tests prove independent profile generations.
- A second fixed-1024 reference is retained as a cross-cadence diagnostic.
  Existing core/FM `denormal::flush` zeros recursive DC state at render
  boundaries, so different cadences produce different subnormal tails. Those
  differences also propagate into final normal-valued mix samples. Largest
  observed raw difference **1.1506732912535485e-38**, propagated master difference
  **1.3484751174136288e-39**; source normal-range difference 0 in these cases.
  Default/fixed-cadence raw maximum is 0. No old golden or DSP algorithm changed.
- `m3g-raw-cross-cadence-diagnostic.json` and `m3g-cross-cadence-pcm.json` retain
  the initial **failed** raw/classification checks. Only descriptive metadata
  was clarified; values/pass flags are unchanged. The final acceptance is
  strict raw same-cadence equality, **not an amplitude tolerance**. Do not claim
  raw-bit-exact smaller-profile output across different render cadences.
- `m3g-short-fallback.json`: requested pool / actual serial at short/48 kHz,
  **1024-frame / 21.33 ms** buffering, six source peaks nonzero, **840,000 /
  357 events**, full completion/event checks. Worklet timing unavailable, all
  duration/count fields null. `m3g-session-reload.json`: fixture-only legacy
  load, saved short/96 kHz session, fresh default/48 kHz reload and explicit
  stopped restore of short/96 kHz verified through visible UI.

### Repeated live profile results

`reports/modular_audio/m3g-live-profiles-48000.json`, same 4175 preview, Chrome
157, non-isolated. Full heavy checks/PCM verification finished before the batch;
external system load not controlled. All 12 rows have document visible at
start/end with no visibility changes.

- **3 warmups + 9 measured runs**, all pass. Per profile **3/3** measured passes,
  **zero transport misses / expired blocks / incomplete DSP**, no substituted
  fallback, **840,000 frames / 357 events**, all six peaks/main nonzero and
  expected FM steals, no reported Rust late/drop/overflow. Selectors restore
  **default / 48 kHz, stopped** and the completed table stays visible.
- Buffering **85.33 / 42.67 / 21.33 ms**. Wasm capacities **11,599,872 /
  11,468,800 / 11,468,800 bytes** plus PCM **786,432 / 393,216 / 196,608**.
  These exclude JS/code/browser overhead. Default remains unchanged.
- Source-worker p95 upper-bound buckets (groups 0/1/2): default **4.096 / 8.192 /
  4.096 ms**, medium **2.048 / 4.096 / 2.048**, short **1.024 / 2.048 / 1.024**.
  Maxima: default **3.6 / 6.4 / 4.4**, medium **2.1 / 4.2 / 2.0**, short
  **1.2 / 2.5 / 1.7 ms**. Different-sized tasks, excluding transport/master /
  scheduling; not a speedup or callback-margin result. Median preparation wall
  ms **121.5 / 131.2 / 123.0**, only three samples each.
- Worklet clock **unavailable in every row**; duration and over-quantum values
  null. Physical output/device underruns and CPU attribution are not measured.
  Three successful foreground desktop trials/profile do not establish phone /
  background headroom. Screenshot `.tmp/modular-audio-m3g-browser.png`.

### Next task after M3g (delivered by M3h below)

Add bounded **contiguous queue-lead** watermarks/histograms in source frames
at quantum boundaries, per worker and coherent minimum, across the same profiles.
This measures actual buffering margin without a worklet wall clock; zero misses
alone does not show how near starvation a run came. Keep defaults conservative
until target-device evidence supports changing them. Shared-memory hosting /
capability, distributed owner transactions, repartitioning and broad desk
migration remain separate. Preserve coherent key/program dependencies, strict
same-cadence PCM and honest cross-cadence/failure diagnostics. Do not infer
speedup from unlike timer scopes or investigate locked-phone crackling here.

## M3h delivery checkpoint (2026-11-09)

Implemented [queue-lead observability](MODULAR_AUDIO_ENGINE_M3H_QUEUE_LEAD.md)
for the opt-in worker/pool harness. At each active quantum, record bounded
contiguous ready frames per worker and coherent minimum; exclude startup and
separate planned terminal drain. Exact minima, fixed 128-frame histograms,
zero/under-quantum/under-block counters and p05 ranges require no worklet clock.
Read-only inspection preserves existing consumption and coherent key/program
silence/recovery. The profile batch now measures the selected rate. Fresh
Default / 48 kHz and all desk/legacy DSP remain unchanged.

- User listening evidence retained verbatim: Short / 96 kHz crackles, other
  tested combinations work well; device/executor/route/cause unspecified.
  Selecting that combination displays the feedback. Delivery counters do not
  override it or certify audible output.
- Full suite **385 files / 2,755 tests**, **308.91 s**, passes with four workers
  after an initial unexpected test-worker exit; both logs retained. Public
  build and graph/fixture/package checks pass. Rust/Wasm unchanged, runtime
  **`8c06ec0578a84abf`**. Focused actual-worklet/protocol tests pass. No native
  Application Control bypass, push or deployment.
- Live Short / 48 kHz: full **840,000 frames / 357 events**, six/main peaks,
  zero misses, steady minimum **512 frames / 10.67 ms**.
- Repeated selected **96 kHz** pool batch: three warmups + nine measured full
  scores. Default/Medium each **3/3** measured passes, minimum steady lead
  **2,304 / 768 frames**, zero misses. Short **0/3**, **56,064** missed frames
  each (**168,192** total); warmup also fails. All 12 complete clocks/events,
  no expired blocks, visible throughout. Worklet duration remains unavailable.
- Separate Short / 96 kHz stall trial **fails** with incomplete group-0 DSP;
  first zero lead predates the injection, so it is not isolated recovery proof.
  Failed rows/pass flags remain intact. All **14** live rows pass independent
  histogram/active/drain and shortage-to-underrun accounting checks. Session
  save/fresh defaults/explicit stopped reload also verified.
- Reports: `reports/modular_audio/m3h-*.json`; exact results, p05 ranges,
  limitations and source links are in the M3h document. Screenshot:
  `.tmp/modular-audio-m3h-browser.png`. M3g committed as `733c2e6`.

**Next:** test a bounded MessageChannel worker task pump in place of recursively
scheduled zero-delay timers. Nested-timer clamping is a concrete risk because
Short / 96 kHz needs one 256-frame block every 2.67 ms; causality remains a
hypothesis until the controlled change is compared. Keep one pending task and
one block per task, retain explicit stall timers, control fairness, private
ownership and coherent silence/no replay. Compare PCM, independent instances,
96 kHz delivery and recovery. No default switch or phone/device crackle claim.
Shared memory, distributed owners and broad desk migration remain separate.

## M3i delivery checkpoint (2026-11-09)

[Opt-in scheduling contracts and negative results](MODULAR_AUDIO_ENGINE_M3I_TASK_PUMP.md)
now govern the next task. The harness exposes **Worker scheduling**. Existing
**timers stay the default**; message-task pumping is explicit and experimental.
One pending task / one block per task avoids nested worker timers, retains
bounded PCM/control ownership and supports real injected-stall timers. The
experiment does **not** establish better delivery or audible quality.

- Same-session corrected-candidate 96 kHz batch: Default **2/3** measured
  passes with **128** missed frames, Medium **3/3** with zero, Short **0/3**
  with **168,192** total missed frames (the same as M3h). Failed rows and the
  initial native timer-receiver error remain intact. Native timer wrappers
  were corrected, regression-tested and verified by actual stall recovery.
- Because the candidate did not remove starvation, its pump is **not promoted
  to the default**. Candidate runtimes/reports are distinct from final opt-in
  runtime **`44de39f7ca5b0904`**. Rust/Wasm and legacy DSP remain unchanged.
- Final **18 files / 116 modular tests pass**, **98.65 s**: both modes' real
  three-rate single/pool PCM, future controls, independent instances,
  worklets, fallback, mode/session validation and accounting. Public build
  passes (**39.86 s** Vite), graph/fixture/package checks pass. Earlier M3h
  whole-repository **385 / 2,755** result remains historical, not a fresh run.
- Final UI explicit message/Medium/96 kHz stall: full **1,680,000 frames /
  357 events**, **25,088** coherent silent frames, one recovery, no executor
  error; default timer/48 kHz: full **840,000 / 357**, zero misses, minimum
  steady lead **2,816 frames**. Six/main analyser peaks nonzero. Final live
  accounting checks pass, physical audio unmeasured.
- Old sessions retain timers. Explicit experiment save/fresh default/explicit
  stopped restore verified. Page and saved session left **Default / 48 kHz /
  timers, stopped**, screenshot `.tmp/modular-audio-m3i-browser.png`.
- M3h committed as `c8ff2bb`; each verified step ends with a local commit.
  No push/deployment or Application Control bypass.

**Next:** measure source-frame consumption between packet-arrival callbacks,
with bounded per-queue/coherent counters and a small trace. This can test ready
capacity needed across message-delivery gaps without assigning a CPU/device
cause. Compare explicit extra headroom against Short / 96 kHz without changing
its original profile/default or hiding latency. Keep user listening evidence,
failed reports, dependencies and exact same-cadence PCM. Shared memory,
distributed owners and broad migration remain separate work.

## M3j delivery checkpoint (2026-11-09)

[Packet-arrival and headroom contracts/results](MODULAR_AUDIO_ENGINE_M3J_ARRIVAL_HEADROOM.md)
now govern the next task. Added bounded per-queue and any-group source-frame
gaps, open consumption spans, steady/drain histograms and first-32 diagnostic
trace. Valid expired traffic counts; malformed/stale/duplicate traffic does not.
Any-group callbacks do not imply coherent readiness. No wall-clock/CPU/device
cause is inferred. Extra PCM slots are explicit **0 / 2 / 4**, with unchanged
producer cadence and corresponding declared startup delay. Original profiles,
timers, owned Rust, graph dependencies and legacy desk/All DSP remain intact.

- Final **21 files / 128 modular tests**, **176.48 s**, pass. Both schedulers,
  three-rate PCM/controls, independent instances, worklets, original percussion
  goldens/sidechain remain covered. Six/eight-slot Short pools retain strict
  same-cadence raw PCM maximum error **0** at all three rates, including full
  96 kHz scores and independent capacities/generations. No new full-repository
  test run is implied. Public build/package checks pass, Vite **33.63 s**.
- Runtime **`5e3eede4bd16e076`**; Rust/Wasm still **296,101 bytes**, unchanged
  SHA256 `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
- Live timer-scheduled Short / 96 kHz matrix: **3 warmups + 9 rotated measured
  full scores**, all **1,680,000 frames / 357 events**, visible throughout,
  six/main analyser peaks, unavailable worklet clock. Original four slots
  **0/3**, **169,728** measured missed frames; +2 and +4 slots each **3/3**,
  zero misses/expiry, minimum steady ready lead **512 / 1,024 frames**.
  Delays **10.67 / 16 / 21.33 ms**, PCM **192 / 288 / 384 KiB**. Failed
  baseline/aggregate pass flags remain false; all 12 arrival/lead invariants pass.
- Max group closed gap and consumed span are **1,024 source frames** in every
  capacity. Span <= capacity does not guarantee ready PCM: callbacks can refill
  only part of a queue. Initial baseline shortage appears with span **512**,
  lead **0**. The comparison supports extra headroom in this desktop environment,
  not a phone/device cause or universally safe minimum. Instrumentation can
  affect scheduling and its worklet CPU cost remains unmeasured.
- Separate message-scheduled Short +2 / 96 kHz 250 ms stall control completes
  after **23,424** coherent silent frames / one recovery; group 0 gap **23,936**
  frames, 91 expired publications, one histogram-overflow entry. Explicit serial
  fallback preserves +2 at 48 kHz (**1,536 frames / 32 ms**, complete 840,000 /
  357). Default / 48 kHz / timers / zero extra slots completes with zero misses,
  minimum ready lead **2,816 frames**. Control invariants pass.
- Session/UI old-default and explicit +4 save/fresh default/stopped Load verified.
  Page and saved session left **Default / 48 kHz / timers / no extra headroom,
  stopped**. New reports `reports/modular_audio/m3j-*.json`; screenshots
  `.tmp/modular-audio-m3j-headroom-browser.png`, `.tmp/modular-audio-m3j-browser.png`.
- M3i committed as `b358bd9`; every verified step ends with a local commit.
  No push/deployment or native Application Control bypass.

**Next:** add a local listening-verdict/export record bound to exact fixture,
build, rate, profile, headroom, scheduling and delivery/lead/gap data. This
supports target-phone Short / 96 kHz +2 versus original capacity, retaining
historical feedback. Do not auto-promote headroom or claim clean physical /
locked-phone / Bluetooth output from desktop counters. Shared memory,
distributed owners and broad workbench migration remain separate.

## M3k delivery checkpoint (2026-11-09)

[Run-bound listening records and clarified target-device evidence](MODULAR_AUDIO_ENGINE_M3K_LISTENING.md)
now govern the next task. Host-only form supports separate verdict/playback
state/device/route/notes, bounded local save/review and JSON download. Each
individual playback has run ID, host timestamps, exact engine/fixture and hashed
host-module provenance. Snapshots preserve actual completed-run settings and
raw diagnostics after controls are edited. A new run resets to Not assessed;
loading a record never changes playback settings or starts audio. Failed and
incomplete run checks remain unchanged, independent of subjective verdicts.

- Exact user observations and clarification preserved in
  `reports/modular_audio/m3k-user-listening-feedback.json`: Short / 96 kHz / +2
  **helps while open, insufficient locked**, at 16 ms declared buffering.
  **Default and Medium / 48 kHz / Message tasks / +2 / three workers work locked**,
  at **128 / 64 ms** respectively. The 2048m clarification maps to Medium's
  original-capacity selector. Rate and available buffering both differ; no
  isolated cause or universal screen-lock guarantee is inferred.
- Device/browser/output route, exact build/run/repeat count and 96 kHz scheduler/
  worker count remain unspecified. The chat observations are not retroactively
  attached to a matching run. Earlier feedback/failures remain intact. Visible
  notices distinguish the clarified settings, foreground and lock-screen reports.
- **5 files / 28 focused tests pass**, **1.61 s**: real-page DOM workflows,
  immutable binding, synthetic clean-hearing versus failed-DSP separation,
  incomplete preservation, busy/reset controls, safe historical load, bounded
  records/schema/storage, corrupt/quota failures, text escaping, native Blob URL
  cleanup and feedback/latency/session checks. No engine code changed; M3j's
  128-test result and earlier full-suite results remain historical. Public
  build/package/provenance checks pass, Vite **35.73 s**.
- Engine runtime remains **`5e3eede4bd16e076`**, Wasm **296,101 bytes**, unchanged
  SHA256 `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
  Host `m3k-listening-v1`, final module `modularWorker-B5WbJWiW.js`. Existing
  DSP, scheduler/buffering defaults and fixture/session keys remain unchanged.
- Actual foreground Medium / 48 kHz / Message tasks / +2 and unchanged Default /
  48 kHz / timers / zero extras each complete **840,000 frames / 357 events**,
  six/main analyser peaks and zero misses. This is not a lock-screen reproduction.
- Actual save/native download event/reload keeps the original 48 kHz Medium
  snapshot after controls change to 96 kHz Default. Saved/reloaded data and
  saved/download-preview run payloads compare exactly. An early-stopped run
  retains pass:false / complete:false. Automation annotations are **Not assessed**
  with explicit UI-test notes; no audible verdict is fabricated. Invariants in
  `m3k-record-invariants.json`, workflow and per-run `m3k-*.json` reports.
- Page/main saved session left **Default / 48 kHz / timers / no extras, stopped**.
  Two unassessed automation records remain in the new separate listening history.
  Screenshot `.tmp/modular-audio-m3k-browser.png`. Native browser download-event
  wait took ~864 s despite a requested 10 s timeout; avoid repeating download
  waits/path retrieval. Preview/serialization and event were verified; no native
  path was requested. This did not occur during active audio.
- M3j committed as `7dea6bc`. Every verified step ends with a local commit;
  no push/deployment or native Application Control bypass.

**Next:** close M3's measured go/no-go gate and begin one isolated opt-in 48 kHz
**sequenced-playback source-stem adapter** into All's existing mixer/local/master
FX path. Preserve IDs, patches/setup files, transport, legacy route and explicit
stopped switching. Medium / +2 / Message tasks is the clarified user reference,
not a new default or CPU-speedup proof. Its 64 ms buffering needs an explicit
live-event policy; retain current live keyboard/MIDI authority until tested.
No broad rack/effect migration, shared memory, arbitrary repartitioning or
distributed owner controls in this first integration slice.

## M4a delivery checkpoint (2026-11-09)

The [M3 measured decision gate](MODULAR_AUDIO_ENGINE_M3_DECISION_GATE.md) is
committed as `3670f50`. The [M4a contract/results](MODULAR_AUDIO_ENGINE_M4A_WORKBENCH_SOURCE.md)
now govern the next task. All / Setup / **Owned Rust sequence preview** captures
one supported pitched role and current progression, then runs one finite pass
through the existing voice inserts/sends, mixer and master path. Actual core/FM
patch/tuning/notes, private graph state, 48 kHz, one worker or serial/startup
fallback, Message tasks / 512 frames / six slots / **64 ms**. FM requires 2x
quality; native/procedural/classic/percussion sources are rejected explicitly.

- Preparation is disarmed until connected. Cancel disposes late-created routes;
  Stop affects only the preview, Panic includes it, and source/host/tuning/
  score/tempo/selection/mute/solo changes invalidate the snapshot. Normal song
  Play cannot overlap the preview. Keyboard/MIDI retains its existing engine.
  Existing source level/trim and role/setup IDs are preserved. No new saved
  backend default or full-song/continuous/live-edit promise.
- Full suite **396 files / 2,815 tests**, **386.29 s**, passes. Final follow-ups
  **36 tests / seven files** (2.75 s) and **81 tests / two files** (55.87 s)
  cover last bounds/quality/failure/Panic changes. Public build passes, Vite
  **44.66 s**. Source core/FM plan PCM is raw-exact against scalar legacy ABI
  and real workers at equal cadence. Existing independent worker/pool, three-
  rate comparisons, setup-file restore and legacy DSP regressions pass.
- Live All Thump Bass worker and serial each complete **668,956 frames / 18
  events**, zero late/overflow/missing frames, nonzero source/channel/master.
  Existing mixer **-16 dB** reduces channel peak **0.10053 -> 0.01590** while
  source peak remains **0.38111**. Live level edits do not stop the snapshot.
  Four-op round bass FM worker completes **698,716 frames / 18 events**, zero
  misses and three signal peaks. Replacing its source stops it incomplete at
  **23,296 frames**; preview Stop leaves a legacy Chord phrase running.
  Normal full-song Play/Stop still produces actual note/meter activity.
- Original Thump Bass configuration and captured notes compare exactly after
  restoration. Save setup is clicked without native download waits/path reads.
  Reload preserves original voice choices, object IDs/poses, selected Pad and
  stopped transport; transient report clears and serial choice resets to worker.
  Session is **Continuous**: ordinary reload regenerates the grid, whose
  comparison is false. Do not claim an exact browser setup-file round trip;
  existing finite/continuous file restoration tests pass. A fresh post-reload
  worker completes **668,956 frames / 14 events**, zero misses, fresh generation
  1. Source/normal transport left stopped, originals restored. New evidence
  `reports/modular_audio/m4a-*.json`; screenshot `.tmp/modular-audio-m4a-browser.png`.
- Runtime **`31d4ba7553a47868`**, unchanged **296,101-byte** Wasm SHA256
  `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
  No Rust ABI/source, golden DSP or fixed fixture change. Existing Application
  Control native-executable restriction is not bypassed. No push/deployment.

**Limitations:** analyser peaks are activity, may include shared tails/keyboard,
and are not isolated wet PCM/physical listening or CPU evidence. This is one
worker, not the user's three-worker lock-screen rig; target-device quality is
unassessed. Scalar core/FM reference does not switch/claim equality with optional
legacy SIMD/acoustic/banked variants. Native exported bytes were not reuploaded.
The source snapshot is bounded to 16 bars, 2,000 notes and 120 seconds; source
tails include body/formant ringing. Keep all default routes/profiles unchanged.

**Next:** add run-bound listening capture/export for the actual All one-role
preview (include source/score snapshot, exact host build, actual executor and
delivery/timing), then collect target-phone evidence before promoting it.
Only after that gate expand to several captured eligible pitched roles with
coherent failure, one owner per patch and current FX paths. Unsupported drum-kit
translation, normal continuous transport, arbitrary racks/shared memory and
distributed owners remain separate tasks. Commit every verified step locally.

## M4a phone startup follow-up (2026-11-09)

M4a is committed as `20e3f56`. The phone's ChatGPT-app local preview stalled at
Warming up while the public deployed page worked. **Do not deploy for testing.**
[Startup recovery and forwarded asset URL results](SYNTHS_STARTUP_RECOVERY.md)
record the actual revealed error, `Unable to preload CSS for
/assets/AllPage-I1eM8As7.css`, the fix and remaining phone confirmation.

The shared synth entry now shows a ten-second slow-loading notice and actual
startup errors with an explicit fresh-page retry. Late successful imports can
still finish. Saved setup/query/hash are retained; unsaved Continuous sequences
still restart on reload. JS-emitted build assets resolve beside their importing
module, preserving forwarded paths; configured site/public audio URL base and
all DSP stay unchanged. A separate proxy-style server reproduces the old CSS
failure and successfully opens All after the fix via the real retry control.
Separate delayed/failed module checks verify slow notice/late success/error UI.
The live 4175 preview and deployed public site were not fault-injected.

**100 focused tests** and final **five startup/URL tests** pass; final public
build passes (**49.45 s**). Evidence `m4a-startup-browser.json` and the linked
document. The direct fresh All route opens stopped with Play enabled. No new
physical/audio-quality result is claimed. User's existing desktop tab and
workbench are retained. **Next:** phone retry at `?_reload=20261109-startup2`;
if it works, return to actual All route listening records. If it fails, diagnose
the newly displayed full error/asset URL, without deploying or clearing data.

## M4a repeated embedded CSS failure / LAN preview (2026-11-09)

The phone's ChatGPT-app retry of `e21547e` **failed** on a full remote-preview
AllPage CSS URL. Bundling the identical 8,287-character All rack/sequence rules
with its page JS removes that request; a stronger CSS-blocking test opens styled
where the previous build fails. **68 tests** and public build pass (**51.45 s**).
The package guard now prevents a separate AllPage stylesheet from reappearing.
But the phone's subsequent retry **fails on shared `generative-ybgFc-ZW.css`**:
this is not a complete phone-preview fix. Preserve both failures and do not
infer anything about Rust/audio from them. No new audio result is claimed.

At the user's explicit request, a separate public-build **HTTPS LAN preview**
is running at **`https://192.168.0.228:4176/synths/all/`**. Use Safari/Chrome on
the same LAN, outside ChatGPT's embedded preview. Existing ignored local TLS
certificate/key are reused; a self-signed warning may require user action, never
an agent bypass. No firewall/trust changes or deployment; original HTTP 4175
and desktop workbench are retained. Config/PID/logs are under `.tmp/https/`.

Host-side exact-CA TLS checks: page **200 / text/html** and the failing shared
stylesheet **200 / text/css / 56,397 bytes**. Host checks alone do not prove
firewall/browser access. The user then
confirms the normal-browser page opens and works after proceeding through the
certificate warning themselves. No agent trust/security bypass was performed.
This is connectivity/page confirmation, not a new run-bound listening verdict. See
[updated startup evidence and commands](SYNTHS_STARTUP_RECOVERY.md),
`m4a-inline-style-{browser,payload}.json`, `m4a-lan-https-preview.json`.
**Next:** use the confirmed normal-browser LAN route for actual All listening records.
Keep the LAN preview running for the user. Do not deploy to test the app proxy.

## M4a phone usability / guarded delivery (2026-11-09)

The user confirms serial works on the phone while one worker badly breaks up;
desktop one-worker playback works. Exact device/browser/run/counters remain
unknown. The full report was too large for chat and difficult to select. See
[phone usability contracts, verification and limits](MODULAR_AUDIO_ENGINE_M4A_PHONE_USABILITY.md).

- All's Setup is now a top-ribbon dropdown outside the desk transform. A
  contained viewport, Move desk and Go to… camera controls address page scrolling;
  fresh narrow layouts pack once after measurement. Existing IDs/poses stay
  intact. Use Spread once for an already-overlapping saved layout.
- All's opt-in preview initially selects **Serial reference**. Explicit worker
  runs stop on their first missing PCM span and report `delivery-gap`; they do
  not reconstruct/replay serial. Generic worker-harness recovery/defaults and
  legacy DSP stay operational. Rate/cadence/capacity remain 48 kHz / Message /
  512 x six / 64 ms. No speculative buffering change or phone-cause claim.
- Each actual run has an ID/browser/host revision and a delivery summary that
  separates listening from counters. **Copy compact diagnostics**, always
  selectable short text, separate full-copy disclosure and copy-failure fallback
  replace the always-visible large JSON. Nothing is transmitted automatically.
- Focused checks: 117 tests / seven files; final UI checks 75 / three, seven
  final Desk checks and four final report checks. Actual workers/core/FM,
  independent state, three-rate PCM, Effects/host regressions: **66 / five**.
  These overlap earlier runs; do not sum. Public build/package checks pass,
  final Vite **39.56 s**. Runtime **`2dd834c6b07330cb`**, unchanged Rust/Wasm hash.
- Real desktop browser at **390 x 844**: document width 390, fresh panels do not
  overlap and fit above navigation; fixed Setup width 366. Pan changes only
  camera; IDs/poses survive reload. Final serial Bass run completes **668,956
  frames / 22 events**, zero late/overflow, three nonzero signal taps. Compact
  report **986 characters**, correct run ID, selectable in full. Copy UI reports
  success; native clipboard payload readback is not verified. Reports
  `m4a-mobile-ui-*.json`, screenshot `.tmp/workbench-mobile-diagnostics.png`.

**Limits / next:** Physical phone layout/pull-to-refresh and worker listening
remain unverified. No phone cause, CPU improvement or wet/physical output quality
is inferred. Keep `https://192.168.0.228:4176/synths/all/` running; refresh for
this build. Obtain only the compact report from a future guarded phone run,
bound to actual source/build/browser/settings, before tuning or multi-role
expansion. The working serial path is available meanwhile. No deployment/push,
firewall/trust change or Application Control bypass. Commit every verified step.

## M4a first correlated phone delivery failure (2026-11-09)

After `fe52433`, the user successfully supplies compact diagnostics for run
`e0382044-e0e8-4aec-8538-7ce9c084f14b`, host `all-preview-delivery-v1`, runtime
`2dd834c6b07330cb`. [Exact report analysis and boundary](MODULAR_AUDIO_ENGINE_M4A_PHONE_DELIVERY.md)
preserve this new evidence separately from the earlier uncorrelated listening
failure. Reported UA is Android/mobile Chrome 156; device model, output route,
lock state and this exact run's listening verdict remain unknown.

Actual worker/Bass/Message/512 x six/64 ms: all nine accepted blocks cover
**4,608 frames**, then **128 missing frames / one quantum**. The guard stops at
source **4,736**, output **7,808**, incomplete and failed. Zero rejected/stale/
late packets, bad recycles, late events or overflow. Maximum consumption since
an arrival is **2,944 frames**, near nominal capacity; zero over-capacity count
does not mean actual queue lead was sufficient.

The worker's **15 blocks / 7,680 frames**, **7.20 ms total / 1.30 ms max render**
are later statistics. Host finish waits 30 ms before querying independent
worker/output snapshots; rendering can advance after output has stopped.
These data confirm PCM transport starvation, but cannot attribute the miss to
worker compute, tasks, recycle/PCM message delivery or audio callback bursts.
Normal PCM/recycle ports do not relay through the main thread. No Bluetooth
cause, CPU headroom or larger-buffer cure is established.

Exact payload: `m4a-phone-worker-delivery-gap.json`; independent frame/block/
delay checks pass in `m4a-phone-delivery-accounting.json`, without changing the
run's `pass:false`. No code/DSP/default/public-build change in this evidence
step. Serial stays initial and the existing HTTPS LAN build remains available;
no replay of bad audio, push or deployment. **Next bounded implementation:**
producer task/recycle waiting observations plus last-accepted-packet producer
snapshot, clearly distinct from the later worker query, before transport tuning
or further source migration. Keep diagnostics bounded and PCM/control behavior.

## M4a phone mixer navigation follow-up (2026-11-09)

The user reports the phone is **still awkward**: if the mixer covers the screen,
touching controls cannot move the view away. Prior desktop layout checks did
not establish physical phone usability. [Panel panning contracts and results](MODULAR_AUDIO_ENGINE_M4A_PHONE_PAN.md)
record the fix: one-finger dragging on non-control panel surfaces, two-finger
panning over controls, and a visible gesture hint. Capture cancels the original
control and prevents remaining fingers/clicks from editing it. Keyboard keybox
multi-touch and navigation remain outside gesture initiation. Touch faders
defer their initial jump until tap release or a four-pixel drag; mouse and
keyboard control remain. Edits made before the second touch are not rolled back.

Candidate All/Effects/Desk/keyboard/mixer regression: **111 tests / six files**,
63.84 s; final gesture/fader/Desk/mixer **15 / three**, 1.57 s, pass (overlapping).
Final public build/package checks pass, Vite **36.43 s**. Actual native browser
single-pointer drag over a mixer filling a **390 x 844** view changes camera
with Move desk off, preserving all mixer values/object poses and width 390;
Go to… escapes and Setup opens. Report `m4a-phone-panel-pan-browser.json`,
screenshot `.tmp/workbench-phone-panel-pan.png`. No audio played; runtime still
`2dd834c6b07330cb`, Rust/worker assets unchanged. No deployment or trust change.

**Next:** physical Android two-finger/capture usability confirmation. Automated
tests simulate PointerEvents; browser automation verifies single-pointer input
only. Keep LAN HTTPS running and do not claim physical gesture success yet.
Once usable, resume producer-wait/last-accepted-packet diagnostics above; the
correlated worker failure and working serial route are unchanged.

## Mixer display / HTTPS restart (2026-11-10)

Restarted public-only HTTPS preview at `https://192.168.0.228:4176/synths/all/`
using the existing local certificate/config; exact-CA host check returns 200
with authorized TLS. Keep it running. No deployment or firewall/trust change.

The user's image partly crops the top due to camera pan/zoom, but the mixer
also has a genuine viewport-breakpoint mismatch: on a phone its fixed 980 px
face gets a full-width LCD, three knob columns and master below the strips.
The narrow mixer rules now use its named **panel-width container** (760 px),
preserving desktop arrangement when a phone camera views the full-width mixer.
Ambience is excluded and retains its existing responsive policy.

Existing mixer/Effects checks: **35 tests / two files**, 11.25 s; public build/
package checks pass, Vite **33.58 s**. Actual browser 390 x 844 and 1280 x 900:
same 230 px LCD column beside eight knobs, master beside strips, no LCD text
overflow; phone document width 390. IDs/poses/mixer values survive reload
unchanged. Report `m4a-mixer-panel-display.json`, screenshots
`.tmp/mixer-display-{phone,desktop}.png`. No audio, engine/worker/default change.
Narrow embedded-container fallback retained but not exercised by this fixed face.
Next: physical phone usability confirmation, then resume the bounded producer
waiting / last-accepted-packet measurements for the retained worker failure.

## Confirmed phone timeout resolution (2026-11-10)

The restarted PID 20492 serves host HTTPS correctly but times out from the
phone's normal Chrome (`192.168.0.21`, same home LAN/no VPN). Read-only inspection
finds the **sandbox-owned process SID** matches the existing
`codex_sandbox_offline_block_inbound` rule. A Node Private allow rule already
exists. Hidden Start-Process inside the sandbox inherits that restricted user;
host-local HTTP 200 did not verify external reachability.

Stopped only the verified owned preview and relaunched the same public-build
HTTPS command through **approved outside-sandbox execution**. PID **8368** has
the normal user's distinct SID, listens at `192.168.0.228:4176`, and passes
exact-CA HTTPS status 200. The user confirms **"Page loads now"** on the phone.
No firewall/security rule, trust, app/build, DSP/default or deployment change.
Keep this server running. Future agent restarts must use `require_escalated`
execution, not an ordinary sandboxed Start-Process. See
[updated launch instructions](SYNTHS_STARTUP_RECOVERY.md) and
`m4a-lan-preview-sandbox-restart.json` for exact attempts, ownership and limits.
Next: phone usability, then bounded worker-wait/last-accepted-packet diagnostics.

## M4a publication-bound timing and exact phone repeat (2026-11-10)

[Timing contracts, desktop/phone evidence and limits](MODULAR_AUDIO_ENGINE_M4A_DELIVERY_TIMING.md)
deliver opt-in All producer task/pool/recycle observations, metadata on the last
accepted packet, explicit later-worker scope, actual sample rate and compact
v2. Generic worker/pool diagnostics remain off; serial remains initial and
buffering stays 512 x six / 64 ms. Runtime **2f9eed09e9122592**, host
**all-preview-delivery-v2**, unchanged 296,101-byte Rust/Wasm hash.

**233 tests / 30 files**, **178.26 s**, and public build/package checks
(**47.50 s**) pass, including real three-rate single/pool workers, independent
state, opt-in core/FM exact PCM and legacy DSP. Desktop worker and serial each
complete **668,956 frames / 18 events**, three signal taps, no delivery/event
misses. Compact worker report is **2,724 chars**; reload preserves poses/IDs,
clears the report and returns to serial. Worklet wall-time clock unavailable,
not zero CPU. No physical listening verdict or native clipboard readback claim.

New actual phone run **98e7ef6f-cee4-4c47-baf7-bc0f190736fa** reproduces the old
failure exactly: nine accepted packets, zero lead **4,608**, stop **4,736**,
**128 missing frames**. Last packet was accepted at source **1,792**; at send,
producer had zero free / six in-flight slots and recycles only through **1,535**,
task wait max **0.30 ms**, last render **0.20 ms**. Later worker handled recycles
through **4,607**, rendered 15 blocks, task wait max **0.40 ms**. This focuses
the next experiment on buffer recycling/holding/delivery, but does not identify
a message leg, callback batch boundary or CPU cause. Startup/holding pollutes
pool/recycle maxima. Original failed/unassessed verdicts remain intact in
`m4a-phone-worker-delivery-timing.json`. See linked doc for desktop evidence.

**Next implementation:** explicit six-versus-eight-slot comparison at unchanged
512-frame cadence, **64 vs 85.33 ms**, six default and serial initial. Capture
actual capacity/source/build; do not silently increase buffering, promise a
cure or migrate more roles. Keep confirmed normal-user LAN HTTPS PID available;
no deployment, firewall/trust change or native Application Control bypass.

## M4a explicit capacity comparison: negative phone result (2026-11-10)

After `758a19e`, [six/eight comparison contracts and exact results](MODULAR_AUDIO_ENGINE_M4A_CAPACITY_COMPARISON.md)
add an explicit All capacity selector: six / 64 ms remains default, eight /
85.33 ms adds 21.33 ms at unchanged 512-frame / Message cadence. Serial remains
initial; controls disable while active and reload returns to serial/six. No
schema or engine-asset change. Host **all-preview-delivery-v3**, runtime still
**2f9eed09e9122592**. Source/score SHA256 identity is included in compact v2;
FX/mixer state is excluded and must remain unchanged during a comparison.

**86 tests / five files**, **63.06 s**, public package build **50.12 s**, pass.
Actual desktop six/eight each complete **668,956 frames / 22 events**, three
signal taps, no misses, matching source fingerprints (independently hashed).
Eight reports correct 4,096-frame / 85.33 ms / 262,144-byte pool; compact text
2,787 chars. Reload pose/ID preservation and experiment reset pass. Reports
`m4a-capacity-*.json`, screenshot `.tmp/m4a-capacity-comparison.png`.

The phone returns **one unique eight-slot run** twice:
**12ad3fdc-f878-4277-a59e-032b29bc6dc5**, retained once in
`m4a-phone-worker-eight.json`. It still accepts **nine packets**, zero lead
**4,608**, stops **4,736**, **128 missing**. Output is **8,832** due to the extra
startup delay. Eight has one early handled recycle (511), versus six's three
(1,535); last packet arrives at source 768 versus 1,792. Adding their initial
delays gives identical active output cursor **4,864 / 101.33 ms** at that
arrival. This is a batching clue, not a browser cause/100 ms guarantee. No
matched six-slot v3 phone input hash was supplied; no exact-input phone pair is
claimed. Eight's negative verdict remains failed/unassessed. Do not promote it.

**Next bounded implementation:** a short explicitly muted worker delivery probe
that uses existing recovery behavior to observe subsequent arrivals/misses
without repeatedly playing broken audio. Preserve normal first-miss guard,
six-slot and serial defaults. No more speculative default buffer increases or
broader source migration. Keep normal-user HTTPS server running.

## M4a muted recovery probe: actual phone evidence (2026-11-10)

[Probe contracts and exact results](MODULAR_AUDIO_ENGINE_M4A_SILENT_PROBE.md)
implement a separate opt-in two-source-second worker diagnostic. Own gain is
zero before connection/arming; only this path allows recovery after misses.
Normal audible preview retains the first-miss guard; serial/six remain defaults.
Probe completion is separate from a full-score pass. Host v4; engine unchanged.
**96 tests / five files (58.40 s)** and public package build **44.30 s** pass.
Actual desktop probe renders 96,000 muted frames; immediately subsequent normal
preview completes 668,956 / 16 events with three signal peaks and no misses.
Both full input hashes match (independently checked); repeat/reload checks pass.

Phone unique run **34cae2c4-49bc-4044-b421-077d96bfdaab** completes the muted
96,000-frame probe, but has **36,608 missing frames, 19 recoveries, 67 late /
121 accepted packets**. First zero lead remains 4,608; largest arrival gap is
**4,864 / 101.33 ms**, above six/eight capacity. Producer is repeatedly resuming,
not permanently stuck. Worklet timing remains unavailable; no message-leg/browser
cause, physical listening pass or matched-input prior phone pair is claimed.
Exact report is `m4a-phone-worker-silent-probe.json`; failed full-score verdicts
remain intact. Normal-user HTTPS PID8368 stays up; temporary QA server is stopped.

**Next:** explicit twelve-slot / 128 ms comparison at unchanged cadence to test
headroom above the observed gap. Start with muted phone probe; request guarded
audible listening only after clean delivery counters. Do not change defaults,
promote a partial probe to a music-quality pass, deploy, or migrate more roles.

## M4a twelve-slot headroom candidate (2026-11-10)

After `ce4908c`, [explicit twelve-slot comparison](MODULAR_AUDIO_ENGINE_M4A_TWELVE_SLOT.md)
adds **512 x 12 / 6,144 frames / 128 ms / 393,216 PCM bytes** as an opt-in All
choice. Existing two-to-eight protocol bounds remain; only exact 512/12 extends
them. Serial/six defaults, transient reset and ordinary guard remain. Host v5;
regenerated runtime **d6a0341e5edf2d57**, byte-identical Rust/Wasm **296,101 bytes**.
No scheduling/ownership/queue algorithm, setup schema, legacy DSP or migration
change. This tests headroom above the phone's observed 4,864-frame gap.

**97 checks / five files (45.50 s)**, **eight pool regressions / three (0.683 s)**,
public package/build **33.60 s** pass. Actual 390 px desktop muted probe completes
96,000 frames with 188 packets and no misses; subsequent matching-input normal
preview completes 668,956 / 16 events with three nonzero peaks, no misses and
guard true. Reload resets Serial/six/report. Reports `m4a-twelve-*.json`, image
`.tmp/m4a-twelve-slot.png`. Normal-user HTTPS stays up.

Phone unique v5 twelve-slot probe **63fa43b8-f202-4794-9833-950a2a8a622e** now
completes 96,000 frames / 188 packets with **zero missing/late/rejected/stale /
bad-recycle counters**. Largest arrival gap stays **4,864 frames**, minimum steady
lead **1,152 / 24 ms**. Headroom covers this observed run. Exact raw report:
`m4a-phone-worker-twelve-probe.json`. The subsequent audible report is now
**3c2c7faf-e696-499d-9e57-95493ec3bff3**, retained in
`m4a-phone-worker-twelve-audible.json`: **668,956 planned/consumed/rendered frames,
16 events, 1,307 blocks, zero delivery/event errors, complete/pass true**. Actual
worker / Message / twelve / 128 ms, ordinary guard true, no probe/fallback.
Minimum steady lead 1,152 / 24 ms and largest gap 4,864 / 101.33 ms persist. Its
source fingerprint matches the phone muted probe. The user's **sounded fine**
statement is linked to this ordinary run in the evidence doc; raw generated
listening stays unassessed. This is one clean full-score bass run with user
listening, not a matched-input six/twelve pair or lock-screen guarantee.

**Next bounded implementation:** repeatable same-input six/twelve muted
comparison, retaining one captured source/score across trials, before a
lower-latency message-leg experiment. The existing full phone report is captured;
no repeat audible run is needed for this checkpoint. Assess the explicit 128 ms
tradeoff before default promotion. Do not assert a Chromium timing guarantee or
broaden migration. Preserve Serial/six, ordinary guard, legacy keyboard and LAN.

Evidence-only follow-up after `84b6916`: parsed and cross-checked phone reports
for exact input/build/capacity identity, guard/probe distinction, full frame/event
completion and zero delivery errors. Prior 105 checks/build are historical,
not rerun or relabeled; no executable/browser/server change in this follow-up.

## M4a controlled captured-input comparison (2026-11-10)

After `8c58a8a`, [captured comparison contracts/results](MODULAR_AUDIO_ENGINE_M4A_CAPTURED_COMPARISON.md)
add **Compare 6 / 12 blocks silently** under All / Setup / One worker. It holds
one original source/tuning lease, compiles/serializes one plan, loads one asset
set, then prepares two independent worker/worklet owners sequentially from
fresh parses of that same plan. Six then twelve is fixed order; each is muted
before connection/arming and observes 96,000 source frames with existing recovery.
Each route disposes before the next starts; original lease releases only after
overall cleanup. Stop/Panic/source changes/host close/fallback abort with partial
evidence; cancellation at second preparation cannot start another owner.

Parent/child IDs and hashes are retained. Compact comparison kind v1 contains
two bounded rows in one copy; full report retains both complete probe reports.
Comparison completion is separate from full-score pass/listening and does not
erase a six-slot failure. Host **all-preview-delivery-v6**; engine remains
**d6a0341e5edf2d57**, byte-identical Wasm. Serial/six defaults, normal first-miss
guard, capacity selection, legacy keyboard, persistence schemas and DSP remain.
Phone-status prose now distinguishes twelve's successful bass run from six/eight.

**108 tests / six files (63.04 s)** pass; final **11 controller checks (1.12 s)**
overlap and add host-close/second-boundary cancellation coverage. Final public
package/provenance build **36.01 s** passes (existing chunk-size warning).
Actual **390 x 844** desktop pair completes two 96,000-frame muted windows with
distinct run IDs and identical independently verified source hashes. Selected
eight is unchanged; controls disable while active. Combined compact **3,590 chars**.
Stop retains one incomplete 11,776-frame trial, no second. Subsequent ordinary
Serial completes 668,956 frames with three nonzero peaks, normal guard/pass true
and same hash. Final-build repeat and copy status pass; reload selects Serial,
clears report and exposes six. Reports `m4a-captured-comparison-*.json`; images
`.tmp/m4a-captured-comparison.png` and `...-summary.png`. Physical listening and
native clipboard payload readback are not claimed. QA server/tab/viewport cleaned
up; normal-user LAN HTTPS PID8368 remains up. No deployment or security change.

**Actual phone pair now received:** parent
**e8df4d20-35ae-44bf-b146-8023c12d8463**, both supplied child hashes match its
captured source hash, same engine/48 kHz/bass/Message/512. Six then twelve each
render/consume the 96,000-frame diagnostic window. **Six: 36,608 missing / 286
quanta, 19 recoveries, 67 late / 121 accepted packets, first zero lead 4,608**.
**Twelve: zero missing/late, 188 accepted, minimum steady lead 1,152 / 24 ms**.
Both maximum arrival gaps remain **4,864 / 101.33 ms**, no rejected/stale/bad
recycles. Raw report `m4a-phone-captured-comparison.json`; exact limits/rows in
linked doc. Full phone plan bytes are absent, so hashes are compared, not
independently recomputed. Both child/parent full-score verdicts stay false and
listening unassessed. Prior clean audible twelve run remains separate.

This supports capacity-dependent delivery at this device/context, with source
controlled. Pool size and startup delay vary together; trial order/warmup and
device scheduling remain uncontrolled. No CPU speedup, browser cause, all-role
or lock-screen guarantee. Evidence follow-up after `daeb335` parses/cross-checks
the supplied report; prior 108/11 checks/build are not relabeled as new runs.
No executable/browser/server/default change.

**Next bounded implementation:** explicit reverse-order **twelve then six**
muted pair using the same captured plan, with order metadata in full/compact
reports. Keep current six-then-twelve initial choice. Check whether the capacity
difference survives order/warmup before a lower-latency message-leg experiment.
Preserve fresh owners, cancellation, false music-pass verdicts, Serial/six
defaults and working explicit twelve/128 ms. No broader migration/deployment.

## M4a reverse order implemented and phone replicated (2026-11-10)

After `50a4fb3`, [reverse-order contracts and exact evidence](MODULAR_AUDIO_ENGINE_M4A_REVERSE_ORDER.md)
add a worker-only transient order selector: six then twelve remains initial;
reverse is explicit. Full/compact reports record `comparison.order` and bounded
`comparison.capacities`, trial rows/summary follow execution order. Invalid
orders fail before lease; Stop retains only actual trials. Reload returns to
Serial/six/six-first. Existing capture/owners/muting/guards and legacy DSP/schema
stay intact. Host **all-preview-delivery-v7**, engine **d6a0341e5edf2d57** unchanged.

**112 tests / six files, 60.26 s**, focused overlapping **21 / two, 1.39 s**,
public package/provenance build **45.88 s** pass. Actual 390 px desktop reverse
and forward pairs each complete two muted 96,000-frame windows, no missing PCM,
same independently verified input hash across all four trials. Metadata/copy
status correct (compact 3,647 chars); ordinary capacity stays eight. Reverse Stop
retains only incomplete twelve / 8,704 frames. Normal Serial afterward completes
668,956 / 32 events, three nonzero peaks, guard/pass true. Reload defaults/report
reset pass. Reports `m4a-reverse-*.json`, image `.tmp/m4a-reverse-summary.png`.
QA tab/server/viewport cleaned; normal-user LAN HTTPS PID8368 remains running.

**Phone reverse parent f324403f-9835-427b-ae2d-9479bd5691b6**: order twelve-first,
capacities [12,6], matching supplied child/parent hashes/build, both 96,000-frame
windows. **Twelve first clean**, 188 accepted / min lead 1,152; **six second
36,608 missing / 286 quanta, 19 recoveries, 67 late / 121 accepted**, first zero
lead 4,608. Both gaps 4,864 / 101.33 ms; no rejected/stale/bad recycles. Delivery,
lead and arrival counters exactly match the forward pair per capacity. Raw
report `m4a-phone-reverse-comparison.json` and artifact cross-checks retained.
Source differs between pairs, not within either; phone full plans absent.
Simple first-trial warmup is unlikely, but startup delay/pool size still vary
together; no browser/CPU cause or lock-screen guarantee. Muted full-score
verdicts remain false/unassessed; prior audible twelve run stays separate.

**Next bounded implementation:** audit then explicitly separate twelve-slot
render-ahead capacity (128 ms) from output startup delay; compare startup
**64 vs 128 ms** with the same twelve-slot pool, capture, cadence and scheduling.
Preserve existing defaults and accurate queue-capacity/latency metadata. Reduced
startup must not be labeled reduced live-event latency: already-rendered state
still imposes lookahead. Verify queue/clock contracts before muted phone test,
then audible guarded listening only on clean delivery. No migration/deployment.

## M4b captured pitched-set paths (2026-11-10)

After `6c4420a`, user prioritizes voices/interaction/conflict coverage over lower
latency. [Full contracts/results](MODULAR_AUDIO_ENGINE_M4B_PITCHED_SET.md) add
Source scope **Chosen pitched voices together**, explicit ready-role checkboxes
and unsupported reasons. Select ready voices refreshes readiness/selection.
One private graph owns up to five actual core/FM sources/events, common clock,
stable lead/counter/rhythm/pad/bass IDs 1..5, separate raw stems into each existing
FX/mixer path and shared master. Combined 2,000 notes / 4,000 events; longest
tail sets end. Empty/missing patterns remain silent, entirely empty sets fail;
mute/solo-excluded roles are named and omitted. No unsupported patch replacement.

Connect all gains/taps before one arm. Silent probe mutes all stems; normal
first-miss guard stops all coherently. Any source/tuning/score/tempo/selection/
host invalidation or Stop/Panic disposes every private route/gain/tap/lease,
leaving legacy keyboard connected. Per-role notes/IDs/kinds/raw+channel peaks
are in full/compact reports; active roles require signal, empty ones do not.
Normal song transport stays excluded during preview. Single scope/Serial/six
defaults, original IDs/patches/setup schema and keyboard backend stay unchanged.
Capacity-order comparisons remain single-role only. Host **all-preview-delivery-v8**;
engine **d6a0341e5edf2d57**, byte-identical 296,101-byte Wasm; no DSP/protocol rebuild.

**286 tests / 34 files (112.66 s)** pass. A real browser found absent counter
pattern incorrectly rejected by the set; pre-fix error/pass false/no executor
is retained. Fix treats absent set slots as silent while single missing-pattern
rejection remains. **24 final overlapping tests / three (1.44 s)** pass, including
exact raw PCM versus five independent sources, duplicate per-owner note IDs,
noncontiguous buses/silent roles, budgets and cleanup. Final public package /
provenance build **33.66 s** passes. Existing chunk warning; no AC bypass.

Actual 390 px browser: current three-slot muted probe [1,2,5] passes, with sparse
lead/counter zero notes correctly reported. Temporary explicit QA choices and
notes exercise **all five active**: four core + counter FM, worker/twelve /128 ms,
**905,116 frames / 56 events**, no misses, five positive raw/channel peaks and
master 0.25449. Lead fader -16 dB repeat has identical input hash, lower Lead
channel peak and other channels active, no misses; restored exactly 0.75.
Sampled FX peaks are not exact wet-PCM gain parity. Keyboard Chord remains
active after group Stop; its own Pause works. Lead patch edit coherently stops
all as source-changed at 33,664, pass false. A temporary QA-server auto-expiry
also exercises accurately reported serial startup fallback; after only that
server restarts, actual worker retry passes. Fallback is not a worker verdict.

Original generators/patch names restored, legacy normal Play shows five notes /
25 lit meter segments, then Stop. Reload restores original voices/fader,
single scope/Serial, clears report and starts nothing. Continuous score regenerates;
no exported setup-byte round-trip claim. Raw full-plan hashes and restore/report
invariants independently checked. Reports `m4b-*.json`, image
`.tmp/m4b-all-active-signals.png`. Physical listening/isolated wet PCM unassessed.
QA tab/viewport/server cleaned; normal-user LAN HTTPS PID8368 stays running.

**Phone sparse set received:** run **51495cad-3673-4bda-b8f8-ada1ff6f6173**, host v8,
48 kHz actual worker/twelve/128 ms. Lead/counter/bass IDs **[1,2,5]**, core source
note counts **[0,0,8]**, no exclusions. Muted 96,000-source / 102,144-output-frame
probe completes, 188 accepted/rendered blocks, no delivery/event errors, min
steady lead 1,152 / 24 ms, max gap 4,864 / 101.33 ms, no zero/over-capacity
observations. Exact report `m4b-phone-current-voices-probe.json`; hash recorded
but full phone plan bytes absent. All peaks zero are expected under mute.
This verifies Bass plus two silent instances, not active three-voice/FX/listening
or full-score acceptance. Full-score complete/pass stays false, listening
unassessed. Evidence-only follow-up after `80ea6b5`: artifact checks, no new
DSP/browser/build runs, source/backend/default or server change.

**Next bounded aid:** explicit selected-voice audition with the actual chosen
patches/tuning and labeled diagnostic test notes, leaving the user's sparse
score untouched. Distinguish test-note audition from captured-song preview in
UI/reports; never substitute a fixture patch. This enables phone active-voice
coverage without frustrating grid edits. Keep muted probe then guarded audible
acceptance, per-role signals/identity, current twelve-slot option, ordinary guard
and legacy keyboard. Then audit actual All percussion seam/kit/hit translation;
native piano/classics remain separate adapter gates. Longer phone lookahead
remains acceptable; defer startup-delay work. No default switch or deployment.

## M4b selected-patch audition delivered (2026-11-10)

After `70ee524`, explicit group Material **Test-note voice audition · song
untouched** activates every selected current core/FM voice with diagnostic
notes, retaining actual patches/tuning/source leases and per-role FX/mixer.
Individual 0.5 s attacks in 0.75 s slots, then two seconds together, fixed test
120 BPM. No song edits or fixture patch substitution. Worker **Silent full
audition probe** observes the entire schedule/tails; normal score probe remains
two seconds. Material/metadata and test-note labels appear in full/compact v2
reports. All muted probes keep full complete/pass false. Host **v9**, engine
**d6a0341e5edf2d57** and Wasm unchanged. Original defaults/schema/keyboard remain.

[Exact contracts and results](MODULAR_AUDIO_ENGINE_M4B_VOICE_AUDITION.md):
**31 focused checks (2.27 s)** including actual five-source threaded raw equality,
**146 regression checks / nine files (63.88 s)** and public build/package checks
(**48.67 s** Vite) pass. Actual 390 px browser original Lead/counter/Bass
IDs **[1,2,5]**, each **two notes**, completes **282,000 frames / 12 events** in
both worker/twelve and explicit Serial. Worker full muted and audible runs
both accept **551** blocks with no delivery/late/overflow/recycle errors.
Audible source/channel signals positive for all three, master **0.062137**;
Serial master **0.062790**. Silent source/channel/master peaks zero, top verdicts
false; physical listening unassessed. Same full audition hash across all three
independently checked. Actual source patches equal original score packets.

Ordinary score probes before/after preserve exact full hash and **0/0/11**
notes. Later silent probe has only an existing **8.85e-7** shared wet tail;
all probe sources remain zero. Private Stop leaves legacy Pad/Piano Chord
active; own Pause works. All original generator/patch selectors unchanged;
reload clears report, starts no audio and restores selected/Serial/six/current
progression. Continuous regenerates on reload; no setup-file byte claim.
Artifacts `reports/modular_audio/m4b-audition-*.json`, screenshot
`.tmp/m4b-voice-audition-signals.png`. QA tab/viewport/loopback server cleaned;
normal-user LAN HTTPS PID8368 serves refreshed local build, no deployment.

**Next:** phone full silent active-voice audition requested at worker/twelve;
check each selected role two notes, all planned/consumed/rendered frames and
events, no misses/late/recycle errors, host v9/material voice-audition. Only
after clean counters request guarded audible listening, preserving run/hash
linkage. Pending phone evidence does not block a read-only audit of actual All
percussion kit/hit/locks/per-role FX routing for the next finite adapter.
Native piano/classics and normal transport migration stay gated. Keep longer
phone lookahead; startup-delay experiments remain deferred.

## M4c percussion seam audit (2026-11-10)

After `2d3ca5f`, [the actual All percussion audit](MODULAR_AUDIO_ENGINE_M4C_PERCUSSION_AUDIT.md)
finds a necessary configuration gap before adapter work: owned raw hits are
correct, but graph preparation cannot yet carry per-drum kit levels/palette.
Scene/basic/classic identity must be resolved from the actual instrument;
basic 808 and classic TR-808 are different kernels. All currently defaults to
native Felt/Crisp and does not pass a query percussion override to Generator.
Initial adapter must explicitly accept ready actual Wasm basic kits, retaining
native/classic exclusions. Reuse All drumStepEvents expression and report the
legacy basic-kit sound-lock limitations. No automatic source replacement.

Reproducible `tools/auditAllPercussionSeam.mjs`: seven source PCM experiments,
four exact agreements and three expected configuration/mapping mismatches,
48 kHz / 48,000 frames / one timed event, different render partitions. A .25
kit level produces legacy peak **0.137166** versus unconfigured graph
**0.546370**. Raw report `m4c-percussion-seam-audit.json`. Existing **27 exact
golden PCM comparisons** and **30 tests / five files (11.58 s)** pass. No DSP,
browser/build/device or generated asset change; legacy DSP remains unchanged.

Next implement validated versioned immutable **owned kit preparation config**
with Rust/JS/ABI/save-reload, absent-config compatibility and exact configured
legacy parity/allocation/independent-instance checks, before All integration.
Then actual Wasm-kit lease, dry percussion role-gain input (avoid live-kit sleep
timers), finite hit compiler/source ID6 and six-stem diagnostics. Phone v9 full
pitched muted/audible reports arrived clean; listening feedback remains pending.
Record those runs in the audition checkpoint separately; this foundation does not depend
on its listening result. No default promotion, latency work or deployment.

## Phone three-active-voice audition accepted (2026-11-10)

After `87f03e0`, phone muted **dd21d98f-ad66-406f-a3f9-1627b774da42** and
audible **b664110c-93c1-4fe5-b2fa-cfc08d86d4bc** complete the explicit Lead /
counter/Bass diagnostic: two notes each, **282,000 frames / 12 events / 551
blocks**, actual worker / Message tasks / 512 x 12 / 128 ms, no missing/late /
overflow/recycle errors. Min steady lead **1,152 / 24 ms**, max gap **4,864 /
101.33 ms**. Audible per-role raw/channel and shared master **0.063581** positive,
normal guard true, raw complete/eventPass/pass true. Muted full verdicts remain
false. User confirms **Clean individual entries and overlap**, saved separately
against the exact audible run/hash; automated listening fields stay unassessed.

Both report hash **2deecc4ea004d634dd58f230723a43ef764415375496b779531adedf5ccb26ee**;
complete audible plan supplied and independently rehashed. It differs from the
saved desktop plan only in two captured global gains; those exact values yield
the reported full hash. Phone muted full plan absent, linked by matching hash.
Raw compact muted report, normalized audible compact excerpt, complete normalized
plan, provenance/checks and user feedback retained as
`reports/modular_audio/m4b-phone-voice-audition-*.json`. Not a verbatim copy of
the full audible histogram payload. Precise model/audio route/background state
unknown; five voices/FM/native/classics/drums/real-song/lock-screen not accepted
by this pair. [Exact results](MODULAR_AUDIO_ENGINE_M4B_VOICE_AUDITION.md).

Setup's informational phone hint now reflects the bounded three-active-voice
result. Artifact/frame/event/hash/listening-link checks and final public
provenance/package build (**35.71 s** Vite) pass. No new browser/DSP rerun or
runtime/engine/default/source change; build refreshes local LAN only.
Next **owned kit preparation configuration** under the committed percussion
audit, then exact configured legacy PCM/independence/persistence/allocation
checks and Wasm-kit-only finite All integration. No further phone audition
request is pending for this three-voice diagnostic. No latency work/deployment.

## M4c owned basic-kit configuration delivered (2026-11-10)

After `57f00ee`, [versioned kit preparation](MODULAR_AUDIO_ENGINE_M4C_KIT_CONFIGURATION.md)
closes the audited gap: `legacy.percussion` module2 requires config version1,
selected Felt/Crisp/basic808/Hand palette and exactly 14 on/level/tone/decay rows.
Rust/JS validation, generated descriptor and owned preparation ABI enforce
kind/version/bounds and immutability after prepare. Module1 keeps raw fixtures;
module2/missing config and module1/config combinations reject. Actual old
d6a JS/Wasm reject module2 instead of ignoring its kit. Graph owns each
kit; reset retains it and restores initial legacy unity-to-target smoothing.
Save/reload and independent reset/cancel are exact. No live-state transplantation,
global state, new algorithm or legacy singleton change.

Graph **62315b4104f2fc7e**, **311,626 bytes**, source/runtime/cache manifests
refreshed. Legacy percussion rebuild is **byte-identical** at **92,363 bytes** /
SHA256 **a0137cdb5805902ab3f8e5d67512ed591a32b5c22420fde2c53ab04fb7cb064f**;
only its source manifest changes. Original 27 raw PCM goldens remain exact.

**322 tests / 38 files (110.12 s)** pass, including **9 kit checks** that
cover **56 exact configured stereo PCM comparisons**, all four palettes and
historical slots, edited/disabled levels/tone/decay, receive order/choke/long
swish tails, 44.1/48/96 kHz, save/reload/reset, immutable/invalid configuration,
independent handles and actual threaded drum/kick buses (**80,037 frames**, all
18 events, no errors). Final independent reset/cancel source comparison is
also checked. **30 Wasm allocation audits**, including 12 configured kits,
report zero allocation/reclamation/growth during render/enqueue/cancel/reset.
Final public package/provenance build **47.50 s** passes. A comment-only stale
legacy source manifest was caught and rebuilt before final success; bytes
remain unchanged. Version2 also exposed a type-only descriptor lookup, fixed
to use type/version before the final full rerun. No native executable/AC bypass
or new browser/phone run.

Artifacts `m4c-kit-configured-pcm.json`, `m4c-kit-allocation.json`, and
`m4c-percussion-seam-configured-audit.json`; original negative seam evidence
preserved. Source PCM is not wet effects, browser queue or physical listening.
Phone v9/d6a three-voice listening remains its own prior build/material gate.

**Next at this checkpoint (delivered below):** actual ready Wasm basic-kit-only
host lease and finite drum compiler, capturing the current kit/palette/private
hit-ID policy and shared All `drumStepEvents` expression. Extend the explicit
group/report to source ID6/six stems and combined <=4,000 events. Native Web
Audio/classic machines stay named unsupported; no normal transport migration.

## M4c finite All Wasm kits delivered (2026-11-10)

After `1dd3a77`, [actual Wasm basic-kit integration](MODULAR_AUDIO_ENGINE_M4C_ALL_KITS.md)
adds Drums to selected-source preview and **Chosen sources together**. Actual
ready module/node, basic palette/model and dry-room invariant are required;
native/classic families remain named unsupported, with no sound substitution.
A kit snapshot and live hit-counter base feed module2/source ID6 before current
external percussion inserts/mixer. It avoids legacy sleep timers and never
touches the live counter/wake/voice queue. Kit/revision/source edits invalidate
the whole group; existing keyboard/pads and normal backend remain connected.

Shared All `drumStepEvents` expression, finite cycle0/fillfalse/captured seed,
semantic IDs/variation/duration and ignored sound-lock/track metadata are
preserved. Private IDs increment for enabled expanded bookings only. Six-source
combined budget <=4,000 events /2,000 notes, current finite 48 kHz bounds,
longest tail including percussion8.1 s. Diagnostic audition uses actual kit
four-hit entry + overlap beat (**17 hits**) without touching the score. Full
silent audition observes all sources/tails; ordinary probes remain two seconds.
Six-stem compact/full reports distinguish notes/hits and actual kit/ID base.
Host **v10**, engine **62315b4104f2fc7e** unchanged. Defaults/schema/transport /
keyboard stay unchanged; percsingle capacity comparison is hidden/rejected.

**163 checks /12 files (51.45 s)**, including real mixed six-source worker PCM
exact versus independent graphs/kick bus and invalidation/limits/UI, pass.
Public package/provenance build **34.44 s**, final phone-hint build **32.09 s**
pass. Actual 390 px browser Hand+three core completes muted/audible **634,800 /
29 events /1,240 blocks**, all six (temporary four core+counter FM+Hand) completes
**706,800 /37 /1,381** in worker/twelve and explicit Serial, all audible stems
positive and no delivery/event/recycle errors. Six-source worker master0.212631.
Drums fader0.75→0.55 leaves same raw/input hash, channel ratio0.159958 and other
channels active; restored0.75. Kit change stops all at20,736/passfalse. Score
capture hash restored before/after kit cycle. Legacy Chord survives private
Stop; legacy pad changes live hit base0→1 while private auditions leave it0.
Selected Drums bus6/96k probe works. Original selectors/defaults/native exclusion
restore on reload; ordinary legacy Play shows5 notes/31 meter segments, later
6/44. Eleven full plans independently rehashed. Sampled wet peaks/desktop audio
are not physical listening; no setup-file byte claim. QA cleanup complete;
normal-user LAN HTTPS PID8368 remains running. Raw `m4c-all-*.json` and image
`.tmp/m4c-all-six-signals.png`; no deployment or new Rust/native executable.

**Phone diagnostic accepted:** guarded audible **7a34d143-4191-4003-b87a-a1e7b00bea1a**,
v10/62315/48 kHz/Message512x12/128 ms, IDs[1,2,5,6], core notes2/2/2 +Hand17hits,
all634,800 source frames/29events/1,240blocks, no errors. Min steady lead1,152 /
24 ms, max gap4,864 /101.33 ms. User explicitly confirms **Clean drum entry and
overlap**, bound separately to run/hash. Raw automated listening unassessed
retained. Compact-only phone export: no independently rehashed full plan or
phone silent pair, and no six-source/native/classic/real-song/lock-screen claim.

**Next check:** same four sources/Hand/worker/twelve, Material **Current
progression**, one complete captured-pattern pass. Sparse Lead/counter may have
zero notes, and native Piano sources are omitted; never label that full-song
migration or active-four-voice listening. Preserve finite scope, guard, current
defaults and longer phone lookahead. Native adapters remain separate work.

## Current captured-pattern desktop gate (2026-11-10)

After `1df4ab0`, actual browser Current progression /three original core slots
+explicit Hand /worker-twelve completes **1,001,116 frames /54 events /1,956
blocks**, no delivery/event/recycle errors, positive Bass/Hand/master0.128747.
Capture has **0/0/11 notes +32 hits**, two intentionally silent sources; native
Piano roles are omitted, so this is not full-song or active-four-voice acceptance.
Run **f1383f7f-ecb6-40e1-a018-541c6038e666**, hostv10/engine62315. Full plan hash
independently verified. Originals/reload defaults restore, QA cleanup complete,
LAN HTTPS8368 remains. Artifacts `m4c-current-progression-*.json`, screenshot
`.tmp/m4c-current-progression.png`.

Original/reloaded graph and independent same-Wasm/independent-Wasm source PCM
are exact at matched127-frame partitions. A 127-vs-509 check differs only in
268 subnormal Bass/reference-mix tail samples, max **1.0662684604623325e-38**,
all differing amplitudes subnormal; drums exact. Existing core boundary denormal
cleanup explains that raw-hash limit. Preserve it as measured, not bit-exact
cross-partition parity; no DSP change. Full details in the integration doc.
Evidence-only step: no new product/build/test-suite change.

**Pending user check:** same phone four-source Hand/worker/twelve, Material
Current progression, one guarded complete pass plus compact report/listening.
This concrete check is ready; wait for its result before further acceptance
or broad/native migration. Earlier diagnostic listening remains accepted
separately. No blocker, default switch or deployment.

## Reusable source-test workflow (2026-11-10)

User responds **its fine** to the current-progression phone listening request,
then explicitly rejects repeated desk navigation/manual settings and requests
larger locally verified changes or a dedicated test surface. Qualitative
feedback is saved in `m4c-current-progression-phone-feedback.json`; no new
run/counter/hash claims. The preceding phone request is closed: do not ask for
that check again or block further work on another raw report.

[Reusable source checks](MODULAR_AUDIO_ENGINE_SOURCE_TESTS.md) adds top-bar
**Tests**, remembered device test settings, a same-panel actual drum-kit selector,
ready-source/phone-buffer shortcut, short-summary copy and full JSON download.
One full batch captures sources/material once and runs complete test notes plus
current progression in Serial and worker/twelve, all muted with first-miss
guarding. Pair fingerprints and exact clocks/events/delivery/recycle evidence
are required; missing evidence fails. Partial/cancel/fallback remains explicit.
Muted automated checks do not claim listening or wet-FX signal acceptance.

Reload testing caught an existing Continuous-mode sound reset. A separate
versioned source/mixer/desk/tempo/mute snapshot now restores actual sounds
without storing its generated buffer or overriding a saved finite song or
explicit front-page preset. Browser Hand/group/material/worker/twelve controls
now restore exactly with no report/controller/audio automatically started.
Fresh test defaults remain Serial/six/selected/current progression.

Next continue larger source-integration milestones with local tests and this
batch; request physical listening only for a meaningful new audible path or
actual device failure. Native Piano is the next ownership/contract audit, not
an automatic substitution. Exact verification is in the linked document. No
new phone request, default backend migration, deployment or AC workaround.

Final affected **132 tests /5 files (57.82 s)** and public build **33.67 s** pass;
earlier ten-file run has148 passing tests. All74 page checks and21 host checks
include Continuous/finite precedence and idempotent no-op rack/mixer restoration.
Actual390px batch **d4cfaf5a-934b-4de9-8131-2ed854a0d501** passes4/4, full
audition634,800/29 plus progression1,001,116/46, no delivery/event/recycle errors.
After another reload, guarded audible **486e6050-1953-4930-944a-44fb937a76f8**
has the exact same audition input hash, completes634,800/29, all four raw/channel
signals/master positive and no missing frames. Thirteen full plans independently
rehashed; real downloaded JSON equals full DOM report. QA source/defaults/tab /
viewport restored/cleaned; isolated loopback server stopped, LAN HTTPS remains.
Exact raw evidence and limitations in the source-tests doc; no physical listening
claim from browser.

## M4d piano synthesis preparation (2026-11-10)

After `2aca381`, [piano ownership/source audit and preparation port](MODULAR_AUDIO_ENGINE_M4D_PIANO_PREPARATION.md)
finds actual piano generation is JS plus per-voice native Web Audio processing,
and Iowa measured playback is a distinct JS worklet. Do not describe these as
already owned Rust engines. Actual **Felt Keys (updated)** uses acoustic
**felted**, not the simpler modal felt model.

New portable `synth-engine/piano` ports modal felt/electric strikes +2048-frame
bodies, and actual grand/felted/upright acoustic synthesis including string modes,
hammer/action noise, soundboard, wear and normalization. Version1 owned immutable
buffer handles are independent, prepare/copy/free off the audio callback, with
no singleton DSP. New worker/cache path is explicit opt-in in Tests, with
separate policy cache keys, exact pitch/velocity/body semantics, actual counters
and visible original-renderer fallback. Default remains original JS. Existing
native envelopes/filters/stereo/effects/voice allocation and normal transport
remain; piano is still honestly excluded from the finite graph compiler.

222 strike comparisons across six rates/controls/registers plus actual updated
Felt preset:183 bit-exact, maximum error1.4901161193847656e-8. All108 modal bodies
bit-exact. Independent handles/instances/settings reload/disposal and worker /
cache/fallback boundaries pass. Raw hashes/metrics retained. No native executable
or AC bypass; builds use local offline Rust-to-Wasm. Exact application/browser
results follow in the linked doc. Next owned piano graph voice-chain contract
and dry native parity; matched/table/measured/classic families remain separate.

Final Wasm **d592cc8a0af5164e /48,561 bytes**, graph still62315. Broad **141 tests /
11 files (71.44 s)**, final15 targeted renderer/pool/UI checks and public package
build **36.09 s** pass. Actual390px normal Continuous Play on unchanged native
Felt Keys(updated) yields19 Rust notes /zero fallback/original/unsupported, active
Pad/music/master meters. Temporary native Starmap Piano +keyboard Chord reaches
30 Rust notes /11 Rust bodies, no fallback, Pad7 and masterL/R8/7 lit segments.
Stop/Pause work. Reload persists Rust choice, resets counters and does not play;
all source/patch selections restore exactly. Original JS selection then restored
and verified after reload. Raw browser records and222-case hashes retained;
physical listening, device timing, wet PCM parity and full piano graph ownership
are not claimed. QA tab/viewport/server cleaned, LAN HTTPS remains; no new phone
check or deployment. Continue with owned piano voice-chain contracts/parity.

## 2026-11-10 — M4e owned finite piano voice and full-path checkpoint

Continue from [M4e](MODULAR_AUDIO_ENGINE_M4E_PIANO_VOICES.md). User explicitly
requests sustained port work and commits with the configured **lizMcLizface**
identity (`121907922+lizMcLizface@users.noreply.github.com`); no push/deploy.

`legacy.piano` v1 now owns prepared buffers, note/owner contracts, finite gain
and lowpass automation, pitch-envelope cursors, polyphonic slots and release.
The five supported variants still share two synthesis routines. Typed persisted
configs regenerate owned PCM; irregular-block/save/reload/reset replay is exact.
Actual native source capture supports both direct Instrument and Wasm-wrapper
native instances. Accepted filter bases avoid sleeping AudioParam defaults and
preserve the existing 11 kHz ceiling. Input holds wake shared compressor/FX only,
keep legacy oscillators asleep and retain tails on release. Existing defaults,
normal transport, JS preparation choice and keyboard backend remain operational.

Final graph **d68f9dc21e528d44 / 348,821 bytes**. Five new piano allocation audits
and previous30 report zero render allocation/reclamation/growth. Mixed real worker
PCM (two pianos/core/FM/drums + sidechain master) is exact against serial. Broad
**489 tests /70 files** pass; later **88 tests /5 files** cover direct-native
capture, piano DAG, Instrument behavior and All. Public package build passes.

Seven actual browser dry comparisons pass: max relative RMS0.0012690086033075425,
min correlation0.9999991948255997. Zero-pitch Felt acoustic max error4.470348e-8.
This is approximate native SRC parity, explicitly not bit identity. Actual
four-case All-host batch passes:942000-frame audition and726000-frame progression
on serial and actual worker, matching input hashes, zero worker delivery gaps or
bad recycles. Separate audible942000-frame worker run has all six raw/channel
peaks positive, master0.15849483013153076, zero underruns/late blocks, pass true.
Evidence is in `reports/modular_audio/piano-{native-voice,full-path-muted,full-path-audible}-browser.json`.

`tools/piano-voice.html` is a fixed standalone test page: one full muted batch,
one listening audition, dry reference comparisons, Stop and compact-copy output.
It creates its own host; All storage/settings/song are untouched. Direct LAN URL
is `https://192.168.0.228:4176/tools/piano-voice.html`; existing HTTPS server serves
this local build. No remote-app asset proxy or deployment is needed.

Limits:48kHz only; lowpass only; finite prepared note-on/panic/cancel, not live
pedal/off/retune. Native shared pitch/filter wander/vibrato/LFO and voice-steal
pre-fades are rejected, not dropped. Fixed test host explicitly disables voice
wander.128 banks/64MiB retained PCM/source/2000notes/65536points/32slots, plus All
120s and combined graph budgets. Serial preparation may do substantial work on
the worklet thread; no production live-start deadline or CPU improvement claimed.
Matched acoustic, calibrated tables, Iowa and classic adapters remain unported.

Next: meaningful phone mixed-piano listening/counter gate on the fixed page,
then shared native piano modulation and steal-fade parity. Keep batching local
verification; do not resume tiny settings-matching phone requests or latency
experiments. Human listening, lock-screen behavior and isolated wet PCM parity
remain unassessed by these new reports.

### Final M4e test-page cleanup checkpoint

The follow-up keeps muted verdicts distinct from audible acceptance and omits
zero analyser rows from muted compact output. At375 CSS pixels the document is
375 pixels wide (no horizontal overflow); all four full-path cases pass again,
with zero worker gaps. The compact result is909 characters and Copy reports
success. Reload returns to Full path ready, with no report/audio players and no
automatic playback. Raw summary: `piano-fixed-page-browser.json`; visual proof:
`.tmp/piano-owned-voice-checks-mobile.png`.

Stop also pauses comparison players; reruns/page exit release their blob URLs.
Disposed native instruments no longer reschedule sleep callbacks or revive when
an external hold releases.31 targeted lifecycle/controller/legacy-wrapper tests
pass and final public build/package checks pass (43.04s). QA browser/viewport is
cleaned up; loopback server is stopped, existing LAN HTTPS remains available.
Phone mixed-piano listening is requested on the fixed page; do not infer it from
desktop counters. Next port remains shared native modulation and steal-fade parity.

## 2026-11-10 — phone M4e listening gate passed

User supplied the `piano.fixed-full-path` report for graph d68f9dc21e528d44:
all four cases pass, with942000-frame audition and726000-frame captured-score
runs on serial and worker; both workers report zero underruns and late blocks.
The explicit listening reply is **"Checks pass and audio is clean"** to the
fixed six-source individual-entry/overlap question. Preserve this separately
from the muted counters: `piano-phone-acceptance.json`. No new user-agent capture
or lock-screen/other-settings acceptance is inferred. Next: owned shared piano
voice modulation and the native pre-onset steal fade, with larger local batches.

## 2026-11-10 — M4f shared piano control snapshot implementation

[M4f](MODULAR_AUDIO_ENGINE_M4F_PIANO_CONTROLS.md) adds owned v2 shared pitch and
filter controls: sine/vibrato/filter-LFO snapshots, seeded walk knots, remaining
depth ramps and future frequency points. V1 stays compatible; wrong versions,
unbounded tables, nonuniform pitch wiring and non-lowpass filters fail closed.
Snapshot replay owns a fresh finite graph clock, not a running keyboard voice.
Native timers/edits after capture are outside that owner; normal playback remains.

Audit discoveries: native sine phase freezes without reachable voice consumers;
k-rate detune pulls from the whole first128-frame quantum; the oscillator helper
schedules frequency1ms ahead. Initial nonzero native vibrato can be unwired from
piano buffers despite the global flag, whereas a live edit connects it. Capture
preserves those actual connections and their phase intervals. It does not fake
parity by attaching a probe that wakes a sleeping oscillator. A1024-frame native
origin aligns the native/owned test clocks without changing the dry path.

Thirteen native comparisons pass on graph e904b017d4f34cd9 /352592bytes. New cold /
warm vibrato errors are about1.1e-6 relative RMS, sine1.44e-7, Brownian9.18e-5,
smoothed Brownian7.79e-4. Existing0.5% RMS/.99998 correlation thresholds stay.
Real-worker modulated mixed-source PCM is exact; save/reload/reset/instances pass.
494 tests /70 files pass plus final focused activation tests.30 previous and7
piano allocation audits report zero render alloc/reclaim/growth. The source page
now enables the three modulation paths in one fixed batch. Next is native steal-
fade ownership after finishing this batch; keep larger local checks, not tiny
phone-setting requests. The user's clean M4e phone acceptance is retained separately.

M4f final checkpoint: graph800313e1223adcff /352592bytes passes all13 native
comparisons,32 final focused tests, seven zero-allocation piano audits and public
packaging. The final change accepts a native walk endpoint one epsilon beyond1.2.
The preceding e904b017d4f34cd9 build passes all four modulated full-path cases
(942000/726000frames, serial/worker) and a separate audible942000-frame six-source
run with positive source/channel/master peaks and zero worker delivery gaps.
These are local measured results; no new phone listening acceptance is inferred.
Evidence is in the three piano modulation browser reports and allocation report.

## 2026-11-10 — M4g prepared piano stealing verified

[M4g](MODULAR_AUDIO_ENGINE_M4G_PIANO_STEALING.md) adds module/config v3 with
explicit slot/onset/fade/cut lifetimes. Compilation follows native free-slot
round-robin and earliest-release stealing, preserving the cursor on steals.
The old gain holds480 frames before replacement and decays with a96-frame time
constant; replacement keeps filter state. V1/v2 still reject stealing. V3 rejects
same-slot onsets below10 ms, invalid slot overlaps and wrong-time triggers.
It is prepared finite playback, not late/live keyboard stealing; future-owner
cancellation does not rewrite an already-prepared earlier fade.

Graph7f5888b007e0c3b2 /355135bytes passes18 native dry comparisons,483 tests /67
files plus17 final focused tests,30 existing and8 piano zero-allocation audits,
graph/piano provenance checks and public packaging. The real-worker eight-bus
comparison includes a stealing, modulated piano and remains exact. Native new
steal cases include one/two slots, slow attack and the exact10 ms boundary, with
unchanged error tolerances. See piano-native-stealing-browser.json.

The fixed page profile is piano-controls-steals-v1. All four full-path cases pass:
942000-frame audition and726000-frame captured progression, serial and actual
worker. Both progression runs record three Rhythm steals; worker gaps/late blocks
are zero. A separate audible726000-frame stress run records three steals, zero
underruns, positive source/channel peaks for all six roles and master peak0.16128.
Reports: piano-stealing-full-path-browser.json and piano-stealing-audible-browser.json.
Measured audible routing is not physical listening acceptance.

The existing LAN HTTPS server serves the updated fixed page at
https://192.168.0.228:4176/tools/piano-voice.html. No deployment or All default/
storage change. The new “Listen to stealing stress” button needs no settings
matching. Next target-device gate: this combined shared-modulation/stealing
profile on phone Chrome. The earlier clean M4e phone result is retained separately.
After that gate, port the matched acoustic preparation family with native parity
tests, then remaining calibrated/Iowa/classic adapters. Dense-steal timeline,
live release/pedal/retune and portable host FX/mixer migration remain explicit
later tasks, with the existing native/legacy paths operational.

## 2026-11-10 — combined modulation/stealing phone gate accepted

The user explicitly answered **"Clean playback"** to the phone Chrome fixed-page
“Listen to stealing stress” request. This accepts the requested
piano-controls-steals-v1 listening workflow; graph7f5888b007e0c3b2 is the requested
build, not a newly supplied device capture. No new counters, user-agent or lock-
screen behavior are inferred. Evidence: piano-stealing-phone-acceptance.json.
Continue matched acoustic preparation, owned graph integration and native parity
in a substantial local batch; retain the existing defaults and legacy renderers.

## 2026-11-10 — M4h fitted acoustic variants

[M4h](MODULAR_AUDIO_ENGINE_M4H_MATCHED_ACOUSTIC.md) adds all six fitted shapes
to the existing portable acoustic renderer, normal opt-in preparation and graph
banks. Codes0–4 remain,5–10 add Ambient/Glass/Drama/Soft/Subdued/Concert. Fitted
bass darkening, fundamental gain, independent seeded ripple and low-string
stiffness preserve acousticPianoMatched.js. Native defaults remain original JS;
calibrated/Iowa/classic are not substituted. No modal body is added to acoustics.

Preparation b8a432b4637a68b5 /50306bytes and graph67531999ec42dded /356798bytes
pass582 preparation comparisons (360 new fitted cases),414 bit-exact strikes,
maximum sample error2.9802322387695312e-8 and108 bit-exact held bodies. All24
native dry comparisons pass; matched errors0.000757–0.002233 relative RMS meet
unchanged tolerances.30 existing and14 piano allocation audits report no render
allocation/reclamation/growth. Real-worker mixed eight-bus PCM remains exact,
including matched modulation/stealing and the existing sidechain master.

The broad run verifies534 tests with one obsolete UI-copy assertion failing;
that assertion said piano was absent from the graph. It is removed, with all11
focused preparation-control/source-capture checks passing. No functional test
gate is relaxed. Public packaging passes. Reports include piano-rust-compatibility,
piano-native-matched-browser and piano-matched-full-path-browser.

The fixed matched profile uses Ambient/Soft/Concert plus core/FM/Hand, keeping
sine/walk/vibrato and one/two-slot stress. All four full-path cases pass:
942000-frame audition /726000-frame progression, serial and actual worker;
progressions execute three Rhythm steals, workers have zero underruns/late blocks.
This is local evidence; the prior M4g phone acceptance keeps its original scope.
Continue measured-table preparation next, using actual measured models and owned
Rust DSP. Do not request another tiny phone checkpoint for this shape extension.

Separate audible matched progression:726000 frames, three Rhythm steals, zero
worker underruns, all six source/channel peaks positive, master peak0.10635.
See piano-matched-audible-browser.json. Physical listening remains unassessed.
