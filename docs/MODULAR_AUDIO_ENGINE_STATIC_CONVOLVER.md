# Static measured-body convolution boundary

This is a distinct convolution kernel, not a substitution of the FDN room.
The actual measured-string live source in
`src/app/engine/stringModel/realtime.js` creates a ConvolverNode with
`normalize=false`, feeds its mono voice output through a mono same-rate body
impulse, then connects the result to its master. The original body construction
and measured tables remain unchanged. This new standalone kernel, adapter and
review page change no All, Graph, measured-string or reverb default.

## Strict versioned contract

`ownedConvolverSpec(rate,ir,{inputChannels,irSampleRate,normalize})` captures six
explicit fields: version1, integer sampleRate8,000–192,000, inputChannels1or2,
matching irSampleRate, normalizefalse and one or two equal-length IR channels.
Each channel contains1–327,680 finite Float32-representable samples. Normalized
room reverb, four-channel true stereo, different IR sample rates, fractional
rates and unknown persisted fields reject. There is no implicit resampling,
normalization, gain fitting or PCM postprocessing.

The output count is `max(inputChannels,irChannels)`:

| Input | IR | Output | Routing |
| ---: | ---: | ---: | --- |
| 1 | 1 | 1 | Mono input through mono IR |
| 1 | 2 | 2 | Same mono input through each IR channel |
| 2 | 1 | 2 | Independent left/right input through the same IR |
| 2 | 2 | 2 | Left through left IR, right through right IR |

The one-channel result remains one channel; a later stereo host must perform
its explicit native-equivalent upmix. The contract does not introduce crossfeed.
The IR is immutable after preparation. Persistence includes the full Float32 IR
and these fields, allowing exact cold reconstruction; it does not capture a
running spectral-history or native-tail snapshot. Reset retains the prepared IR
and clears history, overlap, input/output buffers and frame position.

## Algorithm and execution policy

The Rust implementation has an independent preplanned f64 radix-2 FFT with
Float32 input/IR/output. A128-sample direct head provides sample0 output without
an adapter cache. Early partitions use blocks128/256/512/1,024/2,048/4,096 at
their matching IR offsets. The remaining IR uses an8,192-frame frequency-delay
line with at most39 partitions and FFT size16,384. Each completed input block
computes only output whose earliest IR offset begins at the following block,
so the partition processing adds zero latency beyond the actual IR delays.

This is **worker-only** for production execution. Large FFT and frequency-domain
accumulation work occurs at block boundaries; zero render allocation does not
establish an audio callback deadline. No serial AudioWorklet integration or
realtime fallback is supplied. Finite offline reference calls are allowed.
The standalone ABI renders0–2,048 frames per call and is independent of caller
partition sizes. Nonfinite input rejects before advancing state. There is no
hidden limiter; supported body impulses and audio input still own their levels.

Maximum prepared owned-buffer accounting is46,143,584bytes for stereo input and
stereo maximum-length IR. The allocation audit observes93,650,944bytes of total
Wasm memory with two such handles, including allocator, stack and runtime.
JavaScript saved IRs, transferable result PCM and native AudioBuffers are
separate resources. The bound is not a universal callback CPU/heap claim.

## Official reference and numerical policy

`synth-engine/convolver/CHROMIUM_PROFILE.json` records11 official source URLs,
raw byte lengths and SHA256 values at Chromium revision
`e14de735f191c3a2bdce821a5e3f146bdc987b1e`. Its retained notices are in
`CHROMIUM_NOTICES.txt`. The portable FFT/FDL is independently written under MIT;
no native FFT implementation is bundled.

The inspected primary sources establish actual
[mono/stereo routing](https://raw.githubusercontent.com/chromium/chromium/e14de735f191c3a2bdce821a5e3f146bdc987b1e/third_party/blink/renderer/platform/audio/reverb.cc),
[same-rate input restrictions](https://raw.githubusercontent.com/chromium/chromium/e14de735f191c3a2bdce821a5e3f146bdc987b1e/third_party/blink/renderer/modules/webaudio/convolver_handler.cc),
and a [direct leading stage with zero reported latency](https://raw.githubusercontent.com/chromium/chromium/e14de735f191c3a2bdce821a5e3f146bdc987b1e/third_party/blink/renderer/platform/audio/reverb_convolver.cc).
With normalization disabled, the native scale remains unity. Chromium's pinned
native processing uses Float32 FFT data and a different partition schedule;
this own f64 profile does not claim bit identity with every browser binary.

The native comparison limits were declared before the first browser probe:
maximum absolute error`1e-4` and relative RMS error`1e-4`. Identity PCM must match
exactly; impulse peak sample indices must match exactly across partition edges.
Small actual FFT noise is retained, never zeroed, shifted or normalized to make
an assertion pass.

## Verification and browser gate

Twenty-two permanent checks pass across `ownedConvolver.test.js` and
`convolverWorker.test.js`. They include independent direct mathematical
convolution at six rates, all four channel maps, dense input through all39 tail
partitions and a complete history-ring wrap, exact direct identity,30 exact
impulse peak positions through frame327,679, cold reset, arbitrary render sizes,
complete save/reconstruction, independent handles, strict host/raw bounds and
actual Node Worker output. The actual original body preparation is invoked to
validate its patch keys and the327,680-frame full-wake case.

The finite worker helper bounds each output to1,048,576frames and validates the
AbortSignal contract. It makes tight owned input/IR copies before transferring,
so a short view cannot clone a huge hidden backing buffer and the caller's
buffers are never detached. Actual Worker regressions verify those transfers
and cancellation raised during worker construction. This finite review helper
is not a streaming transport or worker-pool scheduling policy.

`convolver-owned-allocation.json` records nine audit configurations through the
full maximum IR, all channel maps, two live handles, irregular blocks, reset and
invalid-input rejection. Every watched render/reset span has zero allocation or
reclamation calls and no Wasm memory growth. Build provenance distinguishes the
normal production kernel from its audit-only allocator build.

`tools/convolver-owned.html` has a fixed13-case silent comparison: six rates of
actual original measured-body impulses, the maximum-length measured wake,
four native routing combinations, direct identity and maximum-length impulse
boundaries. Native PCM comes from actual OfflineAudioContext/ConvolverNode;
portable PCM comes from a dedicated bundled Worker. Its48k case also checks
reset, arbitrary partitions, independent handles and saved cold reconstruction.
The separate listening button plays finite Worker-rendered PCM through a native
AudioBufferSource at monitor gain0.1. It is not live convolution in a callback,
physical output loopback or listening judgement.

Actual built-in browser acceptance passed all13 cases on 2026-11-11, recorded
in `reports/modular_audio/convolver-native-browser-first.json` and its matching
screenshot. Maximum absolute PCM error was`2.0489096641540527e-8`; maximum
relative RMS error was`2.571818305410126e-7`. Both predeclared`1e-4` limits remain
unchanged. All four native routing combinations, the maximum327,680-frame
measured wake, exact identity PCM, all30 impulse sample positions and the
48kHz lifecycle checks passed.

The accepted normal kernel is version`6a061d44e3e50573`,39,278bytes, Wasm SHA256
`3c420c9526d6f7bbd8a995fb34afec3840dec7ae78c76aca8a0296896e6838ec`.
The report records hostVersion`3cd27dd6fc7b2721`; the manifest carries its complete
host source SHA256 map separately from the numeric kernel identity. No
Graph/default adoption should be inferred from this isolated kernel proof.

## Worker timing evidence

`tools/auditConvolverThroughput.mjs` runs the actual public kernel in one Node
worker, with maximum-length dense IRs, all channel maps and128/512/2,048-frame
calls at48/96/192kHz. It fills the entire spectral-history ring before measuring
two seconds of source time per case. Twenty-one cases passed finite-output,
frame-accounting and no-growth checks; the report is
`reports/modular_audio/convolver-worker-throughput.json`.

Selected maximum-IR stereo input/stereo IR measurements are:

| Rate | Call frames | Offline elapsed/audio duration | Maximum copy+render call | Calls over nominal call period |
| ---: | ---: | ---: | ---: | ---: |
| 48 kHz | 128 | 0.0692 | 5.1114 ms | 11 |
| 96 kHz | 128 | 0.1419 | 7.8312 ms | 27 |
| 192 kHz | 128 | 0.2776 | 7.6960 ms | 97 |
| 48 kHz | 512 | 0.0671 | 5.1305 ms | 0 |
| 96 kHz | 512 | 0.1410 | 6.0228 ms | 2 |
| 192 kHz | 512 | 0.3265 | 8.2117 ms | 46 |

The average offline work fits inside its source duration on this desktop, while
individual transform-boundary calls exceed the corresponding128/512-frame
period. This supports retaining the worker-only policy. The largest observed
call across the matrix was10.8184ms. The report separates copy+render,
render-only, tail-boundary and ordinary-call distributions and records CPU,
Node version and benchmark-source hashes. Wall times include preemption;
offline elapsed also includes monitoring overhead. They do not establish an
AudioWorklet deadline, transport-buffer size, full-song CPU budget, phone or
background behavior, physical output or device-underrun acceptance.
