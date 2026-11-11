# Portable original RoomColour

The standalone owned Rust stage reproduces src/nodes/reverb.js RoomColour:
0..200ms fractional pre-delay and the original Q0.5 low-pass, including the
constructor's350Hz→20000Hz20ms target and original control mapping. It changes
no normal source/effect backend or saved song. Existing legacy playback stays.

The explicit version1 profile preserves original native seconds, Float32
four-lane target evaluation, canonical128-frame parameter blocks and pinned
SSE-style delay interpolation. Native DelayHandler evaluates its AudioParam
again for each channel; the stereo implementation preserves that shared
control-state order. Treating delay controls as one shared curve failed the
first native stereo batch. Its evidence remains in local ignored reports.
Low-pass arithmetic reuses the existing pinned Tape tone implementation;
source notices are retained in the crate. No native output is fitted or shifted.

roomColourSpec(rate,{channels,predelay,damping,events}) captures complete initial
settings and chronological targets. Rates8000..192000, channels1or2, predelay
0..0.225s, damping200..20000Hz and at most255 events per parameter are explicit.
Same-parameter events after second0 require strictly increasing original seconds.
Runtime schedule rejects any event inside an already generated128-frame control
block, retaining counters. Its fixed-capacity queue compacts only consumed
records and accepts sustained controls without growing Wasm memory. Render takes
0..2048 frames. Input finite checks precede clock advancement. Reset restores
the original captured spec and discards later live arrivals. Captured-spec replay
and current-UI-target cold snapshots are separate APIs; neither snapshots a
running room tail. Each handle owns its delay and filter histories.

Verification on11 November2026:14 permanent functional cases pass;12 allocator
cases cover two independent handles,1400live controls, render/reset and zero
allocations/frees/growth. The actual built-in desktop browser native batch
passes48/48 at8/24/44.1/48/96/192k, mono/stereo, constructor/extreme/fractional and
moving controls. Maximum absolute error1.965596916594886e-36;
maximum relativeRMS1.3427002034952046e-35, under unchanged1e-4
bounds. Evidence is local reports/modular_audio/room-colour-native-after-stereo.json
and room-colour-allocation.json. Physical listening, callback deadline acceptance,
complete room routing and default adoption are separate gates.

Maintained commands:

- node tools/buildRoomColour.mjs --publish [--check]
- node tools/buildRoomColour.mjs --audit
- node tools/auditRoomColour.mjs
- npm.cmd test -- --run src/modular-audio/ownedRoomColour.test.js

Next attach this stage to the bounded owned convolution room path and verify
actual routed worklet/worker PCM, live controls and current-settings reload.

Live host follow-up: version c8069f9d36131a64 passes12actual six-rate worklet
PCM comparisons exactly and a running48k muted host case with two independent
nodes, future acknowledged controls and current-target cold reload. Meter peak
0.1059439927; both controls had0late arrivals. Disposal waits for acknowledgement
with a bounded fallback. Repeated future targets at the same second replace
only still-ungenerated control material. Normal room defaults remain native.

Audit correction: the first standalone audit disabled the watch before reading
its counter; that watch operation resets the counter. The corrected audit reads
the counter first and records the exact audited artifact. All12two-handle cases
pass again with1400live controls and actual zero allocations/frees/growth.
The earlier read order was not valid evidence for that claim.

## Post-evaluation nominal range and carry correction

The independent continuous AC retarget probe exposed a real low-rate boundary: at8kHz the original port differed by maximum0.013746686 and relative RMS0.0832176; at24kHz by0.0075541355 and0.0463195. The four higher rates remained exact. A DC-only comparison had masked the frequency-state error because the filter already had unity DC response. Native targets remain unbounded20kHz; clamping targets to Nyquist before smoothing is incorrect.

Pinned AudioParamHandler ValuesForFrameRange first evaluates the timeline, then clips generated values to the nominal parameter range and returns the clipped last sample. CalculateTimelineValues stores that sample as the next intrinsic value. The new additive common Gain::clamp_output method applies that order without changing targets, event times, or any default unbounded caller. RoomColour frequency invokes it with0..Nyquist after every canonical128-frame evaluation, before consuming its controls. This corrects low-rate retarget carry while leaving the high-rate math unchanged.

Actual continuous multitone/noise retarget output is now exactly equal to native PCM at all six rates in room-retarget-ac-after.json; the unmodified before result remains room-retarget-ac-before.json. The accepted artifact is776154307b5a68e7,69,036bytes, Wasm SHA256 f351bab1dfdc5e5227e1df29448425c67b37d03b8705b66801994d9997761802. Sixteen permanent tests pass, including nominal-range/control-reset regressions. The corrected two-handle allocation audit also passes all12cases with counters read before disabling.

This correction does not resolve native automatic channel-layout or inactive-bus behavior. Separate finite-source probes show stereo native inputs can become zero-channel buses after source end, collapsing Delay/Biquad to mono and resetting their histories. The current fixed-channel profile and default host have no claim of parity across those topology changes. The separately versioned explicit activity profile below supplies that clock; no silence flag is inferred from numerical zeros.

## Explicit layout and activity profile

The opt-in `chromium-room-colour-authored-activity-f32-128-v2` contract captures canonical128-frame source-local activity events. Each event explicitly provides0/1/2 source channels and independently selects audio processing or parameter-only advancement for Delay and Biquad. A zero-channel source falls back to logicalmono while its delay tail can still process; it does not automatically select parameter-only mode. The defaultv1 profile remains fixed-channel and has identical PCM when no activity override is used.

Pinned DelayHandler changes preserve the write index and remap the complete ring:2-to-1 uses ordered speaker half-left/half-right summation,1-to-2 duplicates mono history. Pinned BiquadFilterHandler uninitializes/reinitializes its kernels on a width change, discarding filter histories. The portable implementation performs those operations in preallocated buffers. Its fixed maximum output explicitly speaker-upmixes logicalmono; logical width remains available in stats. Source links/hashes and the exact reference scope are in CHROMIUM_ACTIVITY_PROFILE.json; existing BSD notices apply.

The private native candidate passed all12finite-source cases at six rates, with mono/stereo source material and independently authored source-end metadata. The maximum PCM error was1.1197404223457774e-13; all other differences were zero or denormal-scale. This directly supports the history remap/reset policy, rather than inferring it from self-replay. Evidence is room-activity-candidate.json. Earlier failing room-finite-stages.json and room-idle-probe.json remain unchanged.

The Rust queue holds at most256pending events, reuses consumed capacity and allocates nothing during updates/render/reset. Captured books, runtime pending changes and current-target settings are distinguished. Thirteen activity tests and three tests importing the actual worklet module verify clock/replay/reset, independent state, fixed-speaker mapping, queue recycling, strict raw numeric/enum payloads and reject-late behavior. Twelve instrumented two-handle cases perform1200authored changes each, all layouts and both processing modes, with zero allocation/reclamation calls and no memory growth; the largest observed memory is1,966,080bytes (room-colour-activity-allocation.json).

The optional host accepts activity only on this explicit profile. Future activity commands use absolute AudioContext frames aligned to128 and are mapped to the acknowledged processor epoch. Late activity rejects; it is never shifted to a newer frame. Constructor captures stay source-local and roundtrip independently. The original host defaults are unchanged. Native silence flags are not observable from ordinary Float32 input samples; callers must author correct layout/processing metadata from source/graph ownership. Automatic graph-activity inference, arbitrary topology migration and default adoption remain outside this acceptance.

The complete production composition subsequently passed15native full/Light/mono cases and6actual routed Worker cases with the activity profile, including two independent rooms in one AudioContext. Native worst absolute error4.470348358154297e-8 / relative RMS2.443934528873854e-7; routed PCM is exact. The activity-only checkpoint packageab1c6fe4510757e4 differs from the browser'sabb5608c26bd426a only by the acknowledged host-snapshot copy fix; numeric Wasm70084ec1695c78e01ab999805f64c881d3fd176d23e525014872e8b4f5dc0f3a remains unchanged. Two host regressions verify request/constructor ownership across asynchronous startup and acknowledgement. See MODULAR_AUDIO_ENGINE_ROOM_CONVOLUTION.md for exact composition identities and remaining live-host boundaries.

## Additive integer-frame profile (private-room integration)

The separate `ownedRoomColourFramed.js` adapter / profile `chromium-room-colour-authored-activity-framed-f32-128-v3` authors controls as canonical integer source frames, with the existing explicit activity/output routing and a one-hour clock limit. Its new constructor and event/schedule ABI cannot be mixed with the original native-seconds ABI. The common Gain Event/Gain layout and original evaluator are unchanged; new frame-specific methods preserve exact boundary comparisons, including the zero-length prior-segment visit on Delay's second channel evaluation. A source frame is validated before conversion/storage; arbitrary original native timestamps are never imported by rounding.

This addition was required by the private-room native stage probe: at 44.1/48 kHz, F/rate multiplied slightly above F; selecting the adjacent representable ceil-frame fixed one error but placed the target infinitesimally below F, changing the prior-segment comparison on right-channel re-evaluation. Native/owned colour left stayed exact at onset while right differed. The explicit new profile preserves the integer boundary and leaves the native-seconds contract intact. Six maintained deterministic native-seconds stereo PCM goldens, captured from accepted `3b6ecfb` Wasm, are exact at 8/24/44.1/48/96/192 kHz after the addition. Private framed native/live acceptance is recorded separately in `MODULAR_AUDIO_ENGINE_PRIVATE_ROOM.md`; it does not relabel old RoomColour evidence or enable a default backend.
