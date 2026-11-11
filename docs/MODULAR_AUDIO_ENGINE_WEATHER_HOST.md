# Owned weather source host review

`tools/weather-owned.html` is a fixed opt-in review page. It does not change All,
Ambience or their defaults. The portable source remains before Ambience's native
per-source level, pan, width, distance and shelter chains. Those external chains
are excluded explicitly; the three source stems must not be folded into one
graph output and then presented as equivalent routing.

## Actual processor and clocks

`public/weather/owned-bed-processor.js` has no imports and instantiates the
verified published `weather/weather.wasm` module supplied by the loader. Each
worklet owns a private Wasm instance, memory, seed, twelve source layers, gains,
delay histories and event timeline. It publishes three separate stereo outputs:
rain, thunder and waves. It copies the actual Rust stem buffers without a cache,
extra quantum or additional DSP. Algorithmic adapter latency is zero frames.

The processor URL uses a separate manifest `hostVersion`; the report records
`hostVersion` and `hostSHA256` independently of the unchanged kernel version.
The browser host uses normal 128-frame callbacks; the source kernel itself is
sample-state based and accepts arbitrary bounded partitions. Partial first and
last callbacks do not restart RNG, filters or envelope state. Rendering allocates
no JavaScript arrays or typed-array views. The input contract is a complete
versioned `weatherBedSpec`, including the explicit uint32 seed and at most 4,000
pending timestamped commands. Host control requests are capped at 64.

`startFrame` is an explicit absolute integer AudioContext frame. Spec events use
source-local frames: source frame zero is that start frame. Pre-start callbacks
output zero without advancing model time, matching the original worklet's
start behavior. `enqueueAtContext(event, contextFrame)` imports the explicit
absolute frame; its `contextFrame` is authoritative and the payload's frame is
not used for timing. Raw Rust rejects late commands and increments its late
counter; it does not silently clamp them. Stats expose both clock origins,
applied/late/overflow/queued counts, pre-start silence, startup lateness,
finite-stop completion and per-source activity. Startup lateness is recorded
and fails the fixed acceptance check; no device scheduling guarantee is claimed.

`reset(futureContextFrame)` restores the captured initial seed/state and immutable
spec timeline, then assigns a new explicit context origin. It does not serialize
midstream RNG/filter history. Cancel removes future commands of its owner while
retaining already active thunder/surf voices. Dispose releases the Rust handle
outside process, disconnects outputs and rejects outstanding host requests.
Constructor failure after allocation frees the partial handle once.

## Fixed verification

The silent batch uses 8, 24, 44.1, 48, 96 and 192 kHz. Each source runs for 1.25
seconds rounded up to a quantum, with a non-quantized start frame 131. Two manual
thunder and surf triggers overlap seeded weather. Two complete state changes
exercise the original environment and twelve 40 ms smoothed bed gain targets.
The fixture retains all three stereo outputs independently through an explicit
six-channel merger into OfflineAudioContext output.

For each rate the batch compares the actual original `WeatherBedModel` and
`WeatherModel` classes against all twelve raw Rust layers and three bed stems
(maximum absolute and relative RMS limits `1e-7`). It then checks actual
AudioWorklet output against direct Rust PCM exactly. One trigger is removed from
constructor prebooking and sent through the actual MessagePort using its
absolute context frame, with acknowledgement before rendering. Pre-start and
post-stop output must be exactly silent, with all three active stems finite and
nonzero. At 48 kHz, a second independent worklet has a silent plan and must stay
silent while the first remains unchanged.

Cold reset, arbitrary partitions and complete saved-spec restart must preserve
PCM exactly. The page stores the isolated fixed fixture plus the SHA256 of its
six-channel PCM. After a real page reload, a separate button requires navigation
type `reload`, creates fresh original/Rust/worklet instances and verifies both
the saved PCM hash and exact direct-versus-worklet equality. This is seeded
replay from zero, not a resume snapshot of active weather history.

Eleven permanent tests in `ownedWeatherWorklet.test.js` execute the exact published
processor through Node VM and actual published Wasm. They pass at all six rates,
including original source/reference comparison, partial startup, finite silence,
private memory, absolute event import, late rejection, cancellation, reset and
constructor cleanup. Raw MessagePort packets and constructor plans reject
fractional/wrapped owners or parameter IDs, nonnumeric values, invalid enums,
trigger payloads and coerced context timestamps before WebAssembly casts. Those
rejections leave the queued plan unchanged. Existing owned-source compatibility/allocation checks are
documented separately in `MODULAR_AUDIO_ENGINE_OWNED_WEATHER.md`.

The separate listening button routes three real-time worklet outputs to Web
Audio at a fixed monitor gain 0.12 and checks six analyser streams and final
event statistics. It never runs automatically. Browser batch, page reload and
live acceptance passed in the built-in browser on 2026-11-11 using kernel
`b645e01e918b9cdc` (67,067 bytes). `weather-desktop-browser.json` records all six
rates and two independent worklets: all direct/worklet PCM is exact; the original
JS/direct comparison is exact through 96 kHz and has maximum absolute error
`2.3283064365386963e-10` at 192 kHz. `weather-page-reload-browser.json` records a
full reload with matching six-channel PCM SHA256
`1ff46ad14e19dfea979545b1395c61f471fbb82cab3a6863bb66ddd6da49b47f`.
`weather-live-browser.json` records six nonzero finite analyser streams and
clean source/event counters. Matching screenshots accompany all three reports
under `reports/modular_audio`.

The guarded host rerun also passed, recorded separately in
`weather-desktop-browser-final.json`, `weather-page-reload-browser-final.json`
and `weather-live-browser-final.json` with their matching screenshots. These
identify host version `9b46fcd07d33273f` and the unchanged kernel
`b645e01e918b9cdc`; each report includes the complete per-file host SHA256 map.
The final six-rate batch retains exact direct/worklet PCM, independent instances
and the same original-model error bound. The full page reload retains the stored
PCM hash, and all six live analyser streams remain finite and nonzero. The
earlier reports remain available as pre-guard evidence.
Analyser data is routed PCM, not physical device loopback, headphone listening
or device-underrun evidence.

## Remaining adoption boundary

Final built-browser checkpoint: kernel `b645e01e918b9cdc`, host
`9b46fcd07d33273f`, after strict raw packet validation and separate host cache
provenance. `weather-desktop-browser-final.json` passes all six rates; worklet
PCM is exactly equal to direct Rust, while the original JS comparison differs
by at most2.3283064365386963e-10 at192k and is exact at the other five rates.
`weather-page-reload-browser-final.json` proves actual navigation reload and
exact60,032-frame replay with PCM SHA
`1ff46ad14e19dfea979545b1395c61f471fbb82cab3a6863bb66ddd6da49b47f`.
`weather-live-browser-final.json` records nonzero routed PCM on all six channels.
Eleven processor/host regressions include coercion rejection before Wasm casts.
These final records supersede the earlier pre-guard browser checkpoint.

All/Ambience still owns the native weather source choice, worker policy, source
level/pan/width/distance/shelter chains and export history. Production adoption
must preserve explicit three-stem outputs and stopped-state setup/teardown,
import actual state-message clocks and retain seed/config ownership. Streaming
worker transport, midstream state snapshots and the existing 32-second export
history are separate tasks. This page adds none of those implicitly.
