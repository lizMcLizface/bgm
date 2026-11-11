# Owned stereo ambience loop playback

Status: the isolated source reader, worklet facade and resource replay pass the actual desktop native gates. Existing Ambience routing/defaults remain untouched; normal host adoption and live resource upload policy are separate next tasks.

## Audited source boundary

Ambience.loopSource creates a same-context-rate stereo AudioBufferSource, sets loop=true and calls start(time,pieceTime(time)%buffer.duration), with explicit stop(time). It has no detune/playback-rate modulation. Wind, fire and vinyl retain their complete actual 29/23/18-second PCM, original preparation seeds, normalization and independent stereo channels. Synthesis, weather, native fade gains, spatial/shelter processing and level wander remain outside this reader.

Sixty independent native cursor captures established the contract before the Rust implementation was accepted. Start/stop boundaries follow the measured nearest 1/1024-frame then ceiling rule, including the tiny early-start threshold. Native offset seconds are converted back to sample frames and rounded to nearest integer, ties up, before fractional onset phase is added. A rounded offset at/beyond the end resets to loop start. Actual unpulled intervals preserve source sample age; a never-pulled scheduled source retains its initial fractional phase when first pulled later. An absolute stop passed while unplugged produces no resumed PCM. Later creation clamps start(0) to the actual call epoch. Both full native reports remain local. All 122,880 channel observations (61,440 stereo frames) replay bit exactly through Wasm; the permanent fixture retains only discriminating observed spans and the original 17-frame stereo ramp.

## Resources and API

Each Rust reader owns one immutable stereo resource and source state. Limits are 31 seconds and 64 MiB PCM per reader, at integer 8k..192k sample rates; the context factory permits 16 readers and 256 MiB owned PCM. Those limits exclude transient browser clones, worker memory and Wasm page overhead. The six actual old/new 192k resources occupy 215,040,000 PCM bytes and fit without trimming. Admission is checked before source construction, and failure cannot discard older reservations.

prepareAmbiencePlayback(context) returns a context-bound source factory. A source exposes start(seconds,offsetSeconds), stop(seconds), connect/disconnect, onended, prepareOffline, requestStats and dispose. Explicit host demand and the shared HostRenderClock preserve actual pulled age and advancing callbacks through stale browser epochs. Offline sources snapshot PCM and bounded initial commands before the first worklet callback; repeated stops replace the latest stop. Creation-only readiness is distinct from processor health/acknowledgement.

Disposal releases a reservation after acknowledgement. An unacknowledged open-context failure retains its reservation until a late acknowledgement instead of permitting unbounded allocations. Constructor refusal is handled before a reader exists, with the dispose handler already installed. Retired readers clear their JS Wasm export/memory views. Successful Rust render, stop mutation and reset allocate/free/grow zero; the JS hot path reads one scalar ended flag rather than constructing per-quantum stats objects. Full stats are made on actual end/control requests.

Long-resource JSON setups store the accepted preparation specification, complete stereo Float32LE fingerprint, preparation Wasm identity and authored start/offset/stop. Restore regenerates through the accepted owned worker, checks the full original duration and fingerprints both channels before creating a source. It saves no executor choice and does not pretend to capture an in-flight DSP cursor.

## Actual verification

ambience-playback-final.json passes all 23 cases on 005bdd23e0dd16df: every left/right bit matches over 318,336 comparison frames. All 18 full material/rate resources also regenerate independently from JSON with matching fingerprints and zero PCM differences. At 192k the actual frame counts remain wind 5,568,000, fire 4,416,000 and vinyl 3,456,000. Three original shape-swap crossfades each cover 55,424 frames with zero differences: new source at now+.02, piece-relative offset, unchanged one-second native linear gain crossfade and old stop at fade+.05. Both reused live runs cover 57,600 frames with null errors and acknowledged disposal.

ambience-playback-extra-final.json adds the named warmup/zero-lead/lifecycle gate on eee46f790bb98252. Both stereo captures are bit exact. The immediate reused-context source recovers three actual advancing callbacks and a maximum 384-frame stale global lag without replaying or synthesizing samples. Sixteen actual independent small readers reject the seventeenth before construction; all 16 disposal acknowledgements arrive and context accounting returns to zero readers/zero PCM bytes.

The final host cleanup changes only constructor-failure handling, retired export references and provenance dependencies. Numeric Wasm is unchanged across those gates: SHA256 b402f50eac325895270cfa3773f43fb8a5004efb3b694731a30052889589f0f5, 28,554 bytes. Current production is 4d70b1b92d1e884e; private allocation audit is 2e1483c107586bbe, 29,252 bytes. Twelve focused tests pass, including native observations, independent handles/reset/JSON, aggregate/count quotas, constructor refusal and a late disposal acknowledgement. The private allocator test is explicitly skipped when its separately built audit artifact is absent.

Build/check: node tools/buildAmbiencePlayback.mjs --publish; --audit; --check --publish; --check --audit. The fixed tools/ambience-playback.html page retains the full resource gate and a separate immediate/lifecycle button; no phone settings matching is required.

## Limits and next task

Full-loop constructor/upload work is explicit preparation and can allocate/copy a large resource. Actual live tests prepare while suspended. Running-context creation, phone/background performance and total process headroom are not accepted by these numeric gates. Existing native spatial/level/fade processing is preserved, and no normal backend/default changes are made here.

Next: choose the normal-host preparation policy before wiring the source factory. A bounded preallocated inactive-bank upload profile could copy verified PCM in credit-controlled chunks while the old resource runs, then retain the original now+.02/piece-time/crossfade schedule. That is a separate implementation; the accepted immutable reader remains the reference. No worker playback latency or analytic replacement is introduced silently.
