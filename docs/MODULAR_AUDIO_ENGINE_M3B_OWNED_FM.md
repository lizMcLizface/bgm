# M3b: owned FM extraction

Implemented 2026-11-09. This extends the [M3a baseline](MODULAR_AUDIO_ENGINE_M3A_BASELINE.md)
without changing the pinned score, default route or legacy FM algorithms.
M3 remains incomplete: subtractive/core ownership, pitched DAG nodes and the
optional worker executor remain later tasks.
Subsequent [M3c owned core extraction](MODULAR_AUDIO_ENGINE_M3C_OWNED_CORE.md)
delivers core ownership; the FM measurements below remain the M3b record.

## Ownership and compatibility boundary

`synth-engine/fm/src/engine.rs` contains the original scalar DSP as a public
owned `Engine`. Voices, envelopes, expression/RNG, note priority, event queue,
LFOs, colour processing, reconstruction/FIR, headroom, DC state, sine table,
output and optional SIMD frame counter belong to each instance. `prepared(sr)`
initializes an engine outside rendering. Public methods expose the existing
parameter/operator/routing/carrier/event/render/stat semantics. No new synthesis
algorithm, rate conversion or automatic latency compensation was introduced.

The original singleton C ABI moved to `src/abi.rs`, behind default-enabled
`legacy-abi`. Default scalar/SIMD/bank/fast builds retain it. The graph depends
on the FM rlib with defaults disabled and `cache-colour-coefficients` explicitly
enabled. The optional bank's mutable globals are also gated by `legacy-abi`;
they are not part of the owned graph build. The SIMD counter moved into each
engine; the compatibility counter still observes the compatibility engine.
The uncached profile builder explicitly requests `legacy-abi` when disabling
default features, preserving that existing reference tool.

`synth-engine/graph/src/fm_abi.rs` provides `fm_owned_*` handles using the same
crate: prepare/init/free, globals/operators/routes/carriers, timestamped event,
render/output/stat, frame assignment and panic. Handles are trusted opaque
pointers with serialized access: prepare, then render; free exactly once off
the callback. The graph Wasm exports no legacy `fm_init` singleton. It can own
multiple FM engines in one linear memory. All buffer views must be refreshed
after preparing the last owner, because preparation can grow Wasm memory.

This is an owned instrument adapter alongside the graph ABI, **not yet a
`Graph::Kind` pitched module**. The reference DAG remains sample-oriented;
FM keeps its existing block rendering and event queue to preserve PCM and cost.
Pitched-node scheduling, note ownership/cancellation across a DAG and arbitrary
live graph rewiring are not claimed. Each owned FM instance supports its
existing note IDs, scheduled events and whole-instance panic/reset.

## Host contract and audition path

`src/modular-audio/ownedFm.js` is the canonical `OwnedFmSpec` v1 host adapter.
It validates and roundtrips the patch packet, performance mode, safe-integer
sample frames, event kinds/IDs/value bounds, finite values and bounded patch
transitions. It uses the unchanged legacy `PatchTransition` interpolation and
structural gain dip, with performance changes sent through event 6. Reset
reinitializes the same Rust owner and restores its prepared spec; panic clears
voices/events and pending transitions. Existing legacy clamping remains inside
the DSP. A zero lower/diagonal route entry is accepted because legacy packets
include the complete matrix; nonzero invalid-direction routes are rejected.

The build copies/checks this adapter and the original transition helper into
`public/modular-audio`, versions the worklet import and includes FM/transitive
common Rust sources in provenance. Generated files must not be edited as the
authority. `tools/buildSynth.mjs` now hashes extracted FM engine/ABI files for
every FM feature build.

`owned-fm-processor.js` prepares **two owned engines in one Wasm instance**,
refreshes views after both are ready, renders their independent stereo outputs,
honours the exact final partial block, reports per-role stats and disposes both
through the control path. It adds no worker, shared-memory protocol or extra
buffered quantum. JavaScript allocation is outside the Rust allocator audit.

The six-role harness adds **Owned FM pair + kick key · M3b**. It substitutes
second/bass only, retaining the actual owned percussion/kick and existing
program/key compressor, local inserts, desk mixer, shared delay/reverb and final
limiter. The other three pitched roles use the existing core worklets. Current,
Bridge and Keyed remain available; fresh-page default is still Current.
The original 4175 modular harness links to this same page with an M3a/M3b label.

## Exact compatibility evidence

Original Wasm snapshots were preserved before extraction under
`.tmp/fm-before-m3b/`, including scalar/SIMD/bank/fast. Original scalar SHA256:
`e6f3a72f6977be2df3e5cc4b005c78aad2ae7269eda1be005170b1762389f57e`.
`src/modular-audio/fmLegacyPcm.json` contains exact original float hashes; the
audit checks existing goldens and refuses mismatches rather than overwriting
them. [Compatibility report](../reports/modular_audio/fm-owned-compatibility.json).

**57 original/rebuilt/owned exact PCM comparisons passed** at 44.1/48/96 kHz:
all 11 recipes, additional quality 0/2 checks, dense reordered future events/stealing, mono and
legato with glide, pressure, sustain, retuning, structural quality/patch
transition, and the full actual second/bass score. Blocks cycle through
128/37/203/1/127 frames, including final partials. The old module is driven by
the same host transition helper; its DSP is the preserved binary, not a mock.
Owned/rebuilt stats agree. Quality 1 retains **7.5-frame** intrinsic latency;
quality 2 retains **7.75 frames**. Actual second has 14 deterministic release/
capacity steals; bass has 0. Both have 0 late/dropped events at all three rates.

[Legacy export report](../reports/modular_audio/fm-legacy-exports.json): scalar
14, SIMD 15, bank 30, fast 30 exported entries, each exactly matching the
preserved corresponding binary's names/kinds. The existing full suite also
covers the experimental SIMD/bank paths; this does not claim that all optional
multi-output bank patches were separately compared against old binary PCM.

Twelve Wasm counting-allocator audits pass: the previous nine plus two owned FM
handles at three rates, including event enqueue, render, panic, reset and replay.
After preparation: **0 Rust allocation/reclamation calls, 0 memory growth**.
The paired audit's linear memory is **1,507,328 bytes** at each rate; this is
memory capacity for the Wasm instance, not total browser memory. Native
`cargo check --offline --tests` passes. Application Control still blocks native
test executable execution; no policy settings were changed or bypassed.

Full suite: **372 files / 2,690 tests passed**, 109.49 s;
`.tmp/modular-audio-m3b-suite-verified.log`. Public build passed **31.58 s** with
public-bank/exclusion checks; `.tmp/modular-audio-m3b-build.log`. Existing chunk
advisory remains. The initial three failures were stale source-inventory and
named-artifact provenance checks: included the extracted source files and
rebuilt existing SIMD/bank diagnostic artifacts, retaining the checks.

Final graph: **163,099 bytes**, version **`52ec483d8de9ec1c`**. Rebuilt scalar FM:
**265,096 bytes**, SHA256
`8c0acd6bdc14648716e959c104ffc59b16ddea3e603228caa5013263fb4cbe46`.
Durable [allocation report](../reports/modular_audio/m3b-allocation.json).

Focused tests cover original PCM goldens, shared-memory owner independence
through reset/panic/free, absence of the singleton export, contract persistence
and rejection, first event frame, partial worklet output and disposal.

Commands:

```powershell
npm.cmd run graph:audit-fm
npm.cmd run graph:audit-compressor
npm.cmd test -- src/modular-audio/fmOwned.test.js src/modular-audio/sixRole.test.js
npm.cmd run graph:check
npm.cmd run ensemble:check
npm.cmd run build:public
```

## Actual browser comparison

Final public preview, **the user's port 4175**:
`http://127.0.0.1:4175/tools/modular-ensemble.html`. The rebuilt page exposes the
M3b variant and **Compare owned FM · all rates**; no port change is required.
[Raw actual report](../reports/modular_audio/m3b-browser-fm-comparison.json):
Chrome 157, non-isolated, three rates × keyed legacy FM / owned FM × three
measured repeats = **18 measured runs**, plus six full-score warmups. The
17.5-second pinned M3a fixture/hash is unchanged. These runs were after the
full suite/build; desktop background load was otherwise uncontrolled.

All six source/local-insert stems match direct legacy Wasm **exactly** in
every first measured case; repeated stem hashes match. Keyed versus owned
stems are exact at all rates. Full mixes and repeats retain explicit absolute
`1e-6` tolerance for the native mixer/master path: actual maximum difference
**2.9802322387695312e-8** at all rates, also the largest repeat difference.
RMS keyed/owned differences at 44.1/48/96 kHz:
`1.6563661423278373e-9`, `1.9006185724362616e-9`,
`1.7041506917904896e-9`. Do not claim bit-identical complete browser mixes.

Full-route offline render elapsed milliseconds, median / max:

| Rate | Keyed legacy FM | Owned FM pair + same kick key |
| --- | ---: | ---: |
| 44.1 kHz | 4360.9 / 4406.5 | 4383.6 / 4415.5 |
| 48 kHz | 4720.4 / 4743.9 | 4773.9 / 4782.6 |
| 96 kHz | 9433.5 / 9489.8 | 9578.2 / 9621.9 |

This extraction did not demonstrate a speedup. Timing includes the complete
existing browser route, 16-channel capture and observational stats, with the
same scope as M3a; it is not callback CPU, audio-device underruns or worker
headroom. Three repeats are a small sample. M3a's older timings came from a
different run; use same-session comparisons above. First-run direct-stem
verification/hash work occurs after render timing, can occupy the UI thread,
and briefly caused a browser-control read timeout at 96 kHz; the run was left
intact and completed successfully.

All runs have finite output, last-half-second RMS 0/0, no reported late/drop/
overflow and all source stats present. Owned FM stats explicitly identify two
owners sharing **1,507,328 bytes**, retain 7.5-frame latency and second/bass
14/0 steals. Owned worklet frames stop exactly at the fixture end; legacy
source stats may include a padded final worklet quantum, while captured PCM
uses the same requested frame count. The existing final limiter adds 3 ms;
no new buffered quantum or graph latency compensation was added.

The final page saved the pinned fixture, reloaded, restored **stopped**, and
was then explicitly switched to M3b for finite live playback. Per-instance
packet save/load/reset are separately covered by the executable host tests.

[Actual reloaded live report](../reports/modular_audio/m3b-live-production.json):
48 kHz M3b route, **178** analyser polls, master peak **.1265905201435089**;
all six roles nonzero. Role peaks: lead .10455585, second .06792583, rhythm
.06606373, pad .20691101, bass .04086170, drums .08964452. Both FM owners reached
exactly **840,000 frames**, with owned/shared-memory flags, 7.5-frame latency,
14/0 steals and 0 late/drop. Drum events: 57; no reported overflow. Reported
base/output latency **10/40 ms**. The finite score/tail finished and closed its
AudioContext; the page is left M3b/48 kHz **stopped**. Screenshot:
`.tmp/modular-audio-m3b-browser.png`. This is sampled output-path evidence,
not direct listening, physical loopback or a screen-lock test.

## Next task

Extract owned subtractive/core state for lead/rhythm/pad with the same preserved
legacy ABI/PCM discipline, including helper state and optional feature paths.
Then introduce prepared block-capable pitched nodes in the reference DAG,
retaining sample-timed events, explicit note-owner cancellation, latency metadata
and contiguous insert batching. Only after six owned branches match the pinned
fixture should the optional bounded worker executor be attempted. No worker
speedup, deadline/headroom, physical loopback or screen-lock fix is claimed.
The user's clean foreground / crackling locked-phone report remains deferred.
No commit, push or deployment is part of this slice.
