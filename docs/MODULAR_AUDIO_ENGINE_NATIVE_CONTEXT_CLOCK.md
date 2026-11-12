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


## Actual live repair and explicit retirement

Source7a0838a735108706 with new clocked host56288c0e8825363b passed the complete live graph-churn, loop and retirement gate. The first live7610 run already proved exact frame/control repair but retained a separate disposal race; its failed receipt remains unchanged. The new host uses a typed clock-retired notification so an intentional generation failure does not reject a separately pending disposal acknowledgement. Generic DSP/protocol failures remain strict. No Rust DSP or source7a bytes changed for this follow-up.

In the accepted live run, an independent original Native counter matched280,576 decoded samples with maximum error exactly0 and one8second loop wrap. At the recorded witness, global raw frame156544 lagged decoded frame157056 by512; the counter samples and all decoded128frame words agreed exactly. Actual Width acknowledged28/28 commands and Ring21/21, both with0 rejected commands and observed native-clock lag512. They processed374912/374400 frames respectively. Original setter seconds/products were retained; no target was clamped, audio frame moved or active output replaced by silence.

Intentional live suspension then retired generation1 and explicitly notified its consumers. All affected owners disposed with their acknowledgements and no unexpected cleanup error. Those expected retirement notifications are recorded separately from unexpected errors, whose array is empty. The retired authority refused reuse. After resume, a new offroute generation2 at epoch480000 produced a fresh actual Ring with peak0.15339599549770355,3/3 commands,0 rejections and successful disposal. This is accepted generation replacement after explicit retirement; it is not transparent continuation of the old live rack through suspend/resume. Full evidence: native-clock-live-7a08-5628-v2-final.json; the retained first negative is native-clock-live-7a08-7610-first.json.

## Normal-player adoption boundary

The source remains an explicit opt-in authority. Normal live suspension/interruption intentionally retires existing owners. A player that keeps its source/rack objects across Pause/Play cannot automatically select this profile and expect those same objects to resume. Such a caller must either dispose and rebuild them offroute using a fresh generation before publishing audio, or separately prove a live freeze/resume policy. The accepted Offline freeze policy does not establish that live policy. Context/output-device lifecycle changes and default prepared-environment adoption remain separate work. There is no silent fallback or active pending-audio zero path.

## Source-derived coarse code envelope

The Native linear-ramp arithmetic has k=2^-20 and valueDelta=2^17, making k*valueDelta exactly1/8. Across the finite2^20second horizon, the initial Float32 time conversion and SIMD lane-time addition each contribute at most0.0625seconds; dividing by8 bounds those terms by1/64cycle. At the lowest admitted rate8k,31 four-frame additions contribute at most31*(0.5/8000)=0.0019375cycle. A conservative additional1e-6 covers double-time and increment-rounding terms under the declared2^40frame bound. Their sum is below0.017564cycle, less than the predeclared1/32cycle envelope and far below the half-cycle uniqueness threshold. This bound justifies integer code disambiguation; it is not an empirical fit of an audio phase. The full128word integer/canonical/consecutive checks and explicit horizon rejection remain mandatory.


## Initial publication and acknowledged metadata lifetime

New host3ff9323c4bcce2f2 defers its program-input edge until clock binding and
initial-control acknowledgement. Its outer facade is a mechanically checked
fork of the preserved class with only that constructor edge removed; the
factory attaches it after preparation. At most64 callbacks can defer initial
unadmitted clock words, exclusively with disconnected input and literal zero
demand. No active missing/invalid clock can defer, reset or substitute silence.
The metadata edges remain connected until the DSP disposal acknowledgement;
releasing them in parallel with disposal exposed a real callback race. Generic
DSP/protocol errors still fail strictly. The numeric Wasm is unchanged.

The retained first All3ff negative passed two hosts and all six Width/Ring
cleanup checks, then failed the restored host's old compressor clock. Replacing
that adapter in the separate review environment with clocked dynamics4fa fixed
the full group: three Native/owned/restored cases, six clean Width/Ring owners
and45 clean dynamics owners. Evidence:
`clocked-all-3ff9-first-negative.json` and
`clocked-all-3ff9-4fa-final.json`. Actual desktop checks do not establish phone,
background or normal retained-player pause/resume acceptance.

Final host3ff also passes72 actual Native extra/ordered-rack cases across
8/24/44.1/48/96/192k: all Native and independent-owner PCM differences are0.
A fresh cold replay restores identities, settings and PCM hashes exactly.
Its final actual live run proves281,984 independent reference samples with
maximum error0; global lag384 is observed while all active controls survive.
Suspension retires the generation explicitly, disposal completes, and a fresh
offroute owner is accepted. Evidence: native-clocked-rack-3ff-{rate}-final.json,
native-clocked-rack-3ff-cold-final.json and native-clocked-rack-3ff-live-final.json.
The current profile/factory/disposal subset has28 focused tests; the shared
rack preparation tests bring the selected verification run to42. These checks
retain initial isolation and clock-metadata lifetime through disposal ACK.
