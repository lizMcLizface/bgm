# Owned desk mixer primitives

2026-11-10 overnight stream. This slice adds independent portable Rust strip,
master matrix, master fader and actual desk limiter processing. It leaves the existing desk, its
connections, default DSP, effects and limiter in place. Parent graph integration
and actual-browser comparison are separate checkpoints.

## Audited host behavior

The current `src/synths/all/mixerAudio.js` is the compatibility authority:

- A channel applies optional input trim, highpass, lowpass, 200 Hz low shelf,
  1 kHz peaking EQ, 5 kHz high shelf, stereo pan and output fader.
- HP/LP Q is `.707` **in dB**, following Web Audio's low/highpass contract;
  peaking Q is `.7` linear. Shelves have the specified fixed slope.
- Faders are neutral at `.75`, silence at zero, and +10 dB at one. Optional trim
  ranges from −12 to +36 dB. Normal music roles do not receive a second trim;
  subgroup/ambience do, or all roles when the explicit `trimRoles` option is on.
- All updated AudioParams use a 12 ms exponential target. Native construction
  starts HP/LP at 350 Hz, node gains at unity, pan at zero and all four width
  matrix gains at unity. The first patch slews from those initial values.
- Mute overrides solo. A soloed role also opens the headroom subgroup, while a
  soloed subgroup opens all music roles. Ambience retains its separate policy.
- Master mono/width is a two-by-two matrix, then stereo balance. A master insert
  can sit **between that matrix/balance stage and the level/dim stage**. Level is
  followed by the existing external desk limiter; output is unity.
- Reverb/delay settings are captured in desk state but are not processed by
  `mixerAudio.js`. They remain explicit external effect/send responsibilities.
  The native limiter remains selected by default; an owned implementation of
  that same algorithm is now available for explicit integration.

The implementation uses the [Web Audio biquad equations](https://www.w3.org/TR/webaudio/#biquadfilternode)
and [stereo panner law](https://www.w3.org/TR/webaudio/#stereopanner-algorithm).
Those equations establish the intended algorithm, not bit-exact browser parity.

## Portable implementation and contracts

`synth-engine/mixer` is a dependency-free `rlib`/`cdylib` with public `Strip`,
`Matrix`, `Fader`, `Limiter` and `Processor` types. Each has owned filter history and
smoothers; there are no mutable production singleton buffers or RNGs. Processing
uses preallocated/inline state, an actual sample count and stereo f32 buses.

The matrix and fader remain separate primitives so integration can preserve the
master-insert ordering. There is no implicit aux summing, cable routing
or whole-desk topology in these primitives. Stereo input is explicit; mono-input
StereoPanner behavior must be represented by a separate channel conversion rather
than guessed from equal left/right samples.

Parameter codes and physical units:

| Kind | Ordered parameter codes |
| --- | --- |
| strip | trim gain, HP Hz, LP Hz, low dB, mid dB, high dB, pan −1..1, output gain |
| matrix | width 0..2, pan −1..1 |
| fader | output gain |
| limiter | enabled integer 0/1, linear ceiling .05..1 |

Frequencies clamp only in the fixed EQ implementation where native Web Audio
would clamp to Nyquist at low sample rates; exposed HP/LP values must validate
against the actual prepared rate. EQ bounds are ±12 dB. Trim is bounded at 64,
output gain at 4, sample rate at 8–192 kHz and block size at 1–2,048 frames.

The standalone owned ABI exposes `mixer_new/free`, `mixer_input/output`,
`mixer_param`, `mixer_event`, `mixer_render`, `mixer_pause/reset/cancel/stat`.
It has 512 preallocated timestamped parameter events per handle, stable
same-frame receive order, explicit owner IDs, late clamping/counts and overflow
rejection/counts. Non-finite input samples become silence. Invalid configuration,
frames, targets and parameter values fail closed. Handles are trusted-host
opaque pointers and must not be reused after disposal.

Pause produces silence without advancing filter/smoother/event time. Low-level
reset restores construction defaults and clears filter history/events/counters.
`OwnedMixerUnit.reset()` reapplies its immutable captured configuration and event
list, preserving exact replay of that configuration. Cancellation removes queued
events for the owner; already-applied parameter values remain in effect.

`mixerConfig.js` compiles the existing cleaned desk state into typed physical
strip/matrix/fader configurations, including mute/solo policy. It carries
external effect/limiter settings separately without claiming they were rendered.
`saveMixerConfig`/`loadMixerConfig` preserve complete initial parameters,
startup-versus-settled selection and timestamped events. `mixerOwned.js` owns the
Wasm handles and explicit preallocated channel views; preparing a second handle
can grow memory, requiring `refresh()` before rendering the first again.

## Validation checkpoint

Build commands use `.tmp/rust-tools` offline and run the Wasm artifact, never an
Application Control-blocked native executable:

```powershell
node tools/mixer-owned-build.mjs
npm.cmd test -- src/modular-audio/mixerOwned.test.js
npm.cmd test -- src/modular-audio/mixerLimiter.test.js
node tools/mixer-owned-build.mjs --allocation-audit
node tools/mixer-owned-audit.mjs
node tools/mixer-owned-limiter-audit.mjs
```

The initial 15 tests pass: existing compiler laws, neutral/hard-pan stereo at five
rates, width/mono/target timing at three rates, serialized irregular-block replay,
partial pause, reset, two units in one memory, owner cancellation, filter channel
independence, steady shelf/peak gains, HP DC rejection, raw ABI resource bounds,
late/overflow reporting and disposed-handle rejection.

`reports/modular_audio/mixer-owned-allocation.json` records nine two-handle
strip/matrix/fader runs at 44.1/48/96 kHz. All samples are finite, saved/reloaded
units are exact, and allocator instrumentation reports zero allocations,
reclamation or memory growth after preparation, including events, reset, pause
and cancellation.

`tools/mixer-owned.html` and `mixer-owned-review.js` provide 18 silent actual
OfflineAudioContext comparisons: three rates, three primitive kinds, and both
native startup and settled initial state, with timestamped changes. The page
requires the parent build to publish `modular-audio/mixer.wasm` and include the
HTML input. Its fixed limits are max absolute error and relative RMS < 1e-4;
browser results are pending until that button is run through the supported
built-in browser. Do not label the analytic/Wasm tests as browser parity.

## Actual desk limiter port

The portable `Limiter` is an algorithm-preserving extraction of
`public/desk-limiter-processor.js`: a stereo-linked sample-peak detector, a
`ceil(sampleRate * .003)` frame ring buffer, instantaneous downward gain and
80 ms exponential recovery. The detector includes both current and delayed
samples. Disabled mode retains the same delay and recovers gain toward unity;
it does not bypass the buffer. There is no true-peak oversampling.

The ring buffers allocate only at construction. Reset fills the existing
buffers and restores enabled/default ceiling/gain without freeing or allocating.
`mixer_stat` index6 exposes exact latency frames and index7 the current linked
gain. The typed config uses kind `limiter`, enabled integer0/1 and ceiling .05..1.
The desk compiler adds this explicit configuration while retaining external
limiter metadata for the unchanged native default.

`mixer-owned-limiter.json` records twelve comparisons against the actual legacy
worklet's process method in an isolated Node VM at8/24/44.1/48/96/192kHz,
initially enabled and disabled. Impulses, opposite-sign stereo peaks,
non-finite input, non-quantum toggles and ceiling changes all remain bit-exact
(maximum absolute sample error0). Three additional two-handle allocator runs
report zero allocation/free/growth. All24 mixer/limiter tests pass across two
files, including saved-config irregular partition/reset/pause/cancellation.
This is actual-source DSP parity, not a new browser or physical listening claim.

Standalone controls retain f64 values like the original JS messages. A graph
integration that quantizes common parameters to f32 must test and report that
quantization separately rather than relabel standalone results as bit-exact
graph parity.

## Next integration

Parent graph integration should expose stable primitive IDs and typed stereo
ports, reuse the authoritative graph clock/event queue, preserve master-insert
ordering and keep external effect/limiter boundaries explicit. Connect current
role/headroom/ambience topology through an opt-in adapter before changing live
defaults. Port or adapt sends/returns and integrate the separate limiter boundary.
Browser parity,
long tails and changing graph topology remain distinct acceptance tasks.

## Authoritative graph plan

`mixerGraphPlan.js` now compiles actual cleaned desk state into typed `host.audio`,
`desk.strip`, `desk.matrix`, `desk.fader`, `desk.limiter`, explicit `ref.mix`
reductions and one `ref.output`. All desk modules carry their full immutable
mixerConfig objects and begin with empty generic `parameters`. Semantic hashed
module IDs remain stable when role order changes; collisions fail explicitly.
Reduction order remains the supplied recorded role/return order.

Default host boundaries preserve the actual post-headroom Generator fade,
optional sweep and levelTrim, and the optional master insert between matrix and
fader. Their exported/return IDs are explicit. A `host-return` plan needs a
phased host bridge; it is not a turnkey route in the existing executor. The
separate `neutral` modes are deliberately bypassed reference fixtures and must
not be relabelled as complete All migration. Unknown host latencies stay null;
there is no automatic alignment or compensation claim.

Native topology audit: role strips feed headroom; busRack and section-space
sends tap post-strip/fader and return into headroom; the shared reverbHub feeds
Generator.output after headroom; ambience joins the master only after the music
fade/sweep/loudness chain. The compiler represents those distinct return targets
and never mixes ambience through headroom or duplicates a host FX processor.
Web Audio's internal floating-point sum order is not asserted as bit-exact.

`compileMixerGraphStateDiff` appends named f64 target events at monotonically
scheduled frame snapshots, including multi-strip solo side effects. Saved initial
module configurations remain unchanged. Last-scheduled projections are not live
DSP values; cancellation/repatch needs a fresh projection. Unprocessed desk
space settings remain external metadata rather than fabricated audio effects.
Six structural/native-policy tests pass; actual Rust graph descriptor/render
integration is the parent checkpoint.

Final standalone normal Wasm is68,589 bytes, SHA-256
`cd4284141d3ef58d865f181315701f00b57f71e3e45a5daf8688f04f635f71a3`.
The preparation-only build tool's Rust source hash is
`238e09f6adf2915a3013bf291ee7350c88553e0cc380ba4afc045af0a9825d2e`;
the parent's published build adds host/source provenance separately.
