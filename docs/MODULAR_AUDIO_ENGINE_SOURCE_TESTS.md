# Reusable All source checks

2026-11-10, after `c1264cf`. The user reports the current progression sounds
fine and asks for fewer manual phone checks and a reusable testing surface.
The qualitative response is retained separately in
`reports/modular_audio/m4c-current-progression-phone-feedback.json`; no new run
identity, input hash or delivery counters were supplied. Prior raw reports stay
unchanged. Do not request that same listening check again.

## Test surface

The top-bar **Tests** button opens a dedicated anchored dropdown outside the
scaled desk. Playback, full checks and Stop are at the top; detailed settings
are collapsed. Setup still exposes the same preview controls for compatibility.
The dropdown uses the existing Setup placement, scroll containment, outside
dismissal and Escape/focus handling. Closing it does not stop a running check.

Executor, capacity, scope, included roles, material and comparison order now
persist on this browser under `synths:all:source-preview`, version1, separately
from the song/setup format. Fresh browsers retain Serial/six/selected/current
progression defaults. Validation rejects unknown values and filters/deduplicates
roles. Reload never starts audio or restores a live controller/report. Explicit
Reset test settings restores fresh defaults without changing sounds or song.
Changing scope no longer discards the selected material or source set.

**Use ready sources + phone buffer** selects the actual eligible sources and
worker/twelve in one action. A drum-kit selector in this same dropdown makes an
explicit actual Drums sound change through the existing host and desk storage;
there is no automatic sound substitution. Source readiness refreshes on host /
sound edits and panel opening. Saved unsupported choices fail closed, and can
be refreshed explicitly. Existing voices/patches, mixer, FX, keyboard and normal
transport remain operational.

Browser verification also exposed an existing Continuous-mode reset: its song
store deliberately skips the generated buffer, which also discarded edited
sound choices on reload. A separate version1 `synths:all:continuous-sounds`
snapshot now retains the actual six sounds/patches/kits/racks, mixer/desk,
mute/solo and tempo for that scene. It saves only after loading finishes and
does not store generated music. A saved finite song or explicit front-page
preset still takes precedence. Test settings Reset does not clear this sound
snapshot. This closes the Hand-to-scene-drums regression without persisting a
growing Continuous song or changing the finite setup-file schema.

Comparing source plans then exposed redundant legacy `restoreSounds` /
`restoreMixer` updates: an unchanged rack was still repatching a DIY source,
reapplying its initial gain preparation. Those restore functions now skip
unchanged values. Actual edits retain the existing path. No DSP algorithm,
parameter range or instrument initialization was changed. An explicit host
regression checks that an unchanged restore does not call `setSpec`, while a
changed mixer value still does.

Reports offer **Copy short summary**, **Download report**, compact and full copy.
The summary fits comfortably in chat; downloading preserves the entire report.
Clipboard failure retains the existing selectable fallback. Four batch results
are shown in a small table with failed check names.

## Four-case batch contract

**Run full source checks** runs, sequentially:

1. Individual/overlapping test notes and drum hits in Serial.
2. The identical captured test material in One worker, twelve blocks.
3. One complete captured current progression in Serial.
4. The identical captured progression in One worker, twelve blocks.

Chosen group roles are used when set; selected-sequencer scope chooses all
currently ready roles for this batch. Existing mute/solo exclusions remain
explicit. One outer lease per included source captures both material plans
before the first run. Each run receives a fresh deserialized plan and fresh
owned graph/route. Assets load once. Each material pair must reproduce the
captured plan fingerprint. No continuing generator or source edit can silently
change a later case; source/score/tempo/selection/mute changes cancel the batch.

All four cases mute their own source gains, run the entire finite material and
tail, and retain the first-underrun stop guard. Unlike the existing two-second
recovery probe, full silent runs also support explicit Serial and reject
executor fallback before starting. Worker cadence remains Message tasks /
512 frames /twelve blocks /128 ms. Ordinary playback and recovery probes keep
their existing semantics. Engine/Wasm and legacy DSP are unchanged.

Batch checks require exact source/render/event clocks, no error, actual requested
executor, and explicit zero worker missing/late/rejected/stale/recycle counters.
Missing evidence fails the check. Counter failures remain visible; startup,
source invalidation, cancellation, fallback or an incomplete run stop the batch
and preserve partial evidence. Stop/Panic release private routes first and outer
leases once, without disconnecting or silencing the host's live keyboard/pads.

`all.source-test-suite` version1 stores four full child reports, fingerprints,
per-case checks and exclusions. `suite.checksPassed` is an automated muted
delivery/clock verdict. Top-level `pass` and `complete` remain false and listening
remains unassessed. This does not measure audible/wet-FX signal quality or device
underruns: the muted gains precede existing FX. The preceding guarded audible
desktop and phone evidence remains separate.

## Verification and next task

**Local checks:** 148 tests /10 files passed (58.49 s) before the Continuous
follow-up. The final affected five files pass **132 tests (57.82 s)**, including
all **74 All page checks**, **21 host checks**, six suite cancellation/capture /
failure checks, 18 existing preview checks and 13 report/export checks. The
unchanged threaded six-source source-PCM and drum/set/compiler checks also pass
in the ten-file run. Final public provenance/package build passes (**33.67 s**
Vite). No Rust/engine bytes changed, native executable or AC workaround.

**Actual 390 x 844 browser:** one top-bar action completes all four cases,
run **c3e926b8-f684-4d83-9b52-0506ba373719**, engine62315. Three core sources plus
explicit Hand, IDs1/2/5/6. Audition pair **634,800 frames /29 events**; captured
progression pair **1,001,116 /46** (Bass7 notes +Hand32 hits; Lead/counter silent).
Serial and worker clocks exact, pair hashes match, all explicit worker delivery /
recycle/event errors zero. Muted verdicts stay false. All four full plans were
independently rehashed. **Summary copied** and a real downloaded JSON file was
parsed and compared equal to the full DOM report (newline formatting differs).
Raw/compact/artifact records: `reports/modular_audio/source-tests-*.json`.

After the Continuous persistence fix, all visible Hand/group/material/worker /
twelve settings restore exactly, with no automatic playback or restored report.
Closing/reopening the panel during a run leaves it running. A second batch,
**709baab1-f421-4e37-b60b-9c8425dad76c**, also passes4/4; its progression has
51 events because Continuous music is regenerated. Its audition plan differs
from the first batch only in two source gain values; that comparison prompted
the idempotent restoration fix above. This intermediate evidence is retained,
not presented as bit-exact cross-reload PCM acceptance.

After the no-op restoration fix, final batch
**d4cfaf5a-934b-4de9-8131-2ed854a0d501** again passes4/4: audition634,800/29 and
fresh progression1,001,116/46. All requested executors, clocks and explicit
worker error checks pass. Each pair's full source plans match and independently
rehash; all12 full plans across the three retained batches have been checked.
Its audition hash is **e8eed98d225235d8ba1653734095cb618a800b80b665fadf481268e35ee92215**.
No changed-source cross-batch comparison is treated as identical material.

A further actual page reload retains the same four sources/Hand and audition /
worker/twelve controls. Guarded audible run
**486e6050-1953-4930-944a-44fb937a76f8** completes634,800/29 with zero missing
frames and positive raw/channel signals for all four stems, master0.129609.
Its complete input hash independently rehashes **exactly equal** to the final
batch's audition hash above. This verifies the idempotent saved-input path;
sampled Web Audio peaks are not isolated wet-PCM equality or physical listening.
Full report and independent checks are retained as
`source-tests-restored-audible*.json`. All13 retained full plans rehash.

Original isolated Drums scene sound and Serial/selected test defaults restored,
own browser tab/viewport cleaned up. The isolated loopback QA server is stopped. The user's LAN HTTPS server remains running with the refreshed local
build. No deployment. Evidence images `.tmp/source-tests-phone-panel.png` and
`.tmp/source-tests-phone-results.png`.

No new phone test
is requested for this workflow change. Continue with larger locally verified
source-integration steps, using one batch report per material/source milestone;
ask for physical listening only for a meaningful new audible path or an actual
device-specific failure. Native Piano and classic/native percussion remain
explicitly unsupported and require their own ownership/contract audit before
implementation. No default backend change, deployment or security workaround.
