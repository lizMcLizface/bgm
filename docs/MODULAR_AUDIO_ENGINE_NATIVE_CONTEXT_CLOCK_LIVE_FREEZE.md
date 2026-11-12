# Native context clock: separate live freeze candidate

This is strict research-only code: later Native stop-drain evidence refuted a general transparent freeze policy. The candidate is separate from accepted source `7a0838a735108706`. It does not change that source, the default clock policy, existing Rust kernels, or application player lifecycle. Its assets are under `public/native-context-clock-live-freeze/`.

The candidate asks whether an explicitly suspended live AudioContext can retain its source generation without a timeline shift. Passing self-consistency between two paused sources would be insufficient. The review therefore also books an independent original Native ConstantSource AudioParam absolute frame curve while context time is frozen.

The required evidence is:

- After the real `await context.suspend()` resolves, `currentTime` must represent an exact canonical frame `F` and `F` must equal the private anchor's last decoded frame plus 128.
- Context time must remain exactly unchanged during wall-clock delay and offroute graph edits.
- The first actual resumed callback must decode exactly `F`, with no skipped, repeated or fitted frames.
- Every observed independent Native AudioParam counter sample must equal decoded frame plus sample index plus one, with strict zero error.
- The same checks must hold across the eight-second low-word wrap, at 8, 24, 44.1, 48, 96 and 192 kHz.

`LiveFreezeClockSource.certifyFrozen()` requires an already suspended live context. Before certification, or while awaiting the first resumed anchor proof, mutation readiness refuses. An interruption still retires the candidate. The host must explicitly call `waitForResumeProof()` before resuming and await it before treating the generation as ready again. This is a candidate contract, not an application-wide suspend/resume policy.

The anchor reuses the accepted integer codec unchanged. It does not infer an epoch from a first owner callback, use raw AudioWorklet `currentFrame` as authority, rebase authored controls, or process substitute silence. Its third AudioParam is diagnostic only. The production clock still has its original bounded eight-second low buffer and two-event coarse ramp; the larger sixteen-second reference curve belongs only to the proof fixture.

Focused checks cover valid certification/resumption at six rates, exact low-word wrap at six rates, wrong main counter, skipped resume block, absent/mismatched independent reference, disposal acknowledgement after failure, controller readiness, interruption and counter movement while suspended. These tests verify the candidate contract. They do not replace actual Native browser evidence.

The fixed desktop page is `/reports/scripts/native-context-clock-live-freeze.html`. It runs at most three new live contexts per document and exposes complete JSON in a visible textarea. Reload before selecting the other shard. It emits no music and assesses no physical listening or callback deadline.

Initial contiguous desktop Native tests passed for candidate `8ca7d41660b2a010` at all six rates. Each context completed three real suspension/resumption cycles, including wall-time pause and offroute graph edits, and crossed the eight-second low-word wrap. All 18 main frozen counters equaled the last decoded frame plus 128; every first resumed frame equaled that same frozen counter. The independently booked Native AudioParam absolute reference had strict zero error. No source generation was retired or rebased. Full evidence is retained as `reports/modular_audio/native-live-freeze-8ca7-lower-first.json` and `native-live-freeze-8ca7-upper-first.json`. Together they compare 3,375,360 independent reference samples with maximum error exactly zero. All six source cleanups report no error. Twenty-three focused tests also pass.

This accepts the separate source lifecycle component only. Normal player adoption remains deferred until a serialized application lifecycle helper and separately versioned owner adapters are reviewed. The existing main idle suspender and synchronous first-key paths do not yet implement this candidate contract.


A later retained repeated lifecycle probe found a genuine boundary outside this contiguous policy. In `reports/modular_audio/context-lifecycle-v2-upper-first-negative.json`, the fourth 48 kHz suspension resolved at Native frame 441600 while the last rendered anchor/reference block ended at 441344. The independent reference had zero error through that block. The strict 8ca certificate correctly refused the 256-frame destination-only advance and retired; no first-note callback had run. The earlier 18 contiguous passes do not establish universal live suspension compatibility. Pinned RealtimeAudioDestinationHandler renders silence without graph pulls after pulling is disabled, yet still advances its destination sample counter before the device fully stops.

The review-only first-resume diagnostic proved this mechanism directly: main frozen and independently resumed Native AudioParam frame 48512, prior rendered end 48384, original low-buffer decoded 48384, stop-drain 128, start-drain 0. Full 128-sample reference and low-cursor sequences were valid, coarse/reference residual was 1.7940377195976853e-9, and errors were empty. Receipt: `reports/modular_audio/native-freeze-drain-v2-48000-first.json`. It did not repair the clock or advance DSP. Strict 8ca remains unchanged; it is research for the contiguous transition only and is not a generally accepted transparent live-freeze policy. Main adoption is withdrawn pending a separately declared runtime policy, rather than widening this certificate.
