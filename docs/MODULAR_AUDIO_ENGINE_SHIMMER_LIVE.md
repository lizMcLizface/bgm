# Original Shimmer owned live host

Accepted host `567046fb4402707d` uses the unchanged original Shimmer Rust
engine `7b490244eb5cd194` (47,438-byte shared voice-FX Wasm). Freeze is not
selected by this host. Its measured synchronous capture cost remains a separate
worker/capture scheduling boundary.

The prepared context factory exposes the existing Shimmer stage interface.
It keeps the original stable gain input/output ports and dry preparation path,
lazily creates DSP after positive mix, and captures all pre-construction settings.
Later setters retain every original message; no live edit deduplication occurs.
The Rust owner retains its delay/filter/shifter state across message changes and
implements the original clear and left-channel sleep rules. Neither a forward
context gap nor stale host-frame recovery invents missing DSP callbacks.

The host accepts the bounded original UI contract: mix0..1, decay0.3..30seconds,
the four named intervals, climb0..0.95 and effective tone500..16000Hz. Original
mix/climb/tone and minimum-decay clamping are preserved. Out-of-contract decay
is refused before mutation. Configuration snapshots retain typed normalized
parameters; Shimmer consumes no random values. The shared portable spec's seed
is not a change to Shimmer's algorithm or a live Freeze RNG claim.

## Exact results

All72 actual original-wrapper/worklet comparisons pass at8/24/44.1/48/96/192k,
mono/stereo, through continuous input, source-ended tails, disconnect/reconnect,
message edits, clear and right-only sleep behavior. Maximum measured Native and
independent-owner differences are zero. The bounds were fixed at1e-6 absolute
and relative RMS before the first run. No samples, alignment or gains were fitted.

Actual page reload also passes and matches saved PCM SHA
`15d8afe4a53ca70d7d8ab6ddc1b76cdd1e239b2423b3f6e2b6be47aad0cf5e14`.
Nine permanent tests cover six actual original-JS/Rust processor traces plus
constructor/message failure disposal, lazy preparation, cancelled creation,
context identity, complete initialization and retained repeated messages.
The accepted underlying engine's allocator proofs remain unchanged; live
processing uses fixed views and allocates no Rust storage.

The first live offroute comparison failed (max0.09213) because the candidate
used a bare worklet output while the original has a stable output Gain. That
changes the browser's automatic-pull lifetime. Preserving the original wrapper
topology fixes the measured behavior; no DSP algorithm or bound was changed.
The negative remains under ignored reports.

Review: `/tools/shimmer-live.html`. Evidence: six
`reports/modular_audio/shimmer-live-<rate>-final.json` shards,
`shimmer-live-first.json`, `shimmer-live-reload-final.json`,
`shimmer-live-focused.log` and `shimmer-live-verified.png`.

## Next boundary

Optional VoiceFx/Instrument factory hooks are being integrated separately.
This checkpoint does not select Shimmer in the normal prepared environment yet.
Creation allocates prepared storage; desktop PCM correctness does not establish
hot-activation, mobile or physical-device deadline headroom. Existing Native
implementation and normal defaults remain operational. Next verify actual
normal voice composition, arming/teardown and saved reconstruction before
selecting the factory in that environment.
