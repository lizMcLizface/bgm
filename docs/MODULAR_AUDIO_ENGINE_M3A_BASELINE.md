# M3a: actual six-role serial baseline

Measured 2026-11-09. M3a is delivered; M3's owned pitched adapters and optional
worker executor remain unfinished. Existing desk routes, defaults and legacy DSP
remain authoritative. This page supplements the [plan](MODULAR_AUDIO_ENGINE_PLAN.md)
and [handoff](MODULAR_AUDIO_ENGINE_HANDOFF.md).
Subsequent [M3b owned FM extraction](MODULAR_AUDIO_ENGINE_M3B_OWNED_FM.md) supplies
second/bass; the measurements below remain the original M3a baseline.

## Reproducible workload

The pinned [fixture](../public/modular-audio/six-role-fixture.json) is
`six-role-reference-v1`, version 1, SHA256
`77ce180861239426c0c63037235cf98d74a2bbfa09a2a46ee3da3353bb29a7df`.
Its generator is `src/modular-audio/sixRoleFixture.js`. It has 100 BPM, PPQ 96,
four bars/9.6 seconds of score, 250 ms preroll and a total 17.5-second render
window including release and effect tails. Score RNG is xorshift seed
`0x53a6c91d`; each independent legacy Wasm instance uses its existing deterministic
initialization seed. There is no invented public synth seed override.

| Role | Actual scalar source / patch | Capacity | Trim / pan | Active local inserts |
| --- | --- | ---: | --- | --- |
| Lead | DI-Poly/core / Sync sweep | 8, unison 2 | .38 / -.14 | Saturation, mid EQ |
| Second | FM / Tine constellation, quality 1 | 8 | .40 / +.24 | High EQ |
| Rhythm | DI-Poly/core / Resonant sequence | 8 | .34 / +.10 | Phaser |
| Pad | DI-Poly/core / Living silk, internal chorus off | 12, unison 2 | .40 / -.20 | Chorus |
| Bass | FM / Four-op round bass, quality 1 | 3 | .45 / center | None |
| Drums | Real percussion / 808-inspired model 1 | 64 fixed voices | .19 / center | None |

The fixture contains note gates, varied drum velocity/tone variation, FM pressure,
pad sustain, a 60 ms lead patch transition at beat 8 and a dense lead chord in
bar 3. The original transition helper remains authoritative. Its generated
`src/modular-audio/legacyPatchTransition.js` copy is checked by `graph:check`;
Vite source cannot directly import the public-directory JS asset.

The actual existing six-strip `createMixerAudio` route uses the fixture's
channel filters/pan/faders, shared Wasm delay/reverb (decay 1.4 s, reverb .12,
delay .08, 300 ms delay, feedback .23) and the existing final desk sample-peak
limiter. No optional bank/SIMD path or sampled stand-in is used. Three variants:

- **Current:** existing core/FM/percussion worklets and existing desk processing.
- **Bridge:** same route, replacing only percussion with its owned graph adapter.
- **Keyed:** bridge plus owned stereo compressor before shared master effects,
  keyed by actual kick voices from that same percussion engine. The detector
  edge is explicitly connected; silence does not change its connection state.

## Measurement scopes

[Kernel report](../reports/modular_audio/six-role-kernel-baseline.json): Windows
10.0.26200 x64, Ryzen 9 3950X / 32 logical CPUs, Node v24.18.0. One full-score
warmup and three measured repeats per rate, 128-frame blocks. Per-role time
includes Wasm plus its JS driver, transition and copying, and active local
inserts. Source-sum timings exclude native Web Audio mixer/filters, shared master
effects, limiter and scheduling. These are elapsed offline observations, not
callback deadlines or pure DSP CPU attribution. Clock-pair p50/p99 overhead was
.0003/.0005 ms, reported rather than subtracted.

[Browser report](../reports/modular_audio/six-role-browser-baseline.json): actual
Chrome 157 AudioWorklets in `OfflineAudioContext` at 44.1/48/96 kHz, current /
bridge / keyed, one warmup plus three measured repeats each: **27 measured runs,
9 warmups**. Each variant equally captures 16 channels: stereo output, six raw
post-local-insert stereo stems and actual kick stereo where exposed. Render
wall time includes the full audio route and observational worklet stats; host
preparation is separately recorded. Some original worklet constructor work is
not separately observable and may enter render time. Three repeats cannot
establish robust p95/p99 tails. Desktop background load was not controlled.

## Actual output and timing results

Every first measured browser case matched all six direct legacy source/local
insert stems **exactly**, max sample difference 0; repeats retained the same
stem hashes. Nonfinite samples: 0. The current-route and owned-drum bridge stems
were exact at all three rates. Full browser mixes are **not bit identical**:
native mixer/master floating-point differences were observed, so the verifier
records differences and enforces absolute `1e-6` (-120 dBFS) tolerance only for
the complete mix. Current-versus-bridge maximum difference was
`4.470348358154297e-8` at every rate; RMS differences were
`2.500505381262134e-9`, `2.3932609319365595e-9`,
`2.4359969492894383e-9`. Largest full-route repeat difference:
`5.960464477539063e-8`. Do not weaken the exact source comparison or regenerate
legacy goldens to hide an adapter mismatch.

Full 17.5-second browser route elapsed render time, milliseconds:

| Rate | Current median / max | Bridge median / max | Keyed median / max |
| --- | ---: | ---: | ---: |
| 44.1 kHz | 3802.1 / 3933.4 | 3880.4 / 4091.3 | 4184.4 / 4216.7 |
| 48 kHz | 4101.8 / 4108.2 | 4182.9 / 4231.5 | 4407.6 / 4440.9 |
| 96 kHz | 8136.4 / 8191.7 | 8313.4 / 8335.0 | 8723.2 / 8890.2 |

Host preparation medians (current / bridge / keyed): 44.1 kHz
20.9 / 74.5 / 78.5 ms; 48 kHz 21.5 / 72.4 / 75.3 ms; 96 kHz
22.9 / 77.2 / 77.2 ms. No worker speedup follows from these serial results.

Peak output (current / keyed): 44.1 kHz .21660331 / .15604334;
48 kHz .22217833 / .16148254; 96 kHz .21912523 / .15256248.
Last half-second output RMS was **0 / 0** in all runs. Second/FM intentionally
has **14 deterministic voice steals** from release overlap at its fixed cap 8;
the other roles have 0. Reported late/dropped events are 0. Current percussion
does not emit an offline-final-stats message: `missingSourceStats:["drums"]`
is retained rather than fabricated counters. Its direct-kernel and exact PCM
comparisons cover source correctness. Bridge/keyed provide percussion stats.

Direct serial source-sum elapsed time per 128-frame block:

| Rate | p50 range across 3 runs, ms | p99 range, ms | Largest block, ms | Offline blocks exceeding audio duration, each run |
| --- | ---: | ---: | ---: | --- |
| 44.1 kHz | .6158–.6216 | .9966–1.1324 | 1.5445 | 0 / 0 / 0 |
| 48 kHz | .6194–.6207 | .9725–1.0960 | 1.4702 | 0 / 0 / 0 |
| 96 kHz | .6163–.6378 | .9741–1.0367 | 1.5127 | 6 / 1 / 3 |

The 96 kHz budget for 128 frames is 1.3333 ms. Those offline crossings are not
device underruns and exclude the rest of the audio route. They motivate later
deadline measurement; they do not prove live headroom at any rate.

48 kHz, first measured direct run:

| Role | Block p50 / p99, ms | Source + active local insert memory, bytes | Intrinsic source latency, frames |
| --- | ---: | ---: | ---: |
| Lead | .0688 / .1983 | 3,407,872 | 0 |
| Second | .2928 / .4660 | 2,490,368 | 7.5 |
| Rhythm | .0347 / .0588 | 3,407,872 | 0 |
| Pad | .1147 / .2635 | 3,407,872 | 0 |
| Bass | .0612 / .1059 | 1,245,184 | 7.5 |
| Drums | .0240 / .0400 | 2,621,440 | 0 |

FM quality 1 reports fractional **7.5-frame** latency. Preserve that current
sound/contract when extracting it. No new automatic compensation was added.
The existing final limiter adds `round(sampleRate * .003)` frames: 144 at 48 kHz.
Zero-lookahead graph compressor adds 0. These are declared processing latencies,
not physical output latency. Memory figures exclude browser nodes, compiled
modules and JS storage; browser source-only memory is separately in its report.

## Production and live verification

Final public preview at `http://127.0.0.1:4176/tools/modular-ensemble.html`
loaded the pinned fixture, saved locally, reloaded the page and restored it
**stopped**. Storage key is `bgm.modular-ensemble.fixture.v1`; a changed fixture
is refused as a mislabeled v1 baseline. This is a separate tool fixture store,
not a new All setup format. Selected 48 kHz keyed production run, after warmup:
pass, six exact stems, 4397.5 ms render, peak .1614825278520584, tail RMS 0/0,
57 drum events, no reported late/drop/overflow, all source stats present.

[Raw live production evidence](../reports/modular_audio/six-role-live-production.json):
48 kHz keyed, 178 analyser polls, observed master peak **.1265905350446701**.
Role peaks: lead .10455585, second .06792583, rhythm .06553276, pad .20691101,
bass .04220437, drums .11481459. All six parts produced real output. Reported
base/output latency **10/40 ms**; no late/drop/overflow in source stats, 57
applied drum events. The finite score/tail ended and closed its AudioContext.
This is sampled output-path evidence, not direct listening or physical loopback.
The production page is left stopped; the original reference harness links to it.
The user's earlier phone/Bluetooth onset/end report remains deferred and its
cause unverified. These new desktop measurements do not resolve it.

After fixing the missing navigation in the served 4175 harness, the user
confirmed that the six-role page works fine with the page open, with crackling
when the phone is locked (their wording: "locked up"). This is foreground
listening evidence, with exact device/browser, variant/rate and output transport
unspecified. Screen-lock behavior remains deferred; cause and avoidability are
unverified. It does not establish a core DSP underrun.

## Implementation and validation

`host.audio` version 1 is a stereo host input in the Rust contracts. A prepared
node buffer is filled through `graph_input_ptr`; `graph_kick_ptr` exposes the
owned percussion's existing kick buffer, without synthesizing a second kick.
Canonical JS runtime refreshes preallocated input/kick views. Host input is
one-use: nonfinite values become 0, consumed buffers clear, and reset/pause
clear stale input. The opt-in `ensemble-bridge-processor.js` supports stereo
program/key inputs and actual final partial quanta. Connection state remains
the validated patch edge, never inferred from empty buffers.

Graph is **120,773 bytes**, version **`394279c8033e0aaa`**, built with
rustc 1.99.1 (58cf8f9c3 2026-10-13). No legacy DSP algorithms changed for M3a.

- Full suite: **371 files / 2,684 tests passed**, 108.68 s;
  `.tmp/modular-audio-m3a-suite.log`. Focused reference/sidechain/six-role: **30**.
- Public build passed, 32.07 s, all 16 public banks and exclusions checked;
  `.tmp/modular-audio-m3a-build.log`. Existing large-chunk advisory remains.
- Native `cargo check --offline --tests` passed with local Rust;
  `.tmp/modular-audio-m3a-native-check.log`. Native test execution remains
  blocked by Application Control error 4551; it was not bypassed or claimed run.
- **Nine Wasm allocation audits**: M1/M2/external-host-input × three rates,
  0 Rust allocation/reclamation and no growth after preparation. External host
  graph memory 1,245,184 bytes. Independent three-rate compressor equation
  audits passed; `.tmp/modular-audio-m3a-alloc-compressor.log` and
  `.tmp/modular-audio-allocation-wasm.json`. Browser/JS allocation is outside
  that instrumentation scope.
- New tests cover pinned fixture/save roundtrip, three-rate frame/gate timing,
  actual six-role output, exact legacy drum/main and real kick, one-use host
  input/nonfinite/pause behavior, final partial worklet quantum and disposal.

Reproduce using `npm.cmd run ensemble:check`, `npm.cmd run graph:check`,
`npm.cmd run ensemble:baseline -- --repeats=3`, and the harness's **Measure all
rates/variants** with three repeats. `ensemble:fixture` regenerates the pinned
asset; inspect deliberate changes and update provenance with `graph:build`.
Do not overwrite measured reports merely to make a failing comparison green.

## Limits and next task

All routes still execute serially on one rendering thread. No worker pool,
shared-memory protocol, actual audio-device underrun counter, callback duration
distribution, sustained UI-load deadline test, CPU attribution or production
isolation measurement exists. Dev and preview are non-isolated. Existing
workbench defaults, cables, general topology editing and migration are outside
this slice. All work is local and uncommitted; no push or deployment occurred.

**Next: M3b, extract owned FM state first.** It is the largest measured source
cost and supplies two fixture roles. Preserve its legacy ABI and algorithms,
quality 1/fractional latency, event/voice/pressure/sustain/transition behavior;
compare independent owned instances against retained legacy PCM at all three
rates, including the actual second/bass workload. Extend graph preparation and
allocation audits without introducing render allocation or helper statics.
Then extract owned subtractive/core for lead/rhythm/pad, retaining compatible
local-insert batching. Only after six owned branches match the pinned fixture
should M3's optional bounded worker executor be attempted, with explicit added
latency, stall/deadline evidence, capability/hosting checks and serial fallback.
