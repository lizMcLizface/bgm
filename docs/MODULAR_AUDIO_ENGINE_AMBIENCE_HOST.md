# Normal owned ambience source hosts

`prepareOwnedAmbienceHost(context)` provides explicit normal Ambience options:
owned Rust rain/thunder/waves, a sequential Rust weather export worker, and the
already verified Rust wind/fire/vinyl preparation worker. Native defaults remain
unchanged. Current host identity is `562d4492b36f361e`; the exact host/source
bindings and unchanged numeric dependencies are checked by
`node tools/buildOwnedAmbienceHost.mjs --check`.

Each weather node owns its Wasm state, seed, source clock and three separate
stereo outputs. Dynamic state applies at the next source callback through the
original26 controls and40ms bed smoothing. The shared measured callback clock
handles repeated browser stamps without replaying weather samples. The normal
route keeps its existing start/stop and per-stem connections; pending requests
are bounded64, errors are visible, and disposal frees the kernel before port
closure with a bounded cleanup fallback.

The offline worker owns its source and the original32-second history. It keeps
RNG/filter/envelope history across sequential chunks and preroll overlaps. One
request may be in flight, with a91-second chunk limit covering the normal
60-second export chunk,30-second preroll and overlap. Generation guards,
transferred stereo buffers, cancellation and worker termination remain explicit.
Loop preparation has a separate private worker/cache namespace per Ambience
owner. Compiled immutable modules alone are shared.

Twelve permanent Rust/model/history checks pass across six rates8–192k.
Existing renderer injection and shared-route checks also pass. Actual browser
`tools/ambience-host.html` runs nine complete normal Ambience comparisons:
weather at six rates and wind/fire/vinyl at48k. Original and owned sources pass
through the same native spatial, level and wander chains. All nine are exactly
sample-identical on both output channels. Evidence is ignored local
`reports/modular_audio/ambience-host-component-final.json`; no phone settings or
listening request is needed for this source-only check.

The normal Ambience now has idempotent disposal for pending preparation, source
workers, weather nodes, per-layer nodes and slow-signal nodes. The prepared
Generator/offline-renderer composition is tracked separately. BufferSource loop
playback, fractional offset/resampling, distance/shelter filters, stereo width,
pan, fades and total/layer wander remain explicit native DSP boundaries. Next
port those playback/spatial/control stages without changing source PCM or the
existing defaults. No physical-device or live scheduling deadline claim is
inferred from these muted PCM comparisons.
