# Native context clock and separate Width/Ring host

The original active Width/Ring failure is a host-clock boundary. Under actual
Native graph churn, independent original BufferSource and separately booked
AudioParam integer markers both reported frame61440 while the failing active
Width and Ring callbacks reported global currentFrame61056. The original input,
control stamps and failure state are retained in
`reports/modular_audio/wr-native-graph-churn-lag-proved-first.json`.

Pinned Chromium source explains that boundary: destination rendering advances
its sample counter before updating the worklet global, and the latter update
uses a graph try-lock and can be skipped. Native AudioParam evaluation uses the
destination counter. No audio frame is moved to compensate for the old global.
The invalid64second diagnostic fixture is retained separately; it missed its
booked epoch during preparation and supplies no valid clock evidence.

## New bounded authority

Source7a0838a735108706 is an opt-in host metadata component. A same-rate Native
BufferSource loops exactly8seconds of integer values1..periodFrames. A Native
ConstantSource supplies coarse8second cycle units using intrinsic sentinel-7,
then two authored events:0 at the epoch and a linear ramp to2^17 at epoch+2^20
seconds. Those are three bounded offset operations; there is no growing curve
or periodic scheduling list. The largest loop is6,144,000bytes at192k.

The decoder validates every one of128low words as an integer, recovers a unique
coarse integer code within the fixed1/32cycle envelope, and requires the whole
vector to be consecutive and its first absolute frame canonical. It does not
fit an epoch to audio, round a measured PCM phase, shift controls or substitute
zeros for active processing. The envelope covers Float32 coarse quantization
and bounded intraquantum interpolation error; it is strictly below half a cycle.
The finite generation horizon is2^20seconds. A continuously pulled independent
anchor requires a contiguous ledger; consumer ledgers may explicitly skip pulls.

Live suspension/interruption retires a generation and notifies its consumers.
Offroute preparation is required before reuse; live resume is not yet accepted.
The separately selected `offline-freeze-v1` policy allows an Offline context's
wall-time pauses while Native time remains frozen. Normal completed Offline
closure retires authority cleanly and permits owner stats/disposal. It does not
permit further control mutation. Sources, links, ports and acknowledgements have
bounded ownership and aggregate unexpected cleanup errors.

The existing HostRenderClock, DSP kernels, active publication checks and normal
prepared environment remain unchanged. The new Width/Ring processor binds typed
clock specifications; cold epoch0/generation1 is available synchronously before
Offline callbacks. Unbound or prestart clocks can wait at most64callbacks only
with literal dormant demand and disconnected input. Active missing/invalid
clock codes fail and release the owner. Raw global frames remain diagnostics.

## Accepted evidence and next gate

The source/decoder/controller has42permanent checks. The generated clocked rack
and factory add22checks, including six-rate real-Wasm controls already due384
frames ahead of the stale first global frame, independent owners, generation
replacement, atomic preflight refusal and visible cleanup failures.

The actual source page passes six rates8/24/44.1/48/96/192k through the8second
wrap, including the inside-quantum44.1k wrap. A separately pulled original
Native absolute counter agrees with every measured decoded frame exactly.
Each case includes a1024frame consumer pull gap, four frozen wall-time pauses,
normal export completion and cleanup. No decoded frame error is permitted.
Evidence: `native-context-clock-7a08-six-rate-first.json` under ignored reports.

Separate Width/Ring host7610ae037007682f uses the unchanged numeric kernel
3eccb77c7e28803e. All72actual Native whole-extra/ordered-rack cases pass across
those six rates, including mono/stereo, bypass, output gaps and both rack
orders. Every Native PCM and independent-owner comparison has maximum error0.
The48k cold replay restores identical identities, settings and PCM hashes.
Evidence: `native-clocked-rack-7610-{rate}-final.json` and
`native-clocked-rack-7610-cold-final.json` under ignored reports.

Build/check: `node tools/buildNativeContextClock.mjs --check` and
`node tools/buildNativeClockedRack.mjs --check`. The latter binds the exact
source-clock identity, preserved facades, transport, processor and numeric Wasm.
Review: `tools/native-clocked-rack.html`. This checkpoint accepts the listed
component and Offline cases. Actual live graph-churn repair, normal All/reload
adoption and live suspension/device changes remain separate gates. No default
backend selection is changed by these files.
