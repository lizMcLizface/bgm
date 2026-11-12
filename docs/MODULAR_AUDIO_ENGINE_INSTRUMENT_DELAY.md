# Original instrument Delay and PingPong numerical port

This standalone Rust component implements the actual graphs in src/nodes/delay.js and src/nodes/pingPongDelay.js. It does not select a new app backend. The existing Native nodes, accepted Echo/Tape components, Source clock and Sweep profile remain unchanged.

The two original graphs have different laws. Delay feeds its delay output through feedbackGain before both the feedback edge and the tone filter, so zero feedback also mutes its wet signal. PingPong has separate left, pre and right delays; each delay retains the full input layout and each channel-merger input then downmixes to mono. Its wet tone follows the merger. Both original createDelay() calls use the Native default maximum of one second, and all constructor gain steps and the scheduled 11000 Hz filter event are retained.

The numerical cycle profile follows the original graph traversal. Delay reads the previous feedback-gain quantum, then computes current delay and feedback output. PingPong's merger pulls its left input first; the cycle reads the previous left-delay output through the current left feedback gain, evaluates pre/right delay and current right feedback, then the current left delay. No extra 128-frame delay compensation, drift adjustment or sample alignment is introduced. Actual Native comparison is mandatory; these statements are not a universal browser feedback guarantee.

Native Delay::ProcessARate copies the entire input quantum into its circular buffer before reading samples. The new implementation preserves that rule, the pinned SSE Float32 read-position/interpolation operation order and ring length rate+128. Per-sample writes would incorrectly read stale future samples at fractional delays shorter than one sample. Gain constant-zero optimization is distinct from sample-accurate multiplication. Biquad and original-seconds AudioParam arithmetic are hash-pinned read-only dependencies of the accepted InstrumentTone/FDN timeline helpers.

Resources are admitted before allocation: rates 8 kHz through 192 kHz, fixed mono/stereo input with finite samples of absolute value at most 4, 128-frame calls,11 control lanes with 256 events each, maximum 8 actual handles per Wasm instance, and an 8 MiB conservative per-handle bound. The worst prepared Rust allocation measured 4,851,408 bytes versus the calculated 4,986,576 byte bound; eight largest handles measured 38,811,264 bytes, under 64 MiB. Host JS, Native nodes and Wasm linear-page retention are separate from that Rust allocation accounting.

The JS adapter maps original amount/feedback/time/tone setters and Instrument.holdDelays' cancel-now / zero-now / restore-at-until law. It keeps RawF64 authored seconds, including the future restore time. Complete batches validate all rows and actual lane credits before mutation. The recipe journal is bounded to 4096 commands and serializes control replay from the beginning with the same input; it is explicitly not a mid-render delay-buffer snapshot. Same-module callers allocate all handles and refresh views during preparation; render rejects changed memory rather than allocating views.

Current evidence:
- Literal Native authority v2 passed four stereo cases at 48 kHz: both original families, constant fractional delay and zero-time feedback. All original-versus-original words matched, full 8192-frame Source7a capture covered frame 0 without gaps, original control traces matched and all 8 actual Native owners retired cleanly. The earlier v1 failure was a new capture registration identifier mistake, occurred before any case, and is retained separately.
- Eleven meaningful numerical tests cover constructor unity/default chronology across six rates, both graph topologies, complete-quantum fractional reads, stereo downmix, pre-mutation refusal, raw quota/layout/input checks, reset and hold time fidelity. Eleven review/capture tests cover literal source API/graph traces, Source7a registration and full actual coverage.
- Private 24-case six-rate mono/stereo/both-family checks passed same-Wasm handle independence and JSON replay word0. The allocation audit passed 24 cases / 6336 quanta with zero Rust allocation/reallocation/free or linear-memory growth during controls/render/reset, and all Rust allocations released on free.
- The combined literal Native pair versus Rust, independent Rust and JSON replay page is tools/instrument-delay.html. The six-case stereo 48 kHz combined pilot and full 144-case six-rate matrix both passed. Both complete 192 kHz family scenes also passed a true full-HTML save/reload/replay. Fixed maximum absolute and relative RMS limits are 1e-4; independent/reload comparisons require raw word0.

No synchronous Native AudioParam getter bridge, external AudioParam source, automatic Native tail-disable/layout policy, live AudioWorklet transport, deadline, host selection or complete Instrument adoption is claimed. The continuous captured program boundary is explicit; late construction, unpulled/reused live transitions and source-ended tail behavior require their own later host contract. A later facade must use the accepted atomic physical-route helper rather than guessing demand from a Boolean or PCM silence.

Combined pilot171ea28c2195d17b: maximum absolute 0, maximum relative RMS 0. Each of the six Original-versus-Original comparisons was word0; independent Rust and JSON recipe replay were word0, and all Native owners retired cleanly. Evidence: instrument-delay-171e-48000-quick-result.json plus instrument-delay-171e-pilot-independent-audit.json under ignored reports/modular_audio. The separate cold helper compares full settings/actual controls/packed commands and four primary PCM streams plus repeat-Native/reloaded streams after a full document reload.

## Complete numerical acceptance

Kernel 171ea28c2195d17b is 86977 bytes, SHA256 30d761d4c38d9da66f4cbad58868bc16962ea6647383d64a75d897c10961d891. The full matrix has six scenes for each original family and both mono/stereo inputs at 8/24/44.1/48/96/192 kHz: 144 cases across 12 documents, each with at most 12 Offline contexts. Scenes cover defaults, constant fractional delay, dynamic controls/hold, zero-time feedback, quantum-boundary times and the full one-second ring wrap.

All 144 Native-versus-owned comparisons were raw Float32 word0, maximum absolute 0 and relative RMS 0, under the unchanged 1e-4 limits. Original-versus-original, independent Rust and JSON replay were also word0. This covers 2730496 captured frames and 4778368 output sample words per stream; all 288 original Native effect owners completed their cleanup journals without a recorded error. Every actual capture began at Native frame 0, covered all canonical quanta, had zero Native-clock gaps/rejections and never used raw worklet globals as timing authority.

Both 192 kHz complete twelve-case families were saved, the full HTML document reloaded, then replayed. Complete recipes, original actual insertion times/call arguments, packed Rust commands, component identities and all six captured/replayed PCM stream hashes matched exactly. Four primary streams are program/Native/owned/independent; the repeat-Native and JSON-reloaded streams are retained too.

Evidence remains ignored under reports/modular_audio: instrument-delay-171e-{rate}-{delay|ping-pong}-result.json, the four 192 kHz cold save/replay receipts, and instrument-delay-171e-full-independent-audit.json. These are numerical component proofs with explicit continuous input and captured Native insertion epochs. They do not certify a live factory, arbitrary automatic source-ended/tail/layout behavior, unsuspended multi-handler scheduling, synchronous Native getters or normal Instrument selection. The v1 capture registration negative remains a separate pre-case tooling failure.

Commands: node tools/buildInstrumentDelay.mjs --publish --check; node tools/buildInstrumentDelay.mjs --audit; node tools/auditInstrumentDelay.mjs. The focused permanent suite is 27 tests across the adapter/numerical, provenance, Native capture/authoring and separate cold authority files. No shared/default selector, existing kernel or original Node was edited.

## Explicit live owner and facade — 12 November

Host **88049859d690236b** retains the exact accepted **171ea28c2195d17b**
Rust/Wasm bytes. It owns one original Delay or PingPong graph with immutable
mono/stereo input geometry; mono PingPong correctly produces stereo output.
The live wrapper sends checked commands directly to the accepted Rust ABI,
without growing the numerical replay recipe. Five thousand live commands per
mode leave that recipe empty and Wasm memory unchanged. The context quota is
eight live owners across both modes; this bounded leaf is not yet a six-role
normal Instrument constructor policy.

Thirty-two acknowledged RawF64 metadata rows retain the actual author frame
separately from scheduled seconds. Multi-lane setters reserve their complete
metadata batch before any row and retain each original currentTime read. Hold
cancellation, zero steps and future restorations share the one captured
original hold author epoch. Controls retain configured amount/targets only
after admission. Observed Rust curves are asynchronous and identity/layout
checked; synchronous Native intrinsic getters explicitly refuse. The shared
atomic physical-route protocol processes real draining input, freezes
physically unpulled delay history and requires matching observed OFF before
arming or earning a later reconnect reanchor. Terminal gates precede edge cuts;
failed gate publication retains edges until actual SourceACK/context close and
keeps failed audio health.

Actual six-rate worklet verification passes **144 cases / 576 comparisons**
against two literal original Native graphs. Every compared output word, repeated
Native output and independent Rust output matches exactly; 2,730,496 frames
have complete Source7a capture starting at frame zero. All 288 owned Offline
closures and 288 Native journal closures are clean. A true full HTML reload at
192 kHz reproduces both complete families: all 24 recipes, actual original
setter/hold epochs and all five stream hash groups match exactly. These
Offline closures are recorded separately from running SourceACK authority.

The explicit physical-gap review passes another **24 cases / 96 comparisons**
across all six rates. Both original outputs and owned private routes disconnect
at frame 1408 and reconnect at 4224 while the original control/hold program
continues. Every case records exactly 22 absent quanta per output, a complete
source-clock ledger, 5376 rendered delay frames, frozen isolated DSP and exact
Native/independent output words after reconnection. The first capture attempt
refused empty disconnected Native ports; that negative is retained. Its
successor permits absent output planes only in the declared window, records
the actual layout transitions, and rejects every other missing/partial input.
It does not accept arbitrary capture gaps or infer Native silence from zero PCM.

Twenty actual reused-context rounds cover both modes and both layouts with
forty independent live owners. Prepared DSP is zero, inactive controls preserve
delay history, distinct returned delay-time curves stay independent, actual
output is nonzero and finite, and forty real clean SourceACKs release clocks
before context close. Eight actual adversarial upstream holds produce eight
nonzero DRAIN witnesses, each rendering exactly 128 frames of unchanged input
followed by genuine matching OFF receipts. Twenty-four new focused checks pass.
The independent matrix and transition audits, raw negative, receipts and scratch
scripts remain ignored under reports/modular_audio.

This accepts the explicit bounded live owner/facade and declared gap behavior.
It does not select the normal Instrument factory, claim arbitrary automatic
Native delay/filter tail traversal, expose AudioParam signal connections or
claim device deadlines. Next: provide private retained producer endpoints and
join selected Instrument/rack factories with whole-patch preflight and explicit
parent lifetime, alongside the remaining original modulation effects.
