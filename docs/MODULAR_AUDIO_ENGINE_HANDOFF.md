# Modular audio engine handoff

User workflow instruction (2026-11-09): **commit at the end of every completed
step, then continue**. This authorizes local commits of verified steps without
another confirmation. Keep the existing checkout and work; no push/deployment
is authorized. Record verification, limitations and the next task in each step.

Prepared and implemented through opt-in M3e bounded worker transport on 2026-11-09. Read the working tree, this file and
[MODULAR_AUDIO_ENGINE_PLAN.md](MODULAR_AUDIO_ENGINE_PLAN.md) first. This is an
implementation handoff. **M0/M1, owned percussion/sidechain M2 and the actual
six-role M3a baseline, M3b owned FM, M3c owned core, M3d pitched DAG and M3e single-worker transport now exist. Next is a measured multi-worker source executor.** Read
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
M3e is subsequent uncommitted work; no push/deployment.
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
