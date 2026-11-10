# M4b: finite pitched-set source stems

2026-11-10, after `6c4420a`. User prioritizes other voices and end-to-end
conflict/behavior testing. Longer phone lookahead is acceptable for listening;
the startup-delay experiment is deferred. Keep the existing workbench and live
keyboard backend while expanding the explicit finite source preview.

## Contract

- All / Setup / Source scope adds **Chosen pitched voices together**. Entering
  this scope reads current source readiness and explicitly selects ready core/FM
  roles. Checkboxes show each role's engine or unsupported reason; unsupported
  entries are disabled, never silently replaced. **Select ready voices** refreshes
  that list/selection. Default scope remains the existing selected sequencer.
  Existing Serial/six and explicit worker/twelve / 128 ms choices remain.
- A selected set captures up to five actual pitched roles from the current
  progression, effective source patches, tuning, tempo and deterministic note
  realization. Muted/solo-excluded roles are omitted and named in the report;
  an all-excluded set fails before acquiring stems. Empty selected patterns are
  represented as silent sources, not fake notes. An entirely empty set fails.
  Single-source empty/muted rejection remains unchanged.
- One private Rust graph owns all selected source states and timestamped events.
  Stable source IDs are lead 1, counter 2, rhythm 3, pad 4, bass 5; each has its
  own event owner and note-ID namespace. Selected notes are capped at **2,000
  combined / 4,000 events**, current 16-bar / 120-second source bounds remain.
  End is the longest selected source/envelope/colour tail. Unsupported/native
  piano, classics, procedural voices, non-2x FM and percussion remain gated;
  there is no patch substitution or fixed-fixture playback.
- One worker or serial worklet renders the whole graph coherently. Each source
  bus connects to its corresponding existing raw-source input, before that
  role's inserts/VoiceFx/sends/trim/mixer. Shared subgroup/master/output remain
  the existing host's authority. The graph's private reference mix is not also
  connected, avoiding doubled output. No PCM main-thread relay or worker pool
  is introduced. Existing bounded transfer/cadence and fallback policy remain.
- All stem gains/taps connect before one manual arm, with common source clock
  and startup delay. Silent worker probe mutes every stem before connection and
  observes up to 96,000 source frames. Ordinary audible playback retains the
  first-miss guard. A source/tuning/score/tempo/selection change, Stop, Panic or
  host close stops the entire set and disposes all owned gains/taps/leases;
  late preparation cannot resurrect it. Legacy keyboard/audio stays connected.
  Normal song transport remains excluded while preview is active.
- Full and single-run compact v2 reports add bounded per-role stem ID/kind/note
  count/source and post-channel peaks, plus mute/solo exclusions. Active-note
  roles must each have source/channel signal for an ordinary full-run pass;
  intentional empty roles need no signal. Master must be active. These are
  activity/delivery checks, not isolated wet PCM or a physical listening verdict.
  Silent probes never become music-quality passes. Single-source capacity-order
  comparisons remain available only under the single-sequencer scope.
- Host **all-preview-delivery-v8**; engine **d6a0341e5edf2d57**, byte-identical
  **296,101-byte Wasm**. Existing typed graph/event contracts support this set;
  no Rust/worker protocol/DSP rebuild, saved setup/object schema or backend
  default change. New scope/selection/report are transient on reload.

## Verification boundary

Real threaded tests compare every stereo sample of five overlapping core/FM
stems against independent serial source graphs, including role-local duplicate
note IDs. A second noncontiguous counter/bass set includes a silent counter;
inactive buses remain exactly zero. Tests require raw equality, correct full
clock/event totals and no bad recycles. Combined budgets/empty/duplicate role
validation precede worker preparation. Controller checks cover bus-to-role
connections, all-stem muting, source invalidation/coherent cleanup, unsupported
partial preparation and mute/solo exclusion. UI exposes supported/unsupported
roles, preserves default scope and excludes normal transport while active.

Broad modular/All host/mixer/source/UI regression: **286 tests / 34 files pass,
112.66 s**. Browser QA then found that a valid All progression may omit a
role's pattern entirely. Captured-set empty handling now treats that as a silent
role, while ordinary single-source missing-pattern rejection remains. The
pre-fix attempt failed before creating an executor; retained as
`reports/modular_audio/m4b-missing-pattern-pre-fix.json`, pass false. Final
compiler/set/controller checks **24 / three files pass, 1.44 s**, including raw
threaded equality and missing-pattern regression. These overlap the broad run.
Final public package/provenance build passes, **33.66 s**. No Rust assets changed.

Actual browser current-voices worker/twelve probe confirms role IDs **[1,2,5]**,
96,000 source frames, zero missing PCM and zero owned source peaks. This particular
progression has no Lead/Second lead notes; those slots remain silent and Bass
has seven notes. Report `m4b-current-voices-probe.json`. It proves coordinated
silent probing/sparse capture, not audible acceptance of those inactive voices.

## Actual workbench path results

Desktop browser, 390 x 844, current role FX/mixer/master and worker/twelve:

- QA explicitly chose one FM and four core engines and added temporary test
  notes in otherwise silent slots. No source substitution occurs in the adapter.
  Initial five-slot capture has four active voices, **905,116 frames / 54 events**,
  no delivery errors, report `m4b-five-voice-worker.json` / its compact report.
- All-five-active worker run **1d3d4303-c9bb-41a2-998f-5916b6c16e0f** completes
  **905,116 / 905,116 frames**, **56 / 56 events**, zero late/overflow/missing
  PCM, complete/pass true. Note counts are **1 / 1 / 1 / 17 / 8** for
  lead/counter/rhythm/pad/bass; every source and channel peak is positive.
  Counter is actual FM, other four core; IDs **[1,2,3,4,5]**. Shared master peak
  **0.25449**. Full report `m4b-all-active-worker.json`, screenshot
  `.tmp/m4b-all-active-signals.png`. This is activity/delivery, not listening.
- Repeating the identical captured input with only Lead fader **-16.0 dB**
  completes without misses/pass true. Lead raw peak ratio **1.0**, post-channel
  peak ratio **0.1903**; other channel ratios **0.9197 / 0.8971 / 0.9831 / 1.0448**
  remain active. These sampled dynamic FX peaks are not exact wet-PCM gain
  measurements. All input hashes match, independently checked. Fader restored
  exactly **0.75 / 0 dB**. Report `m4b-lead-attenuated.json`.
- A legacy keyboard Chord starts before the set and remains selected/running
  after **Stop source preview**. Its own Pause then stops it. Interrupted set
  remains stopped/pass false (`m4b-keyboard-coexistence.json`). Changing Lead
  source patch during another set stops the whole set as **source-changed** at
  **33,664 source frames**, incomplete/pass false, all leases cleaned up
  (`m4b-source-invalidated.json`). No serial replacement is started mid-run.
- The temporary loopback QA server reached its eight-minute auto-stop during
  preparation of an additional run. Existing startup fallback correctly reports
  **requested worker / actual serial**, 128 ms, no PCM pool; its complete five
  active stems pass at the same source hash. This is retained separately in
  `m4b-qa-server-fallback.json`, not counted as a worker pass. Restarting only the
  loopback QA server allows the all-active worker retry above. Normal-user LAN
  HTTPS remains running; no firewall/trust change or audio algorithm workaround.
- Original generators and patch names are restored exactly: Lead DI-Poly /
  Measured Flute, counter DI-Poly / Soft Flute, rhythm and pad Piano / Felt Keys
  (updated), bass DI-Poly / Thump Bass. Legacy normal Play then shows **five notes
  sounding / 25 lit meter segments** and stops normally. Reload restores those
  choices and Lead fader 0.75, selects **single scope / Serial**, clears the
  transient report and starts nothing. Continuous score regenerates as before;
  this is not a byte-exact exported setup-file round trip. Existing finite /
  continuous setup tests passed in the broad suite.

Workflow evidence: `m4b-browser-checks.json`; full plan hashes, five active stem
signals, source clocks/events, fallback identity and restore/reload assertions
pass independently in Node. The group routes through existing per-role effects
and shared output; no new effect-latency compensation or isolated wet-PCM parity
is claimed. QA tab/viewport and temporary server are cleaned up. LAN PID8368
remains up, serving final local build. No physical listening is inferred from
browser/Node checks.

## Phone sparse-set probe received

User-supplied unique run **51495cad-3673-4bda-b8f8-ada1ff6f6173**, 12:55:03.574 UTC,
Android-reported Chrome 156, host v8 / engine d6a0341e5edf2d57, 48 kHz actual
worker / Message / 512 x 12 / 128 ms, no fallback. Raw report retained in
`reports/modular_audio/m4b-phone-current-voices-probe.json` without changing its
verdicts. Capture has core **lead 1 / counter 2 / bass 5**, note counts **0/0/8**,
no mute/solo exclusions. Zero own-source/channel peaks are expected: this is
explicitly muted, not an audible activity test.

The probe renders/consumes **96,000** of **684,316 planned source frames**,
**102,144 output frames**, **188 accepted/rendered blocks**, zero missing / late /
rejected/stale PCM or bad recycles, no recoveries needed. Three applied events,
zero late/overflow. Minimum steady ready lead **1,152 / 24 ms**, no zero /
below-quantum observations; maximum gap remains **4,864 / 101.33 ms**, below the
twelve-slot capacity, no over-capacity quanta. Worker render **446.10 ms total /
21.80 ms max**, not CPU utilization. Worklet timing remains unavailable/null.

This verifies clean delivery of the captured graph with one note-bearing Bass
source and two silent core instances. It does **not** test three overlapping
active voices, audible FX/mixer/master quality, the full score, native piano or
drums. Full-score complete/pass stays **false**, listening **not assessed**.
The compact phone report contains no full plan bytes, so its hash is recorded,
not independently recomputed. Evidence-only follow-up after `80ea6b5`: JSON and
frame/block/stem/verdict checks pass; no new DSP/browser/build test is claimed.

## Next target-device work

The phone needs note-bearing voices beyond Bass for its active-voice gate. Next
bounded aid: an explicitly labeled short **selected-voice audition** using each
selected actual patch/tuning and clearly reported diagnostic test notes, without
editing the user's score, replacing a patch or relabeling test notes as captured
song playback. This avoids requiring awkward phone grid edits merely to activate
silent slots. Preserve ordinary captured-score preview, twelve-slot option,
normal first-miss guard, legacy keyboard and separate diagnostic/listening
verdicts. First muted probe, then audible audition on clean delivery, with per-role
activity and exact run identity. Existing desktop all-five-active evidence stays.
After that phone active-voice check, audit actual All percussion seam/kit/hit
translation; native piano remains a separate adapter. No broader/default backend
migration or lower-latency experiment is implied. No deployment/security/AC bypass.
