# Original Flanger with explicit cycle traversal

This NEW standalone numerical candidate preserves the literal Flanger graph and requires a caller-selected immutable cycleEntry: input or delay. There is no default profile choice, Native getter replacement, live/app selection, or universal Native-output parity claim. The actual48 kHz four-case stereo pilot passed on522df7eb02ed6717 (136,443 bytes, SHA256598e95cdd2e3317ddd204d26857eca8ed1c1691d29c8b687537b619abc1eda38). The pilot is retained separately from the complete acceptance recorded below.

## Why a named traversal is necessary

The earlier original-original controls differ by up to0.5188618898391724 at8 kHz/feedback0 and0.6109858006238937 at48 kHz/feedback.2. These are retained in reports/modular_audio/native-constructor-b1-flanger-first.json; they are not numerical-port acceptance. All126 tapped stage comparisons were exact, but taps themselves changed the graph and therefore cannot certify untouched outputs.

Pinned Chromium AudioSummingJunction stores output pointers in a HashSet and copies their iteration order into the rendering vector. AudioNodeInput pulls that vector. AudioHandler marks a handler processed before pulling inputs, so recursive visits use the previous cached output bus. Literal Flanger wet gain has two forward inputs, inputGain I and Delay D; this gives two source-derived untapped recursion entries. Full source pins and equations are retained in ignored reports/modular_audio/instrument-flanger-readonly-proposal.json.

Input-first: D_n=Delay(I_previous,dt_n), F_n=g_n*D_n, I_n=X_n+F_n. Delay-first: F_n=g_n*D_previous, I_n=X_n+F_n, D_n=Delay(I_n,dt_n). Each wet signal is the Float32 sum of I_n and D_n in that declared traversal order. The final output is dry*X+wet*(I+D). The delay reader itself is unchanged; there is no invented extra delay compensation. A feedback-first additional tap has a different cached-gain boundary and is intentionally not an untouched-output profile.

Each profile is reconstructed independently from captured input and actual setter epochs. Fresh comparison must retain every candidate error and require each entire untouched original output to match one fixed predeclared profile under maximum absolute and relative RMS1e-4. No per-frame switching, fitting, resampling, retries, runtime Native-order inference, or hidden profile choice is allowed. If either original matches neither, attribution is refused.

## Literal authoring and scope

The actual constructor authors no public amount/rate/depth/delay/feedback setter. Dry, wet and feedback gains all have Native intrinsic1; delay intrinsic0/max1second; LFO intrinsic440Hz/depth1. The constructor command count is0. Captured public rate changes cancel and schedule at exact RawF64 currentTime+.001; feedback is clamped−.9..+.9; delay is0..1second. The declared numerical amount profile is0..1. Getters that read Native AudioParam intrinsic values are not mirrored with authored fields.

The whole graph can be explicitly unpulled, preserving phase and delay/cached-bus state while its absolute authoring frame advances. Pulled depth0 still advances oscillator phase. Fixed mono/stereo layouts and continuous declared program only: automatic Native source-ended output disabling, silent optimization/tails, live timing and channel changes remain separate.

## Bounded private checks

Eight handles per Wasm instance, six lanes of256 events,128-frame quanta, maximum4MiB conservative plan per handle, input magnitude≤4. The JS recipe holds at most4096 commands/methods and always records cycleEntry. Reset preserves allocated buffers. The adapter has no implicit cycle default.

Private15 tests pass: explicit policy admission and immutable identity; literal constructor; different input-first/delay-first impulses even with feedback0; current feedback-gain versus previous-bus recurrence; original setter bounds/RawF64time; atomic capacity/input refusal; six rates and both layouts exact reset/independence; held phase; eight actual handle quota; raw JSON replay; source-identity proofs for accepted Native delay and strict Source7a capture bodies; an unconfigured-constructor full-family recipe with no public setter; complete cold-replay authority and mutation guards.

Rust allocator audit covers24 rate/layout/profile cases and4,800 quanta with zero allocation/reallocation/deallocation/memory growth during control/render/reset after preparation. Maximum prepared Rust heap1,670,048 bytes under planned1,743,776 bytes; eight largest owners13,360,384 bytes under32MiB. This does not claim JavaScript/Native zero allocation or a realtime deadline.

Build privately: node tools/buildInstrumentFlanger.mjs; --check; --audit; node tools/auditInstrumentFlanger.mjs. Public publication requires a separate coordinated asset window. All accepted Chorus/Phaser1efb, Delay171e, original Nodes and shared math remain unchanged.

## Actual pilot, precisely attributed

Full report: reports/modular_audio/instrument-flanger-522d-48000-first-result.json. Independent asserted audit: instrument-flanger-522d-pilot-independent-audit.json. Feedback0 matched input/input; positive-feedback scene matched delay/delay; late constructor matched delay/delay; early-unpulled matched delay/input. Every matching whole-case comparison was word-exact, and each untouched original matched exactly one profile.

The early-unpulled Native originals themselves differed15,850 words, maximum0.17325907200574875, yet each was word-exact to its different predeclared policy. Nonmatching candidate errors remain in the report (maximum0.17811229825019836). This is direct support for the source-derived boundary distinction, not permission to infer a policy in production or to switch per frame.

All eight Native actors retired cleanly; literal virgin constructor values were validated without entering Rust. Each profile's independent/JSON words and hashes were exact. All actual Source7a captures began0 with no gap/rejection; each kernel rendered8,192 frames, held exactly firstPull−birth, and reported0late/0clamps. Only the four48 kHz stereo scenes are covered by this receipt. Those pilot statements cover only the four48 kHz stereo scenes; the separate full acceptance follows.

## Complete numerical acceptance

Profile522df7eb02ed6717 passed60 actual cases: six rates8/24/44.1/48/96/192kHz × five scenes × mono/stereo. Scenes include untouched zero-setter construction, feedback0, timed positive/negative-feedback controls, literal late constructor and early-unpulled first use. Full receipts: reports/modular_audio/instrument-flanger-522d-{rate}-result.json. Independent asserted audit: instrument-flanger-522d-full-independent-audit.json.

Every one of120 untouched Native outputs matched exactly ONE fixed whole-case source-derived profile: input-first66, delay-first54. There was no double match, per-frame policy selection, fitted shift or parameter adjustment.119 comparisons were word-exact. The remaining8 kHz early-unpulled stereo input-first comparison had537 differing words, maximum absolute1.564621925354004e-5 and relative RMS2.253657919757998e-6, within the original unchanged1e-4 bounds. This profile does not claim automatic Native silent/tail-handler flag identity; no implementation or tolerance was changed to hide that residual.

All NONmatching candidate metrics remain in the reports (maximum absolute0.8740199208259583). Untouched Native pairs themselves varied in32 of60 cases, maximum0.7611037194728851. These large alternate-traversal differences are part of the explicit contract and are never treated as numerical error to normalize away or as permission to infer a production policy.

All actual source captures began0, completed their entire programs without gaps/rejections, and retained separate literal birth/first-pull and RawF64 setter epochs. The default constructor had zero public setter rows and verified original intrinsics. Both immutable profiles reported0rejections/late/clamps in these controlled Offline fixtures, processed8,192 frames per case and held exactly first-pull−birth. This is not a live timing guarantee.

The60 cases contain2,064,384 captured frames per plane summed over cases and3,096,576 output words per profile stream; each profile rendered491,520 frames total. All120 Native actors retired cleanly. Both profiles' independent and raw-JSON replay words/hashes matched throughout.

A complete ten-case192 kHz family additionally passed actual full-HTML save/reload/replay: instrument-flanger-522d-192000-cold-{save|replay}-result.json. Recipes, actual control/constructor epochs, source ledgers, packed commands, actual input and BOTH portable profile PCM hashes were exact. Native pointer traversal/hash authority changed after reload and is explicitly recorded separately; each new untouched output still matched one fixed predeclared whole-case candidate. Neither portable profile was switched or modified.

## Next boundary

The mathematical policies are now measured deterministic alternatives. A future live owner must retain required explicit cycleEntry, bounded scheduled-seconds/author-frame transport, real Source7a/route/init/terminal receipts and actual upstream clock/lifetime boundaries. The ordinary Instrument setter path does not call these Native intrinsic getters, so a later facade may refuse them explicitly; it must not substitute authored targets. No existing Native class, application/default selection, shared timeline, accepted1efb Chorus/Phaser or Delay171e kernel has changed.
