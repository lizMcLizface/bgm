# Syncopation: Longuet-Higgins & Lee (1984) and Witek et al. (2014)

Source PDFs: `docs/ref/longuet-higgins1984.pdf` (*Music Perception* 1(4): 424–441,
p. 430 for the definition) and `docs/ref/file.pdf` (Witek, Clarke, Wallentin,
Kringelbach & Vuust, *PLoS ONE* 9(4): e94446). Full text of Witek read for method and
results; Longuet-Higgins only the syncopation definition.

## The definition (L-H & L, p. 430) — implementable
- A metre is a tree of units. The **weight** of a note or rest is the level of the
  highest metrical unit it *initiates*; the topmost unit (bar) is level 0 and each
  child is one level deeper (more negative weight = lighter in their notation; a note on
  the downbeat has the highest weight, off-beat sixteenths the lowest).
- **Syncopation:** if R is a rest or a tied note, and N is the sounded note before it,
  and weight(N) ≤ weight(R) (N is no heavier than R), then (N, R) is a syncopation of
  strength weight(R) − weight(N). A heavier note tied back to a lighter one is the
  classic case; a heavy note followed by a light tie is not syncopation.
- Their examples: strengths 1 and 2 for typical syncopated figures; strength 0 is a
  marginal case.

## Witek et al. result
- 50 funk drum-breaks (34 transcribed, 16 composed to widen the spread), syncopation
  index 0–81, built on the L-H & L index with instrument weights. 57 listeners rated
  "wanting to move" and "pleasure" (1–5).
- **Inverted U.** Quadratic fit beat linear for syncopation. Variance explained:
  R² = .35 (want to move), .43 (pleasure). Joint audio entropy added nothing.
- Bands: Medium syncopation highest on both ratings. For movement: Medium > Low >
  High. For pleasure: Medium > Low ≈ High (the Low–High gap was not significant).
- The effect was stronger for people who dance often, and the vertex moves with
  background (supplementary Text S6, which is not in the PDF).
- Caveats: funk drum-breaks only; ratings of a 16 s clip; syncopation was confounded
  with note density in places (they report it did not correlate significantly with
  note count).

## What it means for us
1. **Compute syncopation per bar** from the merged onset grid of bass + drums + (optionally)
   the lead. `meter.js` gives a three-level tree (bar → groups → units; e.g. 5/4 = 3+2); finer
   levels such as half-units would need to be derived for sixteenth-note patterns. With
   instrument weights, the function is a few dozen lines.
2. **Target a band, not a maximum.** Medium for groove presets (drum-led, funk, synthwave,
   breakbeat). Low for lullaby, ambient, waltz, folk. This replaces probabilistic
   mutation count in `rhythmDevelopment.js` with accept-if-within-band.
3. **Both extremes lose.** No syncopation is flat; too much loses the beat. That matches
   our fear of dense random ornaments.
4. **Combine with Temperley's trade-off** (see `temperley-2007-music-and-probability.md`):
   the higher the syncopation, the less cadence rubato and swing/microtiming.
5. **Don't overclaim.** One study, one style. Use Medium as a prior and check by ear in
   the lo-fi and electronic presets.
