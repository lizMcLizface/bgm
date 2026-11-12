# Prepared Main tone, volume and duck strip

Checkpoint: 12 November 2026. Separate Rust reference profile
`main-tone-volume-duck-prepared-v1`, host identity `2a3e701cfe6db655`.
The application remains hybrid. Existing Main nodes and default playback are unchanged.

The owned strip implements the existing low-pass tone (Q 0.5), then volume,
then duck gain. It keeps separate Float32 products and the original Native
AudioParam call order, seconds and time constants. Its filter and timeline
helpers are the accepted rack helpers, referenced without editing them.
The Rust instance owns its filter histories, three bounded timelines and
input/output planes. There is no shared mutable DSP state.

The typed saved contract has a sample rate, fixed mono/stereo layout, three
initial values and at most 1000 ordered setter calls. Calls are set, linear,
target or cancel; cancel's original seconds are converted to timeline frames.
All calls are authored before rendering, as in an explicitly prepared finite
program. Rendering accepts arbitrary splits up to 2048 frames and advances
parameter curves only at the original 128-frame boundaries. The admitted
program is continuous, including numeric zero. No Native silent flag, demand
clock, source end, live update or suspension behavior is inferred from PCM.
Invalid input fails the owner closed. Disposal is idempotent and frees the
owned Rust allocation. A fresh owner replays a saved program from frame zero.

Actual desktop Native comparison: 60 cases at 8/24/44.1/48/96/192 kHz,
mono/stereo, constant controls, tone/volume/duck targets, cancelled overlapping
duck/tone calls, linear ramps and zero/unmute edges. Every Native Float32
sample matches bit for bit, including the original boundary rounding. The
reloaded program rendered with irregular 17/511/128/1999/1-frame splits also
matches bit for bit. A true HTML reload reran all 60 cases; fixture, input,
Native and both owned PCM hashes and complete reports are identical.
Receipts: `reports/modular_audio/main-strip-2a3e-final.json` and
`main-strip-2a3e-cold-replay-final.json` (ignored local evidence).

The first negative receipt `main-strip-9149-first-negative.json` is retained.
The new adapter initially passed seconds to the timeline's frame-based cancel
operation. Ordinary targets matched, but cancelled cases failed. Correcting
that boundary restored exact PCM without changing accepted helper code or
widening the 1e-4 review bound. The final observed error is zero.

Nine focused actual-Wasm tests pass, including saved cancellation chronology,
sealed control books, nonfinite input before frame advancement, and two
simultaneously live raw handles in one Wasm instance. A separate instrumented
Rust build rendered 49,152 callbacks / 6,291,456 frames across 12 rate/layout
cases with 550 prepared target/cancel calls per case: zero allocations,
reallocations, deallocations or memory growth during render. That audit covers
Rust render only, not JavaScript allocation, worklet deadlines or device audio.
Receipt: `reports/modular_audio/main-strip-allocation.json`.

Reproduce with `node tools/buildMainStrip.mjs --publish`,
`node tools/buildMainStrip.mjs --publish --check`, and
`npm.cmd exec -- vitest run src/modular-audio/ownedMainStrip.test.js`.
The grouped muted review is `/tools/main-strip.html`. Its Native chain is
literal Biquad -> Gain -> Gain, with the same exact source buffer and setters.
Review material is a numerical diagnostic; physical listening is unassessed.

Next: prepare a separate clocked live facade with explicit continuous source
ownership, original per-call dispatch times, bounded control admission and
acknowledged terminal cleanup, then prove live start/control/retirement before
replacing any Main route. The normal percussion route does not have the melodic
tone/duck chain and needs its own exact layout contract. Whole-Main adoption,
Room routing and dynamic timeline append are separate integration gates.
