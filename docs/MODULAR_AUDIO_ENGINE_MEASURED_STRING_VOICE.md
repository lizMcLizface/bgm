# Owned measured-string dry voice

This standalone source ports the original `stringModel/realtime.worklet.js`
for the bowed Long/Live cello path. It consumes the actual measured preparation
described in `MODULAR_AUDIO_ENGINE_MEASURED_STRING_PREPARATION.md`. The output is
the original mono dry sum **before** its native normalize=false body convolver.
Left/right API outputs are identical mono duplicates. No Graph, All, Strings
page, native player or default backend changes here.

Short/Pizzicato use a different native fixed-buffer player. This source rejects
decay-mode tables instead of substituting bowed wavetable playback for them.
The complete source request retains its measured table, tuning, prepared note
identities and explicit phase captures; this is not a generic cello patch.

## Preserved worklet behavior

The kernel preserves the actual cubic4096-sample table reads, bright/dark
opening, vibrato interpolation, f64 accumulated voice age, per-sample wander and
bow-noise filters, raised-cosine-commented cubic attack, measured release curve,
and every Float32 output accumulation in voice insertion order. The terminal
release sample still performs the original phase/noise updates before its
release-stop check. Noise/wander coefficients remain sample-based at every rate.

The source has24 voices and one instance-owned LCG initialized to12345. It
advances **voice-major over a complete128-frame native callback**. Processing
37 frames of every voice before the next37 would change the shared noise
sequence. The owned source therefore generates canonical128-frame blocks and
serves arbitrary0–2048-frame executor reads from a fixed cache. This adds no
output delay; generated DSP state can be up to127 frames ahead of consumption.
It is an explicit128-frame reference contract, not a claim about future browser
render-quantum sizes.

Actual Map semantics are retained. A new on-message first removes the oldest
voice when size is already24, then replaces/adds its ID. Thus an on-message for
an existing later ID at full capacity leaves23 voices; replacement retains the
existing insertion position. This unusual case is tested against the unchanged
original worklet rather than silently corrected. A note-off records the current
accumulated voice age only once. Timed panic clears current voices and keeps the
LCG state; later booked messages still execute, matching this worklet's message
semantics. Its behavior differs from another engine that clears an internal
future-event queue on panic.

The only unseeded branch is `Math.random()` for each on-message's initial LFO
phase. Every on-event here **requires that actual captured phase in radians**;
there is no replacement random seed or default phase. Reference fixtures supply
known Math.random draws to the unchanged original worklet and pass those exact
resulting phases to Rust. They do not claim to reproduce an existing live
uncaptured voice. Live capture requires a separate diagnostic/native boundary.

## Configuration and ownership

New crate: `synth-engine/string-voice`. Adapter/config:
`ownedStringVoice.js` and `stringVoiceConfig.js`.

`stringVoiceSpec(preparation, events, {owner})` creates a complete version1
`measured-string.realtime-dry` configuration. `preparation` is the complete saved
measured-string preparation spec. Bowed mode, native realtime pitch range
(36–84, or24–84 for smooth parts) and rounded1–127 strength capture are enforced.
The source does not silently clamp a mismatched prepared bank to another sound.
At most128 banks,2000 captured on-specifications and4000 pending events are
allowed. Events use safe nonnegative frames aligned to128, with kinds:

- `{kind:'on', frame, owner, id, bank, lfo}`;
- `{kind:'off', frame, owner, id}`;
- `{kind:'panic', frame, owner}`.

These frame positions represent actual callback-boundary message application.
An arbitrary intra-quantum timestamp is rejected; the native protocol does not
provide a sample timestamp to justify inventing one. One nonzero owner is fixed
per source. The native shared LCG couples voices, so the API does not pretend
that different owners inside this kernel have independent noise histories.
Independent modules own independent banks, voices, RNG, cache and queues.

`save/load/validateStringVoiceSpec` persist the whole configuration and exact
phase values. `OwnedStringVoice(voiceEngine, spec, preparationEngine)` prepares
resources outside rendering, uploads owned f32 banks and bounded curves, then
exposes `left/right`, `render`, `frame`, `stats`, `enqueuePrepared`, `cancel`,
`reset`, `refresh` and idempotent `dispose`. Its detached spec and initial plan
are frozen. `loadOwnedStringVoice` caches verified compiled code and creates
fresh memory, pinning the verified preparation version as part of provenance.
Default assets after explicit publication are `public/string-voice/voice.wasm`.

`enqueuePrepared` references an already captured immutable on-spec by zero-based
index (`id`), or a native off ID. It cannot construct new wave resources or
invent an uncaptured phase while rendering. A booking before `generatedFrame`
is rejected with a late counter before modifying the queue. Same-frame arrival
order is stable. Queue insertion/compaction happens outside block generation;
render only advances its head and never repeatedly shifts the remaining list.

`cancel` with a different owner does nothing. A matching owner clears current
voices/future bookings and zeros unread cached audio. It preserves the RNG work
already performed to generate that cache. `reset` restores the cold12345 seed,
empty voice state, clocks and captured initial plan without replacing/freeing
the prepared banks. It replays the captured phases; it does not ask Math.random
for new ones. Body convolution state is downstream and is not reset by this dry
kernel. Runtime commands are separate from the persisted initial plan.

## Verification

```
node tools/buildOwnedStringVoice.mjs
node tools/buildOwnedStringVoice.mjs --audit
npm.cmd exec -- vite-node tools/auditOwnedStringVoice.mjs
npm.cmd exec -- vite-node tools/auditOwnedStringVoice.mjs --allocation
npm.cmd test -- --run src/modular-audio/ownedStringVoice.test.js
node tools/buildOwnedStringVoice.mjs --check
```

The final production build is `6811dc2b48a763fd`,41281bytes; audited build is
`08830e39b6604693`,42959bytes. Both pin preparation `75424d620f95653a`.
Source, adapter/config, unchanged worklet/reference, preparation version and
Wasm hashes are verified. Allocation builds cannot be published.

The unchanged actual worklet runs in a VM with the captured phase draws.
The reference obtains its banks and gain from the actual JS realtime methods,
independently of Rust preparation. The36-case matrix covers Long/Live, six rates
8000/24000/44100/48000/96000/192000, duet, actual pad settings and24-voice stealing
stress. It includes fractional pitch, measured strengths, overlapping releases,
duplicate IDs at capacity, repeated2048-sample wander target changes, timed
panic and subsequent new voices. Every block checks exact active counts and
LCG state in addition to PCM. Total source frames are9,478,300.

35/36 full-source cases are bit exact. The remaining case has worst absolute
error2.2737367544323206e-13 and relative RMS5.077314985964102e-15, against fixed
predeclared1e-7 maximum/RMS limits. Two complete saved independent handles match
exactly. All36 allocator cases have zero Rust allocation/reclamation and no
Wasm growth through rendering, reset/initial-plan replay and cancellation.
Observed source-Wasm memory for two handles is1,835,008–1,900,544bytes. This
excludes the separate preparation instance and detached body IR.

Twelve permanent checks pass on production and audited Wasm. A raw maximum
resource case additionally prepares128 banks/2000 on-specifications, fills and
reuses4000-event capacity, renders/cancels/resets with zero audited allocation,
reclamation or growth. Reports are
`reports/modular_audio/string-owned-voice-compatibility.json` and
`string-owned-voice-allocation.json`. Numeric/reference tests do not establish a
physical callback deadline or new listening acceptance.

## Next physical boundary

The opt-in `/tools/measured-string.html` harness now verifies the actual source
and retained native body path. It appends a diagnostic scheduler subclass to the
unchanged original worklet; the original and wrapper hashes are recorded. Known
test phase draws are clearly separate from observing an existing unseeded live
voice. The owned AudioWorklet receives bounded already-prepared resources before
processing, so no fitting/FFT occurs in its process callback.

Actual browser acceptance passes40/40 cases: Long/Live, six rates and duet/pad/
stealing, plus owner cancellation and complete saved replay. Three independent
sources run in one six-channel OfflineAudioContext: native dry/wet, owned owner1
dry/wet and owned owner2 dry/wet. Each wet route retains its own native
normalize=false convolver and unity master. Exact1024-frame start/event clocks,
native/owned LCG and voice counts, independent instances, cancellation's unread
source silence with retained native body tail, and saved replay all pass.

Worst actual browser dry sample error is1.4901161193847656e-8 and worst relative
RMS6.153e-10; worst wet sample error is7.450580596923828e-8 and worst relative
RMS4.347e-8. Both original fixed1e-7 maximum/RMS limits remain unchanged.
Evidence: `reports/modular_audio/measured-string-native-browser.json`/PNG,
revision `measured-string-native-v1`, source `6811dc2b48a763fd`, preparation
`75424d620f95653a`. These are actual muted browser source/body comparisons, not
a new phone listening acceptance or a portable convolution claim.

The numeric IR remains independently prepared. Native convolution execution is
still downstream; its portable replacement has a separate parity gate. Current
live cached-table identity, phase observability and asynchronous host-message
capture also remain separate before default source adoption. Default/native
routes are operational throughout this slice.
