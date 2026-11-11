# Owned live rack plugin family

Crusher, Pitch and ZPlane can now use their existing accepted owned Rust kernels
inside the original rack host. This is an optional prepared node factory. The
native JavaScript worklets remain the default and their source is unchanged.

## Boundary and API

`prepareOwnedRackPlugins(context, {assets})` verifies the published rack kernel
and matching host manifest, then registers the bundled worklet in that context.
It returns `pluginFactory(context, {kind, shapes, custom, onError})`, creating the actual
AudioWorkletNode. Pass it as `createRack(context, values, {pluginFactory})` or
`createExtraStage(context, kind, {pluginFactory, onError, initialPacket})`. Only Crusher, Pitch
and ZPlane use this hook; other units keep their existing builders. The returned
factory can prepare another context with `factory.prepareContext(context)`.
Normal environment/Classic rack selection remains separate parent integration.

The processor exposes the original parameterDescriptors without renaming,
changing bounds, or changing k-rate automation. Browser AudioParams remain the
control clock and Float32 quantization authority. Each canonical 128-frame
callback samples those native k-rate values once and passes them directly to
Rust, copies stereo input and returns that same callback's Rust output. There
is no new block delay and no JavaScript DSP substitute. Pitch retains its
original intentional dual-head variable wet delay and undelayed dry component;
this is not a new constant-latency or automatic PDC contract.

The existing extras.js builder owns all control projection: Crusher bits/divide
and Pitch semitones/cents step immediately; ZPlane a/b selectors step
immediately; mix/morph/shift/q use the existing 20ms target smoothing. The
existing wrapper still owns the two native through/wet gains, their bypass
crossfade and wiring. The rack still owns stage order, master dry/wet routing,
rewire behavior and tails. Source input leases remain upstream host authority.

ZPlane requires a complete nonempty bank (1..64 shapes, twelve valid rows each)
at both factory and raw processor boundaries; omission or malformed resources
reject instead of implying the original raw empty-bank semantics. createRack
captures the current initialPacket custom A/B rows before node creation; the
factory requires those complete rows for ZPlane. Direct owned stage callers
also supply initialPacket. The processor refuses selection of an unprepared
custom bank until complete captured rows or a valid complete custom message
exists; it does not claim raw null-custom and neutral-custom equivalence.
The existing builder always supplies the original built-in shape bank and complete custom A/B rows
from the original builder. Custom messages are checked as exactly two sides,
each twelve finite triples with the accepted frequency/bandwidth/boost bounds.
Row publication invalidates the original coefficient cache without resetting
filter history. The existing rack clear() intentionally does not reset these
three plugins: its historical no-op is preserved, including Pitch ring/tap
history. OwnedRackFx's standalone reset/clear methods are separate APIs and are
not silently substituted for rack clear().

## Lifecycle and resources

Each node owns a fresh Wasm instance/memory and one owned engine. Preparation
returns the actual node without waiting for an offline context to render; its
ownedReady promise and runtime errors track processor health. Registration
failures can retry. The existing rack reports asynchronous errors through its
onError callback and disposes a plugin that finishes preparation after the rack
has already closed. Wrapper construction also rolls back the prepared inner
processor and every partially created gain if allocation/connection fails;
disposal is idempotent, and an injected second-gain failure proves reclamation.
Host requests are bounded to 32, with a ten-second response
timeout. disposeOwned() rejects pending requests, disconnects the node and
waits for a processor acknowledgement, with a one-second shutdown fallback.
The original native stop message remains supported; an unsolicited stop ACK
closes pending requests and completes disposal rather than leaving timers alive. Native default disposal
continues to post its original stop message.

The port accepts only lifecycle/stats and complete ZPlane custom updates. Render
requires two output channels, 128 frames and finite one-value k-rate parameter
snapshots. Nonfinite output causes an explicit terminal error, not clipping or
an automatic native fallback. This changes invalid input handling, not normal
sound. JavaScript queues, validation and scope/report allocation are not covered
by the Rust zero-allocation claim.

## Evidence

The accepted numeric kernel remains public/modular-audio/rack-fx.wasm,
version 3346ad1568b8b456, 71,436 bytes, SHA
6f78ce5a26ebabc1030057f59c4f31a4d2a229972e16aad89c599f9ebc2bbe4a.
No Rust kernel, shared Graph implementation or native reference processor was
changed for this host bridge. Original public/rack-fx-processor.js file SHA is
259a75b8dff44f9b53a304930fd2f460c6fbbad850d09af4aeed9f46f190b296.
tools/buildOwnedRackPlugins.mjs records the full
host/wrapper/shape source dependency list in rack-live-build.json; its check is
separate from the existing rack kernel build/check. Final candidate host version
is 106c5308d6d8bab1.

49 focused tests across six files pass. Eighteen actual original-JS/owned-Rust
processor comparisons cover six rates (8/24/44.1/48/96/192 kHz), changing k-rate
values, all built-in/custom selections, custom updates, silence, strict unprepared-resource refusal and stop.
Parameter descriptors match the actual old worklet definitions. Other tests
cover strict raw packets, independent memories, registration retry, context
ownership, request bounds, native default loading, original 20ms/immediate
parameter projection, bypass, custom-message deduplication, clear and disposal.
The declared comparison limits are max absolute and relative RMS error below
1e-6; no fitted normalization, output shift or tolerance adjustment is used.

The maintained tools/auditRackPlugins.mjs exercises the actual new worklet
process path against a private audited Wasm build. Eighteen cases each run two
independent instances for 320 callbacks (40,960 frames, past the complete Pitch ring wrap), including input copying, live k-rate
updates and custom row messages. Largest per-instance audited memory is
1,441,792 bytes (2,883,584 bytes for the two-instance pair). Rust allocation/reclamation calls are zero,
Wasm memory does not grow, and both independent outputs remain exactly equal. The same callback audit also
compares the actual original JavaScript processors throughout those ring wraps,
under the same fixed max-absolute/relative-RMS limits.
This is not a JavaScript allocation, CPU deadline, device underrun or physical
listening claim.

The fixed tools/rack-plugins.html page compares actual original/owned stages
with native AudioParams, two simultaneous owned instances, bypass/return,
custom changes and the historical clear behavior. It also saves complete
custom ZPlane packets/control changes for real page reload and compares the
actual ordered createRack chain. Actual browser acceptance at host 106c5308d6d8bab1 passes all eighteen cases.
Sixteen original/owned comparisons are exact zero. ZPlane96k differs by at most
1.4210854715202004e-14, and ZPlane192k by at most 1.1641532182693481e-10; largest
relative RMS is 3.0600129993854776e-12, below the unchanged 1e-6 limits. Both
simultaneous owned outputs are exact across every case. The real HTML reload
replays the saved custom ZPlane48k scene exactly, with PCM SHA
fb67170560fe0e7c01410f6d2135358181e6411ad288237796eda387c30d8373.
The actual ordered three-plugin createRack chain is exact zero against native,
with nonzero peak 0.18833863735198975. Physical listening is not assessed.

The first browser report is retained as a failed fixture run: Crusher/Pitch8k
were exact, then the second independent owned ZPlane stage correctly refused
an omitted initial custom packet. The fixture now supplies the same captured
packet to both owned nodes and tracks each created stage immediately for
rollback. No DSP, reference output or tolerance changed. Local evidence files
are rack-plugins-first.json, rack-plugins-final.json,
rack-plugins-reload-final.json and rack-plugins-route-final.json.
