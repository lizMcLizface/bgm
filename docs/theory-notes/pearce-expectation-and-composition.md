# Pearce (2005 thesis) and Pearce & Wiggins (2006) — statistical expectation and composition

Source PDFs: `docs/ref/pearce2006.pdf` (*Music Perception* 23(5): 377–405, "Expectation
in melody: the influence of context and learning") and `docs/ref/Pearce2005.pdf` (PhD
thesis, City University, "The construction and evaluation of statistical models of
melodic structure in music perception and composition"). Read: 2006 paper experiment 3
(pp. 398–400) and thesis ch. 9 discussion (pp. 207–209). Not yet read: model
internals (ch. 6–7: PPM, viewpoints), expectation experiments 1–2.

## 2006 paper — expectation as entropy
- A statistical model (variable-order Markov / PPM over several melodic "viewpoints" such
  as pitch, scale degree, interval, duration, position in bar; model internals were not
  read, this is from the paper's framing), trained on a corpus, predicts each next
  note's probability. Surprise = −log₂ p ("entropy" of the event).
- It fits human data better than Narmour-style rules. On Manzara et al.'s (1992)
  betting experiment on two Bach chorale melodies, model entropy explained 63% of the
  variance in listeners' entropy (R = .8); Schellenberg's two-factor model explained
  about 13% (R = .41). Adding proximity and reversal to the statistical model gave no
  further improvement.
- **Entropy profile along a melody (Manzara, Witten & Conklin):**
  - high uncertainty at the very start (no context), falling as context builds;
  - final notes of phrases are the *most predictable*;
  - high surprisal at stylistically unusual cadences or intervals;
  - uncertainty rises near the end of a piece, then drops steeply into the final cadence.

## Thesis ch. 9 — can such models compose?
- Three finite-context (n-gram-style) systems sampled by Metropolis–Hastings generated
  chorale melodies. Trained judges rated all three **below** the original melodies for
  stylistic success, whichever viewpoints were used. Originality/creativity ratings
  were inconsistent between judges and discarded.
- **What lowered the success ratings** (regression on judges' comments): pitch range
  and pitch centre departing from the corpus, more dissonant intervals, more
  chromatic tones, and *uneven phrase lengths*.
- Pearce's conclusion: finite-context models do not capture phrase-level regularity and
  repetition; structured or constraint-based generation is needed (pattern-based
  sampling, symbolic constraints). Adding viewpoints for tonal-harmonic structure,
  intervals and range reduced prediction uncertainty but was only a preliminary
  step toward better generation.

## What it means for us
1. **Our approach is the one the thesis endorses.** Plan phrase shape and repetition
   first, then choose notes under constraints, and only use statistics to *score*.
   Do not replace the planner with a Markov sampler.
2. **Four cheap quality guards from the regression,** each checkable per phrase:
   pitch range and centre close to the voice's intended window; few dissonant
   intervals between successive notes or with the chord; few chromatic tones in a
   diatonic preset; phrase lengths even (the 4-bar and 8-bar grid we have).
3. **Surprise budget (cf. Huron, Margulis).** Use a small n-gram over our own
   (interval, duration, scale-degree) tokens as a *surprise meter*, not as a
   generator. Target: high at a section's first phrase, lower once context is built,
   **lowest at phrase-final notes**, one deliberate spike at a planned transition
   or return, steep decline into the closing cadence. Measure it offline first.
4. **Phrase-final predictability.** The final note of a phrase should be a very
   probable continuation: scale degree 1, 3 or 5, short approach interval. This
   matches Temperley and Krumhansl notes.
5. **Cost.** PPM with small orders on tokens is tiny; run it in the planning pass or
   in the offline audit script only.
