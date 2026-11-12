# Composed portable Tape host

This opt-in component couples the actual owned lifecycle queue, unchanged Tape DSP, Rust resource preparation, and the reviewed Native integer frame metadata source. It is not selected in any app environment or default route.

| Component | Identity |
| --- | --- |
| Composed host | `3b17c3eb4ede0c9d` |
| Tape DSP | `7e165c5616e8d55a` (byte unchanged) |
| Owned future lifecycle runtime | `22185a0898a73ca7` |
| Explicit lifecycle source | `3d17422c4a741992` |
| Native frame metadata | `7a0838a735108706` |
| Rust curve preparation | `dcad5770a9397205` |

## Lifetime and resources

`preparePortableTapeAudio(context)` returns a context-bound factory. `factory.preparePreset(raw)` returns a one-use opaque constructor ticket; up to32pending/ready tickets are retained. Consumption/cancellation releases its strong curve data. Factory disposal refuses while any owned node's cleanup is unsettled and rejects late preparation results.

Each owner uses the committed opaque preparation authority: `prepareDrive` / `preparePreset`, synchronous `commitDrive` / `commitPreset`, and `cancelPrepared`. Caller pins survive until successful commit/cancel. Active, queued, or pinned physical resources cannot be reclaimed; release ACK precedes slot reuse. The32resource slots,32outstanding caller handles, two upload credits, and1024Float32 copies percallback remain explicit. Full-preset capacity preflight covers all8original control records. Old numeric `setDrive(value)` is deliberately not exposed as a silent asynchronous fallback.

`setHostAwake(Boolean)` records route demand. Input remains physically isolated during preparation. `arm()` must run after context resume; even a dormant owner with no command packets creates a temporary control-only sink to obtain the actual clock/control ACK. That sink cannot advance the program source because the input edge is disconnected. A desired active route connects input only after preparation. Whole-route inactivity disconnects input before control service.

The new main adapter is generated mechanically from immutable67; original target formulas and separate `currentTime` reads remain literal. `offlineInitialReady:true` is a separate constructor mode allowed only on a suspended OfflineAudioContext at time0 with a complete immutable initialization plan. Its8records execute exactly once before first input processing; it avoids a render-start/ACK deadlock. It is not a generic late-context shortcut.

Input bus silence is an explicit Boolean authority, distinct from connection presence and route demand. The callback never scans zero PCM to infer silence. Input hints must be authored canonically/chronologically; `arm` fences the latest authored hint value/frame, so future hint plans should be booked after initial arming. Arbitrary cancellation is not implemented.

## Owned future retirement

The new Rust runtime has32preallocated future retire/activate events. Admission preserves canonical chronological order and same-frame caller order, projected epoch/output masks, and sequence1..16777215. It does not insert earlier events or cancel previously booked events.

At a callback, an overdue event rejects before sync, resource service, targets, policy or DSP mutation. All same-frame events and callback input/demand authority validate on a stack copy before any dequeue, output change or observed ACK. Semantic failures include an attempt to retire active input without an explicit new activation. A nonfatal admission refusal leaves the current owner live; it does not silently rebase the requested frame.

The facade permits one unacknowledged lifecycle admission at a time and up to32queued events. Admission ACK is distinct from the later observed-at-frame receipt. It keeps quiet control service alive for pending events. Caller source-connection epochs must obey the authored lifecycle plan; this is not a recreation of hidden Native main-thread tail tasks.

## Clock authority

Native mode consumes only the frozen7a integer code and immutable generation spec. Raw worklet `currentFrame` is diagnostic; it does not correct or age DSP. Bounded isolated preparation may wait for a complete code. The processor additionally has an explicitly labeled `source-local` mode for component tests, which makes no context-clock claim; the main factory selects Native mode.

During ordinary live owner disposal, clock parameter links remain until the DSP/lifecycle disposal ACK. Successful Offline context completion ends its clock scope separately. Live suspension/interruption retires7a; offroute re-preparation is required. No live freeze/resume or drain workaround is selected.

## Verified baseline

The actual desktop48kgroup passed all6cases (`reports/modular_audio/tape-composed-3b17-48000-first.json`):

- Four Native-reference cases (continuous and explicit output-gap, each mono/stereo), eight Native-versus-owned comparisons. Maximum absolute3.7725549191236496e-6, maximum relative RMS9.238747478632142e-7, unchanged1e-4bounds. All independent owned comparisons are exactly0.
- In the gap cases, the input edge stays isolated; before reconnect, only16DSP calls/2048LFO frames have occurred and all4offroute control records are observed. The real Native frame source permits elided offroute callbacks without aging DSP or guessing from stale globals. The shared looping program has no always-pulled capture tap.
- Two owned-only authored-retirement cases (mono/stereo), not Native automatic-tail comparisons: source stop1024, explicit retire4096, explicit activation/new source8192. Both nodes observe sequence2/epoch2 and exactly8192LFO frames across12288renderedframes; independent PCM is0.

The fixture awaits disposal, checks node release and then closes its factory. Snapshots/clock consumer counts in the report are taken before cleanup. No post-context heap or live deadline measurement is claimed.

Eleven queue tests compare exact policy state to committed3d across six rates and exercise late/transactional32slot failures. Its private audit runs49152callbacks,3264events,96retirements and96activations: zero Rust allocation/reallocation/free/growth after preparation. Six actual public-callback tests verify DSP coupling, authoritative code vectors under repeated stale globals, isolated clock waiting, late/invalid transaction atomicity, typed errors and disposal ACK. Four actual-Wasm factory tests cover no-command dormant arming, one-use cold tickets, prepared resources/future-event ACKs, and metadata-link release after DSP cleanup. These synthetic-code tests are separate from the actual Native browser baseline.

Remaining gates before normal selection: other rates for the composed adapter, Native numerical coverage for late construction/unsuspended controls, whole-preset cold replay and normal-host routing. Actual live ownership/resource/re-preparation health at48k is recorded below; it is separate from Native numerical coverage. Automatic legacy source-ended parity remains rejected as documented in `MODULAR_AUDIO_ENGINE_TAPE_NATIVE_ACTIVITY.md`; no bounds or timing offsets were changed to accept it.

The subsequent review-only version2 uses an explicit rate-aware caller plan for the owned-only cases: retirement is `max(4096, ceil(rate * .05 /128)*128)`, activation is `max(8192, retirement+4096)`, and rendering ends4096frames later. The passing48kplan remains exactly4096/8192/12288. Seven focused checks run the actual Rust queue at all six rates with conservatively longer first input and350Hz tone; the old fixed4096high-rate plan is retained as a rejection/unchanged-ACK counterexample. This caller budget is not an inferred Native task epoch or a change to policy/DSP. Every version2report records the complete plan. Other-rate browser acceptance remains pending.

## Follow-up gates, not yet browser acceptance

The review page can save a complete passing scene and replay it after full document reload. It records the exact fixture/settings/component identities and both independent owned PCM hashes. Native comparisons continue to use the original bounds; Native summation-order hashes are not asserted as exact. Four focused checks cover incomplete evidence, changed settings/identities/plans, either owned instance and separation of Native numerical evidence.

Three additional actual-Wasm factory checks cover retirement while ready/pending resource handles exist, forty full-preset commits with at least nine acknowledged resource-slot reclaims and bounded callback copies, and constructor/later preparation with JavaScript `Math.tanh` replaced by a throwing sentinel. All seven factory tests pass. The latter confirms this composed route uses the pinned Rust curve preparer without an implicit JavaScript fallback; it does not extend the preparer's separately measured arithmetic coverage.

`tools/tape-portable-live.html` is a review-only real-context health gate: two owners over three rounds, forty READY full-preset commits in the first round, deliberate live suspension retirement, and fresh late preparation in the next two rounds. It measures nonzero audio, control/resource receipts, dormant input isolation and cleanup. Unsuspended control epochs are recorded; this gate explicitly does not assert unmatched Native PCM parity. The actual live gate passed as recorded below; cold-scene replay remains pending. No normal environment selects this component.

## Actual live ownership acceptance

The desktop browser passed all three rounds of host`3b17c3eb4ede0c9d` at48k in one real AudioContext (`reports/modular_audio/tape-composed-3b17-live-first.json`). Each round has two separately owned nodes; logical channels are mono/stereo/mono. Native frame generations are1/2/3 and actual node constructor origins are48512/144512/192512, so this includes late construction and later offroute preparation after deliberate live suspension.

The first round performs40complete READY full-preset commits per node, followed by one dormant drive commit; each node records10ACK-safe resource reclaims. The next two rounds perform8complete preset commits plus one dormant drive commit per node. At active measurement, the first pair has copied84009Float32values per node; maximum copy service is1024 and maximum queued chunks is2 in all rounds. Each active capture measures nonzero output (channel peaks0.3648535–0.3692162). No physical deadline, total-browser heap or Native PCM equivalence is inferred from these health measurements.

All six dormant preparation receipts have zero DSP calls and zero LFO phase. During the later dormant resource commit, LFO counts stay exactly41216in the first round and10496in each later round, with input edges isolated. Each intentional suspension yields exactly the two expected clock-retirement notifications; both old setters refuse and both worklet nodes are released before the next round prepares a fresh generation. Factory cleanup completes in every round.

The live report explicitly records`nativePcmAssessed:false`: sequential unsuspended control calls can cross different original epochs for the two nodes, and their output is not asserted identical. No automatic Native source-ended retirement, live clock freeze/resume, timing offset, coefficient bridge or app-default adoption is claimed. The independent six-rate Native/owned numerical and cold-replay follow-ups remain separate gates.
