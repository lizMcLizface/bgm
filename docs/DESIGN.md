# Generative Mode — Plan

> **History.** This document was written while bgm was being built inside
> [unCAGED](https://github.com/lizMcLizface/uncaged) (branch
> `feat/generative-music`), and moved here with the code on 2026-10-14.
> Paths under `src/` refer to this repo (`src/generative/` there is `src/app/`
> here). References to unCAGED-only files - `PolySynth.jsx`, `src/main.js`,
> `src/index.js`, `scripts/check-build.sh`, `ARCHITECTURE.md`,
> `SESSION_MODE_FEASIBILITY.md` - describe that repo. Share links now use
> `?s=` instead of `#/generative?s=` (old links still load), and the
> toolchain is Vite + Vitest instead of Create React App + Jest.

Target: a page that generates calm, procedural background music (under a
video or podcast) from scales, progressions and chords, played by three
independently configurable synth voices — **lead**, **rhythm/pad** and
**bass/support**. Key, mode, tempo and progression drift over time with a
configurable chance, either *centered* (pulled back toward the configured
values) or *wandering* (free random walk).

Constraints: lives on the `feat/generative-music` branch, runs locally via
`npm start`, is not deployed from this repo. Once it has progressed far
enough it moves to its own fresh repo, which is why it is built to depend
on as few unCAGED modules as possible (see §4).

One copy of the synth editor is kept: it is how a voice is configured on
the page and how new presets are made. Most of the synth's functionality
stays, at the cost of the performance work in §5.

---

## 1. Entry point

`react-router-dom` is a dependency but nothing uses it. The page is reached
at **`/bgm/`** (`http://localhost:3000/#/generative`).

`src/index.js` is now a synchronous dispatcher; the unCAGED app it used to
be lives unchanged in `src/main.js`. The dispatch **must stay synchronous**
(`require`, not `import()`): `main.js` and modules it imports
(`src/fretboard/index.js`, `src/scales/index.js`) register `DOMContentLoaded`
listeners at import time, and a lazily loaded chunk would arrive after that
event and silently never initialize. The generative branch never loads
`main.js`, so none of the vanilla UI, its `window.*` globals, or
`index.css` exist on that page. `public/index.html`'s static unCAGED markup
is replaced by the generative entry at startup.

## 2. Findings that shape the engine

### 2.1 MonoSynth envelopes run on `setTimeout`, not the audio clock

`MonoSynth.noteOn` accepts a `scheduleTime`, but only oscillator *pitch*
honours it. The gain envelope starts immediately (`setGainCurve` with no
start time) and every stage transition — attack→hold→decay — is a
`setTimeout` measured from *now*. `noteOff` is the same. That is fine for a
keyboard (note-on happens now) and fatal for a sequencer, which schedules
notes 100-500 ms ahead: every note would sound early and its envelope would
be smeared by timer jitter.

**Fix:** `MonoSynth.scheduleNote(noteInfo, synthProps, startTime, endTime)`,
a second entry point that writes the whole envelope as AudioParam automation
at known times. Because the note's end is known up front, a note that ends
mid-attack or mid-decay is truncated analytically (the release starts from
the level the envelope actually reached — `src/app/engine/envelope.js`,
pure and unit-tested). No timers, so it also works in an
`OfflineAudioContext` (§6). `noteOn`/`noteOff` are untouched; PolySynth's
behaviour does not change.

Deliberate difference: PolySynth's `getGainEnv(volume)` scales envelope
*times* by `sqrt(volume)` as well as levels. `scheduleNote` scales levels by
velocity only, so a preset's timing is the same at every velocity.

### 2.2 PolySynth can only exist once

All 8 `MonoSynth`s and the whole effects chain are module-level singletons
in `PolySynth.jsx`, and parameters reach the nodes through ~100 `useState`s
and batched `useLayoutEffect`s. Three independently configured voices need
three of these chains.

**Fix:** `src/app/engine/Instrument.js` — a plain class that owns N
`MonoSynth` voices plus the same effects chain in the same order
(compressor → distortion → flanger → chorus → phaser → bitcrush → delay →
ping-pong → reverb → EQ → filter → limiter → gain), configured by
`applyPreset(preset)` using **the same flat preset objects** as
`src/util/presetData.js` and PolySynth's saved custom presets. Presets made
in unCAGED's synth tab load unchanged. Voice allocation is by *time* (a
voice is free once its scheduled note plus release has ended), not by the
`currentNote` flag, because notes are booked ahead.

Each voice has MonoSynth's auto-resync disabled: it recreates oscillators
after 5 s without `noteOn` activity, which a sustained pad booked via
`scheduleNote` could trip mid-note.

### 2.3 Roman-numeral resolution depends on UI state

`resolveRomanChord` (`src/theory/roman.js`) reads the UI's selected scale
through `getPrimaryScale()`/`getPrimaryRootNote()` from `src/scales/`, so it
cannot resolve a chord in a key the generator chose. The generator uses the
scale **data** only and builds diatonic chords itself in MIDI numbers
(`src/app/theory.js`).

Even the data was not importable on its own: `scaleData.js` →
`theory/chords.js` → `src/scales/index.js` (the UI barrel, which pulls in
the fretboard) → `scaleData.js` is an import cycle that only resolves when
entered through `scales/index.js`, as `main.js` does. Entered from
`scaleData.js` it throws `Cannot access 'HeptatonicScales' before
initialization`. The interval tables now live in the import-free
`src/scales/scaleTables.js`, which `scaleData.js` re-exports (existing
importers unchanged). The cycle itself is still there for unCAGED; cutting
`chords.js`'s import of the `../scales` barrel is a refactor-plan item, not
this branch's. When a real Scale model replaces the
dictionaries (the planned `theory/` wrapper), this is one of its first
consumers.

### 2.4 The existing progression sequencer is not reusable for timing

Already noted in `SESSION_MODE_FEASIBILITY.md` §3.2: it chains `setTimeout`.
The generator has its own small lookahead `Transport`
(`src/app/engine/transport.js`) on the shared `AudioContext`'s clock,
modelled on `metronome.js`'s scheduler but not coupled to the metronome
singleton or its UI. Tab-throttling note: Chrome exempts audible pages from
intensive timer throttling, and the lookahead window absorbs ordinary
throttling.

## 3. Architecture

Music is decided ahead into a rolling **plan** of the next 8 bars (chord,
pad voicing, every note event in beats); the Transport only *books* plan
events as they enter its 0.4 s lookahead. Randomness is resolved when a bar
is planned, so the timeline view shows exactly what will play, and layers
can look ahead (a bass approaching the next chord's root). Changing a
setting re-plans every bar after the one currently booked; while stopped,
the plan is a preview of what Play will start with.

```
Conductor  ── key / mode / tempo / section; drift decisions at phrase boundaries
   │
Harmony    ── next progression / chord (weighted bank of Roman numerals)
   │
Arranger   ── per-role note generation: bass, pad, lead, + density budget
   │
Plan       ── next 8 bars, decided (Generator.planBar) ── drawn by ChordTimeline
   │
Transport  ── lookahead scheduler on the audio clock, books plan events
   │
Instrument ×3 ── MonoSynth voices + effects chain per role → masterBus
```

### Arrangement rules (calm-music defaults)

- **Bass/support:** register ~E1-E3. Root on the downbeat, occasional fifth,
  occasional stepwise approach into the next chord's root. Long notes.
- **Rhythm/pad:** register ~C3-C5. Inversion chosen to minimize voice
  movement between chords, leaning a little low or high per phrase so the top
  voice travels. No close intervals below ~C3. Sustained pads, pulses (per
  group, per beat, pushed, or low note / upper notes) or an arpeggio
  (bouncing, up, down, broken; now and then in half units), swelling gently
  over each phrase.
- **Lead:** above the pad, sparse (lots of rests). Chord tones on strong
  beats, scale tones between, mostly stepwise. A 2-bar motif that repeats
  and varies, phrased as call and response.
- **Density budget:** when the lead phrase is active the pad thins.
- **Sections:** layers enter and drop out (intro → A → B → breakdown) —
  the main defence against monotony over long runs.
- **Scales:** every family the main page offers, by its scale ids
  ('Major-7' = Locrian, 'Harmonic Minor-5' = Phrygian Dominant, ...),
  including Hexatonic and Pentatonic. Chords are every-other-scale-note
  stacks; in 5/6-note scales degrees past the scale wrap (VI → I), so any
  progression plays in any scale. Chord names use real spelling (one letter
  per degree in 7-note scales) and numerals show the quality the scale
  actually produced.
- **Calm defaults:** 60-85 BPM; Ionian/Lydian/Dorian/Aeolian; diminished
  chords excluded from the progression bank; small timing/velocity
  humanization.

### Drift (Conductor)

Each parameter (tempo, root, mode, progression) has a change chance
evaluated at phrase boundaries (every 4/8 bars).

- *Centered:* mean-reverting walk — the further from the configured value,
  the more likely the next move goes back.
- *Wandering:* unbiased walk within bounds.
- Key changes only move to closely related keys (±1 on the circle of
  fifths, relative major/minor), ideally via a pivot chord common to both.
- Tempo glides over a bar or two rather than jumping.

## 4. Dependencies on unCAGED (the extraction surface)

Kept deliberately small so the move to a fresh repo is a copy:

| Module | Why |
|---|---|
| `src/audio/context.js`, `src/audio/bus.js` | shared clock and output |
| `src/nodes/` + `public/*-noise-processor.js` | effects and noise |
| `src/components/MonoSynth/` | the voice |
| `src/util/presetData.js`, `src/util/util.js` | presets, envelope curves, note helpers |
| `src/scales/scaleTables.js` | scale interval data (import-free) |
| `src/theory/notes.js` | `CHROMATIC` |
| `src/components/{Knob,KnobGrid,Module,Select}` | (phase 2) synth editor UI |

Nothing under `src/app/` may import `src/main.js`, `src/fretboard/`,
`src/progression/`, `src/scales/index.js`, `src/scales/scaleData.js`,
`src/theory/chords.js`, `src/theory/roman.js` or `PolySynth.jsx` — the
first four directly, the rest through the cycle in §2.3.

## 5. Performance (to measure, then fix)

Each `MonoSynth` starts **10 oscillators** (primary + 7 spread + sub + osc2)
and a noise worklet at `init()`, running continuously whether or not a
note plays. One 8-voice Instrument ≈ 80 oscillators + 8 worklets; three
instruments ≈ 240 + 24, plus three convolution reverbs. Candidates, in
order of expected payoff — **measure first** (Chrome's `chrome://tracing`
audio category / Web Audio inspector render capacity):

1. Per-role polyphony instead of 8 everywhere (bass 2, lead 2, pad 8).
2. Only create/start spread oscillators up to the preset's `voiceCount`.
3. Skip the noise generator when the preset's `noiseMix` is 0.
4. One shared reverb send bus instead of a convolver per instrument (keeps
   per-voice wet amount; sounds more cohesive too).
5. Bypass (disconnect) effects whose amount is 0 instead of running them dry.

### Measured (2026-10-14, headless Chromium, 48 kHz)

Audio-thread load = render time per 128-frame quantum / its 2.67 ms budget,
from a Chrome trace (`audio,webaudio` categories), 8 s windows. "Playing" is
a deliberately busy arrangement: arpeggio pad, walking bass, lead every
phrase.

| | stopped | playing (avg / p99) | over-budget quanta |
|---|---|---|---|
| before | 53% | 50-54% / 73-85% | 1-4 per window |
| noise only while audible | 46% | 47% / 74% | 0-2 |
| + effect bypass | 34% | 30-43% / 53-86% | 0-2 |
| + sleeping voices | **14%** | **27-36% / 61-69%** | 0-1 |

Over-budget quanta are audible dropouts - the "chattery" sound. What it took:

- **Noise** (`src/nodes/noiseGenerator.js`): the source only exists while
  its mix is above 0; processors stop for real on a message; modules load
  once per context; the main-thread ScriptProcessor fallback only where
  AudioWorklet is missing.
- **Bitcrusher** (`src/nodes/bitcrusher.js`, `public/bitcrusher-processor.js`):
  was a 256-frame ScriptProcessorNode in every chain - on the main thread,
  so UI redraws could make the audio miss deadlines. Now an AudioWorklet,
  created only while its wet amount is above 0.
- **Effect bypass** (`Instrument.updateChain`): effects that do not change
  the sound (0% wet, flat EQ, open filter) are routed around and so stop
  rendering; rewired only when the active set changes.
- **Sleeping voices** (`Instrument.wake/sleepIdle`): a voice is disconnected
  once its last release ends and reconnected when a note is booked (ahead
  of time, while silent), so idle voices cost nothing.

Loudness of all 28 presets re-measured afterwards: within run-to-run noise
(detuned voices beat from random phases; identical runs vary by up to
~5 dB on Analog Saw Bass). Not done yet: one shared reverb send instead of
a convolver per role; stopping unused sub/osc2 oscillators per voice.

### Second pass (2026-10-15): where the rest goes

Tooling, kept in the repo this time: `bench/` (served by `npm run dev` at
`/bgm/bench/`). `index.html` renders a planned arrangement through the
real Instruments in an `OfflineAudioContext` and times it (load = render
time / audio duration), with variants that switch one part off to
attribute cost; runs are deterministic, so `mode=render` output can be
diffed sample by sample between engine versions. `nodes.html` measures
one node of each kind. Offline numbers overstate convolvers: Chrome's
realtime rendering runs the long part of each impulse on a helper thread.
Realtime load was checked with a Chrome trace as above
(`RealtimeAudioDestinationHandler::Render`, 8 s windows).

Cost per node, % of one core (offline, 48 kHz):

| node | cost | node | cost |
|---|---|---|---|
| gain | 0.01 | oscillator | 0.03 |
| oscillator, LFO on detune, a-rate | **0.22** | same, k-rate | 0.13 |
| biquad, static | 0.03 | biquad, envelope on detune, a-rate | 0.20 |
| delay, LFO-modulated (chorus voice) | 0.12 | compressor | 0.34 |
| convolver, reverb4 (9.8 s) | **5.8** | convolver, reverb6 (2.0 s) | 1.8 |
| convolver fed silence | **5.4** | convolver with nothing connected | 0.9 |

What that showed: (1) convolution reverb was ~60% of all load while
playing and nearly all of it while stopped - a convolver fed silence costs
as much as one fed music, and the chain behind sleeping voices still fed
it silence; (2) every oscillator had the vibrato LFO connected to its
detune, even at depth 0, which makes it ~7x as expensive; (3) sub
oscillator and osc2 rendered at gain 0 in every awake voice. Changes:

- **Sleeping effects chains** (`Instrument.sleepIdle`, `tailSeconds`):
  once every voice is asleep and the reverb impulse plus the delays'
  echoes (to -80 dB) have died away, the instrument's output is
  disconnected, so nothing in its chain renders; the next booked note
  reconnects it. Chains start asleep. Covers Stop, rests between lead
  phrases and roles that sit out.
- **Vibrato** is wired to the oscillators only while `vibratoDepth > 0`
  (`Instrument.setVibratoConnected`, `MonoSynth.setVibratoEnabled`), and
  oscillator detune is k-rate (`src/nodes/oscillator.js`): updated per
  128-frame block, smooth for a few-Hz LFO.
- **Sub / osc2** feed the mix only while audible (`MonoSynth.updateSilentPaths`).
- **Impulses** are trimmed where the energy still to come falls below
  -80 dB (`trimImpulse` in `src/nodes/reverb.js`; reverb2: 8.0 s -> 3.8 s).

| offline load | stopped | default arrangement | busy |
|---|---|---|---|
| before | 10.4% | 23.5% | 24.9% |
| after | **0.1%** | **13.7%** | **20.5%** |

Realtime audio thread (default / busy arrangement, several runs each -
traces vary run to run): 20-31% / 23-27% before, 13-19% / 17-23% after;
worst quantum 2.45 ms -> 1.63 ms of the 2.67 ms budget. Main thread while
playing: 4% busy (18% at 4x CPU throttling), no task over 9 ms - not the
bottleneck.

Sound: old and new engine rendered offline and diffed. Default
arrangement: difference -53 dB below peak. Busy: -36 dB, all of it from
k-rate vibrato (with a-rate detune restored the difference is -55 dB): it
lags the lead's 4.5 Hz vibrato by up to one block (1.3 ms) - a phase
offset, not an audible change.

What is left, playing (offline, default arrangement): reverb ~8 points of
13.7, voices and other effects ~5.5. In realtime each convolver costs
~3% of the audio thread regardless of impulse length (the length goes to
the helper thread), so only fewer convolvers help there.

#### In the page

The header shows the audio thread's load (`public/load-meter-processor.js`:
a zero-output AudioWorklet fed from the master bus times the gaps between
its calls inside each render burst with `Date.now()`; within a few points
of Chrome's trace at 10-100 ms buffers) and Chrome's dropout count
(`playbackStats`). The buffer size beside it sets the AudioContext's
`latencyHint` (stored per browser, applied on reload, since a context's
buffer is fixed at creation).

#### Stop

With "Quick fade on Stop" (⚙ menu, on by default) Stop fades the generator's output out (time constant 70 ms, -60 dB at
~0.5 s), then `Instrument.flushTails` drops what the effects still hold -
reassigning the convolver's buffer resets its state; delay outputs and
feedback are held at 0 until their lines have emptied - and the output is
restored for auditions and live play. The chains then sleep at once
instead of after their tail time (up to ~14 s).

#### Multi-threading

Web Audio renders a context's whole graph on one realtime thread;
AudioWorklets run on it too. Ways to use more cores:

- **Already happening:** Chrome renders the tail of every ConvolverNode on
  a background thread - why trimming impulses barely moves the realtime
  load.
- **One AudioContext per role:** Chrome gives each context its own render
  thread. But clocks are independent (the problem `src/audio/context.js`
  exists to avoid), each context is a separate output stream, and Firefox
  renders all contexts of a page on one graph thread anyway. Not worth it.
- **Pre-rendering** in an `OfflineAudioContext` (its own thread, faster
  than realtime): possible because notes are planned 8 bars ahead and
  `scheduleNote` uses no timers. Render each bar's voices (each note
  rendered whole, tails overlap-added) and play them as buffers into the
  realtime effects chains. Moves the voices (~5 of the 13.7 points) off
  the realtime thread; costs a bar of latency for synth-editor changes to
  be heard in the music (auditioning and live play stay realtime), and
  care at bar seams (vibrato phase, voice stealing). Worth it only if the
  remaining load is still too much.
- **WASM synth in a worker** feeding an AudioWorklet through a
  SharedArrayBuffer: needs cross-origin isolation (COOP/COEP headers,
  which GitHub Pages cannot set) and a rewrite of the synth. No.

Further options that change the sound or behaviour slightly, not done:

- **Shared reverb per impulse type** (the default presets use reverb4 on
  pad and lead: 3 convolvers -> 2). Not exact: each role's limiter
  (threshold -6 dB, ratio 20) currently acts on dry + wet together; a
  shared send would leave the wet signal unlimited.
- **`latencyHint: 'playback'`** for the AudioContext: larger output
  buffers absorb load spikes on slow machines (the usual cause of
  crackling), at the cost of keyboard/MIDI latency.
- k-rate voice filter envelope (0.20 -> 0.06 per voice) - steps fast
  attack sweeps audibly.

## 6. Export

**Done (2026-10-15)** as "Save audio" (`src/app/engine/render.js`): the
plan Play would start (`Generator.planner()`, a planning-only copy) is
booked onto fresh Instruments with the current sounds in an
`OfflineAudioContext`, mixed as heard, and written as 16-bit WAV.

- Chunks of 60 s, each in its own context, so memory is one chunk plus the
  finished PCM (~11.5 MB/min) rather than a float buffer of the whole file.
- Each chunk starts early by a pre-roll covering every note still sounding
  at its start plus the longest release + effects tail, so it begins warm;
  consecutive chunks cross-fade over 0.25 s (modulation LFOs restart per
  context). Measured: no jump at the seam beyond what the music has anyway.
- Reverb impulses are cached per sample rate (not per context) and the
  worklets expose "ready" promises, so a chunk renders without refetching.
- The ambient bed starts at the chunk's offset into the piece: loops and
  thunder continue exactly.
- Speed: 40 s with the default voices, a second lead and three ambience
  layers rendered in ~11 s on the dev server (~4× real time), while the
  page kept playing. Peaks over 0.9 go through a soft knee.

## 6b. Ambience

**Shapes (2026-10-16).** Each layer has parameters (`LAYER_PARAMS` in
ambienceSynth.js) and every layer has distance, pan and width
(`COMMON_PARAMS`). *Render* parameters (rain intensity / drop size, wind
speed / gusts, wave length / size, fire crackle / roar, vinyl crackle /
hiss) change the generated loop: it is re-rendered in the worker 300 ms
after the last change, in steps of 0.1, and cross-faded in over 1 s; the
last 12 loops are cached. Loudness is normalised against the layer's
defaults, so "more intense" plays louder. The rest act live: each layer
runs through lowpass (distance: 18 kHz down to 600 Hz, a little quieter)
→ mid/side width matrix → panner → level. Thunder's "how often" sets the
average gap (2.5 min down to 15 s), intensity its level, and pan / width
where strikes land.

The rain was reported "annoyingly sharp": its drops were 1-5 ms clicks
highpassed at 1.8 kHz over a hiss up to 6.5 kHz. Now they rise over
0.4 ms, sit in 0.9-4 kHz and the hiss stops near 4 kHz. At the same
loudness, energy above 4 kHz went from 20.7% to 7.8% and the crest factor
from 11.2 to 5.3.

`src/app/engine/ambience.js`: rain, thunder, wind, waves, fire, vinyl,
synthesised from noise in `ambienceSynth.js` - no recordings, nothing to
license. Each layer is rendered once per sample rate into a 17-31 s loop:
slow movement (gusts, swells, flicker) is periodic over the loop and the
noise is cross-faded across the loop point; loop lengths differ so layers
never line up the same way. Playback is a looping buffer source and a gain
per layer - negligible audio-thread cost. Thunder is one-off rumbles at
seeded random times, booked ahead on a timer (or all at once offline).

The bed has its own output and volume (`Generator.ambienceOut`, straight
to the master bus), so it plays with or without the music:
start/stop are the music, startAmbience/stopAmbience the bed,
startAll/stopAll both, and the sleep fade takes whatever plays.

Rendering a layer took 0.2-1.3 s of main-thread time - longer than the
Transport's 0.4 s lookahead, so notes would have come late. It now runs in
a worker (`ambience.worker.js`; slow envelopes computed every 32 samples),
0-1 ms on the main thread; a layer starts, fading in, once its buffer
arrives, and moving a slider while stopped renders ahead.

## 6c. Second lead and sections

The counter role (arranger.js) has four modes: off; *answers* - with the
chance set by its activity, a few notes in the bars where the lead holds
its phrase-ending note, or a full call-and-response melody in phrases the
lead sits out; *harmony* - the lead's notes a diatonic third below, same
rhythm; *own line* - long notes on beat-group starts, more with activity.
It draws nothing from the RNG while off, so pieces without it are
unchanged.

Sections (arranger.js `SECTIONS`) are decided at phrase starts every 2, 4
or 8 phrases: intro (only at the start) → build → full → (breakdown | full
| build), never three fulls in a row. *Gentle* scales the lead's activity
and simplifies the bass; *strong* drops roles (intro = pad alone,
breakdown without bass, pad held). The timeline labels each section.

## 6d. Sleep timer and media controls

The sleep timer (`Playback.jsx`) counts down from Play and calls
`Generator.fadeOut` for the last minute (setTargetAtTime to -60 dB), then
stops through the quick-stop path so tails are dropped and the output
restored. Media Session: browsers only grant a session while a media
element plays, so a silent looping 8 kHz WAV `<audio>` plays alongside
(`mediaSession.js`); the music still goes straight to the AudioContext
destination, with no added latency. It is started inside the Play click,
which iOS requires.

## 7. Steps

1. **Engine core** — `MonoSynth.scheduleNote`, `Instrument`, `Transport`,
   pure diatonic theory helpers, `/bgm/` entry with a test page
   playing a fixed progression on pad + bass. **Done.** Verified in headless
   Chromium: chords advance on the bar, output peaks ~0.53 (no clipping),
   Stop decays to ~−54 dB within 6 s (reverb tail), zero page errors. The
   only console noise is the pre-existing `ScriptProcessorNode` warning
   from `NoiseGenerator`'s fallback before its worklet loads (×10 voices).
   **Then:** plan-ahead model, **chord timeline** (chord lane with
   past/current/upcoming, piano roll of every planned note by role,
   playhead on the audible audio clock) and the full scale/mode suite.
   **Done.**
2. **Synth editor** — extract PolySynth's knob panel into an editor that
   drives an `Instrument` + preset object (load/save/export JSON presets).
   One editor, retargeted to whichever role is selected. **Done:**
   `src/app/editor/` - the panel is data (`synthSchema.js`, knob
   ranges copied from PolySynth: 19 modules, 85 knobs; left out: polyphony,
   which is per role, plus arpeggiator, spectrum views and theme), rendered
   with unCAGED's own Knob/Select/Module components under a theme built from
   the page's colours. Every control calls `Instrument.set(key, value)`,
   which now applies one parameter through a setter table instead of
   re-applying the whole preset. Presets: built-ins, unCAGED's synth-tab
   custom presets (read-only, shared `localStorage` when both run on
   localhost), "Mine" (saved here), and JSON export/import - the route that
   survives the move to its own site. Audition plays the role's part of the
   current chord while stopped.
3. **Arranger** — voice-led pad, bass rules, lead motif generator, density
   budget, humanization. **Done:** `src/app/arranger.js`, pure
   (`arrangeBar(prev state, chord, next chord, scale, settings, rng)`), with
   the per-bar state stored in the plan so re-plans continue seamlessly.
   4-bar phrases: the lead plays with probability *lead activity* (less
   often right after a phrase with lead), as a 2-bar motif + varied
   response resolving onto the chord's root/third; chord tones on strong
   beats, scale steps between, pulled back from the register edges. Pad
   styles sustain / pulse / slow arpeggio, bass styles whole / half /
   walking, picked per phrase in proportion to user style weights (a slider
   per style showing its share; 0 = never, the only non-zero = always). Bass picks the root
   nearest its previous note (pulled toward the range centre) and
   approaches each chord change from a scale step or chromatic neighbour.
   Density budget (a toggle, on by default): under the lead the pad is
   quieter and re-picks away from arpeggio - unless arpeggio is the only
   style allowed. Randomness goes through `random.js` (seedable); tests run
   the rules over seeds and exotic scales.
4. **Conductor** — drift (centered / wandering), related-key modulation,
   tempo glides, progression bank. **Done:** `src/app/conductor.js`
   (pure). Decisions per progression cycle, made as each cycle *starts*
   (a full cycle ahead) and stored in the plan, so every bar knows what
   comes next. Relatedness = number of differing pitch classes, which works
   for every scale family: key moves are a fifth up/down or relative
   major/minor, mode moves go to a parallel mode one note away. Centered:
   never more than 2 notes from home, plus a per-cycle *home pull*
   (independent of the change chances - without it leaving outpaced
   returning and centered music was home only ~11% of the time). Wandering:
   free walk, tempo within 50-110. Tempo glides ≤2 BPM per bar, applied by
   the Transport from the gap before each downbeat. Optional pivot: a
   key-changing cycle's last chord slot becomes the new key's V (shown as
   V/x). Changing a home setting (key, mode, progression, tempo, bars per
   chord) returns the music home from the next bar. Timeline shows key and
   live tempo, and marks key changes. Generator planning is tested with the
   audio layer stubbed (`generator.test.js`).
   **Then:** time signatures (`meter.js`: 3/4, 4/4, 5/4 = 3+2, 6/8 = 3+3
   felt in two with tempo in dotted quarters, 7/4 = 2+2+3). The arranger is
   meter-aware - lead cells per beat group, chord tones on group starts,
   pulse per group, arpeggio per unit, walking bass per felt beat - and
   exact; looseness is a separate *humanize* pass at plan time (normally
   distributed timing in ms, velocity, pitch in cents; 0 = mechanical).
   Notes humanized before their bar are booked from the previous bar's
   last unit (or at the downbeat if a re-plan made them too late).
   **Then:** drift exclusions (keys/modes drift never moves to; home always
   allowed); "now playing" in the Music panel with *Keep this*; share links
   (`settings.js`: sanitized, diff-from-defaults codes in `#/generative?s=`,
   always kept in the address bar; export/import JSON; synth presets not
   included) with `settings.seed` re-seeding every reset so a link replays the
   same piece (*New variation* rolls it); per-role octave (home offset +
   off/centered/wandering wander by phrase, one octave at a time, within
   audible limits); pad chord size (triads / sevenths / ninths - the chords
   themselves, so the pivot becomes V7; `voiceLead` widens its range minimally
   when a ninth cannot fit).
   **Then:** 28 categorised presets (Pads, Bass, Leads, Keys & plucks,
   Textures), loudness-matched per role from browser measurements; a
   DAW-style track strip beside the timeline (and in each role panel) with
   mute / solo (role gain, generation keeps running) and a keyboard arm:
   the armed role plays from the computer keyboard (physical key codes,
   Z/X octave) and from MIDI after "Connect MIDI" (never prompted on load),
   via Instrument.startNote/stopNote - held notes on the same timer-free
   envelopes. Inaudible roles are drawn faintly on the timeline.
5. **Sections** — layer entry/exit, intro/build/full/breakdown. **Done**
   (§6c), with a second lead.
6. **Performance pass** — §5, measured.
7. **Export** — §6. **Done.**
8. **Extraction** — copy into its own repo (§4 list), deploy there.

## 8. Procedural sounds and levelling

`src/app/soundGen.js` makes a preset from (role, 24-bit seed): a recipe per
role draws waveform, envelope, filter, osc2/sub, modulation and effects
from ranges that suit it (pads slow and wide, basses short and dark, leads
clear with vibrato and echoes). Same role and seed, same sound - so a link
carries a generated sound as preset index 255 + role + seed
(`shareCode.js`); changing a recipe needs a new generator version.

Loudness (`src/app/engine/loudness.js`): a role-typical phrase (held
triad / bass line / melody) is rendered offline through an Instrument and
its RMS compared with the role's default preset; masterVolume is scaled to
match (capped at 1). It reproduces the hand levelling of the existing
pads, basses and leads within ±1.8 dB, and set the 13 presets added on
2026-10-15. Plucked sounds read lower than sustained ones on this
measure (Keys & plucks sit 3-7 dB under when measured as a pad); Muted
Pick Bass is 2.4 dB under at full volume, like Round Pluck Bass. Over 75
generated sounds the median error is 0 dB; the few that need more than
full volume end up at most 2.5 dB quiet.

**Ensembles (2026-10-16).** "New sounds" generates every voice from one
24-bit seed. `ensemblePalette(seed)` picks a shared character - waveform
family (smooth / warm / bright), brightness, reverb type and amount,
chorus / phaser / none and its rate, attack softness, an echo time and
vibrato for the melodic voices - and each role's recipe runs on a seed
derived from the ensemble's, then takes on the palette within what suits
the role (the bass keeps a short attack, a dark filter and little reverb).
A single voice's generate is untouched. Links carry an ensemble voice as
preset index 254 + role + the ensemble seed. Levelled, every voice of
sample ensembles lands within 0.1 dB of its role's default.

## 9. Wider sounds and feel (2026-10-16)

Gaps found in review: the sound generator only makes sustained pads,
basses and leads (no keys, plucks, bells or textures, one filter type,
several effects never used); the engine has no FM, no custom waveforms, no
filter LFO, tremolo or auto-pan, no velocity-to-brightness, no filter key
tracking and no pitch envelope; the music has no percussion, no swing, no
ending, and sections change which voices play but never how they sound.

Rules that keep old links working:

- **New preset keys default to off**, so every existing preset (built-in,
  saved, unCAGED's) sounds exactly as before.
- **soundGen v1 is frozen.** New recipes are version 2, with their own
  share-code escapes (preset index 253 = generated v2, 252 = ensemble v2,
  each followed by role, kind and seed). v1 links still make v1 sounds.
- **New share-code fields are appended** as new groups at the end of
  their part (never inside an existing group).
- **New music features draw nothing from the arranger's rng** when off
  (percussion has its own seeded stream), so existing pieces don't change.

### Phase A - engine (MonoSynth / Instrument), all opt-in per preset

1. Filter motion: `filterLfoRate` / `filterLfoDepth` (cents), one LFO per
   Instrument into every voice's filter detune, wired only while it has
   depth (as vibrato). The same input carries a per-instrument brightness
   offset (used by sections, C2).
2. Tremolo and auto-pan: `tremoloRate/Depth`, `autoPanRate/Depth`; an
   effect stage at the head of the chain, routed around when both are 0.
3. Expression: `filterVelocity` (cents of cutoff per unit velocity away
   from 0.8) and `filterKeyTrack` (0..1 octaves of cutoff per octave from
   C4), folded into each note's filter-detune events.
4. Pitch envelope: `pitchEnvAmount` (cents at note start) and
   `pitchEnvDecay`, on the oscillators' detune.
5. FM: a modulator per voice (`fmRatio`, `fmIndex`, `fmEnvAmount`,
   `fmDecay`) into the main oscillators' frequency, scaled per note so the
   timbre is the same in every register; connected only when used.
6. Waveforms beyond the basic four via PeriodicWave: organ, hollow,
   choir, glass, reed.

Editor modules for all of them, and new built-in presets that use them
(appended to SHAREABLE_PRESETS, levelled with loudness.js).

### Phase B - sound generator v2

Recipes by *kind*, chosen per role (or by the seed): pad -> pad, texture,
keys; bass -> bass, pluck bass; lead / second lead -> lead, pluck, bell.
Uses the phase A features, band-pass / high-pass filters, flanger,
bit-crush, ping-pong, portamento and envelope shapes. Ensembles v2 add
characters (lo-fi, glassy, dub, organ). UI: the generate button can pick a
kind.

### Phase C - music

1. Swing: a feel setting (0 = straight), delaying off-beat subdivisions
   at plan time (no rng).
2. Section tone: sections also brighten / darken the voices (intro and
   breakdown darker, full open) via the brightness offset, ramped over a
   bar.
3. Ending: a cadence onto I with a held final chord - used when a WAV
   render reaches its length and when the sleep timer runs out.
4. Percussion: a fifth role, a small synthesised kit (felt kick, brush,
   shaker, rim, soft hat) playing per-section patterns by style (off,
   heartbeat, brushes, lo-fi, shaker), with its own rng stream, volume,
   mute / solo, and share-code fields.

Every phase: unit tests, then a check in the dev server; nothing is
committed or deployed until it has been listened to.

### Built

- **A:** as planned. FM is per voice (a sine modulator into the main
  oscillators' frequency, depth = index x modulator frequency, scheduled
  per note); the pitch envelope rides on the oscillators' (k-rate) detune
  with vibrato. Auto-pan is an equal-power *balance* (splitter, two gains
  driven through wave-shaper curves), not a StereoPanner, which sums both
  channels into one side (+6 dB on a centred sound); at centre it passes
  stereo unchanged. 14 presets added (Breathing Pad, Choir Ah, Hollow
  Tremolo, FM Bass, Thump Bass, Reed Lead, Organ Whistle, FM Rhodes, FM
  Bell, Felt Piano, Soft Marimba, Glass Mallet, Underwater, Tremolo Organ),
  levelled against their role (keys as lead, as before); all within 0.3 dB
  except Underwater (-0.8 dB at full volume).
- **B:** `soundGenV2.js`. The v1 recipes run first for pad / bass / lead,
  then v2 adds colour; keys, texture, pluck and bell are new recipes.
  Levelled over 16 seeds per role and kind, medians are 0 dB; struck kinds
  (keys, plucks) are up to ~4 dB quiet at full volume - an RMS measure
  under-reads them, as noted in §8. Band-pass textures only on harmonic
  waveforms, centred low: a band-pass over a sine's upper range was 12 dB
  quiet. v1 output is pinned by snapshot tests.
- **C:** settings `swing`, `sectionTone`, `drums { style, activity }` and
  `volumes.perc`, all off by default (links carry only what differs from
  the defaults, so a default that is on would change older links). Section
  tone is one lowpass per melodic role after its Instrument (cheap; a
  per-voice filter offset would have made every voice filter
  audio-rate-modulated). The drum kit builds each hit from one-shot nodes
  and sleeps like an Instrument. Endings: `Generator.endSoon()` replans the
  next bar as V and the one after as a held I, stops three bars later and
  rewinds; Stop or a cancelled sleep timer during an ending replans the
  music instead. The WAV render plans its ending so the final chord and
  its tail fill the end of the file.

### Long-timescale drift and the command-line renderer (2026-10-16)

- **Two kinds of wander** (`wander.mode`, `ambienceWander.mode`): the sine waves of
  `engine/wander.js`, or a *bounded random walk*: a seeded Ornstein-Uhlenbeck path
  (a knot every 2 s, mean-reverting over about period/4, sd 0.4, folded at +-1),
  so it is normally distributed around the centre and never leaves its limits.
  It is booked on a constant source's offset as linear ramps - ahead of the
  clock (90 s, refilled every 15 s) while playing, all at once offline - and
  the path is a pure function of its seed, so a chunk of a render starting
  anywhere reproduces it exactly (checked against the path in a browser).
- **Ambience wander** (`ambienceWander`: mode, total, layers, period): the whole
  bed's level and each layer's level drift by up to +- that fraction, each layer on
  its own period (0.85-1.15 x) and phase. On by default (brownian, 8% / 20%, 3 min) - and since
  scenes patch the defaults, every preset has it. Share codes: appended groups
  (`wander.mode` after the crisp drums in the voice part, the four fields last
  in the ambience part), so older links read the defaults.
- **The timeline keeps one shape**: 21:9 with five voices showing (min height 470 px;
  below 640 px it flows as before). A voice that is absent leaves its slot in the
  strip empty. The drawing moved to `timelineDraw.js` (plain data in, canvas calls out).
- **`npm run render`** (`tools/`): `render.js` starts a Vite dev server and a headless
  Chrome on `tools/render.html`; `renderPage.js` builds the generator as the page does and
  streams `renderPcm` (render.js, the WAV render's chunks as 16-bit PCM) to ffmpeg's
  libmp3lame. The video is drawn in Node with `@napi-rs/canvas` through the same
  `drawTimeline`, from `planTimeline`'s bars, into ffmpeg (x264), then muxed with the
  audio (AAC). Measured 2 min: audio ~2x real time, video ~108 fps.
- **Two more chord styles for the rhythm voice** (`PAD_STYLES`, default shares 10 / 8 next to
  sustain 55, pulse 25, arpeggio 20): *rolled* (a strummed chord, a sixteenth a note) and
  *stacked entry* (the notes coming in one a unit and ringing together). Each phrase also picks
  a direction by `directionWeights` (up 35, down 25, middle outward 20, outside inward 20; `chordOrder`).
  Styles are picked per phrase, so a long listen cycles through more colours. (Off-beat stabs
  were tried and dropped: the pads breathed distractingly, direct sounds were hectic.)
  Share codes: one appended group in the music part; a preset that sets `padWeights` gets
  the new defaults for the styles it doesn't name.
- Other slow movements that would fit (not built): a slow tempo breath, a
  reverb send that rises and falls, a drum-level or lead-density drift, the
  ambience layers' own *distance / width* drifting, and the section length or
  tone (`sectionTone`) following a long cycle.

### After a first listen (2026-10-16)

- Percussion was too repetitive and too quiet (about -50 dB RMS soloed
  against a -17 dB mix: the raw hits spanned 18 dB of peak level). Now:
  three grooves per style, one per section (every 16 bars with sections
  off) with phrases borrowing another by *variation*; bar-to-bar drops
  and ghost notes; fills on phrase ends (bigger at a section's end); each
  hit carries a variation value (in the event's `detune` slot) the kit
  turns into pitch / brightness / length differences, and swishes sweep
  over the beat or group they span, alternating direction. 3/4 had no
  backbeat at all (one beat group) - beats after the first stand in. Per
  drum gains bring peaks to -6 dB (kick) .. -15 dB (hat).
- The kit's sound (`drumKit`: room, per drum on / level / tone / decay) and
  mutes (`muted`) are settings, in the voice part of links. **The voice
  part's layout is groups, then presets, then later groups**: the first
  attempt appended groups before the presets, which would have moved the
  preset bits of every released link; a test now opens a code made by
  the released encoder.
- Scenes (`scenes.js`): a patch over the defaults plus a preset per role,
  picked in the top row; the sleep timer moved into the ⚙ menu.

### Pad movement and drum colour (2026-10-15)

- The pad sat still without octave wander: voice leading always took the
  closest voicing. Now each phrase may lean the voicings low or high in
  the register (`padMotion.lean`), picks a pulse pattern (`pulseWeights`)
  or an arpeggio pattern (`arpWeights`), may run an arpeggio in half units
  while the lead rests (`padMotion.fast`) and swells over the phrase
  (`padMotion.swell`). All in the music part of links, appended.
- The styles moved to their voice panels (pad, bass) and humanize and
  swing to a Feel panel, under More options.
- Drums still sounded the same bar to bar (one dropped hit among eight
  hats is inaudible). Three drums were added - felt tom, soft clap, soft
  ride, appended to `DRUMS` (an event's drum is its index; in the voice
  part of links they come after the mutes, keeping older links' bits) -
  plus a Downtempo style. Variation now also colours phrases: hats moved
  to the ride or a shaker, the backbeat to a clap or a rim, a twist on
  every second bar, a ride opening a phrase; fills fall down the toms now
  and then. The tom's pitch, like the swish's direction, rides in the
  event's variation value.

## 10. Memory and audio load of the reverbs (2026-10-16)

Measured in headless Chrome on the production build: the page started at
about 780 MB (JS heap 6 MB). Almost all of it was native: a ConvolverNode holds
about 14 MB per second of its impulse (48 kHz, stereo), and every instrument
and the drum kit has its own - a 9.8 s hall (reverb4, the default pad's) cost
140 MB by itself, and a render's CPU grows the same way. What changed
(`nodes/reverb.js`):

- impulses are cut where 60 dB of energy is left, and capped at 3 s
  (`MAX_SECONDS`, faded over the last 0.8 s);
- a wet level under 0.08 (`MIN_WET`) gets no convolver at all;
- the second lead's and the drums' reverbs load only when they play
  (`defer()` / `hear()`, `Generator.warmRoles`);
- Audio menu > Performance (all apply after a reload, `audio/performance.js`):
  a "Light" reverb (a 2 s mono impulse on a mono-input convolver); "One reverb
  shared by all voices" (`nodes/sharedReverb.js`: each voice sends to one
  convolver per impulse type, the wet skipping the voice's EQ / filter / limiter
  and section tone - about 35 MB less, output level within 0.2 dB in a test).
  A "fewer unison voices" choice was tried and dropped: `bench/effects.html` shows
  the unison oscillators cost nothing measurable (a voice's cost is the reverb and
  a fixed per-voice part, not its oscillators).

Start-up memory about 780 -> 420 MB (full), audio load of the default voices
about halved in `bench/` (16% -> 10%). Tools: `bench/` (engine, one part
switched off at a time) and `bench/voices.html` (each built-in voice ranked by
cost; even a one-oscillator voice costs ~6% of a core, nearly all of it its
reverb). The menus: ⚙ is Options (share, phrase, sleep timer, save audio, tour), Audio
is the engine (load, buffer, quick stop, Performance), and the theme is a
light / dark / auto button in the header.
