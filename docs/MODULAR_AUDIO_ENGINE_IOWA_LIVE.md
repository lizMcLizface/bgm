# Iowa owned live source adoption

This slice connects the existing owned Iowa preparation and Held/Decay/Roll kernels to the normal live player contract. `new IowaPlayer(context, { backend: 'owned-rust' })` and `IowaInstrument.create({ ..., sourceBackend: 'owned-rust' })` opt into the source. The default remains `native`. Executor choice is an environment option; no per-instrument backend setting is written into songs and no new settings-matching UI is required.

## Normal live signal path

Each owned player has a separate preparation Wasm instance, measured-table handles, prepared-bank cache, live voice Wasm memory and AudioWorklet. Raw source measurements feed the existing Rust table settling/interpolation/FFT implementation. The player's original settled JS table remains available only for range, original-recording A/B level metadata and existing finite-capture consumers; owned audible banks use the independent Rust raw-table handle, not JS model or FFT output.

The owned worklet replaces only the original mono source at `IowaPlayer.bus`. The original dry gain, wet gain, complete decoded room impulse, per-player native convolver, DynamicsCompressor limiter and master remain in their original order. Room, vibrato, patch loading, live note-on/off, scheduled note/until, ring, roll, tune and held-note slides use the same player methods. Existing default playback and native modules remain operational. Complete portable room/limiter ownership is a separate integration gate; no room truncation or limiter approximation is introduced here.

Preparation still happens before the source receives a bank. A key not yet warmed performs synchronous preparation on the main thread, as the original player does. Bank upload, validation and reclamation run in a control-message handler on the worklet thread. Those operations may allocate and may take time; the no-allocation claim applies to `process()` and its source render path, not to an arbitrary live upload deadline.

## Dynamic resource ownership and clocks

`calmbgm_iowa::live::Engine` wraps the unchanged original Rust voice kernels. It does not create a new signal algorithm or repeatedly rebuild a finite graph. The live ABI is a separate `synth-engine/iowa-live` crate. The existing immutable Graph configuration API is unchanged.

The dynamic store reproduces the original 96-entry FIFO Map, including eviction before setting an existing key. Active voices and future bookings retain their original immutable resource when that visible cache entry is evicted or replaced. There are at most 128 resident banks, 64 MiB of conservatively counted bank input data, 2,000 concurrently retained note descriptors/bookings and 32 original native voices. Exhaustion refuses the new resource/trigger and surfaces an error; it never silently changes sounds. Retired descriptor slots and unpinned evicted resources are reclaimed only while receiving subsequent control messages. More than 2,000 lifetime note IDs work because retired slots are reused.

Live `on` received before its requested `at` is booked with that fixed bank. Immediate `on` begins when received. At each canonical 128-frame callback, future bookings begin under the original strict `at < blockEnd` rule in insertion order. `until` uses the same original-seconds strict comparison. Immediate off acts only on an already active voice; it does not cancel a future booking. Ring and roll release behavior, oldest-voice stealing and per-instance voice RNG advancement retain the original algorithms.

`panic` clears active voices and future bookings and retains the original live seed. Explicit `cancel(owner)` removes only that owner's active/future voices. Reset clears voices/bookings, restores cold voice RNG and accepts a new canonical start clock, retaining prepared banks. Owners are nonzero uint32 for triggers; owner zero means all owners only for cancellation. Duplicate concurrent note IDs are rejected; the normal player allocates unique increasing IDs.

Process callbacks use monotonic canonical 128-frame blocks. A fresh live source can begin at any absolute canonical context frame. Native subgraphs can stop being pulled during setup/disconnection/suspension and resume later. Forward context-frame gaps preserve voice age, exactly as the original process-only voice advancement does, while bookings still compare against absolute context seconds. `contextSkippedFrames` records those gaps; no catch-up DSP is fabricated. Backward and noncanonical frames reject. Three explicit original-worklet phase regressions cover Held/Decay/Roll across those gaps. No additional source adapter delay is inserted. Prepared resources, controls, slot state, cache and RNG belong to each instance; immutable compiled code alone is shared. Render, cancellation and reset do not allocate, free or grow memory. Bank preparation, upload and reclamation are explicitly outside that claim.

## Host and persistence API

`OwnedIowaLive` provides `store(key, bank)`, `on(key, note, currentFrame)`, `off(id, owner)`, `cancel(owner)`, `reset()`, `render(frame)`, `stats()`, `refresh()` and `dispose()`. Direct host identities are validated before unsigned Wasm conversion. The worklet maps original string cache keys onto bounded numeric store identities and fails silent with a surfaced diagnostic if an owned resource/message contract is violated.

`IowaPlayer.sourceStatus()` reports the selected source, voice/preparation versions and surfaced worklet failure. The same native player's room/master graph remains available to existing host routing. `IowaPlayer.cancel(owner)` is an explicit owned extension; the native reference supports only its original whole-player panic.

`saveSetup()` captures complete raw loaded measurement tables, room amount, vibrato and sample rate. `IowaPlayer.restoreSetup(context, saved)` reconstructs independent preparation tables and a cold owned source. It revalidates tables, sample rate and bounded controls and refuses duplicate/oversized input. This is full resource/configuration cold persistence, not serialization of a currently sounding voice phase, undelivered browser messages or a song executor choice. Caller note/tune/room/master scheduling remains under the existing host contract.

## Verification

Production source `cace5db5ec4cb896` is 88,541 bytes. The allocation-audited build is `e596162e84565f89`, 91,654 bytes. Build provenance covers Rust voice/live sources, standalone ABI, owned adapter/worklet, actual player/instrument integration, preparation adapter/contracts and unchanged original native worklet/voice reference. Preparation remains the accepted `6e0c2bcde51edac3` build.

The all-patch source audit passes 270 cases: all 45 original Iowa/VSCO patches at 8/24/44.1/48/96/192 kHz. It compares complete raw-table Rust preparation and dynamic Rust playback against original JS table settling/preparation and actual original `iowa.worklet.js` receive/process bodies. Each case includes immediate on, live off, future at/until and dynamic same-key replacement while booked/active resources remain pinned. All final seeds and booking counts match. Across 11,134,080 frames, worst sample error is 1.1920928955078125e-7 and worst relative RMS is 1.591752083420979e-7, within the predeclared 1e-6 maximum / 1e-5 relative RMS bounds. No tolerance was widened.

The same 270 cases pass with the allocation-audited module: zero allocations or reclamations during every watched render and no callback memory growth. Maximum observed live playback Wasm memory was 4,980,736 bytes; dynamic bank upload is allowed to grow memory before the following callback, and the adapter refreshes views afterward.

Thirty-three focused kernel tests cover representative Held/Decay/Roll material at all six rates, FIFO eviction and pinned resources, same-key replacement, 32-voice stealing, original panic seed semantics, owner cancellation, over-2,000 lifetime IDs, independent instances, reset and raw/typed bounds. The matrix also includes the actual absent-noise-loop bass clarinet regression at all six rates. They pass on both production and audited Wasm. Four player tests verify the original native default/routing, normal live owned messages and actual Rust preparation, complete cold saved replay, independent resources and surfaced failures/disposal. The two existing instrument playback tests also pass.

The first broad audit refusal was a native-reference reconstruction error: an absent original noise loop (`null`) was reconstructed as a truthy empty Float32Array, making the reference produce NaN. Only the audit/test reconstruction was corrected. A second audit assertion incorrectly included an allowed bank-upload heap growth in the callback no-growth scope; it now measures each render itself. Neither required production DSP changes or relaxed bounds. Initial local failure evidence is retained under ignored reports.

Local evidence is `reports/modular_audio/iowa-live-compatibility.json` and `iowa-live-allocation.json`. Maintained commands:

```text
node tools/buildIowaLive.mjs --publish
node tools/buildIowaLive.mjs --publish --check
node tools/buildIowaLive.mjs --audit
npm.cmd exec -- vitest run src/modular-audio/ownedIowaLive.test.js src/app/engine/iowaModel/playerOwned.test.js src/app/engine/iowaInstrumentPlayback.test.js
npm.cmd exec -- vite-node tools/auditIowaLive.mjs
npm.cmd exec -- vite-node tools/auditIowaLive.mjs --allocation
node tools/buildIowaLiveReference.mjs --check
```

For audited permanent tests set `IOWA_LIVE_WASM=.tmp/iowa-live-audit/iowa.wasm` before the kernel test command. Audit reports are local and ignored; no generated evidence is a checkout dependency.

## Actual browser gate and remaining work

`tools/iowa-live.html` has two fixed batches and complete read-only `#report` JSON. The native full-path batch compares all three source families at six rates, three independent normal players including a complete saved cold reconstruction, mono source and both full room/limiter channels. It retains the complete original IR and compares a declared two-second output window; it does not claim that the whole room tail has drained in that window.

The separate live batch uses the real normal player and AudioContext with live MessagePort bank/on/off/panic commands. It suspends the context at control barriers so both sources receive commands on an equal canonical frame, then captures continuous output between those barriers. The native receipt-only worklet wrapper is generated from unchanged original source, with only import/registration and non-DSP acknowledgements added; its source/voice hashes are checked. Receipt frames and voice RNG snapshots are compared independently from PCM.

The first actual browser batch passes all 18 native full-path cases on the pre-gap-fix artifact. The real MessagePort batch exposed an overly strict absolute-clock continuity guard after an unpulled/suspended subgraph resumed. That wrapper guard was corrected to the original callback semantics described above; no Held/Decay/Roll signal math changed. Failure evidence remains retained. Final actual live MessagePort acceptance passes all three families on `cace5db5ec4cb896`. Actual source maximum error is 4.470348358154297e-8 and relative RMS 4.259419826735743e-8; full stereo native room/limiter maximum error is 5.960464477539063e-8 and relative RMS 5.5511138863803734e-8. On/off/panic receipt frames, control acknowledgements and source RNG snapshots all match. Complete room impulses remain preserved. Evidence: `reports/modular_audio/iowa-live-ports-browser.json`; the first clock-guard failure is retained separately. The 18-case offline native batch is being refreshed on the final artifact before the parent commit. The live control-barrier batch is a functional real MessagePort test, not an unsuspended live upload/jitter/headroom guarantee. Normal defaults remain native until the assembled host/worker room path and target-device deadlines have their own evidence.

Next integrate this constructor-level source option into one coherent host engine choice, then attach the independent long-IR worker room stage with explicit transport delay, owner/lifetime policy and full original IR. Preserve the complete native path as the existing default while deadline evidence is collected. Hidden cello Long/Live/Short/Pizzicato instruments are explicitly outside this adoption task.

Final artifact browser replay: all18native full-player cases pass with the
callback-gap-aware cace5db5ec4cb896 source. Actual3live MessagePort cases also
pass. Full local records: iowa-live-native-browser-final.json and
iowa-live-ports-browser.json under ignored reports/modular_audio/.
