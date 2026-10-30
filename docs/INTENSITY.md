# Intensity (settings.push)

A stronger calmer .. busier than the feel pad, and a program that moves it over the music's own time. Code: `src/app/composition/push.js`; panel: `src/app/IntensityPanel.jsx` (a manual slider for debugging plus the program); `npm run audit:push` prints what it does to a preset at -1, -0.5, 0, 0.5 and 1.

- `push.level`: -1 very calm .. +1 overdrive, 0 the preset as made.
- `push.program.mode`: `off` (the level), `intervals` (low for `lowSeconds`, a steady ramp over `rampSeconds`, high for `highSeconds`, a ramp down, repeat) or `ramp` (one steady ramp from `low` to `high` over `minutes`, then it holds).
- **The control panel's fader** (`IntensityFader.jsx`, a horizontal slider in the panel's bottom row between the pill groups, number above and name below): the cap is the target, the lit line from the middle is the level playing now (red to the right towards +100, a gentle blue to the left towards -100). A manual change ramps: each bar moves the level at most `PUSH_RATE` (0.08 a second, 25 s for a full swing) toward the cap (`glidePush`), so after a drop from +100 the red line shrinks to nothing and a blue one grows. Double-click or a drag near the middle puts it back to the preset as made. With a program on, the fader is disabled and still shows the level.
- The program is a function of each bar's elapsed music time (`pushLevel(push, seconds)`), so it follows rubato and tempo changes, plans ahead like everything else, and renders the same offline. The plan keeps the level it used per bar (`plan.pushLevel`, also in `nowPlaying()`).

What the level does (`applyPush`, over the settings for one bar's planning, like `applyFeel`):
- lead: activity, density and syncopation; second lead activity
- drums: activity, variation, sprinkle; light styles go to `electro` above 0.5 and everything to `drive` above 0.85; below -0.6 they thin to `heartbeat`
- pad patterns: held chords into pulses, arpeggios and sequences (and back); bass: whole and half notes into the driving bass (and back)
- dynamics (level, range, attack, brightness), ornaments, section space
- step sequencer: pump and variation, fills on, and the Drop stage forced at +0.8 and above, the Breakdown at -0.7 and below (`seq.forceStage`, used by `stageForBar`)
- tempo: 15% slower at -1, 15% faster at +1, gliding like any tempo change (2 BPM a bar); `keepCurrent` stores the tempo without this share
- calm only: fewer drum hits and softer playing (`pushEnergy` through `applyArc`) and a darker tone (`pushTone`, about 6 kHz at -1)

Not done: effects (saturation, filter), the effects bus is only touched by the sequencer's own moves; a conductor queue other than the program (changes at chosen bars); a preset that uses a program; the quest/unlock gating for the panel (it shows at stage 4 with the sequencer).
