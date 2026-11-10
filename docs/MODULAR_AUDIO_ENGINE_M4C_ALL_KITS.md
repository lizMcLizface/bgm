# Finite All Wasm basic-kit integration

2026-11-10, after `1dd3a77`. Extends the opt-in All source preview through the
actual ready Wasm basic-kit instrument and its existing effects/mixer path.
The original implementation, normal transport, keyboard, source defaults and
saved workbench schema remain operational. No deployment or latency work.

## Source and timing contracts

- Selected Drums and group **Chosen sources together** now accept an actual
  ready Wasm basic kit. All six role checkboxes/readiness reasons are shown;
  nothing changes a source just to make it eligible. Native percussion, native
  Piano and classic machines remain explicitly unsupported. Basic-kit **808**
  and classic **TR-808** remain distinct. Hand/basic808 are explicit Wasm-only
  choices; Felt/Crisp also work when their actual current backend is Wasm.
- `percussionStemTap` verifies the ready compiled module/node, errors/disposal,
  palette/model and **dry source room=0**. It clones the current validated
  14-slot kit and captures the live hit counter. The host leases its dry role
  gain input before the existing percussion insert/mixer/wander/desk/master,
  avoiding the legacy kit's unrelated output sleep timer. It does not wake,
  silence, replace, disconnect or otherwise take ownership of the live kit.
- Identity/source revision, palette/kit, host and tuning invalidation stop the
  complete private set. External mixer/FX remain live. Legacy pad bookings can
  increment their own counter without invalidating the captured private graph.
  Stop/Panic follow existing coherent cleanup; Stop removes only private gains,
  routes, taps and leases. Keyboard remains on its existing backend.
- `compileWorkbenchDrums` reuses All's **drumStepEvents → seq/core** path for
  probability, conditions, velocity, ratchet, nudge and flam, with finite
  first-cycle **cycle0 / fill=false / swing0.5 / flam0.5**. Randomness is a
  reproducible captured project seed xor `0x70657263`; it does not claim the
  identical stochastic choices of an earlier live pass. Time is rounded onto
  the common 48 kHz source clock after 0.125 s preroll; duration stays in seconds.
- Historical semantic drum IDs, variation and optional track identity are
  preserved. Current basic-kit legacy playback ignores sound-lock params and
  machine track keys after expression; the preview reports those names and
  follows that same behavior instead of inventing classic-machine controls.
  Disabled mapped slots are omitted before ID allocation; zero-level enabled
  slots remain booked but have no expected signal.
- Private hit IDs start at the **captured live counter +1**, increment for
  enabled expanded bookings in receive order, and never mutate the live counter.
  IDs/variation determine reproducible source noise/phase. Overflow rejects.
  This is a new private finite engine, not a transplant of live tails/voice state.
- Stable source/event owner IDs **1..6** are lead/counter/rhythm/pad/bass/perc.
  Single Drums uses ID6/bus5; older single pitched captures retain ID1. Group
  mixing/ownership stays explicit; the private reference sum is not connected
  again alongside its raw stems. Actual kick bus remains available internally,
  without adding a new All sidechain or worker pool.
- Up to six distinct sources, **2,000 pitched notes** and **4,000 combined
  note events + expanded hits**, one current progression, <=16 bars/120 seconds.
  Percussion tail bound is **8.1 s**; the longest source controls end/drain.
  Missing/empty set slots stay silent; an entirely empty capture rejects.
  No fake drum note-offs are generated. All-muted/zero-level signals remain
  explicit in per-source `hitCount` / `audibleHitCount` / expected signal checks.

## Audition, reports and compatibility

The existing diagnostic test-note material now optionally adds four drum hits
(kick/brush/hat/tom, 0.125 s apart) in the drum source's individual slot, then a
two-second beat during the shared overlap: **17 hits** before kit-on filtering.
The actual selected kit is used; the song and patches are untouched. Pitched
solo/overlap notes retain their prior schedule; pitched gate metadata remains
0.5 s /2 s, while drum duration is defined by its actual hit records. Release /
effects tails can overlap later slots; these are not isolated wet solo stems.
Silent audition covers the **entire** plan/tails, while ordinary score probes
retain their two-second bound. Normal playback retains the first-miss guard.

Host **all-preview-delivery-v10**, engine **62315b4104f2fc7e**, with no Rust/
Wasm/transport rebuild beyond the preceding owned-kit foundation. Reports keep
the sixth stem, separate notes/hits, actual palette, ID base and ignored control
names; compact strings/lists are bounded. Group role is `source-set` when drums
is included; existing pitched-only reports remain `pitched-set`. Silent full
complete/pass stays false, and listening remains separate. Unsupported devices
are shown in Setup, not silently replaced or relabeled as tested.

Default selected scope / Serial / six blocks / Current progression, explicit
twelve-slot option, saved schemas, normal transport and keyboard stay unchanged.
Scope changes/reload reset test material. Capacity comparisons remain pitched
single-source only; selected-Drums comparison is hidden/rejected explicitly.

## Verification

**163 checks / 12 files (51.45 s)** pass. The initial focused run found a test
fixture missing its pitched key and obsolete v9/Drums-disabled expectations;
those were updated, and new controller signal checks allow the observation
interval to run. Actual six-source threaded tests cover four core + one FM +
owned kit, **706,800 frames /37 events**, all raw source and kick buses exact
against six independent graphs, unused final sum zero, no event/recycle errors.
Compiler checks cover shared expression/ignored params/track identity, kit-on
filtering, zero-level IDs, repeatability, bounds and the combined 4,000-event
budget. Host/controller/UI/report checks cover dry leases/revisions, native /
classic rejection, bus6, whole-set kit invalidation, muted gains, six-stem data,
selected-Drums controls, Stop/Panic and existing reload/legacy behavior.

Actual **390 x844** browser:

| Run | Result |
| --- | --- |
| Original three core voices + explicitly chosen Hand | Full muted and guarded audible **634,800 frames /29 events /1,240 blocks**, zero delivery/event/recycle errors; all four audible source/channel signals, master **0.129481** |
| All six active, temporary Rhythm/Pad core + counter FM | Full muted and guarded audible **706,800 /37 /1,381 blocks**, zero errors; all six source/channel signals, master **0.212631** |
| Drum fader 0.75 →0.55 | Same input hash, raw drum peak ratio **1**, channel ratio **0.159958**; other five channels stay active, no misses; restored exactly0.75 |
| Explicit Serial, same six-source capture | Full **706,800 /37**, all source/channel signals, master **0.229259**, pass true |
| Hand →basic808 during active preview | Entire set stops `source-changed` at source frame **20,736**, pass false; no partial continued set |
| Restore Hand, compare captured-score probes | Exact source/score hash before/after, notes **0/0/0/34/8** plus **32** hits; no errors |
| Legacy Chord + Low conga pad during private preview | Preview stays active, private Stop leaves Chord pressed; its own Pause works; later selected-Drums probe captures live base **1**, whereas all earlier private auditions kept base0 |
| Selected Drums | Actual worker on ID6, two-second **96,000** source frames, no misses, **32** captured hits, live base1; comparison hidden |
| Restore + reload | All original generator/patch names and drum fader restored; native Drums excluded, selected/Serial/six/current progression restored, report cleared, no automatic audio |
| Ordinary legacy Play after reload | Focused sequencer Play shows playing, initially **5 notes /31 lit meter segments**, later **6 /44**, then Stop |

Worker/twelve declares **128 ms**. Desktop complete audible windows have min
steady ready lead **5,376 frames** and max arrival span **896**. Four-source
muted/audible hashes match; six-source muted/audible/attenuated/Serial hashes
match; **11 full plans independently rehashed**. Sampled analyser peaks do not
prove isolated wet-PCM parity or physical listening. Native clipboard payload
was not read back; compact DOM text/copy UI confirmed. Continuous regenerates
on reload; no exported setup-file byte parity is claimed. A first off-focus
transport click stayed stopped; focusing the sequencer before Play verified
normal playback without a code change.

Raw reports/checks are `reports/modular_audio/m4c-all-*.json`, screenshot
`.tmp/m4c-all-six-signals.png`. Temporary QA tab/viewport/loopback server cleaned;
normal-user LAN HTTPS PID8368 remains. Public build/provenance/package checks
pass (**34.44 s** Vite); final informational phone-hint refresh also passes
(**32.09 s** Vite, existing chunk warning). That last change is informational,
with no DSP/transport/default change or new test required for the sentence.

## Phone Hand + three-core diagnostic accepted

User supplied guarded audible run **7a34d143-4191-4003-b87a-a1e7b00bea1a**,
**2026-11-10T15:28:11.713Z**, v10 / engine62315b4104f2fc7e, **48 kHz / Message
tasks /512 x12 /128 ms**, first-miss guard true. IDs **[1,2,5,6]**, core notes
**2/2/2**, Hand **17 hits**, base0, no ignored controls/exclusions. Entire
**634,800** planned/consumed/rendered frames, **641,024** output, **29** events,
**1,240** accepted/rendered blocks. Every missing/late/rejected/stale/recycle /
overflow counter is zero; all raw/channel signals positive, app full pass true.
Minimum ready lead **1,152 /24 ms**, gap **4,864 /101.33 ms**, no zero/over-capacity
observations. Worker render total/max **3,817.5 /28.7 ms** is not worklet CPU or
synchronized clock evidence; worklet process timing is unavailable.

The user explicitly confirms **Clean drum entry and overlap** against this
run. Feedback is saved separately; original automated listening remains
unassessed. Compact raw data retained as `m4c-all-phone-hand-audible.json`,
feedback in `m4c-all-phone-hand-listening.json`. Only a compact audible export
was supplied, not a separate muted phone report or full plan. Reported hash
`f5bde8992f6e2fefa3e4875a8ed70237583d0349138c39e4c3ae6e9f3f94c48d`
cannot be independently rehashed or equated with the desktop capture. Precise
phone model, audio route and lock/background state are not supplied.

This accepts those diagnostic notes/hits and selected kit, not all six sources
on phone, native Piano/percussion, classic machines or the complete real song.

## Next check

Use the same four selected sources/Hand/worker/twelve with Material **Current
progression** for a complete captured-pattern pass, retaining the normal guard
and exact input/run metadata. Lead/counter can be intentionally silent in a
sparse score; omitted native Piano roles are not being played by this preview.
This checks the real drum expression/booking path beyond the two-second probe.
Keep longer phone lookahead, finite scope and existing defaults. Native-family
adapters, ordinary transport migration and new sidechain/pool routing stay
separate gates; do not start broad migration from this listening result.
