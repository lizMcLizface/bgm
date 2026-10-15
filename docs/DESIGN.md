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
  movement between chords. No close intervals below ~C3. Sustained pads or a
  slow arpeggio.
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

- **Quick:** `MediaRecorder` on a `MediaStreamDestination` tapped from
  `masterBus` → webm/ogg download, realtime.
- **Better:** render through an `OfflineAudioContext` with a seeded RNG —
  faster than realtime, deterministic per seed. Possible because
  `scheduleNote` has no timers and nodes take the context in their
  constructor; the noise worklets must be registered on the offline context
  too.

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
5. **Sections** — layer entry/exit, intro/A/B/breakdown.
6. **Performance pass** — §5, measured.
7. **Export** — §6.
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
