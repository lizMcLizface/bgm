# Owned classic backends — overnight slice

2026-11-10. The twelve classic backends without mutable global wave tables now
have an owned reusable API: CS80, Juno, Prophet, Jupiter, Minimoog, DX7, OB-Xa,
TR808, TR909, TR606, TB303 and TR707. Core voices/parameters, Juno BBD, shared
space effects, DC history and planar output buffers belong to each Engine.
Large delay buffers are initialized directly on the heap before render.

The existing singleton ABI remains the default feature; the crate now also
builds as an rlib with `default-features=false`, excluding legacy HOST/BUFFERS
and the VS/WT global-table modules. The owned API initially rejects models7/12
explicitly; their resource extraction is the next parallel instrument task.
This slice does not change All's backend selection or insert a classic source
into the modular graph yet.

`OwnedClassic` validates a versioned model/parameter configuration and exposes
bounded blocks, controls (including sustain/soft), note IDs, poly pressure,
sequence commands on drum/bass models, panic, reset and safe disposal. Views
must be refreshed off render after preparing another handle in the same memory.
Reset restores initial DSP state and reapplies the wrapper's captured/current
parameters; save/load is configuration replay, not an in-flight tail snapshot.
There is no render allocation or global instance switching.

Evidence:

- Preserved original pre-extraction kernel at baseline58f56d7 in
  `.tmp/classics-before-owned.wasm`; no original binary was overwritten before
  capturing the baseline.
- `classics-owned-compatibility.json`:1,680 actual factory-preset/rate cases
  across the twelve models and44.1/48/96kHz. Owned output matches the original
  kernel exactly at128-frame cadence, including stereo output, shared effects,
  two-note overlap, pressure/control changes and release.
- `classics-owned-allocation.json`:36 two-handle portable Wasm runs report zero
  allocation/reclamation calls and zero memory growth for prepared render,
  note/control/pedal/panic/reset. The portable audit kernel is298,640bytes.
-13 permanent owned-instance tests pass: shared-memory independence, reset,
  save/reload, sustain/soft controls, invalid models/events/blocks and disposal.
- The rebuilt default legacy kernel is505,634bytes and retains the original
  singleton entry points, with source/cache provenance updated.

Limits: per-instance immediate DSP API only; timestamp/owner integration into
the graph is separate. Space processing retains its original matching-block
semantics. VS/WT need owned wave buffers, built tables and scratch before being
accepted. No physical listening or general live-backend migration is claimed.

### Overnight continuation: all14 native models owned (2026-11-11)

The VS/WT limitation above is resolved. Each instance now owns raw waves,
MIP/hash tables, FFT scratch and readiness. Original singleton wave upload and
commit entry points remain operational. Six audit cases report zero allocation,
reclamation or growth during prepared wave DSP. All588 VS/WT factory/rate
comparisons are bit exact against the preserved original kernel, including
rebuilt legacy upload/commit behavior. Together with the previous1680 cases,
all2268 factory/rate comparisons preserve original output.

All2268 cold-reset replay cases also match fresh owned instances exactly.
Owned-only cold resets clear inherited WT RNG/trace/ticks while retaining wave
resources. The original legacy initialization behavior remains. WT reset can
rebuild state and took up to11.7506ms: lifecycle work belongs outside callbacks.
VS staging allocates3145728bytes on first commit outside render, then publishes
at its original16-frame control tick (at most98304bytes copied for four waves).
These costs are explicit; ownership alone does not establish realtime deadlines.

Twenty-five published-asset permanent tests pass. The rebuilt legacy-compatible
kernel is531640bytes, with synths:check provenance passing. Timestamped Graph
adapters and the private live source boundary are separate integration work;
neither changes the default live backend. Evidence is in the owned-wave,
owned-wave-allocation and owned-reset-compatibility reports.
