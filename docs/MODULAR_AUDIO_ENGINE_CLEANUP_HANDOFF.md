# Cleanup session handoff — modular Rust audio migration

Date: 12 November 2026, Europe/London. Workspace: C:\dev\pianote\bgm.
Read this document first. The previous chat is too large to use as working context.
This is a cleanup/convergence handoff, not an instruction to resume the old porting loop.

## 1. User intent and immediate direction

The user agreed that the migration has become too fragmented and requested a fresh
cleanup session. Preserve existing behavior, working components and unfinished work,
then reduce duplication and converge on one explicitly selectable integrated backend.

Do not start by adding another standalone effect/profile/test page. First establish
which code is actually used, which is a retained reference, and which is unfinished.
The intended endpoint is Rust audio DSP/timed control execution; React/UI and song
generation can remain JS. The application is NOT currently all Rust.

Standing user preferences:
- Keep existing defaults and legacy DSP operational.
- Commit coherent verified steps, with BOTH author and committer set to:
  lizMcLizface <121907922+lizMcLizface@users.noreply.github.com>.
- No deployment. The earlier requested push completed; subsequent work is local.
  Do not push this accumulated migration or rewrite history during cleanup unless asked.
- Use npm.cmd on Windows. Local offline Rust tools are under .tmp/rust-tools.
- Reports and scratch scripts belong under ignored reports/, with scripts in reports/scripts/.
- Desktop functional checks are preferred. No repeated phone/per-preset listening requests.
- Hidden measured strings should stay hidden; do not broaden that experiment.
- The user previously authorized parallel work, but all three old agents are now stopped.
  Do not automatically recreate their unfinished workstreams before cleanup planning.

## 2. Exact Git state at handoff preparation

Branch: main.
Last implementation commit: 325cce49c6732e4d51a500d66db680314619896c.
Tracked origin/main: 111d282f9eeed07d86f49194090221c0f62523b6.
This is the locally recorded remote-tracking ref, not a fresh remote fetch.

Before this handoff-only commit: 164 commits ahead, 2,288 changed files,
98,541 insertions and 1,097 deletions against origin/main...HEAD.
Both identities on recent commits are Liz. No tracked changes or staged files
were present; 39 untracked implementation files remain, listed below.
This handoff will add one documentation-only commit after325cce49.

Approximate additions by category:
- Rust DSP/control source:9,181 lines.
- Application/runtime JS:12,093 lines.
- Generated public JS:20,637 lines.
- Tests plus src fixtures/resources:16,258 lines.
- Public/Rust manifests, resources, attribution:26,928 lines.
- Docs:7,858 lines.
- Review pages/build tools:5,335 lines; other251. There are70 changed binary files.

Many modules use dense one-line code, so line counts understate complexity.
The growth is not98k lines of new DSP, but it is a large architectural change.
Keeping successive profiles/bundles alongside old versions multiplied the surface.

Git hygiene:
- /reports/ is already ignored, and git ls-files reports returned nothing.
- .tmp/, dist/, dist-public/ and node_modules/ are also ignored.
- Adding .gitignore does not remove already tracked artifacts or rewrite history.
- Do not use blanket git clean, reset --hard, broad git add, mass untracking or history rewriting.
- First inventory deletions/moves; preserve attribution and meaningful reference fixtures.
- Historical “immutable accepted profile” handling was an implementation strategy,
  not a user requirement to retain every duplicate forever. Consolidation is allowed
  when dependencies/provenance are deliberately updated and behavior is verified.

## 3. Frozen unfinished work and verified local backup

All old agents have stopped edits, tests, publication, staging and commits.

A verified ZIP of ALL39 untracked files, preserving repository-relative paths:
reports/cleanup-handoff-2026-11-12/untracked-wip.zip

Archive SHA256:
8c3200477061de6a3309aa7dd89a786b171eb402041e8df96a3981d5861bfc65

Inventory with per-file SHA256/size/group:
reports/cleanup-handoff-2026-11-12/manifest.json

Also retained there: git-status.txt, local-commits.txt and diff-stat.txt.
The archive was read back and every file hash verified. It is local/ignored,
not committed or pushed. Keep it through cleanup. These files are implementation
WIP, not disposable temporary scripts.

### A. Direct synchronous Distortion —22 untracked files

Most nearly complete WIP. Published only to NEW local public namespace:
public/instrument-distortion-cells-live/{host.json,processor.js}.
Host42cf9989d82e4339, committed numerical kernel3d8d6885812e089c,
Source clock7a0838a735108706. Public/private bytes and provenance matched.

It removes curve Workers/READY upload: each audio sample evaluates the exact
sampled curve cells from an immutable Rust basis. Every drive assignment remains
ordered, including repeats/signed zero.420 metadata descriptors;16 owners/context;
29,360,128 bytes of Wasm linear memory at that quota, excluding JS/Native memory.

Seven focused checks passed, including actual Wasm with a synthetic Native graph.
Root observed the12-case48k actual browser matrix pass, with exact PCM, but the
report was NOT saved before interruption. Treat it as an observation, not retained
acceptance evidence. Actual bank/replacement, six-rate matrix, reused20,
interleave8, gap2 and complete192k reload remain pending.

No normal Instrument/environment wiring, live doc or build registration exists.
Creation-only ready is distinct from fresh live arm. Intrinsic gain readback is
unsupported. Preserve the22 files; decide during cleanup whether to complete and
adopt this as the canonical Distortion actor rather than maintain both live strategies.

### B. Live Chorus/Phaser —13 untracked files

Private kernel fe4797616d62c6ae,178345 bytes, SHA256:
3267d590e7f7a609f15386c0f951788fcdec92a9cc8ad18130436f167dd4735c.
Private output: .tmp/instrument-modulation-live. NO live public namespace.

The fork preserves bare Native constructor state and separate per-wave start
epochs, with a mechanically checked relationship to accepted numerical1efb.
Build/check passed.13 constructor/control tests passed BEFORE the latest guard
edits; those guards and the newly added processor are UNTESTED.

Missing: actual node host/factory, clock/FIFO admission, measured quota/memory
enforcement, private routing/keepalive/SourceFence, bundler/loader, fault tests
and browser acceptance. Processor has version placeholders and no registration.
The facade implements logical controls only. Kernel provenance does not attest
this unfinished JS actor. Compile through its builder; direct Cargo needs the
builder's generated-source environment variable.

### C. Logical-activity mixer/trim —4 untracked files

orderedActivityCore.js, orderedActivityProcessor.js,
rackActivityTrimCore.js, rackActivityTrimProcessor.js under src/modular-audio/.

Syntax checks only. No unit tests, factories, private capabilities/managed leases,
builders, assets or app integration. Placeholders remain. A known unfinished
receiver mismatch emits failure data under stats where lifecycle expects diagnostics.

Proposal: reuse accepted b4eb ordered-send math and da3f rack-gain math, emit a
same-callback logical-activity header derived from actual Rust state, and retain
producer borrows until actual downstream SourceACK. No PCM-zero silence inference.
Header-only service must not fabricate an active zero-program DSP callback.

This is scaffolding, not a usable backend. Accepted5fd/db0f remain unchanged.
One ambiguous write command was rejected by automatic review and did not execute;
subsequent separate-file writes preserved accepted processor hashes. No unresolved
permission request blocks cleanup.

## 4. What is integrated versus only a component

Prepared/optional application paths exist for:
- Core/FM, CLASSIC models, live piano/KS/Iowa sources and percussion.
- Voice/ordinary compressors, Motion, Shimmer, Echo, Width/Ring and rack plugins,
  with different host scopes. Do not infer the same integration scope from names.
- Role motion, Main role controls, master output/trim/ambience controls, Sweep,
  stopped source/runtime ownership and a PARTIAL four-cohort send/sum join.

Important code entry points:
- src/modular-audio/ownedHostEnvironment.js
- src/modular-audio/clockedOwnedHostEnvironment.js
- src/app/engine/audioEnvironment.js
- src/app/engine/Instrument.js and src/app/Generator.js
- src/modular-audio/generatorMainControlSession.js
- src/modular-audio/generatorMasterScalarSession.js
- src/modular-audio/generatorMasterOutputSession.js
- src/modular-audio/generatorPreparedSweepSession.js
- src/modular-audio/generatorOrderedMixRoot.js
- src/modular-audio/stoppedRuntimeBundle.js and mainStoppedRuntimeBinding.js
- src/synths/all/host.js and src/modular-audio/allDeskHostSuite.js

The newer Main/Sweep/ordered-mix application reviews often live in IGNORED
reports/scripts/, NOT in the tracked user-facing test page. Examples:
mainColdRootReview.html, mainMasterCompleteReview.html,
mainPreparedSweepReview.html, mainOrderedMixReview.html and mainColdReloadReview.html.
Their scripts include real integration setup; promote/consolidate deliberately.
Do not blindly rerun old mutation/build scratch scripts.

Recent accepted components still requiring normal application joins:
- Original Filter/EQ2, BitCrusher, Delay/PingPong and Distortion live actors.
- Chorus/Phaser and Flanger numerical ports; the former live actor is unfinished.
- Two-stage rack trim/processed/bypass pair.
- Continuous private Room and Worker Freeze leaves, with explicit latency/lifecycle limits.

Major remaining joins:
1. Normal Instrument factories, whole-preset/morph admission, hold/tempo/diagnostic
   handling, independent bypass, and bounded bank/replacement capacity.
2. Mixer source/activity authority and complete private returns.
3. Delayed Room/Freeze normal lifecycle/PDC.
4. Final post-sum global volume. src/audio/bus.js is still a Native Gain;
   AudioStatus.jsx and EnsemblePage.jsx write/read its AudioParam directly.
5. A consolidated, user-facing full-path acceptance page and selectable backend.

The four-cohort ordered profile currently REFUSES whole-runtime overlap before
mutation because it has no capacity for a second generation. Source-slot swaps
can retain existing Wander actors. Its last actual run retained12 late section-
space publications; do not claim universally zero-late scheduling or deadlines.

## 5. Recent accepted checkpoints worth preserving

Commit | Meaning | Limits
--- | --- | ---
325cce49 | Delay tempo parent seam + separate per-channel timing fix + build registrations | Registered facade seam; normal Instrument construction still Native.
02c14d30 | Two-stage rack outer pair | Standalone private always-active review producer; not normal Generator activity authority.
9be90d18 | Synchronous literal-cell Distortion numerical kernel | Live direct actor above remains uncommitted.
b8becbef | Flanger numerical profiles | Explicit input-first/delay-first cycle traversal; no universal Native traversal claim.
cf865cb6 | READY-resource Distortion live actor | Four-owner context quota; GUI/immediate edits need resource readiness.
feda46d4 | Original Chorus/Phaser numerical graphs | Live adoption incomplete.
7df054f8 | Original Delay/PingPong live actors | Old stereo running-target behavior has a retained counterexample.
4aae307c | Filter/EQ2 live route/facade proof | Intrinsic getters unsupported; independent bypass/adoption still needs care.
c50574f4 | Partial Generator ordered mix | Four-cohort limit and Native outer/return/global boundaries.
4eb24166 | Prepared Sweep application join | Accepted first-use scope; not a blanket OFF-toggle protocol.

Latest delay timing identities: kernel67c22492b0fb4257 (87770 bytes),
hostefccb2d53b8c13a2. Old171ea28c2195d17b /88049859d690236b unchanged.
Native Delay evaluates the same parameter timeline once PER input channel.
The new fork preserves that behavior for running stereo targets; no shared
timeline modification or frame fitting. Entire fork reverses through tracked
FORK_EDITS.json. It passes48 actual cases including full document reload,
192 word-exact Native comparisons,96 Rust and96 Native clean releases,
and24 allocation workloads /12288 quanta with zero Rust heap activity/growth.
See MODULAR_AUDIO_ENGINE_ORIGINAL_DELAY_TEMPO.md.

Rack outer identities: hostdb0f9d7d684a3580, kernelda3f650bcbbc1394 (36918 bytes).
84 exact Native channel comparisons, true reload,11 actual clean live ACKs,
60 JS checks and five EXECUTED native Windows Rust tests. Gain trim stays BEFORE
nonlinear FX; processed/raw-bypass mix stays AFTER. No one-worklet feedback route.

## 6. Last verified assembled baseline — do not rerun without a reason

At implementation checkpoint325cce49:
- Tracked suite:890 files passed;7339 tests passed;4 skipped;238.26 seconds.
- Log: reports/modular_audio/original-ports-integrated-tracked-suite.log.
- Public build:PASS, Vite46.44s, checkpoint artifact presence checks120;
  public synth inventory passes, raw banks/recordings excluded.
- Log: reports/modular_audio/original-ports-integration-public-build.log.
- Existing large-chunk warning remains; no deployment occurred.

The tracked suite intentionally excludes UNTRACKED WIP. It used:
npm.cmd exec vitest -- run --config reports/scripts/tracked-port-vitest.config.mjs
That config derives tests from git ls-files. Ordinary npm.cmd test also discovers
untracked WIP and may fail. Do not silently treat WIP exclusion as acceptance.
Preserve its pending status explicitly; decide how to quarantine/incorporate it.

Useful exact ignored evidence:
- original-delay-tempo-independent-audit.json
- original-delay-tempo-efcc-six-rate-result.json
- original-delay-tempo-efcc-reload-result.json
- original-delay-tempo-first-negative.json / repeat-negative.json
- original-delay-timing-allocation-result.json
- rack-outer-db0f-independent-audit.json
- instrument-distortion-cells-3d8d-independent-summary.json
- instrument-distortion-live-863c-independent-final-summary.json
- instrument-modulation-1efb-full-independent-audit.json
- instrument-flanger-522d-full-independent-audit.json
- original-outer-fx-bundle-audit.md
All are under reports/modular_audio/. Some older documents contain superseded
chronological statements; use current source/manifests and scoped receipts.

## 7. Desktop pages available now

Dev server was verified at http://127.0.0.1:4193. Keep the user's running server
and browser tabs alone unless maintenance requires changing them. If stopped:
npm.cmd run dev -- --host 127.0.0.1 --port 4193 --strictPort

- /tools/piano-voice.html: “Listen to mixed-source audition” and “Listen to
  stealing stress”; fixed six-source path,48kHz, no settings matching.
- /tools/owned-active-host.html: “Run mixed-source host and reload batch”,
  classic/rack/physical-source batches and exports. Most extensive prepared
  host page, but NOT the newest complete Main/ordered-mix convergence endpoint.
- /tools/original-delay-tempo.html?all=1: fixed muted parent tempo matrix and
  Save complete scene -> real Reload -> Replay saved scene.
- /tools/all-desk-host.html: owned desk listening/full-path comparison.
  Its default suite does not pass the newer prepared audioEnvironment, so it
  must not be described as testing all newly ported components.
- /tools/instrument-distortion-cells-live.html?rate=48000: UNCOMMITTED direct
  actor review,12 cases. Use only with its pending status explicit.

The ordinary /synths/all/ page keeps existing defaults; opening it does not
automatically select every new port. Phone HTTPS4176 existed for prior tests;
do not deploy or change firewall/certificates for cleanup testing.

## 8. Cleanup plan for the fresh session

A. Establish a trustworthy inventory and freeze further expansion.
- Verify Git identity/state and WIP archive hashes; read this document plus the
  small current source entry points. Do not reread the entire historical chat.
- Build ONE inventory of component -> canonical source -> generated assets ->
  imports/factory selection -> review coverage -> status (adopted/reference/WIP).
- Include the ignored Main review setup, since important integration lives there.
- Identify duplicate bundles, profiles, wrappers, copied primitives, stale docs,
  unreferenced review pages and excessive one-line helpers. Record reasons before removal.

B. Consolidate the test/user entry point.
- One desktop page should prepare the most integrated supported backend once,
  expose Listen/Stop and one grouped acceptance batch, and show remaining Native
  boundaries plainly. Reuse real setup; do not mint a new disconnected demo.
- Cover representative six-source playback/overlap, meaningful live changes,
  source replacement, stop/resume, save/reload and actual cleanup in one batch.
- Keep targeted numerical reference pages only when they test a distinct law.
- No new UI that asks the user to match settings or run one test per preset.

C. Choose canonical paths and consolidate deliberately.
- The direct-cell Distortion candidate is likely worth finishing/adopting for
  synchronous edits; assess against the READY-resource version before keeping both.
- Treat the13 modulation and4 activity files as incomplete scaffolding, not
  completed ports. Finish only what blocks the agreed integrated slice.
- Preserve one attributed primitive implementation where semantics truly match;
  retain genuine behavioral forks, such as per-channel delay timeline evaluation.
- Existing version/hash manifests may change during an intentional consolidation.
  Update builders, registrations, artifact checks and dependent metadata together.
  Do not create a new forever-retained namespace for each packaging-only change.

D. Verify and commit coherent cleanup slices.
- Focused behavior tests and affected provenance/build checks first.
- Run the full tracked/accepted suite after a meaningful coherent batch, rather
  than repeatedly after docs or reversible housekeeping.
- Preserve real DSP/lifecycle counterexamples and any evidence needed to reproduce
  them. Archive bulky historical evidence locally; do not put reports back in Git.
- Commit with both Liz identities and an explicit scope/validation summary.
- Do not push, deploy, flip defaults or rewrite the164-commit history as a side effect.

A sensible first deliverable is the component/dependency inventory plus a finite
cleanup proposal and consolidated test entry. Do not promise a completion percentage
based on number of leaf ports, green tests or line counts.

## 9. Technical traps to avoid during consolidation

- Source state belongs to each actual owner; independent instances cannot share
  mutable DSP globals.
- Creation-ready, configured, actual clock-armed, physically routed and terminally
  released are different states. Preserve these distinctions without multiplying
  unnecessary public wrapper types.
- Source7a is decoded Native context authority. Raw AudioWorklet currentFrame,
  wall clocks, arbitrary caller receipts and public profile strings do not certify
  source ownership or synchronized event delivery.
- Logical silence, connected numeric zero and physically disconnected input differ.
  Native WaveShaper can produce nonzero output at zero input and retain infinite tail.
- Original feedback graphs/constructor chronology matter. Original named effects
  are not interchangeable with similarly named legacy inserts/FDN/Tape algorithms.
- Whole preset/morph checks must precede preset/timer/graph mutation. Original
  Instrument Distortion setter order is amount then drive.
- Original Delay hold captures one now across both families and restores CURRENT
  preset values; tempo uses future cancel then target with tau.025.
- Stored configured targets are not synchronous Native intrinsic AudioParam getters.
  auditEchoes, tempo and GUI diagnostics need honest adapters, not fake AudioParams.
- Current quotas are actual integration blockers: old Delay combined8, Tone8,
  READY Distortion4, Crusher4. Five roles plus replacements can exceed them.
  Change budgets only with measured/preflighted memory and cleanup, not blind raises.
- The guarded mixer manifest covers host reference source as well as numerical Wasm.
  tools/buildOwnedMixer.mjs --refresh-host checks the last COMMITTED baseline.
  After deliberate dependency edits, derive privately and compare before publishing;
  never blank hashes/guards or blindly rerun scratch rebuild scripts.
- Public generated JS has LF attributes because bytes are hashed. New JSON/TXT
  namespaces may need scoped LF rules. Check real core.autocrlf=true checkout bytes.
- Rust native executables have sometimes hit App Control. Some current native tests
  do execute. Distinguish compilation, executed native assertions, Wasm/Node checks
  and actual browser tests; do not bypass system restrictions.
- For browser control, use the current computer-use skill and documented CUA APIs.
  Do not use CDP, Playwright-over-network or injected hidden page state to bypass
  restrictions. Author explicit review controls, operate them and read visible results.
  Old CUA tab handles expire after turns; never assume tab15 still exists.

## 10. Suggested starting prompt for the new chat

“Continue in C:\dev\pianote\bgm. Read
docs/MODULAR_AUDIO_ENGINE_CLEANUP_HANDOFF.md first. This is a cleanup and convergence
session, not permission to resume endless standalone porting. Preserve the39 WIP
files and verified local archive. Audit dependencies and actual adoption, consolidate
the review surface, and work toward one selectable integrated Rust audio path.
Keep defaults/legacy working, reports/scratch ignored, npm.cmd on Windows, both Git
identities Liz, and commit verified steps. No push, deployment or history rewrite.
Do not ask me for repeated per-preset/phone checks.”

## Appendix: exact preserved WIP inventory

### direct-distortion

- public/instrument-distortion-cells-live/host.json
- public/instrument-distortion-cells-live/processor.js
- src/modular-audio/instrumentDistortionCellsLive.test.js
- src/modular-audio/instrumentDistortionCellsProcessor.js
- src/modular-audio/instrumentDistortionCellsWords.js
- src/nodes/distortionCellsRust.js
- tools/buildInstrumentDistortionCellsHost.mjs
- tools/checkInstrumentDistortionCellsFacade.mjs
- tools/checkInstrumentDistortionCellsProcessor.mjs
- tools/instrument-distortion-cells-bank.html
- tools/instrument-distortion-cells-live-cold.html
- tools/instrument-distortion-cells-live-gap.html
- tools/instrument-distortion-cells-live-interleave.html
- tools/instrument-distortion-cells-live-reused.html
- tools/instrument-distortion-cells-live.html
- tools/instrumentDistortionCellsBankReview.js
- tools/instrumentDistortionCellsGapReview.js
- tools/instrumentDistortionCellsInterleaveReview.js
- tools/instrumentDistortionCellsLiveColdReview.js
- tools/instrumentDistortionCellsLiveReview.js
- tools/instrumentDistortionCellsLiveReview.test.js
- tools/instrumentDistortionCellsReusedReview.js

### live-modulation

- src/modular-audio/instrumentModulationConstructor.js
- src/modular-audio/instrumentModulationConstructor.test.js
- src/modular-audio/instrumentModulationLiveControls.test.js
- src/modular-audio/instrumentModulationLiveProcessor.js
- src/modular-audio/instrumentModulationLiveWords.js
- src/modular-audio/ownedInstrumentModulationLiveCore.js
- src/nodes/instrumentModulationFacade.js
- synth-engine/instrument-modulation-live/Cargo.lock
- synth-engine/instrument-modulation-live/Cargo.toml
- synth-engine/instrument-modulation-live/src/allocation.rs
- synth-engine/instrument-modulation-live/src/lib.rs
- tools/buildInstrumentModulationLiveKernel.mjs
- tools/instrumentModulationLiveSource.mjs

### logical-activity

- src/modular-audio/orderedActivityCore.js
- src/modular-audio/orderedActivityProcessor.js
- src/modular-audio/rackActivityTrimCore.js
- src/modular-audio/rackActivityTrimProcessor.js
