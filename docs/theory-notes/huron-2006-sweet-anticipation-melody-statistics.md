# Huron (2006) — Sweet Anticipation: melodic statistics and scale-degree tendencies

Source PDF: `docs/ref/Sweet Anticipation_ Music and the Psychology of Expectation ...pdf`
(MIT Press). Read: ch. 5 "Statistical properties of music" (melody sections, pp. ~74–85)
and ch. 9 "Tonality" (scale-degree successions, pp. 157–162). Not yet read: ch. 1–4
(ITPRA theory), ch. 7 (information content), ch. 10 (harmony), ch. 12–13 (rhythm,
repetition), ch. 14 (surprise), 15–16 (embellishment, aesthetics).

## Melodic regularities (ch. 5; samples across cultures, mostly European folk)
1. **Pitch proximity.** Small intervals dominate; listeners process them faster.
2. **Step declination.** Fewer than 50% of small intervals ascend; most *large*
   intervals ascend. The typical shape is an opening upward leap followed by stepwise
   descent (the "tumbling strain", cf. Vos & Troost).
3. **Step inertia.** After a descending step, ~70% of the next intervals also
   descend. After an ascending step there is no trend (51% up / 49% down). Listeners
   nevertheless expect inertia in both directions; the heuristic costs them little
   (≈62% correct either way).
4. **Melodic regression, not reversal.** Watt (1924) and von Hippel & Huron (2000):
   for leaps ≥ 1–2 semitones the share followed by a direction change rises with size,
   to ~70% for octaves. But tested against the melody's *median pitch*, a leap that
   lands on the near side of the median usually *continues* in the same direction.
   Post-skip reversal is a consequence of regression to the mean (melodies have a
   stable tessitura), not a separate rule. This is the same conclusion as Temperley.
5. **Melodic arch** is listed among the chapter's regularities (the discussion was not
   read): phrases tend to rise then fall in pitch.

## Scale-degree successions (ch. 9, > 250,000 tone pairs, Germanic folk, major keys)
- **Table 9.2** (read from the rendered page; joint probabilities over all tone pairs,
  rows = antecedent, columns = consequent, diatonic rows only; each row sums to that
  degree's share, so divide by the row sum for conditional probabilities):

  | from \ to | 1̂ | 2̂ | 3̂ | 4̂ | 5̂ | 6̂ | 7̂ | rest |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 1̂ | .03416 | .02806 | .01974 | .00210 | .01321 | .00839 | .02321 | .03678 |
  | 2̂ | .04190 | .02632 | .03282 | .00678 | .00825 | .00201 | .00586 | .01521 |
  | 3̂ | .01555 | .04865 | .03142 | .02644 | .02365 | .00281 | .00029 | .02357 |
  | 4̂ | .00054 | .01260 | .04127 | .01506 | .01712 | .00441 | .00125 | .00537 |
  | 5̂ | .02557 | .00530 | .02854 | .03653 | .04835 | .02076 | .00369 | .02284 |
  | 6̂ | .00238 | .00168 | .00065 | .00342 | .03642 | .01261 | .00854 | .00410 |
  | 7̂ | .02025 | .00510 | .00035 | .00029 | .00323 | .01327 | .00448 | .00275 |
  | rest | .01974 | .01096 | .01644 | .00706 | .03082 | .00487 | .00241 | — |

  Chromatic antecedents (♯1̂, ♭2̂, ♯4̂, ♭7̂ …) are tiny (< .003 each); Table 9.3 lists the
  chromatic continuations (all < .003). Prose findings, now confirmed by the table:
  - Most probable single transition: **3̂ → 2̂ (p ≈ .049)**; repeating 5̂ is almost as
    common; third is 2̂ → 1̂.
  - Neighbouring-degree moves dominate; **descending steps outnumber ascending**.
  - A descending chain 5̂ → 4̂ → 3̂ → 2̂ → 1̂ stands out.
  - Pitches most likely to be followed by a rest (phrase ends): **1̂ clearly first**
    (.0368), then 3̂ (.0236) and 5̂ (.0228) about equal, then 2̂ (.0152, the half-cadence
    tone). The book's prose lists 1̂, 5̂, 3̂; the table has 3̂ marginally ahead of 5̂.
  - Asymmetries: 6̂ → 5̂ is much more likely than 5̂ → 6̂; 4̂ → 3̂ more than 3̂ → 4̂.
- **Tendency tones** (7̂, ♯4̂, ♯1̂) are those where a single continuation dominates
  *relative to that tone's own frequency* (7̂ → 1̂ most strongly), even though
  1̂ → 7̂ happens more in absolute terms. Perceived "leading" = relative probability
  given the current tone, not absolute frequency.

## What it means for us
1. **Concrete melodic priors, cheap to code:**
   - mild descent bias for steps; ascending leaps, descending steps (cf. Vos & Troost);
   - step inertia after a descending step (≈70% continue), none after an ascending one;
   - treat leap "reversal" as regression: pull towards the phrase's median/central
     pitch, which our central-pitch model (Temperley) already does. Do **not** add a
     rule that forces a direction change after every leap, because a leap that
     lands below the median should usually continue upward.
2. **Phrase-end scale degrees.** Weight phrase-final notes 1̂ > 3̂ ≈ 5̂ (settled), 2̂ or
   5̂ (open/half cadence). This matches our `leadEnding` settled/open options and
   gives them a quantitative order.
3. **Tendency tones.** 7̂ resolves to 1̂ (and ♯4̂ to 5̂, ♯1̂ to 2̂ when chromatic notes
   are used); give those a strong "next note" prior rather than a hard rule.
4. **Descending line 5̂–4̂–3̂–2̂–1̂** is a legitimate target contour for cadential
   approach and for the continuation's liquidation (cf. Caplin).
5. **Scope.** Germanic folk melodies, major keys, melody only. Other scales and
   textures need their own profiles; treat as priors.
