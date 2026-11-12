# Complete cold offline Room

The new leaf combines the existing owned RoomColour and long-IR convolution with the original Room dry/wet gain law in a separate Rust state. No app environment or default selects it.

| Component | Current identity |
| --- | --- |
| Complete cold host | `be3bdf1dc8315dd8` |
| New gain/mix kernel | `c7b4ee0c1094a319` |
| RoomColour | `7725ec44e5572cf0` |
| Long-capable convolution | `c5dbde0540bfdf83` |
| Sampled-IR preparation used by review | `8b2f1b053b33184e` |

The normal mix Wasm remains byte-identical to first-tested `52b8820b53cd4757`: SHA256 `5dacd43ff02ca8e9fac04a5a24b2fa3b536f3ec7e561186acd61dc6a75a0426d`. The successor adds audit provenance and a padded-program preflight; its DSP is unchanged.

## Signal and control contract

`OwnedOfflineRoomComplete` composes `OwnedRoomConvolver` with `OwnedRoomCompleteMix`. Dry input is copied before colour. Full uses matching colour/convolver channel layouts. Light stereo applies the existing explicit speaker downmix after stereo colour and before mono convolution; its dry branch retains stereo. Light mono passes through the matching mono route. A mono branch duplicates to stereo only when the combined output requires it.

The new Rust mix stores two independent captured `setValueAtTime` clocks for every amount call. For `v<.5`, dry is1and wet is2v; otherwise dry is `1-((v-.5)*2)` and wet is1. Targets narrow to Float32, each branch multiplication rounds to Float32, then dry and wet are added in that order. It uses an exact pinned copy of the accepted Native timeline, only its prepared step-event subset. There is no smoothing substitution or coupled clock. Original seconds remain in the immutable spec, including floating frame products such as13/44100.

Amount is bounded0..1, each lane holds at most255captured calls plus its constructor event, and captured seconds/program frames are bounded to one hour. The final padded128-frame callback must also fit that bound; a44100Hz unpadded exact hour is refused before creation. `reset` restores the entire captured program. Instances, memories and state are independent.

Adapter latency is0. User pre-delay and convolution response timing remain audible wet-path behavior; dry is not delayed to invent alignment.

## Cold host and ownership

`createOfflineRoomComplete(context,spec)` accepts only a suspended, unstarted OfflineAudioContext at time0, and rechecks after asynchronous preparation. Input must be a known-layout bus continuously present through the complete render budget, including explicit zero padding. Absent/ended input, live context clocks, automatic demand, IR replacement and unbounded GUI edits are outside this leaf.

The host has a two-owner quota per context. Typed receipts bind the host, all three component versions, execution profile, expected frame budget and operation. Creation/registration have bounded10second receipts; up to16control requests use non-wrapping u32 identities and5second receipts. Disposal closes logically in the caller's turn and releases quota only after a valid all-owner ACK or authoritative context completion. Timeout retains a quarantined marker until context closure, while all other cleanup still runs. A terminal DSP failure publishes zeros and frees every component; diagnostic reads do not prevent release.

The review uses the actual original Reverb class and its RoomColour/Gain methods. Only asynchronous `ensureImpulse` loading is replaced with an identical immutable READY resource before rendering. It pins the original Reverb and Gain source hashes, selects the literal Full/Light convolver input policy, uses the original decoded reverb4 FLAC trim/mono/decay transformations and Native normalization, and retains both original amount-setter time reads. Rust performs the owned IR transforms/normalization; decoding/resampling remains the disclosed Native preparation boundary.

## Evidence and limits

The first desktop48khost `353355103f29515c` passed Full mono/stereo and Light mono/stereo: four cases/eight Native comparisons in `room-complete-3533-48000-first.json`. Maximum absolute error2.9802322387695312e-8 and relative RMS1.650707211331471e-7, within the unchanged prospective1e-4bounds. All four independent owned comparisons were exactly0. Full retains144000stereo IR frames; Light retains96000mono frames. Every owner retains12captured gain-lane events and the21original Native clock reads are chronological. Sources and normalization match. The completed context releases all eight facade nodes; this is context authority, not a claim that a live disposal ACK was observed.

Forty-six focused checks cover six rates, four source/wet layouts, irregular render partitions, independent clocks, real long IR, immutable snapshot/reset, all-kernel overflow cleanup, bundled callback behavior, cold recheck/quota/retry/typed ACK/quarantine, reference control chronology and exact cold-scene authority.

The private Rust mix audit (`room-complete-mix-allocation.json`) runs24rate/layout cases,196608callbacks and25165824frames, with510captured lane events, resets and post-preparation mutation refusals. It measures zero Rust allocation/reallocation/free/memory growth after preparation. This proof covers only the new mix kernel. It does not measure complete-host/JS/Native heaps or callback/device deadlines; the existing composite wrappers create views during processing.

The final successor`be3bdf1dc8315dd8` passed all24cases/48Native comparisons across8/24/44.1/48/96/192k (`room-complete-be3b-{rate}-final.json`). Maximum absolute error is4.470348358154297e-8and relative RMS2.0720487233463283e-7; all24independent owned comparisons are exactly0. Full IR frames range24000–576000(stereo), Light16000–384000(mono), including lengths above the old short-IR limit. Every owner reaches the full padded program budget, remains error-free and releases its facade node.

A real full-document192kreload passes exact replay of all four fixtures, source/component/resource identities, separate control epochs and both owned PCM hash pairs (`room-complete-be3b-cold-replay-final.json`). Native comparisons keep their original numerical bounds.

The actual48kcold-control gate also passes (`room-complete-be3b-cold-quota-final.json`). Its first two owners and reused replacement all return valid all-three-kernel disposal ACKs while the context is still suspended at time0, with no DSP calls/frames. Quota refuses the third owner before reuse, logical close precedes ACK, repeated disposal returns the same promise, and the sibling remains untouched. A separately primed owner also returns its ACK before the cached-preparation/startRendering race; that race observes suspended0→running0, refuses late construction, and completes the context. These pre-render ACK receipts are distinct from the numerical matrix's completed-context release authority.

The component is accepted for this explicit cold offline contract. Normal app/Graph adoption, live clocks/demand, mutable IR/UI automation and physical callback deadlines remain separate work. No existing default or accepted kernel was changed.
