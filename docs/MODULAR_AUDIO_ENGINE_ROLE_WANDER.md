# Owned role pan and level — 11 November 2026

This additive Rust stage reproduces the original RoleWander pan/volume path.
It owns sine phase, seeded random walks, target smoothing and stereo balance.
The main route and up to four followers share one control clock. The normal
Generator and All now accept an explicit prepared Rust factory; defaults are unchanged; source filter/pitch wander and the
ambience layer policy are separate remaining work.

The captured contract records role, sample rate, offset, offline/live policy,
initial settings and canonical 128-frame controls. Reset restores that captured
plan. Current-target save/reload creates a cold independent instance, rather
than claiming to serialize oscillator phase or an in-flight transport. All
buffers, control queues and walk history are bounded. Mono preserves the
original splitter behavior: it supplies the left channel, not an invented
stereo duplicate.

Native measurements establish that sine phase freezes when the sine source is
disconnected by a mode switch; zero depth continues phase. Offline Brownian
initialization retains the original first-booking period/order. Live execution
uses deterministic 90-second lookahead and 15-second refill boundaries, without
reproducing accidental main-thread timer delays. The prepared host factory has
the RoleWander input/output/apply/createFollower interface, and is available through `new Generator(settings,{roleWanderFactory})` or
`createHost(scene,{roleWanderFactory})`. Prepare the factory once with
`await prepareOwnedRoleWander(context)`. All `wake`, start and audition paths
await it; direct keyboard notes refuse unprepared motion. The normal offline
renderer prepares a separate factory for each chunk context and installs the
complete initial settings before rendering. Neither backend identity nor a
function is serialized into song settings.

Verification at this step:

- 20 permanent kernel/worklet/host tests pass, including future controls arriving
  before the first callback, same-frame replacement, reset/partition/save,
  all six role seeds, independent handles and follower reuse/disposal.
- 24 actual native comparisons pass at 8/24/44.1/48/96/192 kHz, sine/Brownian and
  smoothed/immediate settings, fractional piece offset and dynamic mode/period
  changes. Maximum absolute error is 2.24e-8; the fixed bounds remain 1e-5 absolute
  and 1e-4 relative RMS. Native FFT-generated tables are not claimed bit exact.
- 12 actual routed AudioWorklet cases pass exactly against standalone Rust,
  including mono/stereo and shared followers at all six rates.
- Actual muted live nodes pass future-control acknowledgement, separate audio
  state, shared follower output and current-target save/reload. A startup-clock
  bug found by the first run is fixed and retained as a permanent regression.
- 12 audited six-rate sine/Brownian cases have zero render/reset allocations or
  frees and no Wasm memory growth. The counter is read before disabling it.
- Existing mixer regression: 80 pass, 3 existing audit-only skips. Shared target
  extraction also retains all 48 existing RoomColour native comparisons and
  14 functional tests. Broader stereo room activity/retarget cases remain under
  investigation; this does not certify that separate full-room composition.

The numeric mixer Wasm is 87,806 bytes, SHA-256
`3c2700933e385c2a30c32c4a4a688651b0624a8f06993cb39afffc454dd3c6dd`.
The maintained review page is `/tools/role-wander.html`. Generated evidence and
private diagnostic scripts remain under ignored `reports/`.

Normal-host checks now also pass: 215 focused Generator/host/routing checks,
six actual simultaneous role routes plus six independent cold-restored nodes,
and a real two-second normal offline score export (96,000 stereo frames,
192,000 Int16 samples, nonzero peak, song unchanged). Three consecutive actual
real-source All batches each pass native desk, owned desk and restored-owned
host cases, with role/shared FX, Generator sweep/trim and ambience. The first
cold batch had an unattributed missing-route measurement after its native case;
that failed report is retained and richer failure measurements were added.
Subsequent passing batches do not establish its cause or certify deadlines.

Next: port the remaining ambience and source-control clocks, then combine live
piano/compressor/room adoption in the real-source host batch. Validate broader
startup and background behavior before changing defaults. Callback deadlines, physical listening and mobile/background
acceptance are not implied by offline parity or muted desktop measurements.
