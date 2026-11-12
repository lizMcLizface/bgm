# Original Distortion literal-cell candidate

This NEW numerical profile preserves the original 44,100-point curve and NONE interpolation while allowing a new finite drive in [0,30] without generating or uploading another complete curve. It leaves the accepted captured17c9 engine, prepared-resource live863c host and all application defaults unchanged. Current published candidate is `3d8d6885812e089c` (745,734 bytes); the actual six-rate Native numerical gate and complete cold replay have passed. This remains a component profile, with no live actor or normal route selected.

## Arithmetic and prepared resource

A separate feature-isolated Rust/Wasm preparation build computes, for each exact original grid coordinate `x = i * 2 / 44100 - 1`, the Float64 factor `atan(sinh(x * .25) * 5)` and `abs(x)`. The pinned immutable little-endian resource contains 88,200 doubles / 705,600 bytes. Production includes those bytes directly. It does not fill a table, invoke a transcendental function or prepare a full drive curve during rendering. The production module has no preparation exports or external math imports.

Each sample first computes the same original Float32 virtual index and clipping. It evaluates the literal lo and hi cells individually as `(3 + drive) * factor[i] / (PI + drive * absX[i])`, narrowing EACH cell to Float32. Only then does it perform the original separate Float32 subtraction, multiplication and addition. It never substitutes a continuous curve formula at the audio input. The even grid therefore retains its original negative zero-input DC, including connected ended-source behavior.

The basis source, bytes and preparation Wasm hashes are recorded. A rebuild refuses a different existing basis; the published check validates source pins, complete binary/manifest identity and copied Chromium profile/BSD notices. This is a pinned Rust/Wasm arithmetic profile, not a universal guarantee about every browser math library.

## Owned control primitive

Each instance owns its input/output planes, two original gain timelines, 32-command queue and drive state. The immutable basis is shared only by handles within the same Wasm memory. Constructor gain calls retain dry1 then wet0 and two original zero-curve assignment records. Subsequent repeated assignments remain distinct commands; configured signed-zero drive is preserved even though its sampled contents equal positive zero.

Gain commands retain separate original seconds and canonical authored frames. The direct primitive rejects future, backward, malformed or over-capacity admission; it does not implement an AudioContext clock or claim a Native immediate-GUI delivery epoch. Queue capacity and per-lane history can be preflighted before composing a complete caller patch. Rendering uses fixed128 frames and immutable mono/stereo layout. Explicit unpulled renders freeze DSP, while pulled input-empty renders still shape zero. The canonical absolute frame ceiling is `2^40 - 128`; there is no one-hour lifetime limit. Future application hosts must additionally enforce their actual Source-clock capability and physical route policy.

No new live facade, synchronous Native gain getter, raw-output borrow, automatic Native sleep/tail policy or normal Instrument selection is supplied by this numerical checkpoint. Review reset explicitly creates a fresh owned engine and replays the original captured control program.

## Private evidence

Actual Wasm full-cell comparison with accepted17c9 covers 1,262 dense, edge and deterministic random drives, including signed zero and neighboring floating values: 55,654,200 cells, zero differing Float32 words. A separate verbatim original JavaScript createDistCurve function, extracted and source-hashed then executed by actual Node V8 Math, also matched55,654,200 cells across another1,262 drives. This is independent of the accepted Rust reference and is labelled Node arithmetic evidence, not browser audio. Twelve rate/layout PCM cases across8–192kHz also match every wet/output word with clipping, zero-input, repeated controls and explicit unpulled quanta. Separate contract checks cover signed-zero state, assignment counts, constructor order, full queue refusal before target mutation, late origin, frame ceiling and connected-zero DC.

An audited Wasm run covers12 rate/layouts,24,576 quanta and direct drive/gain changes on every callback: zero Rust allocation, reallocation, free or memory growth after preparation. Linear memory is1,835,008 bytes per independent renderer. This excludes constructor, JS/Native heap and device deadline claims.

Five sequential local Node measurements at48kHz compare identical static DSP settings. Literal cells take about1.90–2.54 microseconds/128-frame mono block and3.97–4.28 stereo, versus about0.84–1.03 and1.59–1.68 for the accepted constant prepared table. This removes drive preparation latency at the cost of more rendering arithmetic; it is not a realtime device/headroom guarantee. A three-resource captured renderer uses1,769,472 bytes; the accepted eight-resource live renderer uses2,686,976 bytes.

Six focused checks in three files use public fixtures and verify full accepted cells/PCM, raw control refusal, source/basis/notice identity, exact original author seconds and complete cold authority. The separate full private and allocation reports are under `reports/modular_audio/instrument-distortion-cells-*`.

## Review

The grouped Native page `/tools/instrument-distortion-cells.html?rate=48000` runs six literal original scenes in both layouts, captures the real original input and Native output, checks requested complete curve contents and compares two independent cell kernels. Fixed declared error bounds remain1e-4 absolute/relative RMS, with no alignment or tolerance adjustment. Full curves are materialized only by the review for comparison; the audio kernel retains no per-drive full resource.

The separate192kHz cold page `/tools/instrument-distortion-cells-cold.html?rate=192000` saves all twelve scenes, complete called controls, preparation/basis/component identities and all four Native/ownedA/ownedB/input PCM hashes, then replays after a full HTML reload. The actual3d8d desktop gate passed72 cases /144 Native audio comparisons at8,24,44.1,48,96 and192kHz. All requested168 complete Native curves /7,408,800 cells, both owned output streams, real captured input, independent instances and fresh-owner reset matched Float32 words exactly; maximum absolute error and relative RMS were both zero. Original called gain clocks remained exactly canonical and unchanged. Every Native construction journal retired and every Rust owner was freed without errors. The source-ended/retrigger gap retained the same nonzero original shaper DC.

A true full-HTML192kHz save/reload/replay passed all twelve scenes, with complete settings, literal controls, all four PCM hashes and immutable basis/preparation/component authority identical. Independent audit is recorded in `instrument-distortion-cells-3d8d-independent-summary.json`. These are numerical original-Native/captured-input comparisons; no Source7a live worklet readiness, graph transition or application adoption is inferred from them.
