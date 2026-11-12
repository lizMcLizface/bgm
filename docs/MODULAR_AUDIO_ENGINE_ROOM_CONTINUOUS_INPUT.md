# Continuous-input private Room

This profile accepts actual AudioWorklet input without a finite source PCM plan or a final length at construction or start. It composes the unchanged framed RoomColour, long convolver and prepared output-gain Rust modules in a dedicated Worker with split dry/wet returns. Existing Room hosts, Native defaults, Instrument/Graph routing and shared Room remain unchanged.

## Identity and acceptance

Current host: **55794c7d73868593**, in `public/room-continuous-live/`. Its numerical and lifecycle authority is the archived **4a3e4d164d7e1e7b** host, followed by two narrow preflight guards.

Unchanged numerical components:

| Component | Version |
| --- | --- |
| Prepared output gains | e323611d27ec3a36 |
| Framed RoomColour | 7725ec44e5572cf0 |
| Convolution | c5dbde0540bfdf83 |
| Native source clock | 7a0838a735108706 |

The actual desktop six-rate matrix passes **24 cases / 48 original Native comparisons** at 8, 24, 44.1, 48, 96 and 192 kHz. It covers Full/Light, mono/stereo, with two independent owners per case. Maximum absolute error is **2.9802322387695312e-8**; maximum relative RMS is **2.5307022571467844e-7**. Existing `1e-4` bounds are unchanged. Captured input and independent live outputs are whole-stream Float32-word exact. There is no fitted alignment or PCM normalization.

All final packets are partial. Every Worker seal, returned frontier and output frontier equals the admitted final frame; all credits recycle, with no underruns or rejected packets. All 48 owners have a clean typed transport release, clock release and positive Worker termination before context closure.

Reports are `room-continuous-4a3e-{rate}-final.json`, with independently asserted `room-continuous-4a3e-six-rate-summary.json`. The numerical fixture admits END after start/arm but while the capture frontier is still zero. The stronger live proof below covers admission after actual audio has advanced.

## Open input and lifecycle proof

The actual 48 kHz lifecycle passes three reused-context clock generations, 1/2/3. Each stream remains unsealed with END=null while actual input reaches 6272/5760/5760 frames and its Worker has processed 4096 frames. At approximately 0.12 source seconds, only then is the final boundary selected and admitted at 19328/19456/19328 frames.

Captured input, separately rendered Rust reference and both live outputs are bit exact, including zero output after the explicit drain. Both gaps prove real third-owner quota refusal, zero source/audio/parameter DSP while offroute, terminal live suspension, stale-start refusal and fresh preparation. All ten owners have clean terminal ACKs, clock release and positive Worker termination. See `room-continuous-4a3e-lifecycle-final.json` and its independently asserted summary.

A true HTML reload at 192 kHz also passes. All 19 saved authority fields agree, including immutable colour, complete IR/source settings and hashes, identities, declared source clock, exact absolute event times, and both independent PCM hashes. Both save and replay have clean release before context closure. See `room-continuous-4a3e-192000-cold-{save,replay}.json` and `room-continuous-4a3e-cold-summary.json`. This is cold reconstruction, not a saved FFT/ring/queue state.

## Guard-only successor

The current host adds only:

1. Arm must fit the entire declared session plus L inside Source7a's expiry frame. An endpoint exactly at expiry is legal; a later one is refused before epoch/running/source/DSP mutation.
2. The convenience factory refuses invalid block size, pool capacity or session cap before reading, serializing or copying IR samples.

The complete generated processor is byte identical to 4a3e after removing the one expiry condition and identity strings. The shared validator/geometry and all capture, render, return, seal, drain and recycle bodies are identical. The Worker is byte identical, SHA256 `baaf174371cfa477683453c10cb3f7633ad1c7ca4b7bb1368b86b61316c5cace`. All numerical Wasms remain byte identical. Proof and archived source/artifacts are retained in `room-continuous-5579-valid-body-proof.json` and `room-continuous-4a3e-before-preflights/`.

Current-host actual 48 kHz recheck passes all four cases / eight Native comparisons. Maximum absolute error is 2.2351741790771484e-8; maximum relative RMS is 1.6432316751589762e-7. Every captured input and independent output is whole-word exact; all final partial packets, seals, drain/recycling and clean typed release checks pass. Receipt: room-continuous-5579-48000-final.json, independently checked in room-continuous-5579-48000-summary.json. No broader numerical behavior is changed or newly claimed.

## Contract and fixed resources

`roomContinuousSpec(room,{blockFrames,maxSessionFrames})` requires immutable READY IR and immutable colour: one full-audio activity entry at source frame zero, with no later colour events. Source layout is one or two channels. Full preserves its original routing; Light explicitly preserves post-colour speaker stereo-to-mono conversion. Long IR is bounded at 2,097,152 samples per channel, with the same 8–192 kHz rate.

The canonical source-relative cap is `floor(sampleRate*3600/128)*128`, or a smaller caller-specified cap. This comes from the unchanged RoomColour v3 kernel. It is a bounded continuous session, not indefinite service. Reaching the cap without an admitted END retires terminally; there is no hidden reset or synthetic completion.

For canonical B from 128 to 2048 frames:

- One final latency is `L=max(2B,ceil(sampleRate*.5/128)*128)`, once on both branches.
- Pool credits are `P=ceil(L/B)+4`; P must be at most 192 before PCM allocation. High-rate/B128 is refused.
- Combined transferred PCM storage is exactly `P*(inputChannels+wetChannels)*B*4` bytes, with at most four planes. Dry-input and wet-return budgets are separately reported.
- Full stereo/B2048 uses 524,288 bytes at 48 kHz and 1,671,168 bytes at 192 kHz. These are the same buffers moving through input, Worker, output and recycling, not separate full-size input/output pools.

IR/FFT memory, Rust working buffers, Native graph storage and JavaScript metadata are separate. The nested reused composition's source-local frame book describes DSP initialization; it contains neither incoming source PCM nor a fixed duration.

## Input authority, tails and drain

Creation prepares Worker colour/convolution and output-thread gains/transport. Physical upstream input is isolated until positive control/clock readiness and an acknowledged future `start({startFrame,inputState})`. Initial authority is explicitly audio or silent; audio is the default.

`admitInputState({sourceFrame,state})` admits at most 32 pending, ordered, future canonical changes. Audio requires the actual exact known channel layout; missing declared audio is terminal. Silent supplies caller-declared zero padding while all colour/convolution stages keep processing. There is no zero-PCM scan, missing-channel inference, Native AudioBus flag inference or guessed sleep/tail cutoff. The caller must accurately describe its source.

The final source frame is absent until `endAt({sourceFrame})` is admitted, at least one quantum beyond the current capture frontier. The caller includes its chosen silent/tail budget. The last packet can be shorter than B but remains 128-frame aligned. It carries final:true, then typed END travels over the same ordered PCM port. Worker verifies the contiguous final frontier before sealing.

Worker processed/sealed is distinct from audible output drain. `completed` resolves only after all N frames have been emitted at the declared L, the Worker seal has arrived, every packet has returned and every buffer has recycled. Input-ended, processed and drained receipts remain separate. END and session completion have bounded deadlines.

Suspension, route retirement and disposal require reprepare. There is no transparent live pause/freeze/resume or arbitrary hot insertion. The caller owns source start/end; the adapter disconnects its input edge after its end receipt, but does not promise sample-exact upstream cursor preservation after terminal source completion.

## Controls and ownership

Prepared amount controls retain 16 opaque owner-bound tickets, Rust lane reservations, positive cancellation and the original independent dry/wet currentTime reads. Parent state should mutate only after prepareAmount/preflightAmount succeeds, then commitAmount. Events retain absolute Native output time; L and source epoch are never added to their authored seconds. Explicit complete future pairs are a separate supported path.

Two-owner context quota, typed identity/operation receipts, terminal transport ACKs, positive Worker termination and clock-link release are required for clean release. Unproven release remains quarantined until authoritative release or context closure. Aggregate cleanup attempts every owner and preserves primary and cleanup errors.

The implementation allocates JavaScript packet objects/views and copies PCM. The inherited prepared-gain metadata interface exposes 643 descriptors. Fixed PCM capacity and unchanged Rust render allocation behavior do not establish zero JavaScript heap activity, device deadlines, hour-long stability or multi-node phone headroom.

## Permanent checks and review entry points

42 focused checks pass:

- 27 streaming checks: real transferable Worker data, long stereo IR, exact dry/wet words, all layouts, explicit silent tails, partial END, recycling, source/control deadlines, invalid packets/layouts, missing input, underrun and cap failure, initial silence, six-rate reuse, pre-copy capacity refusal and clock expiry.
- Nine facade checks: ready/arm isolation, open completion, rate/offline refusal, quota/quarantine, constructor failure, retirement/disposal race, recoverable source deadline and bounded missing drain.
- Six review UI checks: actual button bindings, retained pre-audio error reports, saved-authority comparison and missing/changed cold-scene refusal.

`node tools/verifyRoomContinuous.mjs` separately checks 24 owned-only six-rate/layout streams across repeated pool reuse: **1,983,744 Float32 words exact**, with all partial END, seal/drain and credit checks. This is not Native acceptance.

`node tools/buildRoomContinuousHost.mjs --publish --check` validates normalized source, generated processor/Worker/notices and all numerical dependency hashes.

Muted desktop pages:

- `tools/room-continuous.html`: grouped original Native comparison.
- `tools/room-continuous-lifecycle.html`: genuinely open input, later END selection, three generations and quota.
- `tools/room-continuous-cold.html`: fixed absolute-clock scene save and actual HTML reload replay.

The initial review binding-name failure is preserved as `room-continuous-4a3e-harness-first-negative.json`; it ran no numerical case. No page selects this profile for normal application routing. Mutable colour/IR, shared Hub, normal factories, automatic Native tail policy and arbitrary live demand changes remain separate work.
