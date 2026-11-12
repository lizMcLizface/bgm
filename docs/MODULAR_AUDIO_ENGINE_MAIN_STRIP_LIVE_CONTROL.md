# Mutable Main tone and gain control kernel

12 November 2026: separate Rust profile `main-tone-volume-duck-live-v1`,
identity `efeda6631d83ff91`, 45,905-byte normal Wasm. It does not change the
accepted prepared Main strip, its helpers, any normal application route or
existing Native controls. There is no selected live AudioWorklet facade yet.

This kernel owns the Main low-pass Q0.5 -> volume -> duck chain, or an explicit
gain-only route for later master/percussion/send integration. Its admitted
methods are set, target and cancel. Linear, hold and dynamic intrinsic assignment
are deliberately refused. Fixed mono/stereo layout and continuous processing
remain explicit. Each lane has256 preallocated events, including the captured
constructor assignment; values/times, author chronology and capacity are checked
before pruning or mutation. Volume admits0..4, duck0..1 and tone0..Nyquist.

Original author time and observed rendering time are separate. Every admitted
command carries its original seconds and an exact canonical Native author
frame. Main-thread clamping applies to ALL three methods, including cancel.
Insertion pruning uses the original author frame; newly observed past events
retain the pinned render-time clamp. Late publication is counted, not shifted
back into already emitted audio. A one-use first-frame binding moves an unrendered
instance to its actual Native pull without inventing preceding DSP samples.

The constructor trace is explicit: original `.value` assignments both change
the intrinsic and schedule a step at the constructor frame. The default Main
trace assigns tone and volume while the untouched duck Gain remains1. Gain
processing also preserves the pinned sample-accurate versus scalar-zero branch;
scalar zero clears positive zero, while an automated product retains its actual
Float32 sign. These are source-backed rules, not output normalization. The new
profile records the hashes of the pinned AudioParam/Gain implementation sources;
all accepted timeline/Biquad helpers remain untouched.

Actual Native desktop reference:36 OfflineAudioContext cases, six rates
8/24/44.1/48/96/192 kHz, mono/stereo, melodic/gain-only/constant mute. Native
rendering suspends at four exact author frames; original controller calls occur
while that frame is frozen. Past setters/cancellation, overlapping future duck
steps, original constructor steps and scalar mute are exercised. Every Native
Float32 word matches. Independent replay with1/17/127/511-frame splits is also
exact. True HTML reload reruns all36; complete reports are byte-identical.
Receipts: `reports/modular_audio/main-strip-live-efed-native-final.json` and
`main-strip-live-efed-cold-replay-final.json`.

The first5391 receipt is retained. It passed the declared1e-4 bound but exposed
up to3.5412609577178955e-5 error after past cancellation, plus signed-zero word
differences in constant mute. Correcting the actual Native clamp/constructor/
scalar rules reduced both to zero without changing that bound or accepted DSP.

12 actual-Wasm tests pass, including the prepared numeric reference, mutable
capacity/chronology refusal, failed input before frame advancement, unsupported
API refusal, exactly-once first-frame binding and two raw handles in one Wasm
instance with one retired while the survivor continues. A separate allocator
build covers12 rate/layout cases,49,152 callbacks/6,291,456 frames and56,184 live
control admissions after construction: zero Rust allocations, reallocations,
deallocations or memory growth. It does not certify JavaScript allocation or
realtime callback deadlines. Receipt: `reports/modular_audio/main-strip-live-allocation.json`.

Reproduce with `node tools/buildMainStripLive.mjs --publish`, then its
`--publish --check` mode and `npm.cmd exec -- vitest run src/modular-audio/mainStripLiveRust.test.js`.
The grouped review is `/tools/main-strip-live.html`. Physical listening is
unassessed; the current evidence is actual Native offline timing/numeric parity.

Next: bind this kernel to source7a and the new raw-F64 stamped metadata transport,
keep per-command credits until observed acknowledgement, own initial warmup and
all terminal release proof, and run one grouped live control/gap/retirement
matrix. Then migrate Main tone/gain/duck and gain-only routes under a stopped
publication transaction. Current Main controls remain Native until that gate.

The additive exact-capacity successor is kernel03eb5d894a75d801,46,464bytes /SHA2563e3f881187fb73cb236d9bf4f35c6c4de20df5fb2738f291cf24f1d12e834e31. Only a read-only insertion-capacity export and JS query wrapper were added to the numerical module; all original command/render and shared timeline/Biquad/tail bodies remain exact. Its Native-frame host451c2a3d35ad1e5b queries the observed callback frame after rendering, supports actual reclaimed credits rather than a lifetime edit cap, and passes the full36-case Native/two-owner group and identical true cold replay. See [the live Main host](MODULAR_AUDIO_ENGINE_MAIN_STRIP_CONTROL_HOST.md) for exact admission/debt, live and allocation evidence. Older efed receipts remain identified as predecessor evidence.

Live host451c also passes an actual1,024-command Native metadata/FIFO reuse soak and primary/survivor/quota/retirement group. Immediate past-zero publication records its actual1,024 main-thread clamps and516 late output-thread observations; this is liveness/admission evidence, not bit-exact unsuspended Native GUI timing. Future-booked audio remains separately exact. Details and full receipt are linked in the host record.

Final source-formatting host identity is a6e7bdc5b0644b28; the complete emitted processor is identical to451c after replacing only host identity. Kernel03eb and all numerical bytes stay unchanged; the recorded451c gates remain separately identified. The exact normalization proof and final published-processor checks are linked in the host record.
