# Prepared normal audio environment

The explicit `prepareOwnedHostEnvironment(context)` composes accepted owned
source/effect factories without putting executor choices into saved songs.
The context-bound `owned-active-host-v1` profile is passed to Generator, All,
WasmInstrument and LabVoice. An offline score chunk prepares a fresh environment
for its own OfflineAudioContext; cross-context factory reuse is rejected.
Existing null-environment defaults remain available.

The profile selects the original owned Core/FM live kernels and Rust patch
transitions, normal owned piano (shared physical controller) and Iowa sources, fourteen original CLASSIC models, the accepted live
VoiceCompressor and owned role pan/level motion. Original Rust weather live
sources and bounded weather/loop preparation feed the original ambience host.
It does not translate native oscillator presets into another sound model.
Original KS live demand/control histories are accepted and selected here.
Crusher/Pitch/ZPlane also use accepted owned processors through the original
CLASSIC/All/offline rack wrappers. The ordinary Instrument mix/limiter pair is also owned (18 exact native-chain
cases plus actual desk/reload/export). Iowa's original bare-native limiter is now owned too (5 exact native full-room
cases, measured desk/reload3, cold20-note export). Original local/shared echo is also owned through a context factory, with24
actual normal route comparisons exact at six rates. Rack target compressors,
other native effects, shared/private sampled-room adoption, native loop playback
and ambience spatial/fade/wander remain explicit continuation boundaries.

A physical source-family edit reconstructs through existing atomic replacement
rather than reusing a different material controller. Failed or superseded
preparation disposes the new instrument without replacing the old source.
Source readiness and pending cold bookings are awaited before score rendering;
async offline preparation is also awaited. Sound/desk snapshots contain no
prepared environment or runtime handles. Ambience cleanup now disposes its
prepared workers and routes with the owning host.

The fixed page `tools/owned-active-host.html` exercises actual normal sources,
per-role effects, shared master/section routing, ambience, desk controls,
source leases and cold sound/mixer reconstruction. Current desktop batches:

- Four actual catalog KS materials + piano/Hand: all3 desk/reload paths pass,
  no cold-preparation lateness (owned-host-physical-final.json).
- CLASSIC/piano/Iowa with Crusher/Pitch/ZPlane active: all3 pass and9 actual
  owned plugin nodes are created (owned-host-rack-final.json).

- Mixed Core/FM + two piano + Hand percussion: native desk, owned desk and
  restored owned desk all pass (`owned-host-current-mixed.json`).
- Iowa Flute/Clarinet + two piano + Core/Hand: the same three actual host paths
  pass (`owned-host-current-measured.json`).
- Isolated cold piano-only score export:3 planned notes,144000 stereo frames
  at48k,288000 Int16 samples, peak3248, original song unchanged
  (`owned-host-current-offline.json`). The earlier zero-note lead-only fixture
  was invalid piano evidence and is retained locally, not relabelled.

The actual normal weather source page also compares its original and owned
three-stereo-output AudioWorklet routes at six rates8–192k, including fractional
startup131. All six pass; each stereo stem is sample-bit-exact
(`ambience-normal-live-final.json`). Prior normal weather export/worker and
wind/fire/vinyl nine-case evidence remains in the focused ambience checkpoint.
Permanent changed-contract checks pass54 across7 files, including six actual-Wasm
weather model/control cases and22 Rust Core/FM transition/processor cases.
These are desktop routed/captured results, not physical listening, browser
universality or callback deadline guarantees. Reports are ignored local evidence.

Continue the ordinary compressor startup/arm contract and physical live-demand
history acceptance, then Classic live sources and remaining effect/room owners.
The private-room policy is separately accepted with declared500ms latency;
normal shared sends and transport latency alignment need explicit composition.

Further accepted integration: original instrument inserts and FDN send/room
buses use [owned live hosts](MODULAR_AUDIO_ENGINE_LIVE_BUS_HOSTS.md), preserving
native echo and original shared response/send policy. Twelve standalone actual
bus cases and six actual two-Core-voice local/shared compositions pass with PCM
exact zero difference;52 focused changed-host checks pass across six files.

The CLASSIC source factory is now supplied to normal melodic and drum-machine
roles and each fresh offline renderer context. Its standalone42 native comparisons,
14 actual offline instrument comparisons and cold reload are exact. A new actual
All palette (Juno, DX7, piano, Iowa, Minimoog and808) also passes native desk,
owned desk and cold sound/mixer restoration, with six nonzero role/channel paths,
shared returns, sweep/trim, ambience, source leases and cleanup
(`owned-host-classic-final.json`). Its selected Minimoog bass uses the existing
one-kernel role policy; no live/offline mono-stack reconciliation is claimed.

Runtime selection and these new factories remain absent from persisted songs.
Continue the physical live-history errors/remaining target clocks, ordinary
compressor final facade adoption, and three-plugin owned rack host acceptance.
Other native VCO/effect/ambience/room owners remain explicit migration work.

The accepted shared piano factory is runtime-only and context-bound.
Its four native body/expression/gap/reused-held checks and actual combined
KS/piano/Hand desk/reload3 pass; see the focused streaming-piano record.

The current Iowa factory is context-bound and runtime-only, forwarded to live
Generator and fresh offline render contexts. The fixed measured host/reload3
and Iowa-only20-note export (144000stereo frames, Int16peak1902) pass with owned
source and owned bare-native limiter, retaining the full original native room.


## Shimmer and complete rack-factory forwarding

Shimmer now uses its accepted context-bound Rust factory in both normal voice
paths. Its30 routed Native comparisons across six rates are exact, and actual
cold page reload matches all three saved PCM hashes and complete settings.
See MODULAR_AUDIO_ENGINE_SHIMMER_LIVE.md for the proved Native initialization
race and unchanged source/DSP reference preparation.

Prepared rack factories now also reach Generator's shared bus and section-space
racks, plus both normal offline CLASSIC construction branches (melodic and drum
machine). Shared preparation errors remain observable; running owners are armed
before source readiness resolves. Disposal retires every owner, including late
loading racks, and preserves cleanup failures. Omitted environments retain the
Native path. The normal renderer also awaits an optional complete Ambience
booking barrier after source starts and before rendering.

Actual All Native-desk, Rust-desk and restored Rust-desk cases pass with51 owned
dynamics instances, including the six newly forwarded shared instances
(owned-host-shared-dynamics-final.json). This is actual routing, health and
reconstruction evidence; the prepared source environment is used in all three
cases, and no cross-backend PCM identity or physical device guarantee is claimed.

Two cold normal renderPcm exports also pass: Juno melodic3notes and TR808 machine
10notes, each144000stereo frames /288000Int16 samples at48k. Peaks are19935 and
7432 respectively. Fresh OAC source/dynamics factories are context-bound, real
processor targets are observed, due original source events apply without late
events, owners/source cleanup completes, and settings plus source presets remain
unchanged (owned-cold-classic-dynamics-export-final.json). The active fixture rack
is authored through normal CLASSIC setRack; All's separate external drum UI rack
is not falsely counted as the renderer's source rack. These are lifecycle/nonzero
checks, not new Native PCM or arbitrary long-export acceptance.

The combined prepared Shimmer/shared/offline contract tests pass75 across14files.
Source-only piano/KS/CLASSIC/mixer manifest refreshes retain the accepted numeric
Wasm bytes. Full public build and broader final regression remain a combined
checkpoint after the independent pending ports settle. No deployment.
