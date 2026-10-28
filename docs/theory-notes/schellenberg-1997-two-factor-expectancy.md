# Schellenberg (1997) — Simplifying the Implication-Realization model

Source PDF: `docs/ref/schellenberg1997.pdf` (*Music Perception* 14(3): 295–318).
Read: abstract, the model descriptions, and the two-factor discussion (pp. 295–314).
Regression tables and the Experiment 1–3 details were skimmed, not checked.

## What Narmour's model says (the five principles)
For a melodic *implicative interval* (two notes) the model predicts the *realized*
third note:
- **Registral direction.** Small intervals (≤ 5 semitones) imply continuing in the
  same direction; large ones (≥ 7) imply a change of direction (or unison). 6 is the
  threshold.
- **Intervallic difference.** Small intervals imply a similar-sized next interval;
  large intervals imply a relatively smaller one.
- **Registral return.** The third note returns to within 2 semitones of the first
  (an a–b–a or a–b–a′ shape).
- **Proximity.** Smaller realized intervals are more implied; Narmour counts ≤ 5
  semitones as proximate.
- **Closure.** Direction change or a smaller interval ends a perceptual group.

## The simplification
Principal-components analysis on the revised model (Schellenberg 1996) found it
redundant. The final model has **two** predictors:
1. **Pitch proximity.** The size of the realized interval in semitones (0 for unison).
   Linear and *without* Narmour's cutoff; bigger leaps are always less expected.
   Any log-pitch scale can replace semitones (they note a Thai scale could use steps).
2. **Pitch reversal.** A combination of revised registral direction (applies only
   after a large interval: the next tone should go the other way) and registral
   return (dummy: the realized note comes back within 2 semitones of the first).

Regression fits on Schellenberg's (1996) three experiments (R², from the paper's table;
Experiments 1 and 3 included a tonality covariate):
| model | Exp. 1 (N = 120) | Exp. 2 (N = 200) | Exp. 3 (N = 132) |
| --- | --- | --- | --- |
| original I-R, 5 principles | .683 | .461 | .690 |
| revised model | .759 | .527 | .755 |
| two-factor model | .759 | .520 | .750 |
So two predictors do as well as the revised model and clearly better than the original.
The stimuli were folk-melody fragments and two-note contexts; the paper also reanalyses
Cuddy & Lunney (1995) with the same conclusion. Pitch height and tonality covariates
are kept alongside the two factors.

Proximity is interpreted as conjunct motion (scale steps) and as an auditory-stream
grouping effect (Bregman): near tones are heard as one source.

## What it means for us
1. **Match, then simplify, `searchPhrase` costs.** Today's costs: distance to degree
   target, leap threshold, run penalty, `recovery`, contour. The literature supports
   exactly two melodic-shape terms: proximity (cost grows linearly with semitones,
   better in scale steps for modal/pentatonic sets) and reversal (a bonus after a
   leap ≥ 6–7 semitones for going the other way or returning to the pre-leap pitch).
2. Everything else in the model is **tonal**: pitch height and tonality/tonal region
   (the final tone prefers being the tonic). Those are already half-present as
   chord-tone and ending constraints.
3. Temperley (2007) argues reversal emerges for free from range + proximity; either
   way, it is cheap to include. Keep the weight small and verify against an
   interval histogram, as in the Vos & Troost note.
4. Use **scale-step distance, not semitones,** when the lead uses pentatonic or other
   non-diatonic sets, as Schellenberg suggests.

## Fig. 3 — quantification of the revised principles (read from the page image)
- **Registral direction (revised):** coded 0 for any small implicative interval (≤ 5–6
  semitones); for a large one, +1 if the realised interval changes direction, −1 if it
  continues in the same direction.
- **Registral return (revised):** 1 if the realised interval lands back within about 2
  semitones of the first tone of the implicative interval (a diagonal band in the
  figure), else 0; an all-or-none dummy.
- **Proximity (revised):** the size of the realised interval in semitones (0–12).
