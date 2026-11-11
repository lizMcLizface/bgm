# Immutable All desk backend boundary

`createHost(scene,{deskBackend:'owned'})` selects the portable strip, matrix,
fader and single 3 ms sample-peak limiter for that host's lifetime. Omitting the
option retains the original native desk. This is an opt-in host API; no All UI
chooser, stored backend preference, default engine change or live desk swap is
introduced. Unknown backend names reject before creating a Generator.

## Preparation and lifetime

`setupMixer()` shares one pending preparation Promise and is idempotent after
successful setup. All seven role rack candidates and the selected desk prepare
off-route before any existing Generator connection is removed. Changes to the
complete desk state during preparation are applied and acknowledged before
installation. The final connection transaction has no await: it installs the
existing source/return/headroom/music/ambience/master topology, updates
`mixReturn`/`mixOutput` pointers and routes completed shared racks using the same
Generator method as before. Future asynchronous shared racks resolve those
current pointers when they finish.

Failure restores changed source, level-trim, ambience and shared-return pointers
and connections, disposes prepared resources and permits a corrected retry.
Failed owned processor-module registration clears only its own cached loading
Promise. Simultaneous preparations share that failed attempt without creating
primitives or a keepalive; a later retry loads again on the same AudioContext.
Disposal during asynchronous preparation prevents installation and releases
each candidate when it resolves. There is no automatic native fallback. The
initial setup rejects while source leases or meter taps own the old pre-desk
route. New taps reject while preparation is pending, and meter creation rejects
after disposal before allocating nodes. After installation
the immutable backend keeps their captured AudioNode pointers valid.

`applyDesk(state)` still applies a whole native desk snapshot immediately and
also tracks asynchronous owned-control acknowledgements. `awaitDeskState()`
waits for setup and pending updates and throws a recorded failure;
`deskStatus()` also polls the owned factory's processor-error health, so a
spontaneous AudioWorklet error is visible without sending another patch. It exposes backend, phase, ready/error state, revision, published
kernel identity/latency and source/meter lease counts. A control failure remains
visible until the host is rebuilt. It does not trigger a mid-playback switch.

The original `ChannelMixer` calls remain compatible. A future chooser must stop
playback and build a replacement host before committing it, using the same
rollback pattern as scene/file/link loading. It must not change nodes beneath
active source leases, meters or captured native tails. Backend selection is an
environment/executor choice, separate from the existing versioned song/setup
file format.

## Routing and limits

Actual All retains its original implicit native fan-in order. Portable desk
primitives replace only their own processing. Role/native effects, shared
bus/section-space sends and returns, reverb hub if configured, Generator fade,
optional SweepFilter, arrangement trim and Ambience remain current host stages.
No sends are duplicated and exactly one desk limiter is created. Actual All has
no master insert in its current setup; the separate owned-desk seam fixture
covers that optional boundary.

Strict deterministic native-versus-owned PCM acceptance belongs to the
`deterministic-left-fold-v2` isolated fixture documented in
`MODULAR_AUDIO_ENGINE_M4_MIXER_HOST.md`. The actual All adoption does not silently
replace implicit summation or claim identical rounding across native graph
instances. UI changes sent at the current AudioContext time can arrive later on
MessagePort; portable late counters remain observable. This host does not claim
sample-exact future scheduling of arbitrary UI arrivals or add automatic PDC.

## Verification

Thirty-five host tests plus six backend factory tests pass. Twelve new host cases
cover native defaults, shared/idempotent setup, explicit owned choice, pre-desk
leases, off-route failure/retry, partial connection rollback, shared-return
rollback, disposal during pending work, asynchronous update failures and
spontaneous processor health errors, pending-setup tap exclusion and disposed
meter exclusion. Repeated setup also rejects a recorded processor failure.
The
factory tests cover actual selection contracts and native limiter/candidate
cleanup. The existing twenty-three host cases still pass.

`tools/all-desk-host.html` runs a fixed actual-host desktop batch: current native
desk, portable desk and a fresh portable host reconstructed from saved sounds,
mixer settings and desk targets. It uses actual Soft Pad/FM Rhodes/House Piano/
Ravel/Hand instruments, role effects, both asynchronous shared returns, native
Generator sweep and trim, rain through Ambience and routed stereo master output.
It schedules dim, bass solo, lead mute and restore automatically, checks all six
role meters plus headroom and ambience, and separately measures music after
Generator sweep/trim with a predeclared minimum stereo peak of `1e-5`, so ambience
cannot mask a broken music path. It retains a valid source lease during
controls and verifies lease/meter disposal. The silent run disconnects only the
isolated page's master-to-destination link and uses one zero-gain keepalive; the
separate listening run retains the normal destination path.

The batch tests finite/nonzero output and actual host behavior; native waveform
phase, stochastic ambience and implicit fan-in make it a different assertion
from portable kernel PCM parity. Built-in browser acceptance passed on
2026-11-11, recorded in `reports/modular_audio/all-owned-desk-host-browser.json`
and `all-owned-desk-live-browser.json`, with matching screenshots. All three
48 kHz silent cases passed: native, owned and fresh saved-state owned host.
Their stereo music peaks were approximately 0.0854/0.1003, 0.0817/0.0891 and
0.0814/0.0894 respectively, exceeding the declared `1e-5` floor; all six role,
headroom and ambience meters were nonzero. All four changes, current source
lease and lease/meter cleanup checks passed. The separate owned live case also
passed, with music peaks approximately 0.081/0.089.

The accepted mixer version is `d43cbe6314cd15e6`, source fingerprint
`cc40b2df4e0986979522ce7e3f7bf5e3d9cbcff39a6c167a554bf476b7287fe9`.
Its unchanged 70,229-byte Rust Wasm SHA256 is
`abb416923ee7d39dc871cedf76b6268f317123dc76d8af6c4267587db58d4e3d`.
This host acceptance demonstrates functional routing and lifetime behavior;
the different native trajectories are not a cross-backend PCM identity claim.

The fixture changes no All storage. Saved reconstruction is cold configuration replay,
not a midstream native-tail or RNG snapshot. Routed analyser/meter data is not
physical device loopback, listening judgement or device-underrun evidence.
