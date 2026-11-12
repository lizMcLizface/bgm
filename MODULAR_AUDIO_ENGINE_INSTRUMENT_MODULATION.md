# Original Chorus and Phaser numerical profile

This standalone preparation/render port preserves the literal Nodes.Chorus and Nodes.Phaser algorithms. It has no application/default factory adoption, live AudioWorklet, Native getter, automatic source-end filter-tail, channel-transition or Flanger claim.

## Source contract

Chorus has three 30 ms delay readers with 5/8/11 ms bases and .3 voice gains. Its actual constructor oscillator rates are .5/.7/.9, while its authored rate getter is .6. The public rate setter uses v/v+.1/v+.2. Feedback is metadata only. The fixed portable voice sum order is 0,1,2.

Phaser has six attributed Native allpass filters, Q .5, a separate wet input, and the original feedback connection. Its actual constructor depth steps from 800 to min(800,800*.8)=640. Each original centre/depth setter retains its authored fields and recalculates the sweep bound. The explicit continuous-cycle profile reads the previous final-filter quantum through the current feedback gain before the new cascade; full Native comparison is required before acceptance.

The shared literal Oscillator starts with intrinsic 440 Hz and schedules public frequency changes at captured currentTime+.001. Rate0 is not a disconnected oscillator; depth0 retains phase advancement while pulled. Explicit unpulled periods do not synthesize elapsed phase. Constructor birth and first pull are separate. The adapter accepts actual captured method epochs, not a Native coefficient/value bridge.

Native allpass clipping and coefficients are attributed to pinned Chromium e14de735f191c3a2bdce821a5e3f146bdc987b1e. Timeline and Sine dependencies are immutable hash-pinned existing implementations; the new allpass helper leaves accepted Tone modes unchanged. The delay read body is mechanically identical to accepted instrument-delay; only ring preparation changes to the literal30 ms maximum.

## Native authority before the port

The 48 kHz six-case actual authority receipt is reports/modular_audio/instrument-modulation-authority-v1-48000-first-result.json. Phaser original pairs were word-exact for cold, late constructor and early-unpulled cases. Chorus dry and all three voice witnesses were word-exact; each of the four full outputs matched one predeclared fixed whole-case Float32 sum order. Untouched Chorus pairs retained 2,824/0/2,416 differing words, maximum1.49e-8. No per-frame order fitting, offset, gain normalization or repeated allocation selection is used. The separately captured Native gain marker is only a sum-law authority witness and never enters Rust or its replay API. All18 Native actors retired cleanly. The original authority source files and independent audit are retained under ignored reports/.

## Bounds and checks

Eight actual handles per Wasm instance; two channels maximum; 24 bounded lanes of256 events; explicit 128-frame quanta; raw finite input magnitude≤4; declared2 MiB upper bound per handle. No large Native source/table vendoring is added. Public methods reserve all actual lane credits before mutation. The JS recipe journal is bounded4096 raw commands and4096 methods; it reconstructs from the constructor with the same PCM and declared pulled windows, not from a mid-render snapshot.

The Rust allocator audit covers24 family/layout/rate combinations and4,800 quanta: no allocation, reallocation, deallocation or memory growth during controls/render/reset after preparation. Maximum prepared heap666,992 bytes, maximum conservative plan961,904 bytes; eight largest Chorus handles5,335,936 bytes. This does not certify JavaScript/Native allocations or realtime deadlines.

The first48 kHz six-case stereo numerical pilot passed on public profile1efb0cfc290f1e11 (179,263 bytes, SHA25687e918390e60ad651951cc57951b618a03de88714f962db979d47b9a29475887). The full report is reports/modular_audio/instrument-modulation-1efb-48000-first-result.json; independent asserted audit instrument-modulation-1efb-pilot-independent-audit.json. All Phaser comparisons against both originals and all Chorus raw voice stems were word-exact. Canonical Chorus aggregate versus both untouched originals had maximum absolute1.4901161193847656e-8 and relative RMS3.385701036971712e-8. Independent and JSON PCM/hashes were exact; all18 Native actors retired cleanly. All actual input clocks began0, had no gaps/rejections, and kernel late/clamp counts were0. Each engine rendered8,192 frames; held frames equalled actual first-pull minus literal birth. These pilot statements are retained separately; complete acceptance is recorded below. Fixed maximum absolute and relative RMS bounds are both1e-4. It compares one canonical Rust profile against both untouched originals; independent and JSON replay must be word-exact. Cold HTML replay records Native aggregate hashes without falsely demanding Chorus fan-in hash stability.

Build/check: node tools/buildInstrumentModulation.mjs; node tools/buildInstrumentModulation.mjs --audit; node tools/auditInstrumentModulation.mjs. New public installation is permitted only in a coordinated browser asset window.

## Complete numerical acceptance

Profile1efb0cfc290f1e11 passed all72 actual cases: Chorus/Phaser × cold/late-constructor/early-unpulled × mono/stereo ×8/24/44.1/48/96/192kHz. Full receipts are reports/modular_audio/instrument-modulation-1efb-{rate}-result.json; the asserted independent audit is instrument-modulation-1efb-full-independent-audit.json.

Each case captured from actual Source7a frame0 without gaps/rejections through its complete program. Actual literal birth and first-pull matched the authored canonical fixture frames in this matrix; each kernel processed8,192 audio frames and held exactly first-pull−birth. Every actual Original setter epoch and now+.001 rate event was retained unchanged. Original constructor and final authored getter fields matched the literal laws. Kernel rejection/late/clamp counts were0 for these controlled Offline cases, which does not claim zero live publication latency.

All Phaser comparisons against both untouched Originals were word-exact. All three Chorus raw voice outputs were word-exact across all36 Chorus cases. Every Native dry/voice witness pair was word-exact, and all four Native Chorus outputs matched a predeclared fixed whole-case sum candidate. The one canonical Rust order0,1,2 remained unchanged. Against both untouched Originals, worst absolute error was1.4901161193847656e-8 and relative RMS4.512868254326699e-8, under the unchanged1e-4 limits.97 of144 complete Rust/Original comparisons were word-exact; the remaining47 were Chorus fan-in rounding. The untouched Chorus Original pairs themselves differed39,884 words across the matrix, openly retained.

Across72 cases this is3,735,552 captured frames per plane summed over cases,5,603,328 output words per stream,589,824 actual rendered kernel frames, and216 fully retired Native actors. Independent Rust and raw-JSON replay were word-exact with matching hashes throughout.

Both complete six-case192kHz families additionally passed actual full-HTML save/reload/replay: instrument-modulation-1efb-192000-{chorus|phaser}-cold-{save|replay}-result.json. All exact recipes, constructor/control epochs, packed RawF64 commands, actual input/owned/independent/reloaded hashes and source ledgers matched. Phaser Native aggregate hashes also matched across reload. Chorus Native aggregate hashes changed, as expected from independently observed fan-in variation; each rerun still passed the same fixed numerical bounds and witness law. The replay contract never changes the portable sum order or infers Native traversal.

## Remaining boundary

This closes the stated original numerical graphs, not a live-stage/application/default migration. The next independent step is a bounded Source7a/atomic-route live owner with literal lazy constructor epochs and full setter admission, real initialization/terminal receipts, and optional explicit factory integration. Fixed numerical layout support does not certify arbitrary Native channel transitions, source-ended silent-tail scheduling, synchronous Native AudioParam getters, or realtime/mobile performance. Shared math and existing Native/default factories remain unchanged. The separate Flanger candidate has required named traversal profiles and its own evidence; it is not part of this accepted canonical Chorus/Phaser profile.
