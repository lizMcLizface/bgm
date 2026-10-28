# Caplin (2013) — Analyzing Classical Form: sentence and period

Source PDF: `docs/ref/Analyzing Classical Form _ An Approach for the Classroom ...pdf`
(Oxford). Read: ch. 2 "The Sentence" (book pp. 33–45) and the opening of ch. 3 "The
Period" (pp. 73–77). Not yet read: ch. 4 hybrids (pp. 99–114), ch. 5–6 (compound
themes, phrase expansion), ch. 7+ (larger forms), summaries. The repertoire is
Viennese classical (c. 1770–1810); apply as a pattern library, not as a style rule.

## Sentence (8 bars in the book)
| segment | length | content |
| --- | --- | --- |
| Basic idea | 2 bars | a complete unit (melody + rhythm + harmony + texture), usually on tonic, usually opening up in pitch space (ascending gestures). It contains 2 or more motives |
| Repetition of the basic idea | 2 bars | one of three kinds, below |
| → together: **presentation phrase** | 4 bars | tonic *prolongation* overall; no cadence; sets up strong expectation of continuation |
| Continuation | ~2 bars | fragmentation (units half as long, e.g. 1-bar then repeated) |
| Cadential idea | ~2 bars | formulaic cadence, melodic content "liquidated" (the motive is stripped away toward the cadence) |
| → together: **continuation phrase** | 4 bars | |

**Continuation function has four named processes (any one or more):**
1. phrase-structural fragmentation (shorter units than the presentation);
2. acceleration of the harmonic rhythm;
3. an increase in surface rhythmic activity (shorter note values);
4. sequential harmonic progressions (model–sequence technique).

The phrase ends with a PAC most often, sometimes an HC, rarely an IAC.

**Three ways to repeat the basic idea (classified by harmony, not melody):**
- *Exact:* same harmonic support; the melody may be transposed to other degrees that
  the harmony allows, or lightly ornamented.
- *Statement–response:* statement on tonic (I), response on dominant (V) or, as a
  variant, on subdominant (IV). The response's melody is frequently transposed by step
  (often up a step) to fit the new harmony.
- *Sequential:* the whole idea (melody and harmony) transposed to another degree, e.g.
  a step up or a third down. Rare at the start of a sentence, since presentation
  must prolong tonic.

**Harmonic plan seen in the examples (e.g. Beethoven Op. 2 No. 1):** I (basic idea) →
V (response) → resolves to I at the start of the continuation → harmony changes
faster → predominant → V (half cadence). That is, harmonic rhythm in the example goes from
one chord per two bars to a steady increase.

## Period (8 bars)
- **Antecedent (4 bars):** 2-bar basic idea + 2-bar *contrasting* idea → *weak* cadence
  (HC usually, sometimes IAC).
- **Consequent (4 bars):** starts with the *same* basic idea, then a contrasting idea
  (may or may not resemble the antecedent's) → *stronger* cadence (PAC, or IAC if
  the antecedent ended with HC).
- The consequent's cadential progression is often longer than the antecedent's.
- Caplin's narrow definition requires the same opening material in both phrases and a
  weak→strong cadence. A phrase pair that opens differently is a *hybrid*, not a period.
- Contrast is created by motives first; otherwise by texture, dynamics, articulation,
  or a change of contour direction. A contrasting idea often has continuation-like
  features (fragmentation, faster harmonic change, sequence).
- Which one results from a given basic idea depends on the next two bars: repeat it
  (sentence) or contrast it with a weak cadence (period).

## Terms
- **Formal function** = beginning / middle / end (presentation, continuation, cadential;
  antecedent, consequent). A **type** (sentence, period) has no fixed place in a piece.
- The basic idea "embraces two metrical downbeats"; it may start with an upbeat.
- Phrase boundaries are interpretation, not bar-line facts (consistent with GTTM).

## What it means for us
1. **A sentence is a recipe over material we already generate.** For our phrases (4 or
   8 bars; chord cycles of 4), scale Caplin's 8 bars by half or double as needed:
   - presentation = idea + repetition (bars 1–2 at 4-bar scale, or 1–4 at 8-bar scale);
     the repeat is exact, statement–response (response a step up on V or IV), or
     sequential. Our `themeDevelopment` transforms already include transpose and
     sequence;
   - continuation = fragments half the length, repeated; **raise note density, move
     chords faster, then liquidate the motive** into a plain cadential figure;
   - cadence = PAC (V→I) or HC (end on V) from `sectionCadence.js` / the final chord.
2. **A period is the question/answer form we have now,** but make it exact: the answer
   must restart with the *same* basic idea, and its cadence must be stronger than the
   first (e.g. first phrase ends on V/half cadence or a scale degree other than the
   tonic, second on the tonic). Check `phraseMelody.js` answer phrases do this.
3. **Pick by section function.** Sentence for build and full sections (forward drive,
   expectation set up then released); period for intros, breakdowns and rests-heavy
   presets (symmetry, closure, calm). Hybrids (period-like start + continuation) for
   variety on returns.
4. **Harmonic acceleration is a controllable.** The existing `harmonicRhythm.js` moves
   whole bars between slots. Under a sentence, shorten the last slots (e.g. 2+2+1+1)
   rather than moving durations randomly. Keep totals fixed, as now.
5. **Liquidation** means the cadence bar uses less distinctive material. That is the
   same as the GTTM rule that cadences stay metrically plain. One rule serves both:
   in the last 1–2 bars, strip ornaments, syncopation and motive-specific rhythm.
6. **Presentation prolongs tonic.** Do not put a sequence that implies a new key in
   the first half of a sentence. Our key-lift and borrowed chords belong in the
   continuation, not the presentation.
7. **Fragment size follows the idea:** a 2-bar idea fragments into 1-bar units. For
   one-bar ideas fragment to half-bars or beats. Never fragment below two events
   (GTTM GPR 1: no one-note groups).
