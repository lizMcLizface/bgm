# Mood (settings.mood)

A harmonic colour slider next to the intensity fader: **suspended and hazy on the left, lush and bright on the right**. Intensity changes how busy the music is; mood changes which notes the chords have, and leaves rhythm and tempo alone. Code: `src/app/composition/mood.js`; fader: `src/app/MoodFader.jsx` (under the intensity fader in the control panel); `npm run audit:mood` prints the chords a preset plays at -1 .. +1.

- `mood.level`: -1 suspended .. +1 radiant, 0 the preset as made. By hand it glides (`glideMood`, 0.1 a second, 20 s for a full swing) from the level of the bar before, so the chords turn over gradually.
- **Per chord colour** (`moodColour`, asked by `Generator.colourFor` with a seeded roll per chord): the share of chords coloured grows with the level (all of them by about 0.65 to the right, 0.7 to the left), and a chord coloured at a level stays coloured at a stronger one. The mood colour wins; chords it leaves keep the setting's `chordColour`.
  - left: `floating` (sus2 over a major chord, sus4 over a minor one, so nothing settles), then `floating+7` (7sus4 and the like), and from -0.8 the clashing minor ninth (`flat2`)
  - right: added sixths and ninths, then `+7` (sevenths), `+9` (ninth chords) and `+13` (a ninth chord with the thirteenth on top, six notes)
  - `diatonicChord` understands the `+7` / `+9` / `+13` suffixes; they are not `CHORD_COLOURS` settings (share links store that list in 3 bits)
- `applyMood` over the settings for one bar's planning, like `applyPush`: borrowing (the dark iv / bVI / bVII of a major key on the left, the bright IV / V of a minor key on the right; the opposite direction cuts the preset's borrowing), the generated progression's brightness, a brighter touch and quicker onsets to the right, slower onsets and more section space to the left.
- `moodTone`: a low-pass at about 7 kHz at the far left (on top of the arc's, feel's and intensity's).
- The plan keeps the level per bar (`plan.moodLevel`, also in `nowPlaying()`). Share links carry `mood.level` (appended group).

Not done: chord names stop at the ninth (a thirteenth shows as `(9)`); a program like intensity's (mood over music time); leaning the melody to the chord's extensions; quest/unlock gating; a mood-driven register move.
