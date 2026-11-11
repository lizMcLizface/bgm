# Original Shimmer owned live host

Accepted host `567046fb4402707d` uses the unchanged original Shimmer Rust
engine `7b490244eb5cd194` (47,438-byte shared voice-FX Wasm). Freeze is not
selected by this host. Its measured synchronous capture cost remains a separate
worker/capture scheduling boundary.

The prepared context factory exposes the existing Shimmer stage interface.
It keeps the original stable gain input/output ports and dry preparation path,
lazily creates DSP after positive mix, and captures all pre-construction settings.
Later setters retain every original message; no live edit deduplication occurs.
The Rust owner retains its delay/filter/shifter state across message changes and
implements the original clear and left-channel sleep rules. Neither a forward
context gap nor stale host-frame recovery invents missing DSP callbacks.

The host accepts the bounded original UI contract: mix0..1, decay0.3..30seconds,
the four named intervals, climb0..0.95 and effective tone500..16000Hz. Original
mix/climb/tone and minimum-decay clamping are preserved. Out-of-contract decay
is refused before mutation. Configuration snapshots retain typed normalized
parameters; Shimmer consumes no random values. The shared portable spec's seed
is not a change to Shimmer's algorithm or a live Freeze RNG claim.

## Exact results

All72 actual original-wrapper/worklet comparisons pass at8/24/44.1/48/96/192k,
mono/stereo, through continuous input, source-ended tails, disconnect/reconnect,
message edits, clear and right-only sleep behavior. Maximum measured Native and
independent-owner differences are zero. The bounds were fixed at1e-6 absolute
and relative RMS before the first run. No samples, alignment or gains were fitted.

Actual page reload also passes and matches saved PCM SHA
`15d8afe4a53ca70d7d8ab6ddc1b76cdd1e239b2423b3f6e2b6be47aad0cf5e14`.
Nine permanent tests cover six actual original-JS/Rust processor traces plus
constructor/message failure disposal, lazy preparation, cancelled creation,
context identity, complete initialization and retained repeated messages.
The accepted underlying engine's allocator proofs remain unchanged; live
processing uses fixed views and allocates no Rust storage.

The first live offroute comparison failed (max0.09213) because the candidate
used a bare worklet output while the original has a stable output Gain. That
changes the browser's automatic-pull lifetime. Preserving the original wrapper
topology fixes the measured behavior; no DSP algorithm or bound was changed.
The negative remains under ignored reports.

Review: `/tools/shimmer-live.html`. Evidence: six
`reports/modular_audio/shimmer-live-<rate>-final.json` shards,
`shimmer-live-first.json`, `shimmer-live-reload-final.json`,
`shimmer-live-focused.log` and `shimmer-live-verified.png`.

## Boundary at the original leaf checkpoint

Optional VoiceFx/Instrument factory hooks are being integrated separately.
This checkpoint does not select Shimmer in the normal prepared environment yet.
Creation allocates prepared storage; desktop PCM correctness does not establish
hot-activation, mobile or physical-device deadline headroom. Existing Native
implementation and normal defaults remain operational. Next verify actual
normal voice composition, arming/teardown and saved reconstruction before
selecting the factory in that environment.


## Normal voice composition acceptance

Accepted normal host `6ffe9530fc98757f` retains the same underlying47,438-byte voice-FX kernel `7b490244eb5cd194`. Registration failure cleanup and preset preflight are host/lifecycle changes, with no DSP substitution or bound change.

Actual normal composition passes18 cases at8/24/44.1/48/96/192kHz. Each rate covers Core local/shared, FM local/shared and the real Instrument effects chain:30 Native/owned routed comparisons total, all maximum sample and relative RMS differences0 under the existing1e-6 bounds. The Instrument case additionally compares two independent owned states with identical output. Original echo, FDN and per-voice routing remain in the paths. Evidence is `reports/modular_audio/shimmer-normal-fence-{8000,24000,44100,96000,192000}.json` and `shimmer-normal-fence-48000-first.json`.

A retained first normal run differed in the shared Native reference. Review-only instrumentation pinned original `public/space-processor.js` SHA256 `815d8158cf9c49ccf118fb1838d341513d5b6983a102823b4ecc16b18808a6c0`. Its trace proves the shared Native processor began callbacks and received nonzero stereo input at frame2304 with mix0/appliedSets0; its initial set was only consumed at frame96000 after the complete render. The local reference consumed its initial set at frame0 and already matched. This was a reference initialization race, not evidence of changed Shimmer DSP. The full negative is `shimmer-normal-native-diagnostics-first.json`.

The diagnostic module is generated from that exact original source: only its two registrations are removed, then a review subclass is appended. It delegates to the unchanged original process/set/clear methods and reports bounded constructor/control/first-callback/first-input/first-added-output metadata. Temporary review factory replacement selects its processor name; production Native source is untouched. Permanent VM comparison confirms byte-identical Float32 DSP output with and without instrumentation.

The prepared reference now requires an ordered ACK on that same processor port, verifies all five effective settings and at least one applied set before first audio, and checks zero history at any preparation fence. Every accepted18-case browser trial used a **pre-render ACK**: guardFrames0, original voice note times unchanged and Instrument sourceStartFrame0. Neither suspend(0) nor the declared common128-frame fallback was used in acceptance. The fallback exists only for platforms unable to acknowledge earlier, is recorded as a distinct common-input fixture, validates silence/history and never trims or fits samples. A saved source0 replay refuses preparation requiring a later source start. Error paths resume and boundedly settle an already-started paused render before propagating the primary error.

The original eight review tests passed with the fence acceptance. The expanded review suite now has12 tests covering unchanged source/DSP, trace bounds, all preparation branches, paused-error cleanup and cold replay safeguards; the separate21 focused Shimmer/preset/environment tests also pass. These checks do not establish mobile activation or physical-device deadline headroom.

`/tools/shimmer-normal.html` now saves complete three-case fixtures/rate and canonical little-endian planar Float32 PCM SHA256 values only after a passing batch. The visible cold replay requires a new HTML document ID, restores the captured specs/notes/source coefficients/frame counts, validates the frozen host version, and compares all three PCM hashes/settings plus distinct owned node/port identities and exact render-frame counts. Actual48k save followed by a full HTML reload and replay passes all three PCM hashes, complete settings and independent state checks. Evidence is `reports/modular_audio/shimmer-normal-save-scene.json` and `shimmer-normal-cold-reload.json`; the accepted source and production assets remained unchanged. No saved instrument/synth settings or default route selection are changed by this review page.

The explicit prepared environment now forwards its context-bound Shimmer factory
to VoiceFx/LabVoice and ordinary Instrument. Edits and morph targets preflight
before preset mutation or pending morph completion. Activation is armed only
on a running context, and teardown waits for every optional owner even after
an earlier failure. Omitted factories preserve Native construction. The combined
prepared-host checkpoint passes75 focused tests across14files.
