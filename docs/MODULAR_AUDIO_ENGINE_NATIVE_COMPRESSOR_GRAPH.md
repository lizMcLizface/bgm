# Native compressor graph contracts

11 November 2026 overnight checkpoint. Graph28 `native.compressor` and Graph29
`native.compressor.capture` reuse the accepted static and captured native kernels.
They remain explicit opt-in modules. The sidechain `graph.compressor`, voice
compressor, desk dynamics and normal Web Audio routes retain their identities.

Both modules consume stereo `program.in` and produce stereo `audio.out`. Each
owns its detector, linked gain history, lookahead, 32-frame division clock and
128-frame control clock. No adapter block or smoothing is added. Preparation
requires all five original controls, retaining f64 requested targets separately
from the source-defined Float32 coefficient snapshots. At most eight native
compressor modules are allowed in one graph.

The streaming module accepts owner-tagged parameter events on canonical128 input
boundaries. Late events move to the next legal boundary and increment the graph
late counter. Cancellation removes that owner's future graph events. Reset
clears cold histories and retains the most recently applied raw targets.

The captured module has no mutable graph parameters. Its configuration contains
the bounded original-seconds step/target timelines from the accepted automation
adapter: at most256 events per control and1024 in total. These immutable module
resources are separate from cancellable owner events. Reset replays the captured
initial values and timeline. Invalid captured edits reject before queue mutation.
Persistence stores the complete profile, targets and original seconds.

Prepared latency is the original native lookahead, including its1023-frame
capacity limit. At8/24/44.1/48/96/192kHz this is48/144/264/288/576/1023 frames.
The graph's optional PDC can align a parallel dry branch by exactly this amount.
The descriptor explicitly exposes no external sidechain port. The separate
`nativeCompressorState()` query returns target/coefficient ledgers, reduction,
native tail, clock phases and latency without inventing generic graph controls.

Verification before this checkpoint:

-25 focused graph tests pass: both modes at all six rates match standalone PCM
  exactly despite foreign gate splits and irregular graph calls. They cover
  independent handles sharing Wasm, save/reload, reset, owner cancellation, late
  boundary controls, raw preparation failure/correction, immutable captured edit
  rejection and six-rate parallel-branch latency compensation. The PDC test uses
  the actual standalone startup amplitude; a unity-gain assumption was rejected
  at high rates, without changing DSP or tolerances.
-Actual one- and three-worker masters at48/96kHz match serial PCM exactly across
  all eight buses, with zero queue underruns in these functional runs.
-12 counting-allocator cases use two prepared graphs with PDC at all six rates,
  exercising render, enqueue, cancel, reset and pause. Allocation/reclamation
  calls and memory growth are zero. See `graph-native-compressor-allocation.json`.
-12 actual browser cases compare native DynamicsCompressorNode with two real
  independent graph AudioWorklets, one rendering regular128 spans and one
  rendering1/37/90 spans. Both modes pass all six rates with maximum absolute and
  relative RMS PCM differences0 in this run. Native meter and onset clocks pass;
  limits were fixed at1e-4 before testing. Evidence:
  `native-compressor-graph-native-browser-first.json` and its screenshot.

This is audio PCM, control, lifetime and persistence evidence. Physical listening,
phone delivery, live user editing, normal transport adoption and target-device
deadline acceptance remain separate. Next integrate accepted source/effect
modules into a coherent opt-in portable host; preserve the normal native route.
