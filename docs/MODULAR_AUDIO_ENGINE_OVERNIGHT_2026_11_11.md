# Overnight modular audio port — 10–11 November 2026

Authorized by the user on 10 November: work unattended until **11 November,
09:00 Europe/London (09:00 UTC)**, potentially in parallel, using desktop
functional checks. No phone feedback is expected during the run.

Baseline: `58f56d7`, owned Iowa Held/Decay/Roll realtime port; clean working tree
at the start. Existing main checkout: `C:\dev\pianote\bgm`.

## Run controls

- Active bounded goal in this chat. A half-hour continuation heartbeat is
  attached to this same chat, with recurrence ending at 09:00 UTC:
  `overnight-modular-audio-ports-ends-11-nov-09-00`.
- Check current UTC time at the start of each resumed turn and between major
  slices. Stop starting features at **08:30**. Use the final half hour for review,
  integration, appropriate regression/build checks, commits and the morning
  handoff. Stop implementation by **09:00**, disable the heartbeat if necessary,
  and complete the bounded run goal after its report is ready. The end of this
  run does not imply that the whole migration is complete.
- Keep the PC awake and desktop app running. Browser checks use the built-in
  ChatGPT browser. If it is unavailable, continue independent local work and
  record the browser gap. Do not fall back to personal Chrome, bypass security
  warnings, disable Application Control or change OS/security settings.
- Use `npm.cmd`, `.tmp/rust-tools`, offline Rust/Wasm checks and the existing
  checkout. Do not run freshly generated native executables blocked by policy.
- Preserve defaults, original algorithms/ABIs, user work and existing playback.
  No push or deployment. Commit each verified slice locally as `lizMcLizface`
  (`121907922+lizMcLizface@users.noreply.github.com`).

## Parallel ownership

All agents share the checkout. Parent owns shared graph/runtime/build integration,
generated public assets, common plan/handoff and all Git mutations. Child agents
must not overwrite other streams, alter shared APIs without coordination or
commit another stream's unfinished changes.

| Stream | Owner | Editable scope | First deliverable |
| --- | --- | --- | --- |
| Iowa preparation | `iowa_preparation` | New `synth-engine/iowa-preparation/`, preparation-specific JS adapter/tests/tools/reports | Owned measurement settling/interpolation/FFT preparation against actual tables; existing prepared bank contract |
| Effects | `owned_effects` | `synth-engine/inserts/`, `synth-engine/effects/`, new owned adapters/tests/audits | Owned reusable kernels with legacy ABI and exact original-Wasm comparisons |
| Mixer | `portable_mixer` | New `synth-engine/mixer/`, mixer-specific adapters/tests/audits/document | Typed strip/master processing, meaningful reference checks and explicit external FX/limiter boundaries |
| Shared integration | parent | Graph/ABI/runtime, build/provenance, host adapters, shared docs, functional browser checks | Review and assemble completed slices; preserve compatibility and deterministic output |

Agent tasks can continue to further non-overlapping verified batches after their
first deliverable. Parent reviews completed milestones and integrates them
sequentially. Avoid multiple concurrent heavy full suites/builds. Run focused
checks while developing, then the appropriate broader regressions at integration.

## Verification and acceptance

Use actual legacy PCM/reference equations and unchanged tolerances. Check finite
output, independent instances, event timing, reset/pause/disposal, resource bounds,
save/reload, and allocation/memory growth after preparation. Test serial/worker
and combined paths when the changed boundary affects them. Native Web Audio
filter parity requires real browser evidence before an exact-parity claim.

Separate preparation, render, scheduling and physical-listening evidence. Never
rename an earlier phone result as acceptance of a new build. Avoid per-preset
phone gates. Record unsupported behavior explicitly and leave incomplete changes
reviewable rather than weakening validation or changing sounds to force a pass.

## Checkpoints

- 10 November ~23:20 UTC: active goal and bounded heartbeat created/verified;
  three implementation streams dispatched. No new browser or phone gate.
- Add exact commits, outputs, checks, limitations and next tasks below as slices
  finish. Morning report belongs in `reports/modular_audio/overnight-2026-11-11.json`
  with a readable summary in the handoff.

- ~23:35 UTC:682cdff commits12 owned classic backends;1680 exact preset/rate
  comparisons,36 zero-allocation cases and73 focused tests pass. VS/WT resource
  extraction is handed to the instrument agent; parent owns graph integration.
- M4k Iowa preparation is locally verified (405 comparisons,47 final tests), with
  explicit pending combined desktop-browser verification. Effects extraction
  and mixer primitives are ready for parent integration while further independent
  classic wave-table/rack-effect work continues.
