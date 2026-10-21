# Synths ensemble page: plan

A single page for judging the /synths instruments in context: the generator's progression playing on its usual voice lines (lead, second lead, pad, bass, percussion), with any role swapped to a classic synth and one of its sounds, the synth's own panel at hand, and an effects rack per voice. Closer to the main generator than the labs: key, scale, progression and the general presets can all change, and ensemble presets place particular synths in particular roles ("Oracle 5 lead in the lead role").

Status: implemented at `/synths/ensemble/` (phases 1–5). Phase 6 remains optional.

## Implementation and validation

- The page uses `Generator` for composition, transport and the role mixer, with eight classic models selectable for each melodic role. The original panels are embedded through `EnsemblePanelContext`, with fitted and full-size views, plus a rack for every player, including percussion.
- The page uses the labs' single-column layout (`labs.css`) with the main page's `ChordTimeline` and `TrackStrip` (playhead, M/S/⌨/✎ per part, keyboard playing of the armed part), the labs' chord cards and interval-coloured mini pianos. The sound section sits outside `.labs-shell` so the synth panels and rack keep their own control styling. (This replaces the earlier resizable two-pane design described below.)
- One synth for every line: the "Every line on" switch and the "All <synth>" ensembles (one per classic, sharing one piece of music) put the same synth on all four lines with role-appropriate sounds (`ROLE_PICKS` in `state.js`). Loading a preset whose music settings match the current ones, switching engines, the drum source or light mode only replaces the sounds that changed; the plan, playhead and playback carry on. Mercury D is monophonic, so chord parts run a stack of single-voice kernels (four, two in light mode).
- Percussion can be the generator's kit or the 808 / 909 kernels (`Generator.setPercussionSource`): each generator drum plays one machine pad (`DRUM_TRACKS` in `classicsInstrument.js`), with the kit's per-drum on/level applied. This is phase 6 in its simple form.
- The embedded panels show the synth page's own library shelves (Juno-106 SysEx bank, JP-8 tape, P5 bank, FM7 carts, OB-Xa book, VS programs). On the dev/preview server the factory banks in the git-ignored `banks/` load by themselves, which allows a derived sound to be compared with the factory patch in context; nothing is bundled.
- Pluto 8 sheet sounds vs the factory tape (2026-10-21, same engine): the sheet readings run short on the time sliders (mean env-1 decay −0.24, LFO delay −0.26, env-1 release −0.18, env-2 release −0.14 of the slider range, against a stated ±0.05) and disagree on envelope key follow in about 37% of patches, so the strings attack fast and stop abruptly (Low Section: 0.1 s attack and release against about 1.0 s and 0.5 s). The roughness is a transcription issue, not the engine.
- Shared-context audio and sample-timed worklet queues support live playback. `ClassicsInstrument` also seeds its offline worklet with the complete scheduled queue before rendering. Untimed standalone synth playing retains its existing behavior.
- Role loudness is matched on assignment. Presets, edited sound values, rack settings, mutes, mix, music settings and light mode persist locally and travel in compressed share links or exported JSON. Four built-in ensembles and the general scene catalog are available.
- Unit tests cover sample-exact on/off boundaries, late and unsorted events, voice limits, panic, adapter routing and expression, and setup validation/round trips. `node tools/auditSynthsEnsemble.mjs` checks all eight panels, four classic roles on one context, live source changes, effects, phone overflow and audible offline output; reports and screenshots go in `.tmp/synths-ensemble/`.
- Remaining device checks: sustained listening and CPU/dropout measurement on physical phones, especially Pixel 8 Pro. Light mode limits voices and disables supported oversampling. The percussion source remains the generator's kit.

The original design follows for reference.

## Layout

```
┌──────────────────────────────┬──────────────────────────────────────────┐
│ Progression (left, ~40%)     │ Synth panel (right, ~60%)                │
│ · scene / ensemble preset    │ · role tabs: Lead · 2nd · Pad · Bass     │
│ · key, scale, tempo, meter   │ · per role: synth + sound picker (✦ New) │
│ · chord timeline + playhead  │ · that synth's panel, zoomed out to fit  │
│ · mini pianos per role       │ · Effects: the role's rack               │
│ · roles: mute/solo/volume,   │                                          │
│   source (calmbgm | synth)   │                                          │
└──────────────────────────────┴──────────────────────────────────────────┘
```
- On a phone: the two halves stack, with the panel behind a "Sound" tab.
- The synth panel is the existing page panel (`SynthShell` children) rendered at a reduced scale (CSS `zoom`/transform with a measured container), so every synth's layout works unchanged. Its keyboard strip, header and preset shelf are replaced by the ensemble's own.

## Architecture

1. **Shared audio context.** `startLiveSynth` creates its own context today; it gains an optional `context` and `destination`, so a role's synth can join the generator's context and route into the role's gain/room chain instead of the speakers.
2. **Timed events in the worklet.** The classics worklet applies events at the next 128-frame block. Scheduled playing needs sample-accurate timing, so events get an optional `time` (context seconds): the processor keeps a small time-ordered queue and splits its render at event boundaries (the kernel already renders arbitrary block lengths up to 2048). Live playing keeps sending untimed events.
3. **`ClassicsInstrument`** (new, `src/app/engine/classicsInstrument.js`): the generator's instrument interface (`scheduleNote(midi, start, duration, velocity, detune, expression)`, `stopAll`, `dispose`, output node) backed by one classics worklet per role. It books note-on/note-off pairs with times, maps expression (velocity, pressure, bend) to the kernel's controls, and caps polyphony per role (lead 2, pad 8, bass 2) by stealing in the adapter.
4. **Role source.** A role's instrument is either a calmbgm preset (as now) or `{synth, sound values}`. `Generator.getRolePreset` / the render loop learns the second kind and constructs a `ClassicsInstrument`; loudness referencing (`engine/loudness.js`) measures it like any preset so swapped voices sit at the role's level.
5. **Effects per role.** Each role gets the existing outboard rack (`effects/graph.js` `createRack`) between its instrument and the role chain; the rack panel opens for the selected role.
6. **Percussion.** Unchanged at first (calmbgm kits). Later: the 808/909/606 as the percussion source, driven by the generator's drum pattern instead of their own sequencer.

## Ensemble presets

A new list beside the general presets: each is a general preset (key, scale, progression style, tempo, drums) plus role sources, for example
- *Oracle lead*: a calm progression with Oracle 5 "Sync Edge" on lead, calmbgm pad and bass;
- *FM keys*: FM7 "Glass Tines" on pad, Pluto 8 "Low Section" on bass;
- *Vector night*: VectorVS "Drift Field" pad, Oberon Xa lead.
Stored like general presets (JSON), so they can be saved, shared and loaded the same way; "Save current" stores the role sources and each role's sound values and rack.

## Phases

1. **Engine plumbing.** Shared context + timed worklet events + `ClassicsInstrument`, tested offline (scheduled notes land on the right samples; note-offs stop; polyphony caps) and in a headless browser (no dropouts at 4 roles).
2. **Generator integration.** Role source switch, loudness referencing, render-loop construction and disposal; the main app keeps working untouched when no role uses a synth.
3. **Ensemble page, left half.** Scene/preset browser, key/scale/progression/tempo controls, chord timeline with playhead, mini pianos per role, role strip (mute/solo/volume/source).
4. **Right half.** Role tabs, synth + sound picker with ✦ New, the zoomed synth panel live-editing the role's synth, the per-role rack.
5. **Ensemble presets** and save/share.
6. **Drum machines as the percussion source** (optional).

## Risks and checks
- **CPU on phones** (Pixel 8 Pro is CPU-bound): up to four classic kernels plus the generator. Measure per synth at the role's polyphony; offer a "light" mode (fewer voices, no 2× oversampling) and show a CPU warning.
- **Timing.** Scheduled events must not drift against the generator's transport; test long runs and tempo changes.
- **Loudness.** Classic sounds vary by tens of dB; reference each to the role's level when assigned.
- **Panel scale.** The vector synth's pad and the CS-80's ribbon need touch targets that still work when zoomed out; give them a full-size pop-out if needed.
- **Licensing posture.** Only the synths' own and derived/generated sounds appear here, as on the public pages.
