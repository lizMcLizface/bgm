# Owned live Core and FM hosts

The explicit prepared factory `prepareOwnedCoreLive(context)` creates the normal
Core/FM backend contract with owned Rust handles and memory. Existing legacy
ABI worklets and defaults remain available. This replaces ownership of the
existing Rust engines; it does not translate original Web Audio presets into
a different sound model.

Current host identity is `a73e7be40b6c9c31`, bound to the verified Graph Wasm
hash `f41a99539bd540dcd4bb826352e441e6c3e75fc2a808035699c2a1a49a5382a0`. `tools/buildOwnedCoreLive.mjs --check` checks the exact
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

The explicit live host now uses the additive owned Rust transition controller.
Its bounded512-row state and32 pending packets preserve same-frame replacement,
16-frame smoothstep/log updates, discrete/performance midpoint switching,
interruption and the original4ms structural output fade. Rust also multiplies
the output samples; JavaScript prepares packets, dispatches kernel controls and
copies PCM. The legacy JS implementation remains available for old hosts.

Fourteen permanent controller checks pass at six rates, including queue refusal,
interruption, independent handles and fixed memory. Eight complete processor
comparisons remain sample-bit-exact, and the actual24-case routed batch also
remains sample-bit-exact. Evidence is `core-live-rust-transition-final.json`.
The maintained `tools/auditPatchTransition.mjs` additionally tests all244 Core
and308 FM parameter keys,96 scheduled packets per case, processing and clear;
all12 kind/rate cases report zero allocation/free calls and zero memory growth.
The audit result is ignored local `patch-transition-allocation.json`.

This completes live Core/FM transition DSP for the explicit prepared host.
The finite Graph compiler still prepares original transition points outside the
render callback; ordinary defaults and native preset translation remain separate.
Continue complete prepared-environment adoption and the remaining source/effect/
room host paths. This is not a claim that the normal application is fully Rust.
