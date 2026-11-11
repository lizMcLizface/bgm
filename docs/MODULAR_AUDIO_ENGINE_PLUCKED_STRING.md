# Owned generator plucked-string preparation

The actual generator's `Instrument.notePlan()` selects `stringModel:'plucked'`
material through `MonoSynth.scheduleNote()` → `stringBuffer()` → `renderString()`.
This is the Karplus–Strong source used by generated strings and Nylon Guitar,
Harp, Kalimba and Upright Pluck voices. It is distinct from the measured cello lab
(`stringModel/model.js`, rendered and realtime string players) and the12-layer
weather/ambience engine. Neither of those other families is claimed migrated.

`synth-engine/plucked-string` ports the original finite note preparation from
`pluckedString.js` and the actual four three-mode profiles in `stringBody.js`.
It retains f64 delay/noise/filter/body state, the original xorshift seed stream,
fractional allpass correction, periodic soft-contact smoothing, DC blocker, edge
fades and the original f32 write/peak/normalization order. Every prepared engine
owns its material and fixed2048-frame stereo copy buffers. There are no mutable
model globals or shared resources. Preparation and disposal allocate/free outside
render; playback and reset perform bounded copies only. Reset replays the same
immutable prepared material from sample0. Output beyond its finite end is zero.

## API and persistence

`pluckedStringSpec(rate, frequency, options)` reproduces the original raw numeric
defaults/clamps and seed coercion. `pluckedStringBufferSpec()` first rounds pitch
to0.01Hz as the existing AudioBuffer cache does. Config version1 contains
sampleRate/frequency/decay/damping/position/body/resonance/bodyType/seed/softness.
`validatePluckedStringSpec`, `savePluckedStringSpec` and `loadPluckedStringSpec`
retain this complete deterministic state. Unknown body profiles normalize to the
original guitar fallback when constructing a spec; malformed saved contracts
fail rather than silently changing a persisted sound.

`new OwnedPluckedString(engineExports, spec)` prepares a private handle. `samples`
is its mono Float32 material; `left`/`right` are duplicate stereo copy-playback
views. `render(0..2048)`, `reset()`, `frame`, `refresh()` and idempotent `dispose()`
are explicit. Preparing another handle can grow Wasm memory; refresh live views
outside playback. Render rejects stale views. Trusted-host numeric pointers stay
inside this adapter. `loadOwnedPluckedString()` caches immutable compiled code
and returns a fresh Wasm memory and preparation factory per caller.

The Rust rlib exposes `prepare(rate, frequency, Settings) -> Vec<f32>` and owned
`Engine`; its C ABI is `string_owned_*`, API1. The typed C constructor validates
all bounds before allocating. Finite source material is at most6seconds and
1,152,000 Float32 samples at192kHz, about4.61MB per note plus transient preparation
scratch and16KB fixed stereo output. No unbounded cache is introduced. Hosts need
their own explicit prepared-note memory budget before adopting this in a graph.

## Evidence

Local production build `ac303d85fde48b42` is39,831bytes. The separate allocation
audit build `8d0cb69452b21a69` is40,666bytes. Builder provenance includes the Rust
crate/lockfile, adapter and actual JS reference/profile hashes. Production and
audit outputs use separate directories; audit publication is rejected.

`plucked-string-owned-compatibility.json` records288 original-reference cases:
six sample rates8/24/44.1/48/96/192kHz, four body profiles, four registers and three
soft-contact amounts.271 cases are bit exact; the largest difference is
4.656612873077393e-10. Each case also saves/reloads an independent prepared voice,
compares its entire material, copies arbitrary113-frame blocks including its end,
and resets/replays it. `plucked-string-owned-allocation.json` records24 two-handle
cases with zero allocation/reclamation calls and no memory growth after prepare.
Eleven permanent tests cover all body profiles, same-memory owners, disposal,
clamps/defaults, seed coercion, minimum/maximum bounds, the largest6second192kHz
buffer, cache pitch quantization, stale views and ABI validation. Native executable
tests remain blocked by Windows Application Control; Wasm tests run the actual
portable code.

Commands:

```
node tools/buildOwnedPluckedString.mjs
node tools/buildOwnedPluckedString.mjs --check
node tools/buildOwnedPluckedString.mjs --audit
npm.cmd exec -- vite-node tools/auditOwnedPluckedString.mjs
npm.cmd exec -- vite-node tools/auditOwnedPluckedStringAlloc.mjs
npm.cmd test -- --run src/modular-audio/ownedPluckedString.test.js
```

`--publish` creates the independent `public/plucked-string` asset for integration;
this slice leaves the existing player/defaults and common build pipeline alone.

## Actual host boundary and next task

This validates finite source material, not the entire live plucked voice. Existing
`stringBuffer()` caches by sample rate,0.01Hz pitch and original options in the
shared24MB LRU. `MonoSynth.scheduleNote()` then uses a native AudioBufferSource,
its detune/pitch-envelope and optional shared pitch-modulation tap. It applies a
fixed2.5 source gain, the actual voice gain envelope, native filter automation,
voice/mixer/rack processing and a finite stop at the earlier of buffer duration
and gain-envelope end. Voice stealing may shift the new onset to permit its10ms
fade. The plucked source enters at `stringGain` and bypasses `modelGate`'s optional
formant-filtered source path. However, `BreathFormants.schedule()` can still add
its independent air-noise branch into the voice gain when breath is enabled.
The initial finite contract must reject active breath unless that real branch is
also captured/ported. It must neither drop that air silently nor indiscriminately
apply the oscillator formant filters to the plucked material.

The next task is a prepared plucked-note source contract feeding the existing
finite native-envelope/filter voice adapter, with actual AudioBuffer resampling,
detune/modulation,2.5 gain and stealing timing verified at the browser boundary.
Raw material should remain a separate bank type and retain its own sample rate,
resource identity and strict memory budget. Do not relabel it as a piano bank or
claim native WebAudio behavior from the standalone copy-playback audit. The
legacy oscillator/FM WebAudio source graph is a separate remaining native-family
port, and rain/thunder/surf plus wind/fire/vinyl remain the ambience stream.
