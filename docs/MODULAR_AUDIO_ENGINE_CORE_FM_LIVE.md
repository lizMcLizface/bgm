# Owned live Core and FM hosts

The explicit prepared factory `prepareOwnedCoreLive(context)` creates the normal
Core/FM backend contract with owned Rust handles and memory. Existing legacy
ABI worklets and defaults remain available. This replaces ownership of the
existing Rust engines; it does not translate original Web Audio presets into
a different sound model.

Current host identity is `03122639bbe5aacd`, bound to the verified Graph Wasm
hash `9c5f0e10220dd338229844ed882e201735774ea0ef6980e0ca67c05bace301c6`. `tools/buildOwnedCoreLive.mjs --check` checks the exact
adapter, packet schemas, transition implementation and graph binary. The
maintained desktop page is `tools/owned-core-live.html`.

The bridge preserves parameter packets, original quality/fractional latency,
timed notes, held sustain/pressure/retune, patch transitions and panic. Each
node owns its instance, handle, voice state, pending controls and disposal.
The measured shared callback clock consumes one actual128-frame callback even
when browser global stamps repeat, while genuine unpulled gaps re-anchor the
absolute clock without fabricating source samples. Invalid contracts, backward
clocks or exhausted event capacity fail visibly. Control barriers are bounded
at64 pending requests; disposal is acknowledged with a one-second host fallback.

Eight permanent checks compare the actual old public worklet/legacy Wasm with
the new worklet/owned Wasm at44.1/48/96k, including live controls, interrupted
patches, three stale stamps, panic, event-capacity failure, disposal and FM
latency changes. All pass with exact PCM. The actual routed browser batch has
24 passing cases: six rates8–192k, Core and all three FM quality tiers. Every
stereo sample is identical to the existing host. Evidence is ignored local
`reports/modular_audio/core-live-component-final.json`; earlier first/final
reports retain the preceding provenance scope.

The existing JavaScript patch interpolator and structural output-gain fade are
preserved for this ownership step. They are explicit remaining control/DSP work
for the all-Rust goal. The next source task is a bounded Rust transition
controller with the same original packets and measured behavior, followed by
complete prepared-environment adoption. This is not a claim that the normal
application, native effects or native preset translator are fully migrated.
