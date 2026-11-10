# Selected-patch test-note audition

2026-11-10, after `70ee524`. The phone's captured set was clean but only Bass had
notes. This explicit diagnostic activates each selected ready core/FM voice
without editing a sparse song or substituting any selected sound.

## Contract

- Under All / Setup / **Chosen pitched voices together**, Material initially
  remains **Current progression**. Explicit **Test-note voice audition · song
  untouched** changes the button to **Audition selected voices (test notes)**.
  Worker mode offers **Silent full audition probe**. Merely selecting material
  does not start audio. Changing scope or reloading resets captured-score
  material; original scope/Serial/six defaults and twelve-slot option remain.
- The same current source leases, effective patches, tuning and per-role FX /
  mixer/master path are captured. Mute/solo omissions and unsupported families
  are unchanged. A new bounded diagnostic project is local to compilation; the
  user's project/progression/tempo/source selections are not read as test-note
  authority or mutated. No preset/fixture patch is loaded and no test notes are
  inserted into the workbench grid, setup or Continuous generator.
- Each included role receives two notes: a **0.5-second individual attack** at
  `0.125 + index * 0.75` seconds, velocity **0.45**, then all roles overlap for
  **two seconds**, velocity **0.35**, starting `0.125 + count * 0.75`. Diagnostic
  tempo is **120 BPM**, independent of the song. Untuned MIDI pitches are lead
  72, counter 64, rhythm 60, pad 55, bass 36; each uses its actual role tuning.
  Existing source-tail bounds remain. Individual attacks are not isolated wet
  audio: release/FX tails may overlap later voices.
- Same private graph, stable module/event owners, common clock, prepared gains,
  coherent cleanup/invalidation and legacy keyboard backend. Audible audition
  keeps `stopOnUnderrun:true`. Its silent worker probe mutes every gain and
  observes **the entire audition including overlap/source tails**, not the
  ordinary two-second prefix. Serial fallback is rejected for a silent worker
  probe as before. Standard captured-score probes retain their two-second bound.
- Full and compact v2 report **material:voice-audition**, `audition` metadata
  (diagnostic test notes, schedule, songUnchanged, slot/gate/overlap frames),
  actual per-role tuned notes/counts and the full source hash. Captured-score
  runs remain labeled **captured-score**. Human summaries explicitly say test
  notes and song not played/changed. An audible audition pass covers its own
  delivery/signal checks, not the user's song or physical listening.
- Every muted probe retains top-level **complete:false / pass:false**, including
  a full audition window. Only `diagnosticProbe.complete` records completion of
  its window; event/frame/counter details remain visible. No silent run gains
  an audible/music-quality pass. Listening remains unassessed by automation.
- Host **all-preview-delivery-v9**; engine **d6a0341e5edf2d57** and Rust/Wasm are
  unchanged. No worker transport/scheduling/pool/default, saved schema, source
  backend or normal keyboard change. No deployment/security/AC bypass.

## Verification boundary

Compiler checks cover exact solo/overlap timings, current tuned pitches and
unchanged current patch packets/user score. Actual five-role threaded audition
PCM is raw-equal to independent serial source instances with the diagnostic
events, including inactive buses and full clock/event accounting. Controller
checks require an explicit set, whole-audition muted target, every gain zero,
all roles note-bearing and false muted completion/pass. Existing stop/Panic /
invalidation/fallback cases remain shared. UI checks distinguish material/buttons,
preserve project data, disable controls during playback and reset scope/reload.

## Next gate

Collect a phone full silent audition at worker/twelve, checking all selected
roles have two notes, full planned/consumed/rendered clocks and all test events,
zero delivery/late/overflow/recycle errors. Only then request the audible
audition and per-role listening feedback. Keep exact run/hash linkage and do
not relabel this as real-song acceptance. Continue to the actual All percussion
seam/kit/hit adapter after active-voice coverage; native piano/classics remain
their own gates. Longer phone lookahead is accepted; latency work stays deferred.

## Measured verification (2026-11-10)

- **31 focused tests / three files (2.27 s)** pass, including the real five-role
  threaded audition compared raw-exact to independently rendered source graphs.
  **146 regression tests / nine files (63.88 s)** pass, covering compiler,
  controller, reports, worker protocol/browser route, All UI, legacy host and
  source taps. Public provenance/package checks and build pass (**48.67 s**
  Vite); the existing large-chunk warning remains. No Rust/Wasm rebuild.
- Actual **390 x 844** browser uses original Measured Flute / Soft Flute /
  Thump Bass core patches (IDs **1,2,5**); Rhythm/Pad native Piano stays visibly
  unsupported. No generator, patch, tuning, score or mixer edit was needed.
  Each audition stem has **two notes**, combined **12 note events**, common
  end **282,000 frames (5.875 s)**. Overlap begins **114,000 (2.375 s)** and
  lasts **96,000 (2 s)**; current release/colour tails set the remaining end.
- Full silent run **478e10ce-a98e-40e1-baac-fc6a722c25c3**, actual worker /
  Message tasks / **512 x 12 / 128 ms**, renders and consumes all **282,000**
  source frames, **288,256** output frames, **551** accepted/rendered blocks,
  all **12** events, zero late/overflow/delivery/recycle errors. Minimum steady
  ready lead **5,376**, maximum arrival span **896**. Every source/channel/master
  peak is zero. Probe completion true, top complete/pass false, listening
  unassessed. Compact text and copy UI confirmation verified; native clipboard
  payload readback is not claimed.
- Audible worker run **b8a61359-af42-4dd7-b09d-3ee0ea119f41** completes the same
  full frames/events/551 blocks with **zero** delivery/event/recycle errors,
  ordinary first-miss guard true and positive per-role raw/channel signals.
  Raw peaks **0.131322 / 0.130297 / 0.236181**, channel peaks
  **0.035352 / 0.015323 / 0.062824**, shared master **0.062137**. Automated
  delivery/signal pass true; physical listening remains unassessed.
- Explicit Serial run **c774aaad-d240-4607-90e4-14fb8452943f** independently
  completes **282,000 / 12 events**, no late/overflow, all three raw/channel
  signals positive, master **0.062790**, pass true. Browser analyser snapshots
  do not prove exact wet-PCM parity. Full plans for muted/worker/Serial share
  independently recomputed SHA-256
  `8f2fd39f113cff1ffe396c9780d96ffb8a56793fb842eb7bf9ee8fbd1d024a86`.
- Ordinary two-second captured-score probes before/after the auditions have
  identical independently rehashed plans
  `f75b8be3c842ec4458995e36f8f81b9d2352db8c3aa3e755ee80fdb4fda2e9d5`,
  original **0/0/11** notes, current source packets byte-structurally identical
  to audition source packets, no delivery errors. The after probe's source
  peaks remain zero; counter/master **8.85e-7** reflects a shared existing tail,
  not generated probe source audio. Mute does not flush existing FX/keyboard.
- Private Stop run **4d7078d8-6334-4498-8d4c-19d0b955ce21** is stopped/pass
  false while legacy Pad/Piano Chord stays pressed; its own Pause works.
  Original six generator/patch selectors are unchanged. Reload starts no audio,
  clears report and restores selected scope / Serial / six / captured-score
  material; entering group still defaults to current progression. Continuous
  song regeneration on reload is existing behavior, not a saved setup-byte
  round-trip claim.
- Raw full reports, bounded compact report, browser checks and independent
  artifact verification are `reports/modular_audio/m4b-audition-*.json`.
  Screenshot `.tmp/m4b-voice-audition-signals.png`. Temporary browser tab,
  viewport and loopback QA server cleaned; normal-user LAN HTTPS PID **8368**
  remains running and serves the updated local build. No deployment.

## Phone active-voice result (2026-11-10)

User-supplied phone Chrome reports now complete the full diagnostic gate:

- Muted **dd21d98f-ad66-406f-a3f9-1627b774da42**, started
  **2026-11-10T14:28:14.305Z**: host v9 / engine d6a0341e5edf2d57, actual
  worker / Message tasks / 512 x 12 / 128 ms, source IDs **[1,2,5]**, all core,
  **two notes each**. Entire **282,000** planned/consumed/rendered frames,
  **288,256** output, **551** accepted/rendered blocks, all **12** events.
  Zero delivery errors, recoveries, late/overflow/recycle errors. Expected
  zero source/channel peaks. Probe complete true; raw top complete/pass false
  and listening unassessed retained.
- Audible **b664110c-93c1-4fe5-b2fa-cfc08d86d4bc**, started
  **2026-11-10T14:29:31.748Z**, completed **14:29:41.141Z**: same full
  frame/event/block counts, actual worker/twelve, normal first-miss guard true,
  no delivery/event/recycle errors, each source ends inactive with peakActive1,
  no steals/dropped/late. Raw peaks **0.130668 / 0.119805 / 0.228128**,
  channel **0.038495 / 0.017952 / 0.060178**, master **0.063581**.
  Original full complete/eventPass/pass true; automated listening remains
  unassessed in the normalized report excerpt.
- Both have steady minimum ready lead **1,152 frames / 24 ms**, no zero /
  below-quantum lead, maximum arrival span **4,864 / 101.33 ms**, no over-capacity
  observations. Worker total/max render time **1,345 / 22.2 ms** muted,
  **1,420.4 / 28.1 ms** audible. These worker durations and later recycle
  queries are not AudioWorklet CPU or synchronized clock measurements.
  Worklet process timing remains unavailable/null. No browser-cause inference.
- Identical reported full plan hash
  `2deecc4ea004d634dd58f230723a43ef764415375496b779531adedf5ccb26ee`.
  User supplied the **complete audible plan**, enabling independent rehash.
  It shares the saved desktop plan except two explicitly supplied captured
  global gains (counter **0.5365830759935362**, bass **1.1388329727674487**).
  Reconstructing that normalized full plan produces the exact supplied hash.
  Phone input is identical within this pair, not across desktop/phone. Muted
  full plan bytes were not separately supplied; linkage uses its matching hash.
- User explicitly reports **“Clean individual entries and overlap”** in reply
  to this exact audible run request. A separate run/hash-bound listening file
  records that assessment without changing raw automated verdicts. This accepts
  the selected three-voice diagnostic listening window at these settings.
- Files `m4b-phone-voice-audition-muted.json` (all supplied compact fields),
  `m4b-phone-voice-audition-audible.json` (normalized compact excerpt of supplied
  full report; full histograms omitted), `m4b-phone-voice-audition-plan.json`
  (hash-verified normalized complete plan), `m4b-phone-voice-audition-evidence.json`
  (provenance/cross-checks), and `m4b-phone-voice-audition-listening.json`
  (direct feedback). Precise phone model, audio route and background/lock state
  were not supplied. No five-voice/FM/native/classic/percussion/real-song or
  general lock-screen acceptance is inferred.

The Setup hint now accurately names this bounded phone result. This evidence
step changes only that informational sentence plus records/docs; no DSP,
transport, default or source configuration change. Artifact/frame/event/hash /
listening-link checks pass. Final public provenance/package build passes
(**35.71 s** Vite, existing chunk warning), refreshing the same LAN preview;
no new browser/DSP rerun or deployment. The [percussion audit](MODULAR_AUDIO_ENGINE_M4C_PERCUSSION_AUDIT.md)
is committed separately as `87f03e0`. **Next:** versioned owned kit preparation
configuration, validated/persisted and compared exactly with configured legacy
Wasm before a Wasm-kit-only finite All adapter. Native Piano/classics remain
separate gates. Keep twelve-slot phone option and defer latency experiments.
