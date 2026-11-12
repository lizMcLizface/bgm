# Complete original FDN frontend — optional live candidate

The committed A seam (b69399da) forwards an optional prepared FDN factory through the real Instrument and both kit constructors. Its original Native frontend/default factory is unchanged. This B candidate replaces that frontend only when explicitly supplied through the same seam. It does not replace FDN with sampled convolution or select a global default.

Current candidate: kernel **772275c02c140294**, host **5a4295073639ce8e**, Source7a **7a0838a735108706**. The fixed Offline numerical/real-route acceptance below is complete. Realtime arm/first-consumer readiness remains a separate unselected successor scope; this checkpoint does not select the factory in the normal prepared environment. The desktop review is tools/fdn-room-live.html; fixed bounds are maximum absolute and relative RMS 1e-4, plus whole-stream exact Float32 words between independent owned actors. No alignment or trimming is permitted.

## Signal and control contract

All sample DSP is Rust: dry/send multiplication, original dry/send amount law, additional RoomColour predelay and damping, outer high/low-pass filters, unchanged effects::Engine FDN, and dry+wet sum. Send amount is applied BEFORE colour/FDN, so amount changes do not erase an existing FDN tail. Both branches have zero added latency. RoomColour Q is0.5 dB and the two outer filters retain the original Float32 Math.SQRT1_2 Q setting.

Original controls keep their separate currentTime reads. An amount call atomically reserves both rows, then publishes dry and send leaves in order; the Rust controller evaluates the original Float64 branch law before Float32 gain targets. Type/decay preserve HP then LP writes and the ordered FDN patch. Each target carries raw Float64 original seconds and value; the declared Source7a clock supplies output-time admission. There is no Native AudioParam value/getter or coefficient bridge. Repeated calls are retained. Constructor controls are immutable processorOptions rows, avoiding a pre-render MessagePort race. Deferred first-start settings are captured once, rather than silently replaced by later settings while construction is pending. Full patch preflight refuses capacity before the parent preset changes.

The original flush clears only FDN state. It does not reset delay, colour, or filter history. FDN resources are prepared upfront in this candidate (approximately7.2MB per Wasm actor); logical FDN DSP remains stopped until the original wet/defer condition starts it. This differs from the original actor's lazy allocation timing, and must be budgeted as preparation memory.

## Activity and ownership

Normal parent wake/sleep and setHostAwake hooks provide explicit physical-output demand. Inactive input edges are disconnected. A temporary zero-gain OUTPUT sink may service outstanding control rows while running; it cannot pull the disconnected upstream source. It performs no frontend/FDN sample DSP. The sink is removed before input reconnect/audio enable. Active numeric-zero input is processed; no Float32-zero heuristic infers a Native silence flag. The initial candidate processes the frontend throughout declared pull, including a stopped source's tail. Native automatic internal Delay/Biquad retirement remains a browser gate, not an assumed equivalence.

The source clock is the frozen Native source7a generation. Live suspend/interruption retires it; cold Offline contexts use the explicit offline-freeze-v1 policy. Only explicitly unpulled, physically input-isolated bootstrap may wait for canonical pending/future control visibility (maximum8192 frames and64 pending callbacks, with bounded5-second arm requests). Such waits do not consume metadata, acknowledge rows, or advance Rust DSP. Active/future/malformed/backward cases reject. This is not an inferred or clamped audio clock.

All worklets install a terminal receiver before Wasm construction. Disposal requires an exact actor identity plus typed positive terminal release, and holds its source clock lease through that proof. Timeout quarantines ownership; it is not release. Every known constructor prefix is closed on failure. Source output quota is16 unreleased FDN actors per context. Constructor/control/registration errors remain sticky and are surfaced to the original parent callback. No recorded-room fallback is introduced.

## Fixed preparation bounds

- Canonical128-frame render quantum, input logical0/1/2 channels, stereo FDN return.
-32 outstanding raw-F64 stamped rows, with per-word stamps and observed-sequence ACK before slot reuse.
-452 Native AudioParam descriptors including clock/demand. Native parameter arrays and JS metadata service are not claimed allocation-free or deadline-safe.
-128 cold constructor rows;256 prepared events per independent lane. A full five-control preset reserves a conservative11-row bound before mutation.
- Source7a finite generation horizon2^20 seconds; no indefinite clock claim. First128 control calls are retained in diagnostic history.

## Current checks

44 focused new tests cover six-rate independent Rust state, dry/send/amount rounding, retained-predecessor versus fresh-event Native clock edges, invalid admission, exact original reference-body restoration, actual original Wasm parameter-handler ACK ordering, future/preorigin isolated deferral, active refusal, full-patch reservation and constructor cleanup.

The prepared Rust allocator audit executes6144 canonical quanta across six rates, repeated original room patches and amount/lane edits, and clear calls. Every rate reports zero allocations/reallocations/frees and unchanged Wasm memory. This is Rust allocator/page evidence; it does not measure JS, browser Native parameter storage, physical CPU utilization, or device underruns.

- 8000 Hz: 7208960 Wasm bytes; allocation/reallocation/free 0/0/0; memory unchanged true
- 24000 Hz: 7274496 Wasm bytes; allocation/reallocation/free 0/0/0; memory unchanged true
- 44100 Hz: 7274496 Wasm bytes; allocation/reallocation/free 0/0/0; memory unchanged true
- 48000 Hz: 7274496 Wasm bytes; allocation/reallocation/free 0/0/0; memory unchanged true
- 96000 Hz: 7340032 Wasm bytes; allocation/reallocation/free 0/0/0; memory unchanged true
- 192000 Hz: 7471104 Wasm bytes; allocation/reallocation/free 0/0/0; memory unchanged true

## Grouped desktop reference

The review compares the original Native FdnRoom/RoomColour frontend and original effects Wasm/processor DSP to TWO real complete Rust worklets. A SHA-pinned review derivative changes only the reference's registration name and same-port ACK diagnostics. Each ACK records actual applied patch count and original FX frame; no timestamp is invented. A permanent test erases those metadata additions and proves the literal original source body is recovered exactly.

Five cases per rate cover source-ended/retriggered mono/stereo audio with ordered/repeated GUI calls, the real Instrument effects route, the real deterministic Native kit, and the real Wasm kit finite hit plan. Separate identically configured captures avoid asymmetric ChannelMerger subnormal behavior. Initial and paused reference patches are acknowledged before rendering/resume. This is a matched prepared reference; unmatched asynchronous legacy actor arrival is not claimed equivalent. True cold replay is covered below. Reused-live first-consumer readiness and prepared environment selection remain pending.

## Retained first desktop negative and host-only successor

reports/modular_audio/fdn-184a-48000-first-negative.json retains the entire first48k run. Both direct source-ended/retriggered layouts and the complete Instrument route were sample-word exact against Native and between owned actors, including cleanup. The actual Native kit was also sample-word exact and nonzero, but both prepared kit disposal promises rejected. This was a cleanup failure, so the batch stopped before the Wasm-kit case. It is not an accepted complete matrix.

Both failed kit children already had exact positive clean natural offline-end receipts at57600 and released clock links. The parent kit then invoked its existing setAwake(false) cleanup hook before journal retirement. In184a that passed through the ordinary clock check, which correctly refused the already-closed Offline context. A deterministic regression reproduces this path. The host-only87a successor accepts ONLY false-demand cleanup after a matching clean natural offline-end proof and a valid final context frame; it detaches known edges without publishing any new control. Active setters/enable after terminal release and any calls after owner disposal still refuse. Unclean, malformed or live terminal receipts do not waive checks.

reports/modular_audio/fdn-terminal-cleanup-body-proof.json proves unchanged7c0004 Wasm bytes and the entire processor body unchanged after substituting its host identity. The184a raw sources/public bytes remain archived under reports/modular_audio/fdn-184a-before. Review receipts now retain bounded nested AggregateError trees. No DSP or numerical bound changed.

Historical87a: a separate actual output-gap/source-cursor diagnostic was prepared in tools/fdn-room-live-gap.html. That historical strict processor rejected a legitimate reactivation frontier after no callbacks were requested. The causal evidence and explicit successor contract resolving it are recorded in the next section. No blanket clock-gap relaxation or inferred audio-frame correction was applied.

## Explicit physical reconnect candidate

The entire87a five-case48k desktop batch passed, including both actual kit sources and all parent/FDN disposal promises. Every Native comparison and independent owned stream had zero differing Float32 words. The subsequent fdn-87a-48000-gap-negative.json proves why the original active-gap guard was too strict: after physical disconnection at512, the original FX and both owned wet DSP cursors stayed512; all three independent Native BufferSource cursor witnesses resumed exactly at512 after the return at4096. Source7a decoded the exact3584-frame global gap without any codec error. The guard then rejected before consuming controls. This was a declared routing gap, not missing or shifted PCM.

The8c successor adds one bounded internal reconnect-generation AudioParam. Its private facade counter is minted only after an actual successful input edge removal and valid route return. It is not a GUI parameter or a generic clock override. Counter overflow refuses before reconnect; no wrapping is allowed. The processor consumes a generation once, on the first actual pulled callback. No/old/reused certificates, malformed counters and backwards/retired Native clocks still reject. Inputless mode0 control service does not consume an audio return certificate. A cold first activation with no prior pulled DSP can bind its first absolute time without advancing DSP over the unused interval.

fdn-reconnect-body-proof.json proves unchanged Rust Wasm, Source7a and complete raw-F64 GUI-reader bodies. Permanent tests compare an explicit global clock jump to the same two uninterrupted DSP quanta: output is exact while wet/FDN history advances only128 frames. The absolute clock gap does not synthesize silent audio or reset filters.

The initial8c48k full-five batch and separate actual gap/cursor gate pass (fdn-8c31-48000-first-pass.json and fdn-8c31-48000-gap-pass.json). The six-rate numerical, parent-source health and cold replay acceptance is recorded below. Reused-live adoption remains a separate scope. The review now additionally records all original/owned parent source errors, counters and Wasm source capabilities, and requires actual positive clean source disposal ACKs. These are read-only post-render observations; complete runtime provenance remains8c3179e0686a5e55.

## Accepted fixed Offline scope and clean-checkout package

The six final8c reports fdn-8c31-{8000,24000,44100,48000,96000,192000}-final.json contain30 cases: five original normal routes per rate. All30 Native comparisons and30 independent owned comparisons have **zero differing Float32 words, zero maximum absolute error and zero relative RMS**. Every source is nonzero; every original/owned parent health check, parent retirement promise and positive FDN terminal/clock release passes. The original Offline percussion processor does not report late/drop stats; these are explicitly unmeasured rather than represented as observed zeros. Available counters and typed source capability/clean terminal ACKs are checked. fdn-B-desktop-summary.json independently aggregates the full receipts.

The actual output-gap gate fdn-8c31-48000-gap-pass.json is also word exact. Its three independent real Native sources resume at cursor512 after the3584-frame route gap; both FDN wet/DSP histories finish at12800 while absolute context/control time reaches16384. Four offroute GUI rows are intentionally observed3072 frames after their authored time; this is a sleeping-control observation distance, not dropped audio. No silence was rendered to fill the gap.

The192k true full-HTML reload pair fdn-8c31-192000-cold-{save,reload}.json passes every complete authority field: schema, rate, fixture source hash, fixed bounds and all five cases. The cases include exact settings/ordered controls, component identities and all six output-plane hashes per case. This numerical/cold authority belongs to host8c3179e0686a5e55/kernel7c0004c719cb2e03. It has not been relabeled as a later build.

The packaging-only successor is host5a4295073639ce8e/kernel772275c02c140294. fdn-packaging-body-proof.json proves the same103340-byte Wasm (SHA256926a8de71f1f28cbdd16563447b9564af9bf6e5f4e37e6ce689e3df0c4e8a585), and the entire processor identical after substituting only both identity strings. No Rust/DSP, GUI, routing or clock-body change occurred. Its actual48k five-case recheck fdn-5a42-48000-final.json again passes every Native/independent word and health/cleanup check exactly.

The ONE published binary lives beside its canonical tracked kernel-build.json. Both public provenance commands work without any temporary read:

~~~sh
node tools/buildFdnRoomLive.mjs --publish --check
node tools/buildFdnRoomLiveHost.mjs --publish --check
~~~

The permanent clean-checkout test denies all.tmp reads for both commands; separate regressions reject changed binary/audit receipts and a changed public notice against canonical source. Temporary output is required only to compile a new kernel, not verify committed public assets.

## Explicit realtime arm boundary for the next successor

This checkpoint's ready promise proves constructor/setup completion, not that this consumer has processed its first valid Native source-clock quantum. Its zero-runtime-row flush can acknowledge sequence0 directly from the control handler. Typical deferred rooms emit a start row during hear and therefore drive a control callback, but a nondeferred, entirely constructor-configured room may have no equivalent first-consumer proof. The realtime factory is not globally selected on the basis of Offline acceptance alone.

The current arm method additionally requires a running context; fixed Offline review uses the pre-render ready path and never calls arm. Restoring the original pre-render-legal Offline arm behavior, and requiring a bounded actual clock-consumer ACK/private input-isolated service for realtime zero-row arm, belong to the next separately identified lifecycle successor. The accepted5a snapshot is retained before that work. No universal realtime readiness, device deadline or phone acceptance is claimed here.
