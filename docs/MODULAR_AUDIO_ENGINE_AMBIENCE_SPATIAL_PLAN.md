# Complete owned Ambience spatial, fade and wander slice

This is a source-derived next-task proposal, not an implemented or accepted port. Keep normal default playback selection native until the combined source/processing gates justify adoption. Hidden cello work remains separate.

## Exact audited chain

`src/app/engine/ambience.js` creates one stereo chain for each active rain/thunder/wind/waves/fire/vinyl layer: input gain, distance lowpass (`Q.value = 0.5`), two additional shelter lowpasses for weather only (`Q.value = Math.SQRT1_2`), same/cross width matrix, stereo panner, level gain and layer drift gain. Chains sum into the bed output/start-stop gain and then the total drift gain. Existing source-specific one-second loop replacement fades occur before the layer chain.

Distance cutoff is `18000 * (600/18000)^distance`; distance gain is `1 - 0.35*distance`. Shelter cutoff is `min(sampleRate*.45, 18000*(300/18000)^shelter)`. Width weights are `(1+width)/2` and `(1-width)/2`, with original per-edge Float32 gain/product/addition boundaries. Level is `level^1.6 * 1.8`, multiplied by distance gain. Preserve native lowpass Q semantics and endpoints through the attributed biquad helper; do not reinterpret the numeric Q fields as an unrelated linear filter design.

`applyShape` uses SetValue for zero ramp and SetTarget with time constant ramp/3 otherwise. Existing starts cancel/set the level control, shape edits ramp over .15 seconds, ordinary live updates preserve their .3/.4-second decisions, and bed stop uses a target to zero with fade/5 before stopping sources at time+fade. Preserve those exact authored operations, public-property constructor events, clamping and Float32 conversion order.

Layer wander uses the original `wander.js` sine/bounded Brownian algorithms. Six layer slots retain phase `(slot*.618034+.07)%1`, seed `6101+slot*53`, and period factor `.85+.3*((slot*.381966+.19)%1)`. Total wander retains phase .31 and seed4411. Both modes preserve actual pull-age, zero-depth versus disconnected behavior, existing knots across period changes, RNG draw counts, piece offsets and exact mode-switch history. Reuse accepted math/control kernels only after testing these distinct constants and lifecycle recipes; role wander is not an interchangeable preset.

## Proposed owned boundary

Create a new standalone Rust processing core first, with six separate stereo layer signals and one stereo bed output, owned per-layer IIR state, width/pan/level/drift state, bed fade and total wander. Its complete adapter must retain distinct old/new loop contributions until their owned per-source replacement fades and layer mix are applied; six already-mixed inputs alone cannot own those fades. Bound contribution slots against the existing sixteen loop-source slots and three weather stems, or add the equivalent owned fade stage beside the bank. Prepared loop banks and owned weather keep their exact source generation. Do not silently retain native gain fades, filters, panners or oscillators inside a claimed complete processing profile.

Use the existing attributed native biquad/panner/width kernels where their exact operation/precision contracts apply. Constructor property events and live control timelines need explicit initial snapshots and acknowledged live batches. Native gain/panner/control paths can have different constant and sample-accurate branches; compare both. All arrays/event resources must be preallocated or prepared outside render, with bounded admission, explicit source ownership, reset, cancellation and JSON replay.

Source start/stop alone does not identify the native processing clock. Model explicit source-authored activity and demand instead of guessing an IsSilent flag from small samples. A layer can remain pulled at level zero, while disconnected inputs, ProcessOnlyAudioParams, channel-count changes and deferred native output disable alter native IIR activity/tail behavior. Any proposed policy must be tested against actual source-derived topology and acknowledged as a deterministic owned contract where the native reference has more than one observable trace.

## Evidence gate before adoption

First compare original static distance/shelter/width/pan/level coefficients, native property events and control trajectories at six rates and representative boundary controls. Then actual native/offline/live captures must cover mono/stereo inputs, all six layers, partial starts/stops, overlap, source-driven activity, long idle/wake intervals, mode/period edits, zero-depth drift, independent beds, late/reused context construction and save/reload. Keep complete per-layer outputs separate from final sums.

The existing native summation diagnostic proves full mixes can differ solely because native three-input addition order differs, even between two untapped native controls. Use exact source/per-layer comparisons and a separately derived aggregate arithmetic envelope; do not claim aggregate bit identity. The unresolved normal offline native filter endpoint is similarly an explicit next boundary: the final booking bug is fixed, but the remaining 128-frame ~1e-13 difference must not be trimmed or accepted by inventing a tolerance. Compare actual native lifecycle alternatives and state/flag evidence before selecting the complete owned tail policy.

Finally assemble the new processor with pooled live banks and immutable offline snapshots, preserve original source offsets/fades/settings, and verify two independent normal beds on one context plus normal export. Only then wire the context-level prepared environment. No per-instrument selector or backend field belongs in saved song data.
