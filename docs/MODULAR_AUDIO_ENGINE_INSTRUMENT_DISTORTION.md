# Original Instrument Distortion

This numerical component ports `src/nodes/distortion.js`, including its complete dry/wet mix. It does not substitute desk saturation or the synth-lab effect. The existing Native class, application routes and defaults remain unchanged.

## Literal numerical contract

The Rust preparer evaluates the original 44,100-cell function with binary64 `sinh`, `atan`, `abs` and the original expression order, then narrows each resource cell to Float32. The denominator for the sample grid is **44,100**, not 44,099. Its even grid is asymmetric under the Native WaveShaper mapping: zero input maps between cells 22,049 and 22,050 and produces a small negative value. This is preserved. The pinned Chromium handler consequently treats the original curve as having infinite tail time. An ended source, connected zero-valued source and explicitly unpulled private route are separate states; this profile does not guess Native automatic retirement.

The None shaper follows the pinned separate Float32 vector operations: add one, multiply by `(N - 1) / 2`, clamp to the resource bounds, subtract adjacent cells, multiply the fraction and add the base. Input outside [-1,1] selects an endpoint. No oversampling, FIR, output shift, clipping of the mixed output or PCM normalization is introduced.

Two independent gain timelines retain the actual original dry-then-wet `AC.currentTime` reads and step ordering. Amount uses `dry = 1 - amount`, `wet = amount`; it is not the balanced gain law of BitCrusher. Repeated calls remain separate commands. The original constructor assigns a zero-drive resource twice; both resources are present, with the second selected. Both gains begin at Native intrinsic one, followed by the original constructor amount-zero steps.

## Prepared boundary

`OwnedInstrumentDistortion` accepts immutable rate/layout, at most eight 44,100-cell resources including the two original constructor resources, and 256 ordered captured commands. Resource generation occurs before `prepare()`. Each lane command is inserted/pruned at its captured author frame when the render cursor reaches it, so prebooking does not prematurely apply Native insertion pruning. The original seconds remain authoritative; this initial captured profile admits exact canonical 128-frame epochs from source frame zero and at most one hour. It refuses edits after preparation and malformed/out-of-order/control-capacity requests before mutation.

Rendering is canonical 128 frames with one or two fixed logical channels. Caller-declared absent input is shaped as zero when pulled; caller-declared unpulled freezes gain evaluation and publishes zero. The latter is explicit authority, not a waveform-silence heuristic. Reset retains the complete immutable resource/control program and replays its constructor state. Finite input or gain/output overflow is refused rather than clipped or published as infinity.

There is no live worklet, asynchronous curve-install epoch, arbitrary future automation/cancellation, Native synchronous gain getter, automatic source-tail retirement, shared Graph or normal Instrument adoption claim. A later private live facade needs explicit READY resource admission and parent preset preparation; it cannot silently delay the original immediate drive setter. Stored drive is a safe getter. Stored amount is not a substitute for Native `AudioParam.value`.

## Evidence

The first independent Node comparison extracted the literal curve function from the unchanged application source. Sixty-five boundary/random drives covered 2,866,500 cells with **zero differing Float32 words**. The separate permanent corpus also compares complete resource words. This sampled evidence is not a universal platform `sinh`/`atan` equivalence proof.

Seventeen focused checks in four files pass: resource law and independent copies, source-defined None operation order, six sample rates, stereo independence, zero-input DC, independent lane clocks, repeated steps/reset, bounded admission, malformed input/epoch/layout refusal, finite-output refusal, original two-clock call trace, cold authority mutation checks and provenance.

The actual audit Wasm processed twelve rate/layout cases and 12,288 quanta while consuming 240 prepared commands and resetting/replaying the program. Rust allocation/reallocation/free counters were all zero after preparation and Wasm memory stayed unchanged. Each audited prepared instance occupied 2,752,512 bytes of linear memory. This excludes JavaScript/browser allocation and gives no device deadline guarantee.

Actual desktop Chrome comparison passed all **72 cases / 144 Native comparisons**, twelve cases at each of 8, 24, 44.1, 48, 96 and 192 kHz. Every complete Native output, both independent Rust outputs, input capture and reset replay was **Float32-word exact**, with maximum absolute error and relative RMS both zero. The browser-created original curves also matched all **7,408,800 compared resource cells** word for word. All Native journals retired every owner and all Rust handles were freed.

The zero-input curve-zero output is exactly `-0.000027067168048233725`. Both ended/retrigger cases retain the drive-15 constant `-0.0001623678399482742` throughout the measured gap. Actual captured bus layouts remained one/two channels during these ended-source witnesses; this proves the connected ended/zero-input response, not an automatic absent-input scheduling policy. The declared explicit-unpulled unit contract remains separate.

A true full-HTML reload at 192 kHz passed all twelve cold cases. Full drive/control recipes, original raw called seconds, component identities, Native/both independent Rust/input hashes and cleanup matched. No output alignment, tolerance change or PCM normalization was used. Full receipts are `reports/modular_audio/instrument-distortion-17c9-{rate}-result.json` and the 192 kHz cold save/replay pair; the independently checked aggregate is `instrument-distortion-independent-final-summary.json`.

The frozen grouped page compares the unchanged original Native class with two independent Rust instances, captures real input, requires unchanged browser-prepared curve words, exact independent/reset/input streams, healthy Native ownership retirement and freed Rust owners. Declared bounds before browser execution are maximum absolute error **1e-4** and relative RMS **1e-4**. Six scenes times mono/stereo give twelve cases per fresh document at each of 8, 24, 44.1, 48, 96 and 192 kHz. The cold page saves the full curve/control recipe, component identities and all four streams' hashes for a true full-HTML reload replay.

Current frozen kernel: `17c9f3dbeaa6c678`, 39,118 bytes, Wasm SHA256 `48e2603807c3feb6c92d8e6d3ba0c773d250c43aa3fec58a683027f1a4c8a42a`. Original bundled reference: `49da896bffbcc155`.

## Reproduction

- `node tools/buildInstrumentDistortion.mjs --publish --check`
- `node tools/buildInstrumentDistortionReference.mjs --check`
- `npm.cmd exec -- vitest run src/modular-audio/instrumentDistortion.test.js src/modular-audio/instrumentDistortionProvenance.test.js tools/instrumentDistortionReview.test.js tools/instrumentDistortionColdReview.test.js`
- `node tools/buildInstrumentDistortion.mjs --audit`, then `node tools/auditInstrumentDistortion.mjs`
- Desktop page `/tools/instrument-distortion.html?rate=48000`; cold replay `/tools/instrument-distortion-cold.html?rate=192000`.

Chromium revision/source hashes and BSD notices ship beside the independent Wasm. Text provenance is normalized LF; the builder checks the pinned original WaveShaper source and reused timeline without modifying either accepted implementation.
