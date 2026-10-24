# Procedural weather maker

Run `npm run dev`. The main page's **Vibe** panel now uses the tuned procedural
rain, thunder and waves, with independent source cards, settings and presets.
The same sources play beneath music and in ambience-only presets. `/ambient/`
remains the detailed audition lab, with component solos and event previews.
No recorded audio is loaded by the live generator. Reference buttons in the lab
are local analysis aids, not synthesis sources.

## Main-page Vibe controls

Each weather source has its own level, preset selector and expandable settings.
Choosing a source preset resets that source's shape and level, leaving the other
sources untouched. Wind, fireplace and vinyl retain their existing controls.

| Source | Presets | Settings |
| --- | --- | --- |
| Rain | Gentle drizzle, Open rain, Rain indoors, Roof patter | Intensity, near drops, wind, temporal coupling, impact texture, material, shelter |
| Thunder | Distant rolls, Nearby thunder, Rolling storm | Frequency, weight, falloff, initial report, rumble, echoes, shelter |
| Waves | Gentle shoreline, Rolling surf, Rough coast | Period, size, retreat length, surge, breaking crest, backwash, shelter |

All three also have independent distance, direction and stereo width. The preset
browser includes Gentle drizzle, Open rain, Rain indoors, Distant thunder, Gentle
shoreline, Rolling surf and Coastal storm. Existing rain/thunder/beach presets
automatically use the updated synthesis too. Shared links preserve the new
settings, including material; legacy links retain their original field layout.

`weatherBedModel.js` mixes the lab's twelve components into three stereo source
outputs. `weatherBed.worklet.js` streams them live, while the existing ambience
chains apply source levels, distance, shelter, width, pan and slow drift.
`weatherBed.worker.js` runs the same model for WAV/video exports. One renderer
persists for the whole export and retains 32 seconds of history, so a chunk's
preroll reuses the exact previous samples without restarting a swell or thunder
tail. Weather generation stays off the main thread.

Run `node tools/auditMainWeather.mjs` against a dev server on port 5179 to check
source presets, actual stereo source output, saved controls, mobile layout,
stop/restart and a 66-second two-chunk export. Set `WEATHER_URL` for another origin;
add `--public` to audit a production preview (without the dev-only export hook).

Start with Open rain, solo Near drops, switch between the impact materials, then
restore the mix. Compare temporal coupling at zero and one, with wind chaos high.
With coupling zero the arrival rate is constant; with coupling raised, the same
weather process modulates wash energy and impact density. Shelter attenuates the
foreground much more than the bass and rolls off high frequencies.

## Thunder and breaking-wave events

The page also has Thunderstorm, Shoreline and Coastal storm presets. Thunder and
surf are independently enabled by their activity sliders; both default to zero so
Open rain keeps its tuned sound. Use Hear one thunder or Hear one wave to audition
a complete event even with automatic activity off. These buttons also start audio
when stopped and isolate the selected family (or preserve a soloed component within
that family), so rain cannot mask an audition. Choosing a scene preset clears the
solo and restores the full scene. Solo thunder / Solo surf isolate a family, and each family has three
independently soloable and adjustable components:

| Event | Components | Shape controls |
| --- | --- | --- |
| Thunder | Initial report, rolling rumble, diffuse echoes | Activity, distance, weight, rumble/echo length |
| Surf | Approach/surge, breaking crest, retreat/backwash | Activity/amount, size, pace, retreat length |

Source shape controls are captured for each new event; activity zero stops new
automatic events and lets the existing event tails finish. Thunder distance/decay
also adjust the shared echo damping/feedback live. Component levels, solos, output
and shelter remain live. Stop closes the context and silences everything.

`weatherModel.js` composes the unchanged rain generator with two independent seeded
event generators from `weatherEvents.js`. The twelve stereo worklet outputs pass
through the existing indoor bus and master protection. New events use independent
random streams, so enabling them does not change the seeded rain output.

Thunder starts with a compact cluster of bipolar pressure fronts, constructed from
derivatives of Gaussian pulses, plus a broader low pressure impact. Distance widens
and damps these fronts. There is no sustained white-noise crack layer. Six smoothly
overlapping envelope lobes modulate a DC-blocked, double-low-pass noise source with
most energy below 180 Hz. This replaces the previous brighter bandpass wash and
stepwise energy injections. A separate generated reverberation stage uses four
strongly damped delay lines with orthogonal feedback mixing. It spreads reflections
in stereo, with no sampled impulse response. The distance and tail settings affect
this diffusion as well. Automatic events have randomized intervals with a minimum
spacing. Four overlapping thunder voices are available; direct and reverberant
components remain separately audible/soloable.

Each wave is one coherent, stereo water signal with a rising envelope and a long
decay. Approach, crest and retreat are overlapping partitions of that same source;
their gain weights sum to one. Fixed filter colours run throughout the event, so
the transition does not switch from bass to midrange to a bright foam source.
There are no discrete foam grains or collapse clicks. Low-depth, smoothly varying
turbulence gives the flow some movement without triggering individual pops. Size,
timing, stereo position and duration vary per wave, and successive waves overlap.
Pace controls the mean interval with jitter; the retreat control changes the decay
duration. A pool of eight wave voices bounds memory and CPU, and excess manual
triggers are skipped. These are perceptual acoustic models rather than a simulation
of lightning paths or coastal fluid dynamics.

Shelter attenuates thunder rumble by 3 dB, echoes by 6 dB and the initial report by
15 dB at its maximum, before the common low-pass stages. Waves receive the wash's
9 dB attenuation. The source controls model future events; they are not a master
volume control for an event already in progress.

## Assessment of the proposed architecture

The layered architecture is a useful perceptual starting point, with these changes:

- A constant-rate Poisson process produces independent arrivals. It does not create
  correlated rain clusters by itself. Integrating a rate driven by multiscale random
  weather gives a Cox process: Poisson conditional on the evolving weather. This
  also responds to live intensity changes without queuing stale future drops.
- The time-averaged spectrum is insufficient for matching bursts, envelope evolution,
  material decays and cross-band dynamics. Spectra are still useful: the ordinary
  autocorrelation of a stationary signal and its power spectrum are Fourier pairs.
  It is the loss of higher-order, envelope and evolving structure in a single average
  spectrum that matters here. Spectrograms and modulation spectra remain useful.
- Widely separated high-Q bandpasses in series mostly reject each other's energy.
  The first lab used parallel damped modes, but their sustained pitches sounded
  like a glockenspiel. The revised model colours short noise strikes with broad,
  low-Q filters. A material changes attack, spectral colour and splatter length;
  it does not add a freely ringing oscillator.
- A broad impact/body region around 300 Hz fills the gap between the bass and
  the 1.2 kHz mist.
- Bass is shared/mono; higher wash streams are independent stereo. Drops have fixed
  equal-power pan positions per event, rather than a final panner moving everything.
- Low rumble stands in for distant rain, wind and structural transmission. Continuous
  cloud friction is not a sufficient physical explanation for it; discrete thunder
  would be another event model.
- Source playback runs on the audio thread, with a fixed 96-voice pool. It creates no
  Web Audio graph per drop and uses no main-thread timing for impact scheduling.

## Implemented synthesis

`src/ambient/rainModel.js` is pure streaming DSP, shared by tests and the worklet.
State persists between blocks; changing block sizes does not change the seeded stream.
Three smoothly interpolated random weather scales (0.43, 2.7 and 13 seconds) drive
shared amplitude and rate changes. This approximates multiscale weather; it is not
an exact mathematical 1/f process or a fluid simulation.

The six stereo outputs are pressure (DC-blocked leaky brown noise, variable low-pass),
body (broad 300 Hz region), mist (1.2 kHz), sheet (3.5 kHz), splash/air (broad
bright splatter around 8.5 kHz with a 2.4 kHz underpinning), and near impacts. Intensity changes both level and
density. Continuous pink noise provides a reduced floor under the impact texture.

Body and air have independent left/right stochastic impact clouds. Random energy
packets overlap into noise puffs with short tails: body uses 14/36 ms
decay scales with a 4.5 ms onset, splash uses 1.4/9 ms scales with a fast onset. Body
uses more frequent, smaller packets with a narrower amplitude range. A shared process creates 55 ms patches of
splatter inside the much slower weather. Energy summation approximates a dense
superposition of independent noise bursts, avoiding one voice per distant impact.
These layers therefore retain audible temporal structure when soloed, even when
macro weather coupling is zero. The body mix passes through two 750 Hz low-pass
stages after all cloud and foreground contributions, suppressing sharp upper edges.
Mist uses a bounded envelope smoothed at 5 Hz with a reduced modulation depth and
a gentle high-frequency roll-off. Sheet retains faster granular dynamics. Splash
adds a broad 2.4 kHz noise layer with a slightly smoothed envelope beneath its fast
8.5 kHz splatter, giving the frying texture more depth.
The Impact texture slider blends the continuous wash and granular field live; its
default is 90%. It does not restore the original pitched foreground model.

Each near event has a rounded 3–6.5 ms attack, a short coloured noise strike, a low dull
puff, and three delayed splash fragments. Its amplitude, size, colour, fragment
spacing and pan vary. Foreground amplitudes have a narrower range so large hits do
not jump out as popcorn clicks. Splash fragments are quieter in the near output
and their envelope rises over 2.5 ms. The summed near output passes through two
2.3 kHz low-pass stages, softening its bright edge. These foreground changes have
separate envelopes and gains from the contributions routed to Body and Splash & air.
Broad material filters have Q from 0.55 to 1.5, rather than
long resonant sine tails. Puddles add a small broad falling colour inside the noise.
Mixed favours leaves, concrete and water; glass and tin remain explicit choices.
Each near event also contributes its puff and splash to Body and Splash & air,
preserving onset relationships between layers. The body contribution has its own
4–9 ms rounded onset and a lower gain.
The separate cloud generators keep
those layers populated between foreground events. These are design parameters,
not measured mechanical properties. The model does not include runoff, water
accumulation, canopy storage or surface-specific distant wash.

`rainAudio.js` routes the streams through smoothed layer gains, two low-pass biquads
(four poles), master gain, a protective compressor and an analyser. Shelter moves
the cutoff exponentially from 18 kHz to 300 Hz and attenuates pressure by 3 dB,
wash by 9 dB and near drops by 24 dB at its maximum. An indoor model is necessarily
context dependent: rain on a window or roof can remain loud indoors. This control
currently represents a listener moving away from exposed local impacts.

## Reference file mapping

The original `rain_synth/reference/` files are OGG stems, with `a` and `b` alternating
clips for each of ten sliders. `rain_synth/bands/` contains the earlier 15-second WAV
excerpts and synth renders. `*_ref.wav` is a reference excerpt; `*_synth.wav` is the
previous Python band model, not the new engine. `rain_demo.wav` and `tin_demo.wav`
are earlier full mixes. The page auditions WAVs through a restricted local server
endpoint; these files are never imported into the Vite bundle or copied into builds.

| WAV reference group | Perceptual role | Live generator to explore |
| --- | --- | --- |
| `rain_band0–1_ref.wav` | Sub pressure, distant thuds | Pressure; sparse dull impacts could extend band 1 |
| `rain_band2–4_ref.wav` | Low body and mid wash | Body; overlapping impacts also contribute |
| `rain_band5_ref.wav` | Mist / distant sheet | Mist |
| `rain_band6–7_ref.wav` | Near impacts, sparse patter | Near drops, with some sheet |
| `rain_band8–9_ref.wav` | Splash, hiss, air | Splash & air, with bright impact tails |
| `tin_band0–1_ref.wav` | Deep roof rumble | Pressure |
| `tin_band2_ref.wav` | Low roof body | Body |
| `tin_band3–4_ref.wav` | Roof thump | Near drops, tin colour; Body |
| `tin_band5–6_ref.wav` | Dense roof midrange | Mist; Body and overlapping dull strikes |
| `tin_band7–8_ref.wav` | Metallic patter / strikes | Near drops, tin colour |
| `tin_band9_ref.wav` | Bright roof patter | Sheet and near drops |

These are perceptual associations, not evidence of the recordings' exact source
mechanisms, nor one-to-one frequency matches. The live layers are broader than the
individual source stems. Source and previous WAVs share the earlier render script's
RMS target of 0.018; live synthesis retains its own level, so it is not a loudness
matched A/B. Use the layer and output sliders when comparing.

## Measurements and checks

Run `node tools/analyzeRainReferences.mjs` to regenerate
`src/ambient/referenceMetrics.json` from all 40 local WAVs. It measures stereo-energy
spectral median, stereo correlation, crest factor, 20 ms RMS-envelope CV and envelope
autocorrelation at 0.1, 0.5 and 2 seconds. Unlike a mono downmix, the stereo-energy
measurement does not cancel decorrelated or anti-phase content.

The older synth differs in both tone and dynamics. For example, `tin_band8_ref.wav`
has a measured median around 4.0 kHz, while its previous synth is around 9.4 kHz.
Several excerpts have strong fades: `tin_band7_ref.wav` rises from roughly 0.0025
RMS in its first second to 0.0249 in its last. Such trends inflate slow envelope
autocorrelation and must not be interpreted entirely as weather correlation. No
single CV, spectrum or autocorrelation score establishes a perceptual match. The
new engine is a listening candidate, not a demonstrated reconstruction of the stems.

The revised DSP tests additionally examine 2 ms RMS envelopes with macro weather
held stationary: Body and Splash & air must have stronger variation and 10 ms
correlation than their smooth-wash setting. Isolated glass/tin/puddle hits must
avoid strong waveform periodicity and retain less than 1% of their energy after
70 ms. Near-drop tests also check suppression of energy above 5 kHz and a small
energy fraction in the first millisecond of an isolated hit. These checks guard
against steady hiss, sustained pitched rings and hard popcorn-like attacks; they
do not prove perceptual similarity to the references.

Run:

```sh
npx vitest run src/ambient/rainModel.test.js src/ambient/weatherModel.test.js
node tools/auditRain.mjs
npm run build:public
```

The browser audit expects the dev server at `http://127.0.0.1:5179`; override
`RAIN_LAB_URL` for another origin. It checks actual worklet output, material/control
changes, family/component solos, six thunder/surf streams through an actual break,
single-event previews (including from stopped), source switching, repeated start/stop, context cleanup and mobile
overflow. It saves diagnostics and desktop/mobile screenshots under `.tmp/rain-audit/`.
For the public build, run the preview server in public mode and pass `--public` to
the audit; it also checks that no local recordings are requested. This does not
establish a mobile CPU budget or replace subjective listening. Weather DSP tests
cover event stage order, delayed/decaying stereo reverberation, randomized scheduling,
tail completion after activity is disabled, bounded polyphony, determinism across
block sizes and combined finite/headroom checks at 8, 44.1, 48 and 96 kHz.

Web Audio implementation references:
[AudioWorklet source lifetime](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process),
[bandpass and Q semantics](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode/BiquadFilterNode).
