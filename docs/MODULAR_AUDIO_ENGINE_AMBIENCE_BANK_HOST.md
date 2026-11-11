# Normal Ambience owned resource sessions

The explicit live profile passes the twenty-second normal lifecycle gate with exact per-layer wet PCM. Normal offline raw sources and their final booking barrier also pass. **Normal offline native-filtered endpoint bit parity is not accepted.** The top-level environment and omitted options retain native loop playback; no backend field is added to saved songs.

## Context and bed ownership

`prepareOwnedAmbienceHost(context, {loopPlayback:'owned-pool'})` selects the accepted pooled reader for a live context and the accepted immutable reader for an OfflineAudioContext. First live arena preparation requires a suspended context before the pool's first callback. An active first allocation refuses before preparing unrelated routes. Reused suspended uploads require an explicit muted warmup/resume; no context is resumed implicitly.

The context owner retains the returned handle. Each `options(context)` call creates a separate bed session with its own cache leases, cancellation generations and source cursors. Bed cleanup releases only that bed's references. The designated context owner can retire the shared pool with `disposeContext()` after muting/suspending routes or during context closure. `status()` and read-only `stats()` observe that same authoritative owner; telemetry does not create another arena.

At most one successful resource per material is cached per bed. An unused cached resource is retired before a newer reservation. Admission waits up to five seconds only when already-retired pages can satisfy the request; it does not wait for arbitrary active crossfades. Insufficient live capacity refuses explicitly before reservation. Active old sources remain retained through replacement and original fade/stop. Releasing a stale descriptor invalidates only its own cache record. Superseded AbortError is ignored only for a stale request or disposed bed; current admission and transport failures stay visible. Cleanup waits for superseded jobs as well as current ones.

## Original normal scheduling and offline booking

The optional `Ambience.loopResourceFactory` supplies an immutable duration/identity and source creator. The original `layerBuffer` and native BufferSource path stay unchanged when omitted. Original piece-relative offsets, start/stop overwrites, source gain fades, replacement at now + .02 seconds, one-second crossfade, old stop at fade + .05 seconds, spatial/shelter chain and native wander remain the scheduling authority.

Normal immutable source construction is deferred until `await bed.prepareOffline()`, called after all authored starts and final stop overwrites and before `startRendering()`. The source options snapshot those commands; rendering does not rely on a suspended-context stop port message. The normal renderer awaits the barrier. Standalone immutable-source APIs and all numeric Wasm payloads are unchanged.

## Exact stems and native aggregate rounding

The original aggregate bit-identity negative remains retained in `ambience-bank-host-v5-first.json`: 960,000 stereo frames, 137,296 left/137,202 right differing samples, maximum error 7.450580596923828e-9. Resource/cursor lifetime checks passed in that run.

A separate causal capture, `ambience-bank-sum-first.json`, has all six raw and six individual wet channels bit exact. Two independent, internally untapped native controls nevertheless differ in their final sums by up to 7.450580596923828e-9. Each of four full mixes exactly matches one of six fixed Float32 three-stem addition orders. Tap counts and the untapped controls are recorded. Near cancellation, a small absolute rounding error can represent many result ulps.

Normal acceptance therefore requires exact, nonzero wet stems and reports aggregate bit identity separately. The aggregate bound is derived rather than fitted: two additions per three-layer bed, one bed fade multiplication with absolute gain at most one, then one outer two-bed addition give rounding depth four. With u = 2^-24 and gamma4 = 4u/(1-4u), the two-implementation bound is `2 * gamma4 * sum(abs(six wet stems)) + 8 * Float32MinNormal`. The floor covers bounded SSE flush. Unity final gains and zero total-wander depth are explicit fixture assumptions. Product audio is never reordered or modified by this evidence helper. Three arithmetic tests cover all fixed sum-order pairs, fades, cancellation, subnormals and injected-error rejection.

## Accepted results and explicit limits

The actual v7 live gate captures 24 wet channels plus four full-mix channels over 960,000 frames. All twelve wet comparisons are exactly zero error/zero differing bits. It runs two complete three-material beds, fills six banks, publishes an unused seventh full wind resource, retires it before latest reservation, then verifies another full wind resource without changing actual active identities. Disposing the first bed leaves exactly three surviving sources/resources. Partial fire upload cancellation preserves audio; the original replacement fade runs; acknowledgements arrive; final source/resource/reclamation accounting returns to zero.

Native and owned comparison disposal beginnings use a recorded common suspended frame (397,440), followed by resume and owned acknowledgement. Full uploads/cancellation run while sources play. No PCM is shifted or trimmed. The prior unsuspended v6 negative is retained: one 128-frame disposed-bed window beginning at 396,032 differed because independently issued graph operations could straddle a callback. The survivor stayed exact. The fenced live result has maximum aggregate error 1.4901161193847656e-8 and maximum analytic-bound ratio below .497. Aggregate bit identity is not claimed.

`ambience-normal-offline-raw-final.json` passes all twelve raw channels over 76,800 frames, including authored stop at 52,800 and every trailing frame. An actual-Wasm/VM test also proves initial start plus the final stop overwrite are present at construction, with no stop port message. This closes the controller/source booking defect that previously left one source playing for 24,000 extra frames.

`ambience-bank-host-v8-offline.json` retains the separate native filtered endpoint failure: five stereo wet pairs have one 128-frame residual window beginning at 52,864, maximum 4.050189816775379e-13. Native silence/channel activity and deferred handler disable are not observable merely from source stop or small PCM. No tolerance is widened, residual masked or tail trimmed. Complete normal offline filtered parity remains unaccepted. Other retained negatives include the first v4 observer/module-identity error; subsequent evidence uses only authoritative owner stats and private `?review` cache keys.

The scoped suite passes 69 tests across nine files, including saturated actual preparation/transfer/reader tests, independent bed disposal, generation ownership, constructor cleanup, original preparation and immutable playback, offline snapshots and allocation audits. Production host is 1bf54a77a650f420, pooled reader metadata 146ff0774233a61c and immutable reader metadata 54b890f75a14b5bd. Loop/reader/pool numeric Wasm bytes are unchanged. Earlier leaf acceptance remains separately recorded on 68199bfdca56652f. All full reports/screenshots remain local and ignored.

## Next task

Keep environment selection native at this checkpoint. Follow `MODULAR_AUDIO_ENGINE_AMBIENCE_SPATIAL_PLAN.md` to own the original spatial/fade/wander and activity/tail state, rather than infer opaque native flags through more tiny-tail tests. Phone/background behavior and whole-process 192 kHz headroom are unverified. Build provenance in order: original loop preparation, immutable reader, pool, then `tools/buildOwnedAmbienceHost.mjs`. The fixed normal page retains separate full, offline-filtered and offline-raw buttons; the causal summation page remains available.
