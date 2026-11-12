# Explicit Ambience source topology

This separate, opt-in profile owns known source-channel transitions and downstream control demand. Normal Ambience and its Native defaults are unchanged. It depends on the accepted spatial/session/source kernels without editing their source files or manifests.

The actual grouped desktop review passed all six cases at 48000 Hz: connected silence before the first source; last-source stop and restart; idle shape edits before restart; the prior Brownian and Sine six-layer sessions; and the shared-bank retirement/slot-reuse scenario. All endpoint wet and aggregate samples were bit-exact Native. Both prior six-layer wet outputs were bit-exact, with aggregate maximum error 7.450580596923828e-9; the prior bank composition remained bit-exact throughout. Every owner cleaned up without error. The unchanged full-audio bound is 1e-7. Evidence remains local in `reports/modular_audio/ambience-topology-a4c21-first.json`.

The browser-tested receipt is `a4c21add46962fb3`. Receipt-only successor `8a2063d30442e67d` adds explicit original-module, Native basis and preparation-input hashes. Both have exactly the same 234945-byte Wasm, SHA256 `343374ed990d85f9ade82526ba7d152f3bdbbe110a571bebfc8888a5adc1aa1b`, and processor SHA256 `48d0373ce2484a694d2d7e9ccbe00f0cf8d24c24344fa39dcef097d2eec69551`. The old receipt, assets and source proof are archived separately; the metadata successor is not described as a new browser run.

## Source-derived policy

Pinned Blink `AudioHandler::ProcessIfNecessary` pulls inputs before its silence decision and may process AudioParams during silent input. A connected Gain can therefore pull its LFO without an incoming source. `AudioNodeInput` gives an empty max-channel input one channel, while a connected normal stereo source supplies two. `BiquadFilterHandler::CheckNumberOfChannelsForInput` reinitializes its filter kernels when that known channel count changes. The source references are the existing attributed spatial profile plus `reports/scripts/pinned/audio_handler.cc`, `audio_node_input.cc`, `tape-native-gain_handler.cc`, `tape-live-biquad_filter_handler.cc` and `tape-native-audio_node_wiring.cc`.

This profile declares the following ownership rules:

- Constructed, downstream-demanded layers advance downstream panner, level and drift controls during connected silence.
- A constructed layer with no source yet retains its initial filter and width demand. After its final authored source connection is removed, those filter and width clocks stop; downstream controls remain demanded.
- Known input-channel transitions between empty mono and connected stereo clear only that layer's three filter histories. Retained AudioParam and LFO state is preserved. Repeating the same channel count does not reset anything.
- Complete output disconnection stops that bed's pull-dependent processing and its subscribed bank cursors. Independent beds in the same context keep advancing.
- Source owner cancellation, channel transitions and the new activity mask publish in one prevalidated audio-thread transaction. Physical bank cursor reuse still waits for the accepted spatial cancellation and reader-free acknowledgements.

These are explicit owned topology rules, not a reconstruction of every Native deferred output-disable flag. A scheduled source stop by itself is not treated as a channel change. No PCM threshold, inferred silent timestamp, output shift or tail trimming is used. Native filtered-endpoint scheduler alternatives and Float32 fan-in order remain separate limitations. The old unchanged-session endpoint failures remain recorded in `ambience-endpoints-before-first.json`.

## Implementation and bounds

The new crate mechanically generates the accepted spatial Rust modules into Cargo's temporary output directory. Its build verifies every generated module and all three Native basis resources. The only allowed changes are a dedicated width-demand mask, guards for those four width parameter lanes, a lease reset for that mask and the appended channel-transition ABI. All coefficient and audio algorithms retain their accepted source. No copied DSP tree is tracked.

`prepareAmbienceSpatialTopologyPool(context)` requires a virgin suspended live context; it does not resume a context or allocate the first arena on an active audio thread. The accepted bounded startup transaction, deadlines, quarantine and context ownership are reused. `createAmbienceSpatialTopologySession(pool, options)` adds explicit demand/channel publication to the accepted session. `createAmbienceTopologyBankSource(options)` subscribes only its own cursor to that demand and retains the accepted retirement fence. Await asynchronous preparation and connection before booking playback.

Existing limits remain: six layers, nineteen source inputs (three weather plus sixteen loop cursors), at most nineteen demand subscribers, sixty-four serialized session bookings, bounded walk/history resources and the existing two-credit resource upload protocol. Walk refill remains explicit; normal automatic fifteen-second scheduling and application adoption are not part of this checkpoint. Session descriptions are diagnostics, not a mid-render DSP checkpoint.

Seven focused permanent tests cover all six rates against unchanged accepted rendering, LP reset isolation, empty-chain control clocks, invalid transaction atomicity, independent width clock demand, two-bed bank-cursor pull isolation, and actual startup constructor rollback. The allocation audit publishes phase/walk resources, performs 1000 quanta and 25 attach/cancel cycles, edits idle controls and resets a lease: zero Rust allocations, frees or memory growth occur after cold creation. Host JS messages/views still allocate within declared protocol bounds; no real-time deadline is claimed.

Build and verification:

```text
node tools/buildAmbienceSpatialTopology.mjs --publish
node tools/buildAmbienceSpatialTopology.mjs --publish --check
node tools/auditAmbienceSpatialTopology.mjs
npm.cmd exec vitest run src/modular-audio/ambienceSpatialTopology.test.js
```

The grouped review is `/tools/ambience-spatial-topology.html?review=topology-v1`. Common build registration and prepared-environment adoption belong to the parent integration checkpoint.
