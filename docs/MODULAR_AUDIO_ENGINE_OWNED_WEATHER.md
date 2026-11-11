# Owned streaming weather source

This standalone slice ports the actual `RainModel`, `ThunderEvents`,
`SurfEvents`, `WeatherModel` and `WeatherBedModel` numeric source to portable
Rust. It retains the original identities, material tables, seeded noise draws,
fixed voice budgets, filters, generated diffuse tail and twelve-layer reduction.
It is not a replacement rain algorithm or a migration of Ambience's host chain.

The source emits **three separate stereo stems: rain, thunder and waves**.
Their existing independent native level, pan, width, distance, shelter filters,
wander and routing remain outside this crate. In particular, adding the stems
together before those three chains would change the original sound. The native
player, All workbench, Graph descriptors and default backend are unchanged.
Wind/fire/vinyl's seamless prepared loops and measured cello's convolver are
different sources and are not included.

## Original boundary and numeric fidelity

`WeatherBedRoute` creates the original three-output `main-weather-bed` worklet;
each output connects to its corresponding `Ambience.chain(id).input`. Its
`WeatherBedModel` combines six rain, three thunder and three surf layers with
the original twelve gains and40ms gain smoothing. Levels inside that source
enable generation; the independent outer scalar level remains a native host
operation. WeatherBed's shelter attenuation is retained separately from the
outer shelter low-passes.

The Rust port uses f64 for the original JS number states and coefficients.
It rounds at every original Float32Array write, including each foreground
rain `+=`, post-sum rain damping, each diffuse-delay write, all twelve raw
stereo layers and the final three stereo reductions. Combining those
foreground additions in f64 until the end would be a different algorithm.

Every RNG belongs to its model instance. Original xorshift32 streams, stream
seed XORs, cloud hazard draws, channel-specific seeds, initial constructor draws,
32/64-sample control countdowns and persistent sample state are preserved.
Automatic event enable/disable transitions draw exactly as the original
`setEnvironment` calls do. Manual events retain original skip behavior when
the4 thunder or8 surf voices are full; rain retains96 foreground voices.
Surf resets existing Pink states rather than allocating three new JS objects.
No unseeded `Math.random` branch is replaced with invented deterministic data:
these particular source kernels use explicit seeds, and the new capture builder
rejects non-uint32 seeds. Seed0 remains distinct for derived streams even though
the original base xorshift treats its own zero state as1.

## Configuration, events and lifecycle

`src/modular-audio/ownedWeatherBed.js` exports:

- `weatherBedState(shape, levels)`: captures the actual native shape defaults,
  `weatherEnvironment` mapping and twelve gain targets without mutating inputs.
- `weatherBedSpec(rate, shape, levels, seed, events)`: version1 complete numeric
  configuration. Rates8000–192000Hz, uint32 seed including0, thirteen normalized
  environment fields, the actual surface identity, twelve gain targets and a
  maximum4000-event initial plan are validated.
- `weatherStateEvents(frame, state, owner)`: one same-frame26-parameter state
  update in stable arrival order; all events apply before that source sample.
- `validateWeatherBedSpec`, `saveWeatherBedSpec`, `loadWeatherBedSpec`.
- `OwnedWeatherBed(engine, spec)` with `render(0..2048)`, `enqueue(event)`,
  `setState(frame, shape, levels, owner)`, `cancel(owner)`, `reset()`, `refresh()`,
  `stats()`, `frame` and idempotent `dispose()`.
- `loadOwnedWeatherBed()`: caches verified compiled code and creates fresh
  Wasm memory per call. No production page currently calls it.

The configuration is detached from its caller. Save/reload replays that complete
seeded configuration and initial event plan from frame0; it is not a live filter,
delay or RNG snapshot. Runtime commands are separate from the saved initial plan.
Reset clears runtime commands, restores original config/RNG/filter/delay/gain
state and rebooks the initial plan without allocating or reclaiming Rust memory.

Events have `{frame, owner, kind, id?, value?}`. Frames are nonnegative safe
integers, owners nonzero uint32. `kind` is `parameter`, `thunder` or `surf`;
trigger payloads must be absent or zero. Parameter IDs0–12 follow exported
`WEATHER_ENV_KEYS`;13 is the index in `WEATHER_SURFACES` (`mixed`, `leaves`,
`concrete`, `glass`, `tin`, `puddle`);14–25 are the twelve bed gain targets.
The original `indoorFilter` field is captured but unused by RainModel DSP;
native shelter/distance filtering must not be silently inserted here.

Late events are rejected before changing DSP state, with a late counter.
The fixed4000-event pending capacity rejects overflow and reuses consumed
capacity. Same-frame arrival order is stable. A state update preflights its
entire26-event batch. `cancel(owner)` removes only that owner's future commands;
it does not erase an already triggered weather event or another owner's commands.
The original continuous model has no per-owner active-voice semantics, so this
API does not pretend to provide note-style owner termination.

Rust `Engine::new/initial/prepare/enqueue/render/output/cancel/reset/stat` is
available as an rlib. C ABI prefix is `weather_owned_*`, API1. The ABI enqueue
kind codes are0 parameter,1 thunder and2 manual surf. `output(channel)` exposes
fixed2048-frame f32 storage; only the rendered prefix is valid:

| Channels | Original source |
| --- | --- |
|0–11|Rain rumble, body, mist, sheet, hiss and drops, each L/R|
|12–17|Thunder crack, roll and generated diffuse echo, each L/R|
|18–23|Surf surge, break and wash, each L/R|
|24–25|Independent rain bed L/R|
|26–27|Independent thunder bed L/R|
|28–29|Independent waves bed L/R|

The adapter's `layers[12][2]` and `stems[3][2]` views are created during prepare
or explicit refresh, never per render. Refresh is required outside rendering
if a second handle in the same memory caused growth while being prepared.
Queue insertion/compaction happens during enqueue/cancel; render advances its
head without repeatedly shifting all pending events.

## Verification and provenance

Build commands use the local Rust tools and offline dependencies:

```
node tools/buildOwnedWeatherBed.mjs
node tools/buildOwnedWeatherBed.mjs --audit
npm.cmd exec -- vite-node tools/auditOwnedWeatherBed.mjs
npm.cmd exec -- vite-node tools/auditOwnedWeatherBed.mjs --allocation
npm.cmd test -- --run src/modular-audio/ownedWeatherBed.test.js src/ambient/rainModel.test.js src/ambient/weatherModel.test.js src/app/engine/weatherBedModel.test.js
node tools/buildOwnedWeatherBed.mjs --check
```

`--publish` explicitly writes this crate's assets to `public/weather`; the
standalone development batch itself does not switch any page/backend. Audit
allocator builds cannot be published. Provenance hashes every crate source,
Cargo manifest/lock, adapter, all five actual JS reference files and Wasm bytes.

Final local production build is `b645e01e918b9cdc`,67067bytes. Audit build is
`0645e920d8521581`,68668bytes. The fixed reference matrix compares all30 output
channels against the actual independent JS models, including original
WeatherBed reduction. It covers six rates8000/24000/44100/48000/96000/192000,
all six surfaces, seeds0/731/0xffffffff,8s per rate/surface, manual events at
nonaligned and aligned samples, same-frame order, event voice exhaustion,
environment/gain changes, enable/disable and re-enable, plus a48s long run.
This is37 cases and20,164,800 source frames. The predeclared fixed limits are
maximum absolute sample error1e-7 and relative RMS1e-7; they were not widened.

The expanded matrix passes:31/37 cases bit exact, worst sample error
1.862645149230957e-9 and worst relative RMS7.890889883273957e-12. The residual
differences are isolated f32 least-bit differences; event counts, active/skipped
voices, rates and deterministic replay remain aligned. Two saved independent
handles agree exactly.37 allocator cases cover render, initial-plan replay,
reset and cancellation with zero allocation/reclamation and no Wasm growth.
Observed total Wasm memory for two handles ranges2,031,616–3,604,480bytes across
the matrix, including stack/runtime/prepared resources, rather than claiming
that number is the per-instance heap size.

Fifteen new permanent tests and the33 original rain/weather/bed tests pass
(48 checks across4 files), including strict raw ABI/lifecycle bounds, reclaiming
pending event capacity, disposed instances, sample partitions, independent
handles, saved reload and reset. Reports are
`reports/modular_audio/weather-owned-compatibility.json` and
`weather-owned-allocation.json`. Their build hashes identify the exact run.
The15 focused checks also pass using the audited Wasm. A separate severe-gust
case uses actual seed863 and reaches the original96-rain-voice limit:350
successful drops,258 skipped arrivals and84 voices still active at frame4000,
matching the original JS exactly with zero allocator/reclamation calls or growth.

These are numeric source/reference and resource checks. The audit elapsed times
also include JS reference rendering/comparison and are not callback performance.
There is no new browser/device listening or lock-screen deadline acceptance.
The inherited stochastic hazard loops and a dense same-frame4000-command batch
are bounded in storage, not a claimed universal quantum execution deadline.

Next: an opt-in three-output AudioWorklet/worker source harness preserving these
separate native ambience-input seams, measured desktop output/timing and captured
host start/state-message clocks. Graph adoption needs an explicit three-stem
contract; the existing single-output source bus must not silently fold them.
Offline32s WeatherSegmentRenderer history/export adoption is a separate host
task. No live/default route should change before those boundaries are tested.
