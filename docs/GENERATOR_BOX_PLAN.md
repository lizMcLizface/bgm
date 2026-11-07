# Generator box, channel mixer and ambience box (plan)

Status: plan plus a visual proof of concept (2026-11-07, uncommitted). The proof of concept is
[GeneratorBox.jsx](../src/synths/all/GeneratorBox.jsx), [ChannelMixer.jsx](../src/synths/all/ChannelMixer.jsx),
[generatorBox.css](../src/synths/all/generatorBox.css) and the data in [generatorBoxModel.js](../src/synths/all/generatorBoxModel.js),
mounted above the sound generators on `/synths/all`. Its knobs turn and press, but nothing is wired to the Generator.

## The idea

`/synths/all` becomes a rack of boxes, each a hardware-style device with the same grammar: a **display**, **section buttons**
and **four knobs with a function window each**. The front page's generator becomes the first box; the synths become boxes
that plug into it later.

| Box | What it is | State |
|---|---|---|
| Generator | key, progression, tempo, evolution, wander, rules, control | proof of concept |
| Mixing desk | 8 strips (6 voices, ambience, headroom) + master; sends on a display above | proof of concept |
| Ambience | rain, wind, birds as one box feeding the mixer's 7th strip | plan only |
| Sequencer | exists | built |
| Synth boxes | each synth page as an embeddable box | later |

## The generator box, made concrete

```
┌─ GENERATOR ───────────────────────────────────────────────── [PRESET OLED] (◉) ┐
│ ┌────────┐ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Scale  │ │ C Ionian · i-VI-III-VII · 72 BPM · 4/4            PLAYING       │ │ ← info strip, always shown
│ │ Progr. │ │ SCALE   the key and the scale the song lives in                 │ │ ← section title
│ │ Tempo  │ │                                                                 │ │
│ │ Evol. ●│ │                    display (per section)                        │ │
│ │ Wander●│ │                                                                 │ │
│ │ Rules  │ │                                                                 │ │
│ │ Control│ │                                                                 │ │
│ └────────┘ └─────────────────────────────────────────────────────────────────┘ │
│ [fn window](◉)   [fn window](◉)   [fn window](◉)   [fn window](◉)            │
└────────────────────────────────────────────────────────────────────────────────┘
```

Cleanups from the sketch: the display is split into three bands (always-on **info strip**, **section title**, **section body**);
every knob has its function window *beside* it (left of the knob) so the label is always the live value; section buttons carry
a status light when the section is a switch (Evolution, Wander); unused knob slots stay dark rather than vanishing, so the
layout never jumps. Small screens: the section buttons become a row on top, the knobs go two by two.

### Knob grammar (all sections)

- **Turn**: choose or change. **Press** (a click that is not a drag): switch on/off, or pick, where the knob says "press".
- Double-click resets. Wheel and arrows work (the existing `Encoder`).
- Choice knobs snap to list entries; value knobs run 0..1 and are shown in real units.

### Sections and knobs

| Section | Knob 1 | Knob 2 | Knob 3 | Knob 4 | Settings path |
|---|---|---|---|---|---|
| Scale | Key | Scale family | Mode (list follows the family) | – | `tonic`, `mode` |
| Progression | Progression (4 chords) | Bars per chord | press: generate; | Mood | `progression`, `barsPerChord`, `progressionMode`, `mood` |
| Tempo | BPM | Meter | Bars per chord | Swing | `bpm`, `meter`, `barsPerChord`, `swing` |
| Evolution | on/off (press) | What: key, mode, key change, progression, tempo (press = include) | Chance | – | `drift.*` |
| Wander | on/off (press) | What: pan, volume, filter, pitch | Amount | Voices (turn through, press = toggle each) | `wander.*` |
| Rules | Voice (lead, 2nd lead, rhythm, pad, bass, drums, harmony) | Rule within it | Value (press = rule on/off) | – | `src/app/rulebook` |
| Control | – | – | – | – | embeds the front page's `QuickPanel` in the display |

Display per section: Scale = key/scale/mode chips; Progression = four chord cells sized by bars; Tempo = big BPM;
Evolution/Wander/Rules = chip lists with the current and the switched-on ones lit.

## Things the sketch did not have (added)

1. **Preset section on the title bar** drives `scenes`/preset browse; also shows the preset name in the info strip when edited ("Rainy Window*").
2. **Seed / New song**: a seed readout and a "new song" key (today these are above the page); a lock per section so New song keeps the key but changes the rest.
3. **Transport and play state** in the info strip (bar x of y, playing), so every section shows where the song is.
4. **Undo / compare** (A/B): flip between the preset's settings and the hand-edited ones.
5. **Mood, Intensity, Feel** have a home: Mood is on Progression, Intensity and Feel live in Control (the QuickPanel).
6. **Rules reset per voice** and a "modified" dot on a section when it differs from the preset.
7. **Link to share** keeps working: the box reads and writes the same `settings`, so `?s=` links are unchanged.
8. **MIDI learn / mod assign** on any knob later, as the drum pages already do (Encoder `onAssign`).
9. **Keyboard focus order** and aria on every knob (the `Encoder` has it already).
10. **Touch**: knobs drag vertically, which fights page scroll; the box captures pointers on knob only, never on the display.

## The mixing desk

Laid out after an X32 ([ChannelMixer.jsx](../src/synths/all/ChannelMixer.jsx), [mixerDesk.css](../src/synths/all/mixerDesk.css)). Eight strips: the six voices
(lead, 2nd lead, rhythm, pad, bass, drums), the ambience box and a **headroom** channel (a spare input; its job is open, see below), then a master section.
Reverb and delay are **not** on the strips: a small display above the desk with six knobs (channel, reverb, reverb size, delay, delay time, feedback) edits the sends of
the channel it shows, and a strip's name display or SEL button chooses that channel.

Per strip, top to bottom: name LCD (with pan readout), gain, high-pass (on + frequency), low-pass (on + frequency), 3-band EQ (hi, mid, lo),
pan, SEL / SOLO / MUTE, level meter and fader (dB scale, 0 dB at 75%), dB readout, channel colour bar.
Master: width, balance, limiter ceiling, LIMIT / MONO / DIM, two meters, master fader.

Wiring plan:
- Fader = `settings.volumes`, mute = `settings.muted`, sends = the per-voice bus sends (`settings.bus`) plus a reverb size and delay time/feedback per voice (new, small).
  Solo is new and session-only, like the front page. The sequencer cards' mute/solo checkboxes and the strips share one state (`useMixer`).
- Per channel chain after the instrument: gain → HPF → LPF → 3-band EQ (low shelf, peaking, high shelf) → pan → fader → sends. All BiquadFilters, bypassed when off, so the cost stays low on mobile.
- Master: limiter (DynamicsCompressor with a high ratio, or the existing bus limiter), width (mid/side), balance, mono, dim.
- Meters read the role metering already in the generator (`__generator`).
- Scene volume compensation stays underneath: the fader shows the user's value.
- Headroom channel: proposal is a trim strip for what the other channels cannot reach (e.g. the sequencer's own preview voice or an external input). If you meant something else by "headroom" (a master headroom trim?), the strip is a placeholder and easy to change.

## The ambience box

Rain, wind and the rest of `engine/ambience` become their own box (layers with their params, distance, pan, width, wander) with one output
that feeds the mixer's seventh strip. The generator's `playAmbience`, `ambience`, `ambienceShape`, `ambienceWander` move there.
Display = layer list; knobs = layer, level, the layer's main param, distance. The box and mixer talk through a plain `{ input, level }` contract, so
a later "any box can plug into a mixer channel" falls out of it.

## Floating boxes and the ambience box (proof of concept)

- `/synths/all` now sits on the shared desk like the other synth pages (header bar with ⚙ setup, Panic, full screen and keyboard buttons; `Desk` pan/zoom/Fit all/Reset layout; `StageKeys` keyboard that lights the notes the sequencers play and plays the selected voice).
  Every box is a [FloatBox](../src/synths/all/FloatBox.jsx) (`ui/useFloating`, grip on its top edge, place remembered under `synths:all:<box>`, covered by Reset layout).
- The generator display is a fixed 16:9 window (640 × 360, scaling down only on a narrow screen); sections must fit in it, never make it grow.
- [AmbienceBox.jsx](../src/synths/all/AmbienceBox.jsx): a small display, knobs for the chosen source (source, distance, pan, width), a fader per source
  (rain, thunder, wind, waves, fireplace, vinyl) and an overall fader, plus a start button. Output = the mixer's channel 7. Maps onto `settings.ambience`, `ambienceShape`, `ambienceVolume`, `playAmbience`.
- Shared desk controls (pot, fader, meter) are in [deskParts.jsx](../src/synths/all/deskParts.jsx).

## Build order

1. **Model first** (done): `generatorBoxModel.js` with tests. Next: a `settingsBinding.js` mapping each knob id to a settings path with
   `get(settings)` and `set(settings, v)`; unit-test every binding against `sanitizeSettings`.
2. **Scale, Tempo, Progression live**: read/write host settings and re-plan the song through the existing `newSong` path (these change the plan, not just the sound).
3. **Wander and Evolution**: these are live parameters and need no re-plan; Evolution reads `drift`.
4. **Rules**: reuse `rulebook/model.js` and `navigation.js`; the box is a three-knob view onto the same model as the front page's rulebook.
5. **Control**: mount `QuickPanel` and the control sheets inside the display (they need a container-relative layout; check `embedded.css` in the rulebook as the pattern).
6. **Mixer** wiring: shared `useMixer`, then the filter node and solo.
7. **Ambience box**: move the settings and the audio, add the seventh strip.
8. **Synth boxes**: wrap each synth page in `EmbeddedShell` (already used by the ensemble page) so they drop into the rack.
9. **Layout**: rack as a grid with drag-to-reorder and collapse; save the rack layout in `useSaved`.

## Open questions

- Should the generator box replace the Scene / Progressions / New song bar at the top of `/synths/all`, or sit under it? (Proof of concept leaves the bar.)
- Evolution "What" is a list of kinds; today `drift` has separate chances per kind plus excluded keys and modes. Is one shared Chance knob enough, with the exclusions in the display?
- Does the front page itself move to this box, or stay as it is while `/synths/all` is the power-user view?
- Solo: saved with the scene or session-only (the front page is session-only)?

## Risks

- Re-planning on every Scale or Progression knob turn is heavy on mobile (see the mobile-performance notes): debounce the knob and re-plan on release.
- The Rules category has far more options than one knob scrolls comfortably; group them (the rulebook already has groups) before it ships.
