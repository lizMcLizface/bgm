# Full Tape in the portable graph

Graph27 `voice.tape` integrates the verified explicit full Tape profile. It
owns its five f64 targets, four oscillator clocks, tone/delay/filter histories
and1–32 immutable drive curves. Curves allocate only during preparation; future
unprepared values fail before event-queue mutation. All graph parameter events
use canonical128-frame input boundaries. Late controls move to the next boundary
and remain visible in late counters. Owner cancellation removes future controls.

This is the exact-integer graph control contract. The standalone native
prebooked-seconds importer retains different transition state and is deliberately
separate. The active graph effect also does not infer Instrument's all-zero
native bypass. Normal All routes and defaults remain unchanged.

The source-derived FIR contributes128 frames of fixed group delay. The intentional
6ms wet delay is modulated, so total wet latency is not fixed. Descriptor latency
is unknown; the prepared graph query reports only the known FIR group portion,
with that scope declared. Both JS and Rust reject automatic latency compensation
for a graph containing Tape. No extra128-frame input adapter is introduced.

Production graph `dd0b459e6b932eab` passes15 focused tests: exact standalone/graph
PCM at8/24/44.1/48/96/192k under irregular calls and foreign event splits, f64
targets, immutable drive bounds, late/cancel/reset/independent handles, raw retry
and PDC rejection. Actual one- and three-worker masters preserve all eight source
buses at48/96k with zero measured transport misses. Six two-graph allocator
cases observe no allocation/reclamation calls or memory growth after preparation.

The built `tools/tape-graph.html` batch routes Tone → Motion → full Tape → one
desk limiter through the actual Graph AudioWorklet. All six sample rates exactly
match irregular direct rendering. Two independent worklets and canonical saved
restart pass; actual full-page reload repeats the72,064-frame48k fixture exactly.
Evidence: `tape-graph-desktop-browser.json`,
`tape-graph-page-reload-browser.json`, `graph-full-tape-allocation.json`.

The standalone native comparison remains the algorithm parity proof; graph
tests verify its integration and ownership. No physical listening, phone result
or device deadline guarantee is inferred. Native bypass/automation adoption in
the normal host is a later explicit task.
