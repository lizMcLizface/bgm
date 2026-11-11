# Owned graph port integration — overnight 11 November 2026

This is an opt-in integration of the original kernels. Existing live/default
backends remain. Prepared Rust state owns every module; host orchestration and
external rack/return seams stay explicit. Cable editing and arbitrary distributed
execution are later work.

| Type | Code | Fixed intrinsic latency |
| --- | --- | --- |
| legacy.inserts / legacy.effects | 12 / 13 | 128 frames per adapter |
| graph.delay | 14 | Configured immutable integer frames |
| desk.strip / matrix / fader | 15 / 16 / 17 | 0 |
| desk.limiter | 18 | ceil(sampleRate × .003), including bypass |
| legacy.classic | 19 | 0; native composite retained |
| rack.crusher / pitch / zplane | 20 / 21 / 22 | 128 frames per adapter |
| voice.shimmer / freeze | 23 / 24 | 128 frames per adapter |

Each effect captures128 input frames and emits the preceding completed block.
Foreign graph events and executor partitions do not change the original kernel's
callback cadence. Effect parameter events use global128-frame input boundaries;
a late valid target advances to the next boundary. Native smoothing, sleep,
capture, clear and tail behavior remain. Pitch's wet delay is time-varying;
the128-frame query describes the adapter, not a fixed delay of the wet algorithm.
Insert/send targets retain original f32 authority; rack/voice targets preserve
their message f64 values, with rack controls converted by the original native
Float32AudioParam law. ZPlane banks/custom rows are immutable after preparation
in graph v1. Dedicated standalone adapters still expose their original edits.

Desk configs must be complete, match graph sample rate and have no embedded
events: graph events are the sole clock authority. Named mixer automation uses
a separate f64 ABI, retaining values such as a limiter ceiling that differ only
below f32 precision. Original12ms smoothing applies to strip/matrix/fader;
limiter control changes are immediate. The limiter is the original linked
sample-peak algorithm, not a true-peak limiter. Compiler seams retain headroom,
ambience bypass, returns, pre-music processing and the master insert position.

`legacy.classic` captures actual model0..13 parameters, complete VS/WT waves,
controllers and the host held-key polyphony cap. Events use exact sample frames.
Its native callback cache splits only for its own prebooked events; a new event
cannot rewrite already-generated PCM and is explicitly clamped to that boundary
with late counters. One owner holds a source until reset. Panic/cancel clear
future owned material; cancel also silences cached native background noise.
WT reset/resource preparation is lifecycle work, not quantum-safe work.

Classic native composites include their original BBD/space/DC/output stages.
The private live source input follows that composite and precedes each existing
outboard rack. A lease gates the old native feed while owned PCM is connected.
Minimoog stacks retain one native module and one existing rack per actual slot;
they cannot be collapsed before nonlinear racks. The fixed workbench transport
still has five pitched slots and percussion slot6, plus kick and mix buses.
Oversized role/stack selections fail before starting playback. This does not
change the graph's separate eight-pitched-module resource limit.

`latencyCompensation:true` is an explicit patch policy; absent/false preserves
existing timing. Prepared path queries retain f64 latency (FM7.5/7.75 included).
Only integer differences are currently compensated. Unequal fractional paths
reject instead of rounding; equal absolute fractional paths can join. FM quality
edits that change prepared latency reject under PDC. Host input metadata is a
declaration of an already-delayed source, not an extra physical delay. Pool
masters receive actual prepared source maps before construction. Delays advance
even across disabled detector edges; reset clears them and pause freezes them.

Bounds:64 nodes,128 edges,4096 global events,8 pitched modules,8 native insert
engines,4 native send engines,16 rack engines,8 voice FX and at most2 Freeze
instances. A delay is at most262144 stereo frames; explicit and compensation
buffers together are capped at1048576 stereo frames (8MiB). Preparation can
allocate; enqueue/render/pause/cancel/reset are watched separately by audits.

Freeze is worker-only in realtime. Its exact synchronous four-second capture
copy can exceed one callback period. Browser startup and every direct realtime
processor constructor reject a serial Freeze graph, including fallback and
dependent pool masters. Direct/offline ReferenceGraph remains available for
compatibility measurement. Its seeded xorshift32-v1 stream is explicit; native
unseeded Math.random identity is not claimed.

Evidence is split deliberately: permanent effectGraph/mixerGraph/classicGraph
tests establish original PCM, events, save/reload, independent state and delay
semantics; pool-effects-latency-parity.json covers actual Node threads and eight
buses; graph-owned-ports-allocation.json covers two complete shared-memory graphs
through all effect families, mixer/limiter, a classic branch and PDC. Desktop
AudioWorklet/routed output evidence is recorded separately when run. None of
these functional comparisons claims a worker speedup or physical listening.
