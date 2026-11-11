# Normal Instrument ordinary compressor pair

The explicit prepared environment supplies ordinaryCompressorFactory to the
actual Instrument mix compressor and final limiter. The default null environment
keeps both original native nodes. VoiceCompressor remains its separate accepted
topology. No saved preset gains an executor field.

The mix wrapper retains threshold(-6), knee(0), ratio(20), in that order.
The limiter retains preset threshold, ratio, knee, attack, release order and raw
UI values, including native finite-value clamping. Offline renders embed exactly
those initial steps in the processor constructor; only the corresponding first
constructor/preset calls are omitted. Later controls keep the existing setter
chronology and unchanged preset equality behavior.

The whole effects chain owns processing demand, including external-source and
effect tails. Demand stops with its final destination or chain sleep; note-off
does not prematurely stop limiter history. Generator/All resume then await
initial processor readiness before booking. Concurrent readiness requests share
one acknowledgement transaction. Offline setup never waits for rendering to
begin. Disposal frees and acknowledges all three compressor owners.

Desktop acceptance, ignored reports/modular_audio:
- instrument-dynamics-first.json:18 cases, six rates8k through192k, cold and
  late construction, real output gap, threshold/release/mix edits. The actual
  original Instrument chain and owned pair receive identical stereo input.
  Every PCM comparison is sample-bit-exact and a second owned instance is exact.
  Fixed max-absolute/relative-RMS bounds remain1e-6.
- owned-host-ordinary-final.json: actual four-KS/piano/Hand native desk, owned
  desk and saved reconstruction all pass. All five melodic owners report owned
  ordinary stages; the basic kit is a separate existing path.
- owned-host-ordinary-offline-final.json: cold3-note piano export144000 stereo
  frames, peak3248 Int16, song unchanged.
-57 focused policy, environment, source-wrapper and host checks pass. The4 policy
  checks exercise immutable initial trace, finite raw UI values, demand/tail
  ownership, first-failure propagation and concurrent arming.

Primitive host1e26d3251c12099f uses unchanged69695-byte Wasm. Source provenance
refresh adds the initialization-policy dependency explicitly; numeric source
Wasm remains253652 bytes and finite KS86381 bytes. Earlier evidence retains
its original artifact version rather than being relabelled.

This proves application composition and offline native PCM on the desktop
browser. It does not claim physical-device loopback, phone deadlines, ownership
of native connected-silent flags, Iowa's distinct bare-native limiter, external
rack target compressors, other effects or all room/ambience DSP. Those remain
separate acceptance tasks. A full suite/public build follows combined work.
