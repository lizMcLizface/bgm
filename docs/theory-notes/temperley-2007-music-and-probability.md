# Temperley (2007) — Music and Probability

Source PDF: `docs/ref/Music and Probability (MIT Press) -- David Temperley -- ...pdf`
(MIT Press). Read: ch. 4 (pitch model, book pp. 56–62), ch. 5.2–5.3 (expectation,
pp. 65–72), ch. 7.6 (tonal harmony strategies, pp. 131–136), ch. 10.1–10.3
(communicative pressure, pp. 181–192). Not yet read: ch. 3 (rhythm model), ch. 9
(style comparison), ch. 6–7 key-finding.

## 1. Pitch model: a usable generative recipe (ch. 4)
Fitted to the Essen folksong collection (6,217 European folk songs). A melody
note's probability is the normalised product of three bell curves:

| profile | meaning | parameter (pitch in MIDI, C4 = 60) |
| --- | --- | --- |
| central pitch | where the whole melody's range is centred | mean 68, variance 13.2 (fitted for expectation tests: 40.0) |
| range | spread of pitches around that centre | variance 29.0 (fitted: 16.0) |
| proximity | closeness to the previous pitch | variance 7.2 (fitted: 25.0) |
| key profile | scale-degree probability, from the corpus | e.g. 18.4% of major-key notes are degree 1 |

Facts from the Essen data worth keeping:
- Variance of all pitches is 25.0, but variance *within* one melody is only 10.6.
  So a melody sits in a narrow window; the window position varies between songs.
  (The range-curve parameter in the table, 29.0 or 16.0, is broader than 10.6 because
  the proximity curve multiplies in and narrows the result.)
- More than half of all melodic intervals are 2 semitones or less.
- Scale-degree profiles: scale tones > non-scale; tonic-triad tones (1, 3, 5)
  > other scale tones. Values (Fig. 4.7, read from the page image; proportion of
  notes by scale degree, Essen corpus):

  | degree | 1 | ♯1/♭2 | 2 | ♯2/♭3 | 3 | 4 | ♯4/♭5 | 5 | ♯5/♭6 | 6 | ♯6/♭7 | 7 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | major keys | .184 | .001 | .155 | .003 | .191 | .109 | .005 | .214 | .001 | .078 | .004 | .055 |
  | minor keys | .192 | .005 | .149 | .179 | .002 | .144 | .002 | .201 | .038 | .012 | .053 | .022 |

  In major the dominant (.214) is the most frequent degree, ahead of 3 (.191) and
  the tonic (.184): usage frequency is not the same as probe-tone stability.

## 2. Expectation (ch. 5)
- The model above, with probability read as log-expectedness, predicted listener
  ratings of continuation tones at r = .870 (Cuddy & Lunney 1995 data), beating
  Cuddy & Lunney's 5-factor model (.80) and Schellenberg's 2-factor model (.851).
- Adding a "tonal region" boost (tonic ×20 in the final-note key profile) was
  needed. Listeners rate a continuation higher when it can be heard as the tonic.
- **Post-skip reversal / gap-fill is likely not a separate rule.** The model has no
  reversal term, yet reproduces it: a large leap lands near the edge of the
  range, so proximity-plus-range pulls the next note back. (von Hippel & Huron
  2000 argue the same, calling it regression to the mean.)
- **Key matters even when the key is ambiguous.** After an up-a-step context, a
  whole-step-down continuation was rated above a half-step-down one even though
  proximity favours the half step, because the whole step stays in more
  plausible keys.
- Rhythmic expectation: regular onsets create a strong expectation that the
  pattern continues at the same interval (Large & Jones 1999). The probability of
  a continuation is proportional to the probability of the whole onset pattern
  including it.

## 3. Tonal harmony as ambiguity-avoidance (ch. 7.6)
Temperley's key-finding model predicts that composers favour pitch collections
with low tonal ambiguity at cadences:
- C–D–E–G–B (a V–I in major, triads only) is nearly as consistent with G major as
  with C major. V7–I and V–i (minor) are unambiguous.
- Prediction tested on Haydn, Mozart and Beethoven piano sonatas: the final
  cadence uses V7, not V, in major-key movements 76–88% of the time, but V
  (plain triad) in 67–80% of minor-key movements (differences significant,
  p < .05 to .001).
- Predominants IV and ii complete the full diatonic collection in a cadence
  (unambiguous), while vi or iii add no useful tones. This may explain why IV and
  ii are the usual predominants.
- Pivot-chord ambiguity (C-D-E-G-B again) is useful at modulations because it is
  shared between the old and new key.

## 4. Communicative pressure (ch. 10)
- Huron-derived voice-leading rules (avoid part-crossing, avoid small harmonic
  intervals in low registers) are explained as helping listeners identify notes and
  lines. They hold only if the style wants clear lines. Ambiguity can be a goal.
- **Syncopation–rubato trade-off (10.2).** Styles with much rubato (common-practice,
  Romantic) have little syncopation. Styles with much syncopation (rock, African
  music) keep a rigid tempo. Both make the beat harder to infer, and the
  difficulty adds up. Rubato is most acceptable when accented events sit on strong
  beats and a repeated left-hand pattern keeps the metre clear (Chopin nocturnes
  are the example).

## What it means for us
1. **Melody pitch cost.** Replace the flat `Math.abs(midi - target)` pull and the
   threshold leap rule in `searchPhrase` with a proper log-probability: range
   (centred on a slowly moving central pitch), proximity (variance 7.2 corpus-fit; 25.0
   fitted to expectation ratings; start from 7.2 for generation, a suggestion, since
   the 25.0 fit was for rating tones, not producing them), and a scale-degree prior. The reversal term then comes for free; remove `recovery`'s
   flat penalty or lower it.
2. **Narrow window per phrase.** Choose a central pitch per phrase and keep the
   effective spread small (observed variance about 10.6 within a melody). Our `contrastPhrases` register
   shifts map onto choosing a new centre.
3. **Tonal region at cadences.** At the last note, multiply tonic probability
   heavily (×20 in the paper) instead of the current endings pool filter alone.
4. **Cadence chords.** In major keys prefer V7 (or add the 7th to the pad) at section
   cadences and final cadences, since plain V–I is the ambiguous case. Minor keys
   can stay on a plain triad. Use IV or ii as the predominant, not vi or iii.
5. **Rubato budget.** Make `rubato.js` amount shrink as the bar's syncopation or
   drum activity grows. Cadence rubato is safest in sustained, low-syncopation
   presets (lullaby, ambient, piano).
6. **Low-register spacing** is a masking rule: see `huron-2016-voice-leading.md` and
   `plomp-levelt-1965-critical-bandwidth.md`.
7. **Sample size caution.** The parameters come from European folk songs, so they
   describe vocal-range tunes (central pitch ≈ A♭4). For bass or synth leads in
   other ranges, take the shape and variances but set the centre per voice.
