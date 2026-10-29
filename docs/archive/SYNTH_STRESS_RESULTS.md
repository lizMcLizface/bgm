> **Archived 2026-10-28.** Historical record of finished work; open items are tracked in [../ROADMAP.md](../ROADMAP.md).

# Synth stress matrix — first desktop measurements

18 October 2026. The source/effects feature pass is implemented in the isolated synth laboratories. This matrix measures that graph; it does not migrate the music generator or set automatic device budgets.

## Reproduce

Open [the stress matrix](http://localhost:5173/tools/stress.html). Choose a suite or a custom load; nothing starts automatically. Offline renders discard PCM after measuring it. Live runs use the shared AudioContext, foreground frame/clock observations and optional production-fluid load. Stop clears the graph, future events and tails. URL controls and JSON export preserve the load; current reports include complete patches/notes/routing, per-case protocol and kernel build manifests.

With the dev server running:

~~~powershell
npm run audit:synth-stress -- --suite=all --repeats=1 --verify --live --seconds=15
~~~

Set SYNTH_BROWSER=firefox and SYNTH_BROWSER_PATH to its executable for Firefox. SYNTH_AUDIT_DIR selects the report destination. Browsers must run sequentially; avoid other audio benchmarks/builds during timings. --cases=comma,separated,ids selects cases, --skip-offline --live measures only live, and --live-cases / --fluids / --seconds select that load.

## Method and scope

- Windows 10.0.26200; AMD Ryzen 9 3950X 16-Core Processor; 32 logical CPUs, 63.9 GiB RAM. Headless Chrome/155.0.8059.84 and firefox/158.0; muted monitoring. Chrome identified the RTX 3090 through ANGLE. Firefox reported a generic GTX 980 / 'or similar' renderer string, which does not identify the actual GPU; neither browser reported a software renderer. Other user applications were not controlled, so small differences should not be treated as rankings.
- 27 deterministic cases across all five source families, polyphony/unison/layers, four/six FM operators and 1×/2×/4×, SVF/ladder filters, modulation/glides/patch edits, air/vowels/body, inserts, per-instrument echoes, shared/private rooms, 44.1/48/96 kHz and complete tails. Most use an eight-second fixed window with 5.1–7.1 seconds of held melodic input; plucks rearticulate halfway. Native kits play 12 hits/s each. Boundary configurations intentionally exceed comfortable limits.
- Each screen excludes one warm-up and measures one render. Six representative cases were repeated three times per browser; the Chrome texture/ladder/expression addendum also uses three measured runs. The table uses those medians where available and labels their sample counts. Cold/warm preparation is stored separately. The initial 25-case Chrome run predates the two added cases and fixture manifest v2; its expression row is superseded by the addendum. Other initial audio fixtures are unchanged.
- Throughput is audio duration divided by offline render wall time. It includes browser graph overhead and opt-in callback telemetry, not audio-thread CPU. It does not prove real-time scheduling headroom. Fixed windows explicitly omit later source/effect tails; complete-tail throughput averages quieter/idle stretches and must not be used as sustained-voice capacity.
- Known memory is source + room + insert Wasm linear memory plus unique prepared piano/pluck PCM retained by the graph. Native percussion’s internal noise buffers are not included (so its known-memory cell can be zero); it also excludes browser nodes, overlapping LRU entries, graphics and other process allocations. It is not RSS or a phone memory limit.

## Offline results

| Case | Chrome audio/render | n | Firefox audio/render | n | Known MiB (Chrome) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Subtractive · 1 × 4, dry | 46.67× | 1 | 47.34× | 1 | 1.3 |
| Subtractive · 4 × 8, dry | 6.59× | 1 | 7.48× | 1 | 5.3 |
| Subtractive · dual layer / 2 unison | 2.40× | 3 | 2.49× | 3 | 5.3 |
| FM · four operators / 2× | 2.33× | 1 | 2.17× | 1 | 4.8 |
| FM · six operators / 2× | 1.74× | 3 | 1.86× | 3 | 4.8 |
| Prepared piano · 4 × 8 | 18.06× | 1 | 9.09× | 1 | 4.7 |
| Prepared strings · 4 × 16 | 23.27× | 1 | 125.00× | 1 | 12.1 |
| Native kits · 4 × 12 hits/s | 8.87× | 1 | 68.38× | 1 | 0.0 |
| Mixed · all five source families, dry | 4.57× | 1 | 4.97× | 1 | 16.0 |
| Mixed · full instrument inserts | 3.34× | 1 | 3.84× | 1 | 22.0 |
| Mixed · inserts, local echoes, one room | 2.95× | 3 | 3.27× | 3 | 28.6 |
| Mixed · two shared + private 20 s room | 2.49× | 3 | 2.79× | 3 | 41.8 |
| Mixed · one effect processor per instrument | 2.28× | 1 | 2.26× | 1 | 55.1 |
| Mixed · modulation, glides, held patch edits | 3.13× | 3 | 3.74× | 1 | 28.6 |
| FM · six operators / 1× | 3.55× | 1 | 3.50× | 1 | 4.8 |
| FM · six operators / 4× | 0.90× | 1 | 0.89× | 1 | 4.8 |
| Mixed · 44.1 kHz | 3.43× | 1 | 3.78× | 1 | 27.5 |
| Mixed · 96 kHz | 1.35× | 3 | 1.74× | 3 | 42.1 |
| Mixed · 8-line room | 2.91× | 1 | 3.25× | 1 | 28.6 |
| Mixed · 20 s room, same fixed window | 2.95× | 3 | 3.24× | 3 | 28.6 |
| Boundary · 8 × 32 FM voices | 0.22× | 1 | 0.24× | 1 | 19.0 |
| Boundary · 4 × 16 dual-layer / 4 unison | 0.70× | 1 | 0.75× | 1 | 10.0 |
| Boundary · 8 instruments, 16 voices, rooms | 0.97× | 1 | 0.92× | 1 | 52.5 |
| Complete 8 s room tail | 6.14× | 1 | 8.15× | 1 | 28.6 |
| Complete 20 s room tail | 6.51× | 1 | 9.13× | 1 | 28.6 |
| Mixed · expression, air / vowels / bodies | 2.13× | 3 | 2.38× | 1 | 28.6 |
| Subtractive · 4 × 8, ladder filter | 5.27× | 3 | 6.51× | 1 | 5.3 |

The ordinary five-family graph with inserts, individual echoes and one room renders roughly three times faster than real time on this desktop. Three rooms (two shared plus one private 20-second pad room) increase Chrome's median render time from 2715 to 3217 ms, and known retained memory from 28.6 to 41.8 MiB. The separate-per-instrument configuration has five effect processors. These comparisons support keeping individual echoes and selectively private rooms; they are not a universal preset limit.

The costly cases are FM oversampling, many active voices/layers/unison, acoustic textures and higher sample rates. The 32-voice, six-operator 2× FM case is above real time in both browsers, while 4× falls below it. The mixed texture fixture costs more than the otherwise matching expression fixture. At 96 kHz, the prepared-buffer working set also exceeds the existing 24 MiB LRU, so warm preparations still rebuild evicted buffers; do not attribute all of that cost to the Wasm render.

The 20-second FDN setting costs approximately the same per fixed eight-second window as the eight-second room. Rendering its complete conservative tail costs more total time because it renders more seconds. This confirms the intended separation of decay length from network size; it does not eliminate the cost of additional simultaneous rooms.

Every completed offline render had finite, non-silent, unclipped output, complete source telemetry and zero dropped/late/stolen notes. These synthetic fixtures are gain-scaled and do not replace preset listening or all possible hot-patch tests.

## Live observations

Each main live sweep uses two seconds of warm-up followed by 15 measured seconds, 48 kHz actual context rate, fluid off / 256–512 / 512–1024 simulation–dye grids. The same deterministic note fixture drives the production fluid solver; its 32-emitter cap remains. Frame statistics cover the measured foreground interval. Audio/wall covers the full session including warm-up.

| Browser / load | Fluid sim | Frame p95 ms | Audio / wall | Late / drop / missed cycles |
| --- | ---: | ---: | ---: | ---: |
| chrome / mixed-room (15 s) | 0 | 16.8 | 1.000× | 0 / 0 / 0 |
| chrome / mixed-room (15 s) | 256 | 16.8 | 1.000× | 0 / 0 / 0 |
| chrome / mixed-room (15 s) | 512 | 16.8 | 1.000× | 0 / 0 / 0 |
| chrome / boundary-band (15 s) | 0 | 16.8 | 0.832× | 0 / 0 / 0 |
| chrome / boundary-band (15 s) | 256 | 16.8 | 0.810× | 0 / 0 / 0 |
| chrome / boundary-band (15 s) | 512 | 16.8 | 0.785× | 0 / 0 / 0 |
| firefox / mixed-room (15 s) | 0 | 16.7 | 1.000× | 0 / 0 / 0 |
| firefox / mixed-room (15 s) | 256 | 16.7 | 1.000× | 0 / 0 / 0 |
| firefox / mixed-room (15 s) | 512 | 16.7 | 1.000× | 0 / 0 / 0 |
| firefox / boundary-band (15 s) | 0 | 16.7 | 0.829× | 0 / 0 / 0 |
| firefox / boundary-band (15 s) | 256 | 16.7 | 0.849× | 0 / 0 / 0 |
| firefox / boundary-band (15 s) | 512 | 16.7 | 0.877× | 0 / 0 / 0 |
| chrome / mixed-acoustic (60 s) | 512 | 16.8 | 1.000× | 0 / 0 / 0 |
| firefox / mixed-acoustic (60 s) | 512 | 16.7 | 1.000× | 0 / 0 / 0 |

Both browsers' normal five-family mixes kept their audio clocks in step with wall time. Firefox also lagged at the eight-instrument boundary (about 0.83–0.88 audio seconds per wall second), despite smooth frames and clean queues. Chrome’s eight-instrument / 16-voice / three-room boundary kept the page near 60 fps and reported no queue drops, yet its audio clock advanced only 13.4–14.2 seconds in roughly 17 seconds of wall time. This is a clear reason to inspect the audio path even when graphics and queues look healthy. The page now shows clock/wall explicitly and marks differences greater than 5% for inspection; this heuristic is not a hardware underrun counter.

The one-minute texture runs also kept their clocks aligned with zero reported queue/cycle problems. Firefox recorded two frame intervals above 33 ms (maximum 34.9 ms); Chrome recorded none. These are short headless desktop observations. Device underruns remain unavailable, and clean queues/frames alone never establish glitch-free playback. Physical phones, thermal behavior, hardware-output listening, background-tab behavior and sustained device/browser memory still need measurement. A 390 px viewport is a layout check only.

## Remaining work and direct next step

The combined matrix and first desktop baseline complete this slice of sound-engine validation. Follow-up [DSP profiling](SYNTH_DSP_PROFILE.md) is now complete and identifies fractional-envelope and acoustic-colour work as the next optimization targets. Keep the approved 2× FM default and leave the released generator on its existing backend. Next: apply and verify those targeted optimizations, then run the same moderate mixed loads on actual phones and longer audible Firefox sessions, then choose conservative per-device quality/polyphony/room budgets before an explicit generator-integration slice. Music-generation Phase 5 remains actual-preset listening/tuning; chip articulation is excluded.

Raw JSON and screenshots are in this task's outputs/stress-matrix, outputs/stress-addendum and optional stress-live-* directories; see the accompanying plan checkpoint for validation counts. No commit, push or deployment was performed.
