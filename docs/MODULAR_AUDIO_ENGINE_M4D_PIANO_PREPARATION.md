# M4d: piano boundaries and owned note preparation

2026-11-10, after `2aca381`. A genuine modal and base-acoustic piano synthesis port,
used opt-in by the existing piano worker and native voice path. This is not a
claim that the complete piano voice or normal transport now runs in the modular
Rust graph. Keep that distinction when reporting remaining migration work.

## Audited remaining source boundaries

| Family | Existing implementation | Remaining modular boundary |
| --- | --- | --- |
| Core/FM | Owned Rust graph adapters and existing live backends | Normal transport/live-control migration |
| Basic Wasm drum kits | Owned configurable Rust adapter, finite All integration | Normal transport and live kit edits |
| Felt/electric modal piano | JS `piano.js` produced mono strikes and looping bodies; native `MonoSynth` plays them | This step ports those two generators; per-voice playback/envelopes/filters still need owned graph state |
| Acoustic grand/felted/upright | JS stiff-string/hammer/soundboard renderer | This step ports these three generators; native voice-chain ownership remains |
| Matched acoustic variants | JS model with six fitted spectral/body shapes | Separate shape/configuration port and parity checks |
| Calibrated/measured piano | JS table interpolation, measured modal synthesis and normalization | Immutable table preparation plus owned DSP; eight table families remain separate |
| Iowa measured instruments | JS preparation and JS AudioWorklet Held/Decay/Roll voices; native room/limiter | Owned voices, seeds, event clocks, release and table lifetime; this is not already an owned Rust instrument |
| Classic synths/drum machines | Existing Rust/Wasm plus native host processing | Extract reusable owned instances/configuration without altering the legacy ABI |
| Plucked strings/other native fallback sounds | JS/native source generation and Web Audio | Separate algorithm/voice adapters |

The actual native piano path is `Instrument.noteInfo/notePlan/scheduleNote` ->
`pianoBufferLater` -> cached `pianoBuffer`/`pianoBodyBuffer` -> per-voice
`MonoSynth` BufferSources. Its existing path applies stringGain2.5, native
gain-envelope points, pitch automation, filters, stereo, voice stealing and
release, then instrument processing and the host's current role/mixer effects.
Preset temperament/stretch/wear affect the prepared frequency before dispatch.
Velocity uses the existing eight-layer cache policy; exact note velocity still
shapes the voice gain envelope.

There is no one mixed dry native-piano source tap equivalent to core/FM's
`voice.sourceInput`: different overlapping piano voices have different filters
and envelopes. Feeding their raw sum into a core adapter would change the
sound. Do not substitute an existing subtractive preset or relabel prepared
buffers as a complete graph piano port.

## Implemented Rust kernel

`synth-engine/piano` is an independent portable crate. `Piano::strike` ports the
existing felt/electric inharmonic partials, per-partial decay, unison, softness,
resonant bloom, seeded hammer noise, DC removal, edge fades and peak bound.
`acoustic::render` ports the actual grand/felted/upright stiff-string modes,
unison, prompt/aftersound, soundboard resonators, wear, action noise, low-band
normalization, DC removal and fades. `Piano::body` ports the original2048-frame periodic sustained body and resonant
harmonics. Float64 recurrences and float32 accumulation points preserve the
reference's arithmetic. Seed is note-owned; there is no singleton DSP state.

Version1 Wasm ABI returns an opaque owned immutable buffer handle. Hosts can
create/read/free multiple simultaneous notes or independent Wasm instances.
JS wrappers refresh memory views after allocations, copy PCM before freeing,
reject use after disposal, and free handles on exceptions. Strike material is
bounded by the original8–192kHz /six-second modal or seven-second acoustic limits, at most
1,344,000 floats;
each body is2048 floats. Unsupported kinds fail instead of silently becoming
felt. Preparation allocates and runs outside the audio callback; no real-time
allocation-free voice-processing claim is made here.

`tools/buildPiano.mjs` uses the local offline Rust toolchain for Wasm only.
`piano:check` binds Cargo/Rust source, lockfile and emitted Wasm provenance and
is included in normal/public builds. Public package checks require both assets.
Existing core/FM/percussion/graph binaries and legacy ABIs remain untouched.

## Actual worker/cache integration

Top-bar **Tests -> Test settings and sources -> Piano note preparation** offers
Original JavaScript (fresh default) or explicit Rust/Wasm (modal plus grand/felted/upright).
The device choice is saved separately under `synths:piano:preparation`. It
affects future normal piano and keyboard notes, not the finite source compiler.
The finite graph's unsupported-native messages remain honest.

Existing note-preparation workers load one Rust renderer each, with owned note
handles. Jobs return strikes and held bodies; samples enter the existing24MiB
shared LRU and the unchanged native voice chain. Rust policy has separate cache
namespaces, so an old JS note cannot be mistaken for prepared Rust material.
The held body's Nyquist count uses the original unrounded frequency, while the
strike preserves the existing pitch rounding. No-worker Rust preparation is
asynchronous on the host thread; it does not require a worker-pool deployment.

Unsupported matched-acoustic/calibrated families continue on their actual original
renderer and are counted separately. Rust load/render failures retain the
existing JS fallback, now with explicit fallback/error counters. This fallback
is not a successful Rust preparation. UI shows requested mode, actual prepared
Rust/original note/body counts, version and errors. Counts describe preparation,
not the number of notes heard or graph-delivery success. Existing notes are not
restarted when the preference changes. Browser storage failure leaves the choice
unchanged and is shown. Legacy default cache keys/worker behavior are retained.

## Measured compatibility

`npm.cmd run piano:audit` compares222 strike cases: modal felt/electric plus
grand/felted/upright,8/24/44.1/48/96/192kHz, three registers and varied controls,
velocity/seed/softness/resonance/wear. Six additional cases use the actual
**Felt Keys (updated)** preset values. **183/222 strikes are bit-exact; maximum
absolute difference across all cases is1.4901161193847656e-8. All108 modal
held-body buffers are bit-exact.** Output lengths match, samples are finite and
handles are released. Per-case hashes/errors are retained in
`reports/modular_audio/piano-rust-compatibility.json`. The initial modal-only
checkpoint is retained separately under its older build identity. This measures
prepared source PCM, not native-filter/wet output or physical listening.

Independent simultaneous handles survive later allocations/freeing; separate
instances and serialized settings reproduce output exactly. Invalid-family,
clamping, dispose, renderer-cache separation, unrounded body pitch, explicit
fallback, no-worker preparation and unsupported matched-acoustic dispatch are tested.
The broad application run passes **141 tests /11 files (71.44 s)**, including
existing piano tuning/model/Iowa playback, All74-page checks, host ownership and
source-suite behavior. The final targeted renderer/pool/control run passes
**15 tests (3.10 s)**, including ten pool tests; later metadata fixes preserve
the actual request policy for in-flight jobs and do not count failed original
jobs as prepared notes. Public provenance/package build passes **36.09 s**.
The final preparation Wasm is **48,561 bytes**, version **d592cc8a0af5164e**,
SHA256 **80029784b936d9e19566f6e900875b180f348d5fb79bf81b3e6bf397dfdffba2**.
The graph remains62315b4104f2fc7e; no legacy or modular-graph Wasm changes.

## Actual browser path

In a390x844 isolated browser, normal Continuous Play with the existing native
Rhythm/Pad **Felt Keys (updated)** starts from zero preparation counters and
produces **19 Rust notes, zero original notes/fallbacks/unsupported models**.
Actual engine version is d592. Pad/music/master meters are active and the
preparation selector is disabled during transport. The initial modal-only
build correctly counted the same acoustic preset as original/unsupported;
that evidence is retained separately instead of called a Rust success.

A temporary native **Starmap Piano** on Pad exercises the modal felt sustain
path through the existing keyboard Chord. Totals become **30 Rust notes /
11 Rust bodies**, no original/fallback/unsupported counts. Pad meter has7 lit
segments and the separate master L/R meters have8/7. Chord Pause and normal
Stop work; no private graph route is implied. Raw DOM-visible observations are
`piano-acoustic-live-browser.json` and `piano-modal-held-browser.json`.
Image `.tmp/piano-rust-preparation.png` shows actual Rust preparation counters.
This verifies prepared Rust material entering the live native voice/mixer path,
not physical listening, isolated wet PCM equivalence, device-underrun timing or
complete piano graph ownership. Existing cold-note preparation/rescheduling
behavior remains; no CPU, latency or lock-screen improvement is claimed.

Reload retains the explicit Rust choice, resets session counters and starts no
playback. All twelve source/patch selectors match their pre-test values after
restoring Pad; the final original-JS choice also survives reload, with normal
Play unpressed. Raw checks are `piano-preparation-{reload,restored}-browser.json`.
Agent tab/viewport and loopback QA server are cleaned up. Existing LAN HTTPS
preview is retained with the checked local build; no deployment or phone request.

## Next bounded task

Use this owned generator in a prepared piano graph module with owned per-voice
playback, gain/filter envelopes, pitch, stereo allocation/stealing and release.
First define that contract against actual native piano dry-chain captures,
including rounded strike pitch/unrounded body pitch, stringGain and temperament.
Only after source/voice-chain parity should All expose it beside core/FM/basic
kits and run full six-source batches. Matched-acoustic/calibrated/Iowa/classic models
remain named separate adapters. Continue larger locally checked steps; no new
phone request, automatic backend replacement, deployment or AC workaround.
