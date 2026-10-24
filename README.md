# bgm

Calm procedural background music in the browser - for under a video, a
podcast or a work session. Live at **[calmbgm.com](https://calmbgm.com/)**.

Synth voices - **rhythm/pad**, **bass/support**, **lead** and an optional
**second lead** - play
from scales, chord progressions and simple arrangement rules, and can slowly
drift: key, mode, progression and tempo change over time with configurable
chances, either centred on your settings or wandering freely. Everything is
synthesised with the Web Audio API; there are no samples.

## Features

- Vibe on the main page: updated procedural rain, thunder and waves, with separate
  source settings and presets, alongside wind, fireplace and vinyl. Weather plays
  with music or on its own; shared links and WAV/video exports retain its settings.
  Continuous synthesis and retained export history keep events flowing across chunks.
- Detailed weather maker at `/ambient/`: continuous AudioWorklet synthesis,
  correlated rain and impact density, five impact materials, shelter filtering and
  seeded playback. Thunder adds a crack, rolling body and generated reverberation;
  breaking waves add approach, crest and continuous retreat/backwash. All twelve components have
  level/solo controls, with automatic activity, individual event previews and storm/
  shoreline presets. Local reference/previous-synth WAV auditions
  are available when `rain_synth/bands/` exists; recordings stay out of public builds.
  See [the rain lab notes](docs/RAIN_LAB.md) for the model and reference mapping.

- Every scale and mode family (major modes, harmonic/melodic minor,
  harmonic major, double harmonic, Neapolitan, hexatonic, pentatonic), any
  key, with correctly spelled chord names and Roman numerals
- Progressions of 2 to 8 chords; triads, sevenths or ninths; 3/4, 4/4,
  5/4, 6/8 and 7/4
- Arrangement: pad styles (sustain / pulse / slow arpeggio) and bass styles
  (whole bar / per beat group / walking) by adjustable shares, a lead that
  plays call-and-response phrases, per-voice octave and octave wander,
  humanized timing, velocity and pitch
- A second lead that answers the lead, harmonises it a third below, or
  plays its own slow line
- Sections: every few phrases the piece moves between intro, build, full
  and breakdown - voices come and go, the lead plays more or less, and
  (optionally) the voices darken in intros and breakdowns and open up in Full
- Presets in the top row: 46 soundscapes in a browsable window (categories,
  search, cards) - cozy, night, focus, ambience, sub-light cruising,
  console nostalgia and dig-farm-repeat - each setting key, scale, feel,
  drums, ambience and every voice's sound at once; switched while playing.
  "Copy setup" puts the whole current setup, every synth parameter
  included, on the clipboard as JSON; "Save current" keeps it in the browser
  under Mine; "Paste / open…" loads one back (docs/LIBRARY.md)
- A built-in preset has a plain link, `calmbgm.com/?preset=turnip-town` (or just
  `?turnip-town`); the address shows only that name until something is changed,
  then it becomes the usual settings link
- Percussion, in its own panel: soft synthesised drums - heartbeat,
  brushes, lo-fi beat or shaker, several grooves each - with activity,
  variation (grooves change between sections and phrases, every hit sounds
  a little different), volume, mute / solo, a room, and per drum on /
  level / tone / length; sections bring it in and out, fills close
  phrases, and turning it on never changes the notes
- Mutes are kept: they are part of the settings, so a reload or a link
  keeps them (solo isn't)
- Swing, from straight to nearly triplet (simple meters)
- Ambience under the music - rain, distant thunder, wind, waves, a
  fireplace, vinyl crackle - synthesised from noise (no recordings), each
  with its own level, plus a volume for the whole bed against the music.
  Each layer can be shaped - rain intensity and drop size, how often and
  how hard it thunders, wind speed and gustiness, wave length and size,
  fire crackle and roar, vinyl crackle and hiss - and placed: distance,
  pan (wind and thunder: direction) and stereo width;
  it plays with the music or on its own. "Music" and "Ambience" beside
  Play choose what Play starts (switching live while playing) and are
  part of the link; new visits play music only. Turning a layer up while
  nothing plays starts the ambience alone
- Sleep timer (in the ⚙ menu, its countdown in the header): in the last minute the music comes to an
  end on the home chord (V, then a held I) and the ambience fades out
- Save audio: renders the piece to a WAV file (1-60 min) faster than real
  time, in chunks so long files stay light on memory, with live progress,
  time left and Cancel; it can end on the home chord instead of fading
- Slow drift: each voice's pan, volume, filter and pitch wander (Wander panel), and the ambient bed's level -
  in all and per layer - does too, either on smooth waves or as a bounded random walk (normally spread around the
  centre, never past its limits)
- A pass-phrase per piece (in the ⚙ menu, with a dice to roll a new one):
  every visit - and every reload - starts with a random one, which reads as four words (`amber-tide-lantern-moss`); type
  those - or any words - and press Enter to play that phrase's piece from
  the start. The same phrase and settings always make the same music, and
  a link can name one: `calmbgm.com/?phrase=rainy+sunday`. The address bar
  keeps the settings but not the phrase; "Copy link" pins it
- Pause resumes at the next bar; randomizing or changing settings (time
  signature too) changes what comes next without starting over; ⏮ goes
  back to the start, ◀ ▶ step a chord, ◀◀ ▶▶ a progression - forward
  keeps the place within it, back goes to the start of the one playing,
  then to the one before (and plays exactly what was heard) - and loop
  repeats the chord or progression playing, handy for shaping sounds;
  Space plays /
  pauses; [ and ] step to the previous / next preset; ← and → go back / on a chord (with Shift, a progression); lock-screen, notification and media-key controls
  (next / previous track = new / previous variation)
- Drift ("evolution"): related-key and mode changes, progression changes,
  tempo glides, optional V-chord preparation for key changes; keys and
  modes can be excluded
- A scrolling timeline of the chords and notes coming up, with mute / solo
  per voice
- Play any voice from the computer keyboard (A-; and W E T Y U O P, Z/X for
  octave) or from MIDI after clicking "Connect MIDI"
- A full synth editor per voice - with FM, organ / hollow / choir / glass /
  reed waveforms, a pitch envelope, filter LFO, key tracking and velocity
  to brightness, tremolo and auto-pan - 71 built-in presets by category,
  and your own presets (saved in the browser, or exported/imported as JSON)
- Procedural sounds: a new preset per voice from a random seed, of a kind
  you pick or the seed picks (pad, texture or keys; bass or pluck bass;
  lead, pluck or bell), levelled to the role's default loudness; or "New
  sounds" for every voice at once, sharing one character (smooth, warm,
  bright, glassy, organ, lo-fi or dub); links carry the seeds
- Stop fades out within half a second, reverb and echo tails included
  (optional, in the Audio menu with the buffer size and the Performance choices); master volume
- Simple by default: each panel shows its main controls, the rest is
  behind "More options"; a dice button randomizes a whole panel, a style
  group or a single field
- Randomize key & scale, progression, conductor, voices or everything at
  once - "within reason" (near the defaults, minor progressions in minor
  modes, lead sounds on the lead) or "full random"
- Share links: the address bar always holds the current settings in
  short codes, so a link plays the same piece for whoever opens it. A link
  has up to three parts, present only when they differ from the defaults:
  `m=` the music (with the random seed: about 6 characters for the defaults),
  `v=` the voices (sounds, volumes, registers) and `a=` the ambience.
  Older `?s=` links still open
- An audio-thread load meter with a choice of output buffer size (larger
  buffers stop crackling on slow machines), and a light / dark / system
  theme

## Fluid background (desktop MVP)

Open the palette menu beside the volume control and enable **Fluid background**,
then press Play. Fluid starts disabled on desktop and mobile when
there is no saved choice; an explicit choice is remembered. The circle
visualizer is currently hidden from the interface and inactive. Hide the
interface and timeline for an unobstructed view.
Both hidden-view choices are remembered per browser across visits; Escape
shows the interface again and remembers that choice.
The WebGL2 fluid replaces the former noise clouds: each voice has a smooth,
seeded wandering source, with its notes grouped closely around that path.
Pitch shapes small offsets around the voice,
velocity and synth envelopes control injection, and held notes follow curved
paths. Short gates create narrow, stronger jets; longer gates create broader,
slower sources. Live keys grow and slow as they remain held. Synth brightness
and roughness also affect the source shape and movement.
Keyboard/MIDI notes, mute/solo, and ambience-only playback also drive it.

Colour follows the sounding chord, key, section, and activity, with register,
velocity and synth brightness affecting individual notes. Major/minor warmth
and harmonic tension are visual interpretations. Follow the key allows larger
mood changes; named palettes keep the shifts within their colour family, and
Monochrome stays desaturated. Colour transitions are eased. Voice paths use a
separate deterministic random stream and never alter the generated music.

Start with a **Flow look**: Balanced, Fine trails, or Soft ink. These set the
dynamics together while preserving your palette and quality. Changing a look
clears the existing fluid; **Clear flow** does the same without changing settings
or stopping playback. The main controls show emitter size, swirl, and trail
half-life in seconds. **Fullness** broadens dye emitted by notes and audible
ambient layers without changing their velocity field. There is no procedural
background pattern. Rain falls, wind blows, waves swell, fire rises, vinyl
drifts, and thunder pulses with its actual sound. Layer levels, shapes, pan
and width update these sources live; silent or disabled layers emit nothing.
Fullness is preserved when changing flow looks. Quality has Efficient,
Balanced, and High choices.

**Jet direction** offers backward-facing Exhaust or Along source path.
**Motion speed** sets one budget; **Motion to source** shares it between source
travel and jet speed. At 0% the source stays still with a strong jet; at 100%
the source moves with no injected jet. Advanced **Balance drift** varies the
share smoothly per voice, keeping the total budget fixed and the endpoints
exact. Changing the balance or speed preserves the current source position.
These controls affect musical sources; ambience retains its own sound mapping.

**Advanced fluid settings** retains the individual solver controls and shows
values beside every slider. The palette menu controls motion speed, colour, dye brightness,
separate velocity/dye diffusion and fade rates, independent simulation/dye
resolutions, and a kinetic-energy ceiling. Diffusion spreads the field; fade
removes it over time. Zero diffusion preserves sharper detail. The ceiling is the mean of
`0.5 * dot(velocity, velocity)` over the normalised unit-area simulation domain;
it is measured and enforced on the GPU every simulation step. Dye is bounded
separately. The simulation longest edge is selectable from 128 to 1024 cells,
and dye from 256 to 2048 cells; both grid axes are powers of two. Resolution
changes and aspect-ratio changes resample the existing fields. Defaults are
512/1024, with 24 pressure iterations and a 60 Hz simulation capped at two steps
per display frame. Dye uses limited MacCormack advection to retain fine trails.
The Swirl detail control sets vorticity confinement, followed by pressure
projection and the energy cap. Diffusion uses an implicit solve on each field independently. It needs renderable
floating-point WebGL2 textures. No video-export changes are included.

In development, `window.__fluid` exposes the solver, emitter controller, and
frame/step counters for debugging. Numeric energy controls are simulation
units, not an audio loudness measurement. This is a first visual/timbre mapping;
there is no spectral separation of individual instruments.

## Music generation modes

The options menu offers **Latest** (default) and **Original**. Latest retains
themes across rests and develops them through four-bar statements, answers,
variations and returns. Answers can displace or fragment the retained motif;
development can sequence it, lengthen notes or create a shorter fragment, with
restrained ornaments at higher density. Statements and returns keep the stored
motif, fitted to the sounding harmony. It also uses revised meter-specific percussion with
protected accents and restrained fills. Bass and drums share accents and pickups,
walking bass connects chord targets, and rhythmic accompaniment leaves room
around lead attacks. Timing variation keeps bass and kick together. Latest now
shapes velocity over each phrase, rising towards a high point and relaxing,
with shallower movement in supporting parts and less independent note jitter.
The existing humanisation velocity and timing controls set the amounts; zero
keeps the corresponding values exact. Original retains its previous performance. Sections now vary in duration,
prepare their next destination, retain themes through breakdowns and bring
the main theme back on returns. Section tone follows a smooth brightness
curve when enabled. Section length is a reference duration in Latest.
Original uses the previous arranger
and percussion algorithms. New generated sounds (✦ / New sounds) use scene-aware
version 3 recipes in Latest. Folk, keys, chip, analogue, cinematic, ambient and
organ families adapt to the intended register, tempo and note length, with
different widths and effect depths per role. These creation settings are frozen
in shared links. Original uses previous recipes; switching modes rebuilds
unedited v3 sounds at the next chord. Edited sounds and explicit v1/v2 sound definitions retain their settings.
Latest also upgrades five named pluck patches and four piano patches as described below. The underlying synthesis
engine is shared.

Append `generation=legacy` to a URL to restore Original, for example
`/?preset=rainy-cafe&generation=legacy`. Reloads, preset changes and copied
links keep the choice. Switching while playing applies at the next chord.
Latest's pentatonic lead option restricts every melodic note, including
strong notes and endings, to the selected pentatonic set.

For local groove comparisons, open `/tools/percussion.html` with the dev server
running. It exposes each Latest groove, labelled hits, dry four-bar playback
and WAV download, with meter, tempo, seed, swing and variation controls.

For ensemble comparisons, open `/tools/ensemble.html`. It compares the previous
Latest with coordinated Latest using the same seed, themes and sounds, with
optional Original, individual part controls, matched average levels, note maps
and WAV downloads. Switching players keeps the listening position.

For longer form comparisons, open `/tools/form.html`. Inspect 32–128 bars of
previous sections and developed form using the same ensemble, then render a
matched audio pair. Section strips and phrase decisions show where themes
return and transitions are prepared. The earlier ensemble comparison keeps
the previous section system in both versions to isolate ensemble changes.

For sound comparisons, open `/tools/sound.html`. Hear previous generated sounds,
scene-aware sounds and an optional library reference on identical notes, with
matched levels, part isolation, family selection, a fast-articulation option and
WAV downloads. This changes generated voices; applying a named scene continues
to load its named library sounds. Further acoustic models and per-note expression remain future work.

For performance comparisons, open `/tools/performance.html`. Hear independent
variation against phrase dynamics on identical pitches and note lengths, using
current named sounds. It supports part isolation, velocity/timing controls,
matched levels, per-bar dynamics summaries and WAV downloads. Earlier comparison
pages retain their original performance to isolate the changes they review.

For melody comparisons, open `/tools/melody.html`. Compare repeating motifs with
bounded theme development over 8–32 bars, with solo/duet/ensemble playback,
density overrides, matched levels, WAV downloads and per-bar transform labels.
Sixteen bars expose statement, answer, development and return with sections off.
This earlier comparison retains the per-bar pitch search to isolate motif changes.

Latest now plans pitches across the remaining known portion of each four-bar
phrase, balancing contour, chord fit, leap recovery and the closing target.
It keeps motif rhythm and note lengths. The path is cached and replanned when
its harmonic or melodic context changes; unknown future key changes limit the
forecast rather than being guessed. Latest also chooses four- or eight-bar phrases, keeping shorter phrases for
driving profiles and short section boundaries. Longer phrases retain their
orchestration across the midpoint, answer in the second half, and place pickups,
fills and performance gestures at their actual boundaries. Their midpoint target
is lighter than the final close. Original remains four bars.

Open `/tools/phrase.html` to compare per-bar and phrase-wide pitch planning.
It offers the same presets and density controls, settled/open endings,
solo/duet/ensemble playback, matched levels, WAVs and destination labels.
Exact timing defaults on; preset humanisation can be restored for listening.

Open `/tools/length.html` to compare forced four- and eight-bar phrasing.
It includes density and ending controls, solo/duet/ensemble playback, matched
levels, WAVs and phrase labels. Use 32 bars to hear a full long phrase-role cycle.
Earlier comparison tools retain four-bar phrases to isolate their original changes.

Latest also plans restrained passing/neighbour notes, anticipations and prepared
holds over known chord changes, with an explicit chord-tone landing. These reuse
existing attacks; suspensions tie across the bar instead of reattacking. The
selected melodic scale and range still constrain them, and a two-bar budget
keeps embellishment restrained.

Open `/tools/resolution.html` for matched listening comparisons and labels showing
each tension note and its landing. Density, ending and part controls are included.
Deliberate two-lead repeat patterns (one lead moves while the other holds) remain
planned counterpoint work; current second-lead spacing checks are still in place.

Latest can now introduce a distinct contrast phrase before returning to the main
theme. It uses the retained secondary theme with bounded reflected contour,
shifted entrances and more space. Development stays available in alternating
cycles; the existing repeat preference reduces contrast, and 100% suppresses it.

Open `/tools/contrast.html` for a matched previous-cycle/contrast comparison,
with four/eight-bar phrases, part controls, WAVs and role/transform labels.
The comparison sets repeat preference to zero to expose the contrast role.

The Colour panel's Harmony scale control separates melodic notes from chord
colours. Automatic parent harmony uses major/minor parents for Major/Minor
Pentatonic melodies; other modes keep their selected-scale chords. Selected
scale colours retains the earlier unusual pentatonic harmony, and explicit
major/minor parents are available. Bass and accompaniment follow the harmonic
scale while melodic parts retain their selected note set. The choice persists
in shared settings URLs; Original keeps its existing selected-scale harmony.
Open `/tools/harmony.html` for a matched listening comparison with chord labels.

Latest also retains a two-bar second-lead idea for duet phrases. Answers move
the foreground over that idea; development exchanges the roles, contrast uses
opposing motion, and returns recall the shared opening. Repeats adapt to harmony
and sustained clashes rather than forcing exact pitches. Existing activity,
silence and parallel-harmony choices still apply; Original is unchanged.
Open `/tools/duet.html` for matched duet/ensemble comparisons. Choose 32 bars
to include the inverse exchange, or 32 bars with eight-bar phrases for the
first longer cycle. Earlier comparison pages retain their previous behaviour.

Latest's rhythmic accompaniment and counter can now support, answer or leave
space around the foreground over a shared two-bar rhythm cell. The cell stays
recognisable for four phrases, with a bounded weak-slot change before its
opening returns. Drum ornament choices also reuse the cell; anchors, fills
and section transitions retain their existing rules. Held textures and chord
entrances stay fixed, and the accompaniment thinning switch still applies.
Open `/tools/rhythm.html` to compare this layer with the previous coordination.
Pulse or Arpeggio makes the accompaniment response easier to hear. Earlier
comparison pages keep their existing rhythmic behaviour; Original is unchanged.

Latest lead lines also use a bounded melodic rhythm grammar: earlier pickups,
syncopated attacks, breathing gaps, held or shortened endings, and ties between
equal pitches. It reuses existing attacks, retains the final motif degree and
protects cadence/resolution targets. Across-bar ties require unchanged known
harmony and account for tempo changes; not every phrase has a qualifying tie.
Open `/tools/grammar.html` to isolate these changes from the previous motif
rhythm, with solo/ensemble playback, phrase controls and gesture/tie labels.
Earlier comparisons keep their earlier rhythms; Original remains unchanged.

Latest rhythmic accompaniment and independent counter lines can also breathe:
one interior attack group can drop out, a phrase tail can shorten, an existing
pickup can arrive earlier, or repeated attacks can become a hold. A planned
counter rest can hand a bar to the main lead without losing its motif memory.
The lead's notes stay the same. Sustained/rolled/stacked pads retain their
fullness, and the accompaniment thinning switch still applies.
Open `/tools/breathing.html` for matched comparisons, including counter-only
and accompaniment-only playback. Earlier tools retain their prior behaviour.

Latest also gives loaded instruments a small timing feel: plucked voices can
lean forward, keys and breath-like voices sit slightly behind, and chip/classic
voices have tighter residual timing. Chord pitches share one strike, while
bass and kick retain their common timing reference. The existing Timing control
scales the effect; zero remains exact. Profiles refresh at phrase entrances.
Open `/tools/groove.html` for a matched timing comparison using the same current
composition and sounds. Earlier comparison pages and Original remain unchanged.

Latest independent leads can also choose pitches jointly over the known part
of a phrase. A bounded search weighs motif contours, continuity, held clashes,
crossings and motion between the voices. Cadence, tie and resolution notes stay
protected. Future counter rhythms are projected from retained ideas and known
breathing plans, then reconciled as each bar becomes current. Compatible paths
are retained; changed harmony or rhythmic context replans the remaining phrase.
Open `/tools/counterpoint.html` for the comparison and per-bar change labels.
Many passages already fit and remain unchanged. Deep Night, seed 7, full lead
density and eight bars provides a small foreground response in bar five.
Explicit parallel harmony, Original and earlier comparison pages are unchanged.

Open `/tools/percussion-audit.html` to isolate core grooves versus optional
variation/fills, felt versus crisp mapping, or exact versus instrument timing.
The new comparison includes synced vertical cursors, current bar/beat labels,
A/B position matching and click-to-seek charts. Earlier pages are unchanged.
New comparison pages should use `tools/comparisonPlayhead.js` with actual bar
start times/durations and the renderer's pre-roll offset.

When sections are enabled, Latest also shapes activity, note length, small
register movement and the balance of allowed accompaniment/bass styles across
each section. Breakdowns favour longer notes and sustained textures; builds can
become more rhythmic. Disabled styles and explicit lead silence remain respected.
Slower long forms can prepare transitions eight bars ahead.
Open `/tools/sections.html` for the comparison, with synced cursors across chart
rows. The pair shares section order and lengths; a measured difference table and
amber bar outlines identify changes inside the sections, including unchanged
selections. Choose 64 bars to include more breakdown/return transitions. Earlier form
comparisons and Original retain their previous behaviour.

Latest also prepares full-section arrivals with a closing fifth chord and a
tonic return, retaining the mode's chord qualities and existing chord-slot grid.
Conductor pivots and explicit endings take precedence; Sections Off and Original
retain their previous harmony. `/tools/cadences.html` isolates this layer with
exact chord/arrival tables, measured note differences and synced playheads.
Latest can also connect the slot before a cadence through common tones, selecting
a modal substitute only when both sides connect and the score improves.
`/tools/bridges.html` isolates this layer and lists shared notes. These are
harmonic connections; individual voices are not automatically tied across them.
Eligible Latest section cycles can redistribute whole-bar chord durations while
keeping progression order and cycle length: a two-bar reference becomes 3/1/2/2.
This initial layer requires at least four progression entries and two reference
bars per chord; full sections remain even. `/tools/harmonic-rhythm.html` compares
actual slot boundaries, with matched audio and synced playheads.
Latest can also thin rhythmic backing and lighten its closing tail during the
last two bars before a full arrival or breakdown. Held pads retain their fullness;
lead rhythm and bass/drum patterns are not directly edited. `/tools/gestures.html`
isolates the backing layer and marks planned versus actual changes.
Busy lead ideas can also lose one unaccented interior source attack before a
section change, preserving endpoints, accents and committed tie/resolution points.
Sparse lines remain intact. `/tools/lead-transitions.html` isolates this layer
with lead-only playback, source-removal counts and actual note differences.
A weak closing lead attack can also become an upbeat into a known full return,
retaining its pitch degree and source count. Accents, sparse material and committed
ties/resolutions are preserved. `/tools/lead-pickups.html` isolates this rhythmic
articulation with source timing, matched audio and synced playheads.
An eligible closing chord tone can also hold across a full-section return and
resolve by step against the new harmony. Its preparation can move by up to a third;
the arrival reuses an existing attack, and silent leads remain silent.
`/tools/section-suspensions.html` isolates this layer with lead/pad playback,
explicit preparation/landing status, matched audio and synced playheads.

Latest now selects gradual, thematic, ostinato, cinematic or speech-bed development
from the composition settings. Duration, recent section history and reference
harmonic-cycle entrances guide the form. Returns retain the theme with varied
orchestration; subdivision and tension have separate curves. Harmonic pacing
keeps progression order/cycle length and protects closing/returning slots, with
guarded interior modal destinations in long sections. Explicit silence, disabled
styles, modulation, strict scales and endings retain precedence.

`/tools/development.html` compares the complete Phase 3 batch or isolates form,
curves, harmony and ending integration. It includes strategy overrides, section
decision tables, matched audio and shared playheads across chart rows. Earlier
comparison tools retain their preceding algorithms. Live, offline and visual
plans carry actual four/eight-bar phrase and section boundaries; final endings
clear unheard phrase targets before their held tonic and silent tail.

## Plucked strings

Latest uses damped-string synthesis for Nylon Guitar, Soft Harp, Harp Pluck,
Kalimba Pluck and Upright Pluck, and for generated folk plucks. Original retains
their oscillator versions. Explicit custom patches and edited voices stay intact.
The advanced sound editor's Sound source selector chooses the model; the
Plucked string module adjusts decay, damping, pick position and body. Envelopes, filters, effects, microtonal
tuning, humanised detune, pitch envelopes, vibrato and pitch wander still apply.
VCO/FM controls appear when the oscillator source is selected.

Open `/tools/strings.html` for a level-matched comparison on identical notes,
with patch/part selection, string controls, solo or ensemble playback and WAV
downloads. Note buffers are generated procedurally ahead of playback and retained
in a shared 24 MiB cache with piano note buffers. This is an initial string model, not a complete acoustic
guitar or harp simulation.

## Piano voices

Latest uses struck-key synthesis for Felt Piano, Soft Keys, Tine Keys and FM
Rhodes, and for generated keys-family voices other than bass. Independently
decaying partials, register-dependent decay and velocity-sensitive strike colour
provide felt and electric variants. Original retains the oscillator/FM recipes;
custom patches and edited voices stay intact. Pixel Piano keeps its chip sound.
Select Piano under Sound source in the advanced editor to adjust tone, decay,
brightness, hammer, unison and **Held body**. The held body adds a quiet sustained
tone under the fading strike so long pad chords stay present; set it to zero for
a purely decaying voice. Existing envelopes, filters and effects still apply.

The **Classic keys** group keeps Felt Piano (classic), Soft Keys (classic),
Tine Keys (classic) and FM Rhodes (classic), with their original oscillator/FM
sound. These are selectable in Latest and retained in sharing links.

Open `/tools/piano.html` for comparisons on identical notes at matched levels,
with preset music, soft/hard strikes, register sweeps, short and long held chords, optional
ensemble playback and WAV downloads. Piano and string note buffers share a
24 MiB cache. The small held-body buffer loops until release. This is an initial procedural model; pedal behaviour and coupled
soundboard/string resonance remain future work.

## Music generation roadmap

See [Music generation improvement plan](docs/MUSIC_GENERATION_PLAN.md) for the
phased work on themes, rhythm, form, expression and synthesis, with compatibility
requirements and listening checks.

## Development

The public [synth comparison hub](https://calmbgm.com/synths/) offers fourteen
instruments under Vintage, DIY and Drums, with bundled YAML preset banks.
DIY Poly and DIY FM wrap the existing synth engines with playable panels.
Every synth's **Effects** button opens the illustrated shared rack. It can also
connect to an open instrument from the [effects page](https://calmbgm.com/synths/effects/).
Choose a program under **Compare presets**, then **Copy comparison link** to send that exact program to a hardware
tester. **Download YAML** includes the panel settings. See
[public testing instructions](docs/SYNTHS_PUBLIC_TESTING.md) for exports,
limitations and validation.

```bash
npm install
npm run dev       # http://localhost:5173/
npm test          # Vitest
npm run build     # -> dist/
npm run preview   # serve dist/ at http://localhost:4173/
npm run deploy    # tests + build, then publish dist/ to the gh-pages branch
npm run render -- --preset rainy-cafe --minutes 60   # MP3 + a 30 fps MP4 of the timeline (below)
```

For a single performance-testing switch, open
`/?preset=tine-and-tide&perf=1` (or `/labs/all/?perf=1`). On the main page,
**Perf: on/off** in the header switches live and briefly rebuilds the instruments
at the current bar. The bundle enables Wasm, FM source banking/SIMD, eligible
acoustic-filter SIMD, shared matching rooms, and pauses the fluid background.
It retains the selected synthesis/reverb quality, individual delays and private
rooms. The trial is temporary, travels in shared links and leaves saved device
preferences untouched. `perf=0` disables the optional bank/SIMD paths for A/B;
it retains Wasm and the saved room/background choices. Already accepted exact
optimizations remain enabled in both modes. Perf mode remains off by default.

The optional FM source-bank trial is available at
`/?preset=tine-and-tide&wasm=1&bank=1` and `/labs/all/?bank=1`.
It batches sparse FM voices across instruments while retaining separate stereo
outputs, controls and effects. Omit `bank` and reload for independent sources;
the choice is temporary and falls back when the optional kernel is unavailable.
It remains off by default. See [the backend handoff](docs/SYNTH_NEXT_STEPS.md)
for measured gains, limitations and validation commands.

### Recording from the command line

`npm run render` records a stretch of a preset as an **MP3** and an **MP4** that shows the page's timeline
with its playhead (21:9, 1680x720, 30 fps), for demo videos and uploads - no WAV is ever written. It needs
Chrome (or Edge) and `ffmpeg` on the PATH; the engine is Web Audio, so a headless Chrome renders the sound
(faster than real time, a minute at a time, streamed into ffmpeg) while the video is drawn alongside and
muxed at the end. An hour takes roughly half an hour.

```bash
npm run render -- --list                                   # the presets
npm run render -- --preset rainy-cafe --minutes 60         # renders/rainy-cafe-60m.mp3 + .mp4
npm run render -- --preset rainy-cafe --minutes 10 --no-video --seed 42
npm run render -- --link "https://calmbgm.com/?m=...&v=..." --wander brownian --ending
```

Several at once: `--preset a,b,c` or `--all` (`--category cozy` for one category) render a few at a time
(`--jobs`, default a third of your cores, at most 4; each job has its own browser, video process and ffmpeg),
with a row of progress per render. `--skip-existing` carries on after a stop, and a failed render doesn't stop the rest.

`--help` lists the rest (`--out`, `--width`, `--fps`, `--theme`, `--mp3-quality`, `--ending`, ...). Links
that carry a *generated* sound can't be rebuilt yet: use a preset or a link of library sounds.

Audio performance: with `npm run dev` running, open
http://localhost:5173/bench/ (engine load per arrangement, parameters in
`bench/bench.js`) or `/bench/nodes.html` (cost per node type); results
and history are in `docs/DESIGN.md` §5.

The site is GitHub Pages (the `gh-pages` branch) on the custom domain
calmbgm.com - `public/CNAME` names it, and it ships with every deploy. It
is built with `base: '/'` (see `vite.config.js`); asset and AudioWorklet
URLs go through `import.meta.env.BASE_URL`.

## Layout

```
src/app/            the application
  Generator.js        plan-ahead sequencer: settings -> planned bars -> audio
  conductor.js        drift of key / mode / progression / tempo per cycle
  arranger.js         per-bar notes for pad, bass, lead and second lead; sections
  theory.js           scales, chords, spelling, voice leading
  engine/             Instrument (voices + effects), envelopes, Transport,
                      ambience (+ its worker), offline render to WAV
  editor/             synth editor, presets store
  PresetBrowser.jsx   the presets window; scenes.js / setupStore.js its data
  settings.js         defaults, validation, share links
src/library/        the presets as JSON: voices.json (synth sounds), scenes.json (setups)
src/nodes/          Web Audio building blocks (effects, oscillators, noise)
src/components/     MonoSynth voice and the knob/select/module UI controls
public/             AudioWorklet processors (noise, bitcrusher)
bench/              audio performance benchmark pages (dev server only)
docs/DESIGN.md      design notes, decisions and performance measurements
```

Unit tests live next to the code (`*.test.js`) and cover the music logic -
theory, arrangement rules across meters and scales, drift, planning and
booking, settings/share-link validation.

## Licence

The code is [MIT licensed](LICENSE). The music it makes is procedural, and
no rights are claimed on it: use anything you play, record or save however
you like. A credit (calmbgm.com) is appreciated but not required.


Background playback diagnostics: the main Audio menu can copy a local snapshot of context/engine/quality and source recovery counters even without recorded silence. The audio-load display is an estimate where callback pacing permits measurement; a dash means unavailable and Idle means suspended. Paused silent playback now suspends safely. See [background investigation and device-test limits](docs/SYNTH_DSP_PROFILE.md#background-clocks-idle-shutdown-and-load-reporting--19-october-2026).


`/tools/audio-output.html` is a minimal output-path diagnostic: the same quiet PCM loop through native Web Audio, Web Audio plus the lock-screen helper, a media-file element, or a media-stream bridge. It loads no synth/room/worklet. Stop other playing tabs when comparing. Main-page links can temporarily disable the silent helper with `mediaHelper=0`; the default stays on and no preference is saved. These are diagnostics, not a promise of mobile output reliability.


Firefox on Android visitors receive a dismissible audio-compatibility notice on the main page and labs. It covers both synth engines, suggests Chrome for better compatibility, and offers an optional persistent opt-out. Playback is still available through Continue anyway; desktop Firefox is unaffected.


Percussion is a track voice with four whole-kit presets: **Felt**, **Crisp**, **808** and **Hand percussion**. Click the percussion track name to open the same sound browser as the melodic tracks, filtered to drum kits. Search or use arrow/bracket keys to audition Felt, Crisp, 808 and Hand percussion; Escape closes it. The pencil opens detailed controls for eleven named instruments, their level/tone/length and room. The voice preset includes kit balance; loading/resetting one preserves the groove, track volume and mute/solo. Edited kits are marked and travel with settings/share links. Felt and Crisp retain their existing saved IDs and default balances; 808 adds quieter metallic extras, including a labelled cowbell and open hat. It is an original drum-machine-inspired palette, not a circuit emulation.

The **percussion backend** is separate from the sound preset and melodic engine. Native Web Audio remains the default for Felt/Crisp. Choose **Options → Sound engine → Percussion backend**, or append `perc=wasm` to test queued Wasm percussion. The 808 and Hand Percussion voices require Wasm and prepare it automatically for percussion only. Once prepared, Felt/Crisp can use that same source; changing kit voice does not restart the piece or shorten the lookahead. Future hits remain data in an 8,192-event queue with 64 active voices. Existing `perc=808` links migrate to the 808 voice and `perc=wasm`, retaining saved per-drum edits. The percussion room remains the original convolution path.

`/tools/percussion-engine.html` auditions the four voices with a fixed groove by default, explicit groove variant / seeded choice, meter, seed and variation controls, eleven correctly named live pads, shared playback cursors and WAV downloads. Felt/Crisp compare Native and Wasm; 808 and Hand Percussion are Wasm-only. The raw fourteen-slot compatibility fixtures remain available to automated source audits. `npm run audit:percussion` checks raw-source parity; `npm run audit:percussion-playback` checks playback, cancellation, exports and phone layout. See `docs/SYNTH_NEXT_STEPS.md` for sustained physical-device validation still required.


Hand Percussion adds rounded low/muted conga and bongo tones, woodblock and claves, soft tambourine tap/shake, seed shaker/sweep, palm clap and cabasa. It uses modal sine bodies with a quiet contact layer and a balanced kit preset, retaining the same bounded Wasm queue. Standard MIDI bongo/conga/woodblock/tambourine notes address the appropriate roles; note velocity controls hit strength.

Five additional rhythm styles are available on the main page and percussion bench: **Bossa / light Latin**, **Jazz lounge**, **Broken beat**, **Ambient percussion** and **Hand-percussion groove**, each with three variants across all supported meters. They work with any kit. Ambient uses a sparse four-bar texture without a kick/backbeat clock; jazz carries a triplet ride skip; bossa has an alternating two-bar clave. The older seven active styles keep their prior patterns. Main-page pattern edits affect the next unbooked bars; the long lookahead stays intact. Kit voice changes can reinterpret already queued attacks.

On the audition page, changing a control pauses old audio and marks it outdated. Press **Render comparison** to hear the new selection; rendered players show their style/variant. `npm run audit:percussion-palette` checks all four kits across the new styles, Hand controls at 44.1/96 kHz, long-queue playback, stop, exports, saved links, rulebook labels and phone-width layout. Physical listening/balance and sustained phone/Surface testing remain the next gates.

The preset browser contains 92 current scenes, each shown once. The temporary Updated comparisons have been removed after listening; approved revisions are the normal presets and retain New badges. Historical comparison URLs still resolve. `npm run audit:percussion-presets` checks the shared drum browser, sequential scene navigation, mobile layout and the twelve reviewed arrangements.
