# Prepared complete Room in a live Worker

Status: accepted independent component; normal application/default/Graph adoption is not selected.

## Numerical composition and controls

The dedicated Worker owns unchanged RoomColour `7725ec44e5572cf0`, long convolver `c5dbde0540bfdf83`, and original dry/wet mix `c7b4ee0c1094a319` Wasm. New glue requires framed RoomColour v3; the accepted cold offline facade still requires its original v1 contract.

Dry PCM is copied before colour. Full/Light routing retains the existing post-colour ordered speaker downmix. Final output width is max(source channels, wet channels): Light stereo therefore preserves stereo dry while convolution is mono. One Worker returns the complete sum, without a second Graph dry delay/VCA/summer.

The original unsmoothed amount law and two independently captured dry/wet setter times remain in Rust. The entire finite book is prepared before streaming: up to255 amount calls with original source-local seconds, plus explicit canonical framed colour/activity. This is not a mutable live GUI controller, asynchronous IR replacement, event cancellation or running-history snapshot. Original colour seconds and the explicit framed-colour policy are distinct authorities.

## Streaming time

For block size B, additional latency is exactly

`L = max(2*B, ceil(sampleRate*0.5/128)*128)`.

It delays the final dry/wet stream once. With B2048, the supported six-rate fixtures use4096,12032,22144,24064,48000,96000 frames at8/24/44.1/48/96/192k respectively. Numerical adapter latency is0; intentional wet predelay/convolution response is not extra PDC compensation.

Frozen Native context clock source `7a0838a735108706` is the sole absolute audio-frame authority. Raw AudioWorklet currentFrame is diagnostic. Packets have independent contiguous source-local frame indices. Missing active source/output pulls, late/corrupt returns, exhausted credits, changed known input layout and underruns are terminal. There is no fitted alignment, resampling, synthesized pull or native fallback.

Preparation disconnects the input edge. A quiet output sink services only clock/control preparation. Following a typed future-start ACK, the input edge is connected and the quiet sink removed. The caller owns the source's scheduled start and known-layout padding through the entire finite budget. This does not confer transparent ownership over an arbitrary already-running upstream source. Numerical zeros never infer input activity.

Live suspension/interruption retires the source generation. Resume requires a new offroute owner/clock generation. Existing explicit Offline clock-freeze tests do not extend live semantics.

## Resource ownership

The pool has ceil(L/B)+4 blocks, capped at192; each backing buffer is max(input channels, final output channels)*B Float32 samples. A direct dedicated MessagePort transfers buffers between worklet and Worker. Main-thread code never relays PCM.

This is not a zero-JavaScript-allocation or physical-deadline claim. Packet objects, returned-buffer Float32 views, cloned preparation books/IRs and host arrays are explicit costs. Existing Rust mix allocation evidence is not relabelled as a complete-pipeline allocation audit.

The facade reserves at most2 owners per context, at most32 outstanding requests and nonwrapping u32 IDs. Receipts bind host, all3 numeric components, clock version, owner generation and operation. Logical close is synchronous/idempotent. Cleanup aggregates failures, waits for independent transport release and Worker release/positive termination, and retains clock links until transport release. Missing transport ACK quarantines its quota until context closure; timeout is not successful release. Worker processing completion and final output drain are distinct receipts.

## Permanent checks

42 focused checks across9 files pass. They cover six-rate Full/Light mono/stereo composition and odd split cadence; a real471389-tap Worker with detached direct-port buffers, including an8320-frame run with128-frame final remainder; exact single-delay delivery/drain and bounded reuse; gaps, layout ends, underruns, invalid packets; offroute isolation, typed receipts, quota, retirement and timeout quarantine; published-constructor failure cleanup; exact source/capture clocks and signed-zero/subnormal comparison; complete cold replay identities.

The two publication builders verify normalized-LF source provenance and existing numerical asset hashes. No Rust algorithm or Wasm rebuild was introduced.

## Actual six-rate numerical and replay authority

Original host `92ceb05607457287`, review capture `c6511ac6c2b40bd5`: all24 cases /48 original Native comparisons passed at8,24,44.1,48,96,192k. Each rate covers Full mono/stereo and Light stereo/mono, with2 real Worker owners.

Every entire source capture and independent owned logical output pair is word-exact. Maximum absolute Native error is4.470348358154297e-8; maximum relative RMS is2.1267170899703739e-7, within the unchanged prospective1e-4 bounds. All source/returned/output budgets and declared Ls match exactly, without underruns/rejected packets. Every owner obtained independent transport release and positive Worker termination before context close. Full/Light retain the original3/2-second IRs at each rate.

Receipts: `reports/modular_audio/room-live-92ce-{8000,24000,44100,96000,192000}-final.json` and `room-live-92ce-48000-first.json`. A true192k HTML reload also reproduced source/settings, decoded/transformed/preweighted IR hashes, all component/source identities and both logical PCM hash pairs: `room-live-92ce-cold-replay-final.json`.

The real input source begins at an explicitly authored exact binary quarter-second. Its declared zero prefix precedes the canonical Room epoch; the independent input capture must match the full fixed Float32 program exactly. The original READY Reverb/Gain consumes that exact captured source in an OfflineAudioContext. Actual original source code, native normalization, framed-colour events and original two-read gain seconds are pinned. Expected native output is padded by declared L, never fitted. These fixtures retain known source layout from the Room epoch; automatic source-end/tail semantics are not inferred.

## Validation successor and actual lifecycle

Final host `500e21b661710c7e` adds only exact profile-L admission and exact full-block/final-remainder packet length/alignment admission. The entire healthy transport process body and Worker render/publication suffix are unchanged92ce source, pinned by permanent checks:

- Transport process normalized-LF SHA256: `4af9f95dd3d2c041b0bb0d1ed4cf2b932f8d0da431ccca355bd6cb2b5cd15cfe`.
- Worker render/publication suffix SHA256: `5b46fe2ada348bad45aaee72822b6f9f17c8b0d5cdf9b74d86f091ade78c20e3`.

All3 numeric Wasm identities remain unchanged. Old artifacts/source are archived under `reports/modular_audio/room-live-92ce-baseline/`; their six-rate/reload evidence is not relabelled as a new-version rerun.

The final500e actual48k four-case recheck passes all8 Native comparisons, exact source/independence and full cleanup. Maximum absolute error2.9802322387695312e-8 / relative RMS1.483978217137335e-7: `room-live-500e-48000-final.json`.

Actual500e lifecycle passes three same-AudioContext rounds using source7a generations1,2,3 and monoLight/stereoFull/monoLight. Every source and both separate output streams match the independently prepared Rust program word-for-word; independent output comparisons are exact. This is explicitly `nativePcmAssessed:false`, separate from the Native matrix.

Between rounds,2 pairs of offroute probes remain at0 Worker/mix/capture frames. Both attempted third-owner reservations are refused. One probe is explicitly released; suspension retires the survivor, old start is refused, and resume obtains a new clock generation. All10 owners release transport resources and terminate their Worker before final context close: `reports/modular_audio/room-live-500e-lifecycle-final.json`.

## Review entry points and limits

`/tools/live-room-complete.html` provides four Native cases per rate, save, and actual document-reload replay. `/tools/live-room-complete-lifecycle.html` provides the three-generation/quota group.

The component supports prepared finite known-layout programs up to one hour, block sizes128..2048 in128-frame increments and immutable IR/control books. No mutable GUI amount, lazy IR transaction, automatic Native tail equivalence, shared hub, normal application selection, physical listening or device deadline acceptance is claimed.
