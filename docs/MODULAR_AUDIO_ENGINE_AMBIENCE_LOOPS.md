# Owned wind, fire and vinyl preparation

11 November2026 overnight checkpoint. Kernel88696dc04c5ce79d (39,984bytes),
host8e942d988ab958ac. This opt-in port prepares the actual wind/fire/vinyl
loops in Rust; it does not replace the original weather model or invent new
materials. The normal All and legacy ambience routes retain their defaults.

The complete version1 specification captures material, integer8–192kHz rate and
the original two material controls quantized to tenths. Seeds, channel-major RNG
order,32-sample control clock, default-relative RMS normalization, clipping and
equal-power seam fold follow original renderLayer. Loop periods remain wind29s,
fire23s and vinyl18s. Source shape bounds reject before preparation.

A dedicated serial preparation worker owns a fresh private Wasm instance per
job. Only verified compiled code is cached; returned stereo PCM is independently
owned and transferred. Default request capacity is4 (hard1–8), with a bounded
watchdog. Queued abort removes that request; active abort terminates its worker
generation. Disposal drains requests; stale generation messages cannot replace
new output. Failure clears the relevant cached preparation for retry.

Maximum returned stereo PCM is44,544,000bytes for wind192kHz. Preparation has
additional temporary arrays and can exceed64MiB; it is explicitly off-thread.
The fixed-buffer player exists for reference/lifecycle checks. It starts at
phase0 and is not claimed to reproduce native fractional BufferSource offsets.

The existing Ambience constructor now accepts an explicit loopRenderer function.
Each renderer gets its own12-entry LRU namespace, keeping legacy PCM from masking
a different renderer. prepare/start/replacement all use the supplied function;
malformed or failed PCM is rejected. Failed pending preparation clears its
placeholder; failed replacement retains the already-playing source and records
the error. Existing native AudioBufferSource looping, fractional piece offsets,
distance/width/pan, sine/random wander, level laws and crossfades remain native.
No backend selector or default switch is added.

Verification:

-72 actual original-reference cases cover all three materials, six rates and
  four shape/quantization profiles. Complete stereo source PCM is bit exact.
-72 counting-allocator cases check two saved/reconstructed handles, arbitrary
  render partitions, loop wrap and reset. Render/reset allocations, reclamation
  and memory growth are zero after preparation.
-32 permanent tests pass:8 source tests,19 actual Worker lifecycle/integrity/
  cancellation/timeout/transfer tests, and5 native-consumer cache/error tests.
-12 actual desktop browser cases compare two native and two owned-preparation
  Ambience hosts in one OfflineAudioContext. They cover individual materials at
 44.1/48/96kHz, three-layer overlap, saved reconstruction and a shape crossfade.
  Every complete source buffer is bit exact and owned hosts use separate buffers.
  Host maximum error is1.1175870895385742e-8, relative RMS4.786911251310113e-8,
  within the predeclared1e-7 bounds. Startup is silent through frame1024; native
  loop sources and worker accounting/transfer checks pass.

The first host test incorrectly demanded bit-identical independent native fan-in
output. The retained first/baseline reports show native-native repeats themselves
differ by7.450580596923828e-9 as connection ordering changes floating-point sums.
The final test therefore checks complete source buffers strictly, and applies
the original fixed1e-7 host bound to both native and owned repeats. No source or
playback DSP was changed to obtain the pass. Evidence is in
ambience-loops-native-host-first.json, ambience-loops-native-host-baseline.json
and ambience-loops-native-host-final.json, each with its screenshot.

This proves preparation, worker ownership and actual native host PCM behavior.
Physical listening, phone delivery, live default adoption, portable spatial/
wander chains and a fully Rust ambience host remain separate work. Next connect
this explicit preparation capability to the opt-in aggregate host, then port
remaining native host chains under their own contracts.
