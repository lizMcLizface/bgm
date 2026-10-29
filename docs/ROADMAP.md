# Roadmap

Single list of open work, updated 2026-10-28. Finished plans live in `docs/archive/`. The detailed live plan for composition is [COMPOSITION_PLAN.md](COMPOSITION_PLAN.md).

## 1. Built, waiting for ears
Nothing here is known to be right until it has been heard in the app.

- Composition controls (all in COMPOSITION_PLAN status table): `padRoot`, `chordSize`, `leadInertia`, `padContour`, `leadTendency`, `bassEuclid`, `borrowStyle`, `padVibrato`, generated progressions. Most have no presets seeded yet.
- Drum styles twostep, breaks, synthwave and their presets (Outrun After Midnight, Rainfall Breaks, Wet Pavement Two-Step). Check mobile CPU at 170 bpm.
- Measured Grand piano (`pianoType 'measured'`): tune `gainRelease` and master volume, then decide whether it replaces the piano in Ambient Piano and the other piano presets.
- The 2026-10-16 game / FTL / Synth Cinema preset batch and Plotting a Course: unheard, loudness never measured.

## 2. Not started
- **Classic synth quality (user report 2026-10-29)**: only a handful of presets are good - V 80 (Plain, Electric Tines, Velvet Strings, Soft Bow), Analog 106 (Classic Pad, Wide Pulse Pad, Strange Machine, Rimshot, Alto Reed, Nylon, Bass 106), Mercury D (Singing Filter); those are listed in the main-page picker (library/classics.json). On the others (Oracle 5, Pluto 8, Oberon Xa, FM7, VectorVS...) almost every preset sounds bad - weird wobble, "off" - which points to an underlying engine bug, not patch tuning. Needs real reference recordings to compare against before fixing; start by rendering one preset per synth offline and looking for the shared fault (voice detune/drift, unison, LFO, filter tracking).
- Composition: A2 lead density arc, A3 rubato vs syncopation, B3 lead compass, B4 tonal-stability prior, C5 pad subset per attack, C6 low-spacing roughness, E3-E5 harmony and form, G2-G4 generated-progression follow-ups.
- Swap short-pattern pads to Deep Pulse in 7 presets (Bounty Hunter Basement, Heroic Field Trip, Dark Mirror Dimension, Boss Fight Politely, Demo Opening out, Nightcall Voicemail, Getaway Driver). User said "fine for now".
- 365 "sound of the week" preset generator, also wired into randomize.
- Mobile low-CPU mode (share one reverb per impulse type, fewer layers, pre-render). Pixel 8 Pro is CPU-bound; see `DESIGN.md` section 5.
- Loudness audit of all presets (offline LUFS check).
- Link `/synths` from the main page.
- Pedal / sympathetic resonance for the piano.
- Single-room reverb mode on the shared bus; TB-303 as a bass source.
- Drum-style share field is full (16 of 16): a 17th style needs a new appended field.

## 3. Parked
- **Strings** (`docs/STRING_MODEL.md`, `/synths/strings/`): synthesizing them satisfyingly is impractical for now. The uncommitted work (source-filter test, real-time worklet version, bow-noise bed) is kept as-is. Long and Live were judged "pretty good"; Short, Pizzicato and ensembles are not to be tuned further in the current model.

## Reference docs (not plans)
`DESIGN.md`, `LIBRARY.md`, `PIANO_MODEL.md`, `RULEBOOK_DESIGN.md`, `COMPOSITION_AUDIT.md`, `MUSIC_THEORY_GROUNDING.md`, `LANDSCAPE_PRESETS.md`, `SYNTH_DSP_PROFILE.md`, and the format notes (`JP8_TAPE_FORMAT.md`, `P5_SYSEX_FORMAT.md`, `VS_SYSEX_FORMAT.md`).
