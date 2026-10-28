# Music theory grounding — literature review and proposed rules

28 October 2026 (revised after reading the sources in `docs/ref/`). Nothing here is
implemented yet. Per-source detail, page references and caveats are in
[theory-notes/](theory-notes/README.md); this file is the synthesis. Where the first
version of this document differed from the sources, the sources won; see §5 for what
changed.

**Evidence rules.** A claim is marked *(source)* when it comes from a note in
`theory-notes/`. Anything marked *(recalled)* is from background knowledge and not
yet checked. Most of the literature is Western tonal, rock and folk repertoire with
small lab effects: treat numbers as priors to measure against, not laws, especially
for modal, pentatonic, chip and ambient presets.

## 1. Where the current rules are thin

The code already has themes, beam-searched phrases, joint counterpoint, cadences,
rubato and form strategies. What it lacks is *grounded weights*, *chord function*
and *measurement*:

| Area | Current state | Gap |
| --- | --- | --- |
| Harmony | Fixed Roman-numeral bank; whole-bar durations; V→I at section edges | Borrowing, destinations and cadences chosen by chance, not by corpus or function; no 7th-clarified cadence |
| Melody | Beam search: distance to degree target, chord-tone accents, leap threshold, run penalty | No proximity/central-pitch probability, no graded tonal stability, no phrase-end degree order, no direction asymmetry |
| Phrase form | Call/varied response (period-like), 4 or 8 bars, themes and transforms | No sentence form; the answer need not restart with the same idea or end more strongly |
| Rhythm | Pickup/tie/gap grammar; anchored groove mutation | No syncopation score or target; no cadence-stability rule; Euclidean cells only noted as optional |
| Counterpoint / pad | Joint beam over lead and counter; `voiceLead` for the pad | No masking-based spacing in the bass, no stream-fusion cost for parallel motion |
| Mood | Hand-tuned per preset; randomizer pairs minor with `i` progressions | No cue model; minor treated as calm |
| Form / repetition | Sections, themes, returns | No exact-repeat benchmark, no satiation model, no transition smoothness score |

## 2. Findings and the rules they suggest

### 2.1 Melody: replace ad hoc costs with a small probabilistic model
*(temperley-2007, schellenberg-1997, huron-2006, vos-troost-1989, krumhansl-1990,
pearce-expectation)*
- Melody pitch ≈ the normalised product of: a **central-pitch** bell curve, a **range**
  curve around that centre, **proximity** to the previous note, and a **scale-degree
  prior**. On the Essen folk corpus pitch variance within one melody is only 10.6
  (vs 25.0 across all melodies); more than half of intervals are ≤ 2 semitones.
  Major-key degree frequencies in Essen: 1 .184, 2 .155, 3 .191, 4 .109, 5 .214, 6 .078, 7 .055 (minor: 1 .192, 2 .149, ♭3 .179, 4 .144, 5 .201, ♭6 .038, ♭7 .053, 7 .022). Fitted variances for expectation data: range 16.0, proximity 25.0, central pitch 40.0
  (corpus-fit: 29.0 / 7.2 / 13.2; central pitch mean 68). That model reproduces
  listener ratings at r = .87 (Cuddy & Lunney data).
- **Post-skip reversal is mostly regression to the mean.** Schellenberg's reduced
  model keeps only *proximity* and *reversal*; Temperley and Huron both show reversal
  largely follows from range plus proximity; a leap that lands below the median tends
  to continue upward. Do not force a direction change after every leap.
- **Direction asymmetry.** Small steps descend more than ascend; large leaps ascend
  (Vos & Troost; Huron). After a descending step ≈ 70% of the next intervals descend;
  after an ascending step there is no trend. First interval of a tune is usually up.
- **Stability.** Probe-tone ratings (Krumhansl): major tonic 6.35, fifth 5.19, third
  4.38, fourth 4.09, sixth 3.66, second 3.48, leading tone 2.88, chromatic ≈ 2.2–2.5;
  minor tonic 6.33, ♭3 5.38, fifth 4.75, ♭6 3.98. Phrase-final degree order from folk
  data: 1̂ first, then 3̂ ≈ 5̂, then 2̂ for half cadences (Huron, Table 9.2). Tendency tones (7̂→1̂ etc.).
  Final-tone expectation needs a large tonic boost (×20 in Temperley's fit).
- **Leap lengthening** (Huron PR12): lengthen one or both notes of a large leap.
- **Rules.** (1) In `searchPhrase`, replace the target-distance and flat leap costs with
  −log of range × proximity × degree prior, one central pitch per phrase (so
  `contrastPhrases` changes the centre). (2) Add a small direction bias (descending
  steps, ascending leaps) and step inertia after descending steps. (3) Graded stability
  on strong beats and a degree-order prior at phrase ends. (4) Use scale-step distance
  for non-diatonic scales. (5) Tendency-tone resolution inside the beam, extending
  `resolution.js`.
- **Test.** Interval histogram, step share, post-leap direction conditional on landing
  relative to the median, phrase-final degree distribution, strong-beat stability.

### 2.2 Phrase form: add the sentence; make the period exact
*(caplin-2013, lerdahl-jackendoff-1983)*
- **Sentence:** basic idea → its repeat (exact, statement-response with the response
  a step up on V or IV, or sequential) = *presentation* (tonic-prolonging, no cadence)
  → *continuation* (fragmentation to half-length units, faster harmonic rhythm,
  busier rhythm, sequence) → *cadential idea* with the motive liquidated. Typical
  8 bars as 2+2+(1+1)+2; scale to 4 or 8.
- **Period:** antecedent = idea + contrasting idea → weak cadence (HC/IAC); consequent
  restarts with the *same* idea and ends on a stronger cadence (PAC). A phrase pair
  that opens differently is a hybrid.
- GTTM boundaries: a boundary is heard where the gap (GPR 2) or change in
  register/dynamics/articulation/length (GPR 3) is larger than on both sides; avoid
  one-note groups (GPR 1); prefer 2:2 splits (GPR 5) and parallel structure (GPR 6);
  binary regularity at hypermetric levels (MPR 10).
- **Rules.** A phrase "function plan" before notes: sentence for build/full, period for
  intro/breakdown/calm, hybrid for returns. Continuation raises onset density and
  harmonic rate then strips ornament at the cadence. Repeat keeps the rhythm parallel,
  then breaks it. Odd-length spans only as deliberate elisions/extensions.

### 2.3 Rhythm: syncopation as a measured target, plain cadences
*(syncopation note, toussaint-2013, lerdahl-jackendoff, temperley-2007)*
- Longuet-Higgins & Lee: weight = level of the highest metrical unit a note/rest
  starts; a rest or tie after a note of weight ≤ its own is a syncopation of strength
  weight(R) − weight(N). Keith's simpler count (Toussaint): an onset is off-beat if
  its start is not a multiple of its own duration rounded down to a power of two.
- Witek et al.: **medium** syncopation gave the highest want-to-move and pleasure
  ratings (quadratic, R² .35–.43); funk drum-breaks only.
- **Cadence stability (GTTM MPR 7):** syncopation and cross-accents are extremely rare
  inside cadences; complexity belongs in the approach.
- **Syncopation–rubato trade-off (Temperley):** high syncopation styles keep rigid
  tempo; rubato suits low-syncopation, strongly metred music.
- Microtiming: modest asynchrony helps a little for expert listeners; exaggeration is
  not rewarded (Kilchenmann & Senn; bass-drum timing SD ≈ 10 ms in the funk sample).
- Euclidean cells E(k,n) give maximally even onset sets and cover many named
  timelines (3,8 · 5,8 · 5,12 · 7,12 · 5,16 · 7,16 · 9,16 …).
- **Rules.** Per-bar syncopation score from the merged bass/drum/lead grid; accept
  `rhythmDevelopment` mutations that keep it in a style-specific band (low for calm,
  medium for groove). No syncopation mutation, ghost off-beat, extra swing or
  displaced fill in the last 1–2 bars of a phrase. Scale `rubato.js` down as the score
  rises. Offer Euclidean cells per meter as the generator for new groove cells.

### 2.4 Harmony: use the corpus, not a made-up function table
*(declercq-temperley-2011, rohrmeier-steedman, temperley-2007, tymoczko-2011)*
- **Pop/rock is not directional.** (Full 12×12 transition counts are in the note.) In 100 top songs: I .328, IV .226, V .163, bVII .081,
  VI .072, bVI .040, II .036, bIII .026. Chords before and after the tonic have
  almost the same distribution (IV most), ascending and descending root motion are
  about equally common, and frequency falls with circle-of-fifths distance
  (P4/P5 ≫ M2 > m3 > M3 > m2 ≫ tritone). Top trigrams to I: IV–V–I 352, V–IV–I 292,
  bVII–IV–I 146, VI–IV–I 126, bVII–bVI–I 103.
- **Directional grammars fit functional styles.** Rohrmeier: TR → DR t; DR → SR d;
  TR → TR DR (half cadence); substitutions t→tp (vi), s→sp (ii); secondary dominants;
  modulation = a non-tonic function becoming a local tonic. Steedman: time-preserving
  rewrites (x → x x; x → x Sd(x); insert a dominant before a dominant; flat-II
  substitution).
- **Cadence clarity.** Plain V–I in major is tonally ambiguous (pitch set also fits the
  dominant key); V7–I and V–i are not. In sonatas the final cadence uses V7 in
  76–88% of major-key movements. IV and ii complete the diatonic set and are the usual
  predominants (Temperley).
- **Macroharmony/centricity (Tymoczko).** Keep the pitch-class set small (5–8), change it
  slowly, and make the centre by use: frequency, duration, accent, high/low points,
  stepwise approach, octave/fifth doubling. This works for any mode.
- **Rules.** Per-preset `harmonicStyle`: `modal-loop` (symmetric, circle-of-fifths
  distance, corpus priors, IV–I and bVII–I as common approaches, bVII/bVI/bIII as the
  borrowed chords) vs `functional` (Rohrmeier/Steedman expansions). Section
  cadences: major keys get the seventh (or IV/ii before V); a 1–2 step backward cadence
  expansion replaces the fixed V–I. Key drift/lift: prefer small pitch-class-set
  changes. Centricity recipe for modal presets. Harmonic expansion splits a slot in two
  by function, keeping cycle length.

### 2.5 Voice leading, spacing and texture
*(huron-2016, plomp-levelt-1965)*
- Critical band ≈ 3 semitones near middle C, narrower above, much wider below; most
  dissonant when two partials are ~¼ of a critical bandwidth apart; wider spacing
  in the bass reduces masking.
- Huron preference rules: proximity, conjunct motion, leap away in outer voices,
  resist crossing and overlap, prefer contrary/oblique to parallel/similar motion,
  avoid unisons/octaves/fifths between voices (fusion), prefer sustained tones in
  close succession (gaps over ~800 ms split a stream), keep the line region between
  E2 and G5 centred near D4.
- **Rules.** Compute a partial-based roughness cost (adjacent-partial beating through
  the critical-band curve) in `voiceLead` and for bass-under-pad; count parallel
  motion as one stream; add leap-lengthening; check rest lengths in seconds inside lead
  phrases.

### 2.6 Surprise and repetition
*(pearce-expectation, huron-2006, margulis-2013)*
- Entropy of a note under a variable-order model tracks listener uncertainty (R = .8 on
  chorales): high at a piece's start, **lowest at phrase-final notes**, spikes at unusual
  cadences, rising before the end then dropping sharply into the final cadence.
- Pure Markov generation lost to real melodies; success ratings fell when range/centre
  drifted, dissonant intervals and chromatic tones rose, or phrase lengths were uneven.
- Inserting repetition raised enjoyment in Margulis's study; liking follows an inverted
  U with exposure and satiates later for richer material; repetition rewards attention
  at different levels.
- **Rules.** Use a small n-gram only as a *surprise meter*; target low at phrase ends, one
  spike at transitions. Keep exact short cells early (musematic) and vary other layers
  (timbre, inner voice, register, space) on later passes. Satiation budget scales with
  number of layers and elapsed repeats.

### 2.7 Mood coherence and sleep use
*(mood-cues-microtiming-and-sleep)*
- Six cues add up linearly (77–89% of variance): for **peaceful**, slower tempo
  (β −.27), softer dynamics (−.28), darker timbre (−.45), *higher* register (+.15; the authors
  predicted low), more legato (−.10), and major mode (+.43 in the regression but marked
  non-significant in the paper's own summary table, so weak at best). Happy/sad are mostly
  mode and tempo. Units: tempo in notes/second (1.2–6), ±10 dB, articulation ratio
  1–0.25, register F3–B5.
- Sleep review: 60–80 bpm, soft, simple, instrumental; avoid accented beats, percussion
  transients and syncopation; heart-rate entrainment is a hypothesis.
- **Rules.** A mood vector mapped to these cues, used by `randomize.js` to reject
  contradictions and as a preset lint. Mode is the happy/sad axis; calm is
  tempo/level/timbre/articulation. Sleep/ending path: low syncopation, no accents,
  plain cadences, 60–80 bpm.

### 2.8 Sections, seams and loops
*(game-music-hunt-medina-gray)*
- Game music: on average 62.8% of bars exactly repeat an earlier bar (SD 3.5 across
  platforms); this did not change with hardware.
- Seam smoothness: meter continuity, shared timbre, pitch classes of the first second
  after a seam present in the previous five seconds' macroharmony (≥ 50% = at least mild
  smoothness), consistent volume, gradual rather than abrupt endings.
- **Rules.** Offline exact-repeat ratio per preset (expect ≈ 50–75% for game-style).
  Score every section transition and the loop wrap on the five aspects; default to
  smooth, use disjunction only for deliberate drops.

## 3. Priority list

| # | Change | Where | Effort | Basis |
| --- | --- | --- | --- | --- |
| 1 | Audit harness (§4) | new `tools/` script | small | Every later weight needs a number |
| 2 | Melody probability model + degree priors + direction bias | `phraseMelody.js`, `resolution.js` | medium | §2.1 |
| 3 | Sentence/period function plans | `phrase.js`, `formStrategies.js`, `themeDevelopment.js` | medium | §2.2 |
| 4 | Syncopation score, band, cadence stability, rubato coupling | `rhythmDevelopment.js`, `ensembleRhythm.js`, `rubato.js`, `percussion.js` | small–medium | §2.3 |
| 5 | Cadence chord clarity (7th / IV–ii), corpus-weighted borrowing and destinations | `sectionCadence.js`, `harmonicDestinations.js`, `theory.js` | small | §2.4 |
| 6 | Mood vector lint | `randomize.js`, presets | small | §2.7 |
| 7 | Roughness-based spacing | `theory.js` `voiceLead`, `arranger.js` | small–medium | §2.5 |
| 8 | Transition and loop-seam scoring | `formLatest.js`, `percussionLatest.js`, `commonToneBridge.js` | medium | §2.8 |
| 9 | Centricity recipe for modal presets | `arranger.js` bass/pad, `phraseMelody.js` | medium | §2.4 |
| 10 | Surprise meter and satiation budget | new composition module | medium | §2.6 |
| 11 | Backward cadence expansion / functional grammar | `progressions.js`, `harmonicRhythm.js` | large | §2.4 |

## 4. Step zero: make the vibe limit measurable

Add an offline script that renders N bars per preset (the planner is a pure function)
and reports, against the norms above:
- interval histogram, step share, direction by interval size, post-leap direction by
  landing relative to the median, phrase-final degree distribution;
- strong-beat stability and chord-tone share;
- onset density by bar position (sentence/period shape);
- syncopation (Keith and Longuet-Higgins) per bar, and in the last two bars of phrases;
- chord-root histogram and root-motion distribution vs the corpus table; V7/V use at
  cadences;
- pitch-class circulation curve (windows 2–100 notes);
- bar-level exact-repeat ratio and similarity matrix;
- roughness of pad + bass partials by register;
- seam scores at section changes and the loop wrap;
- an n-gram surprise profile along phrases.
Compare with the published values, then with the presets you consider best, and use
the gaps to choose weights. The listening gate stays: numbers show what to try, not
whether it sounds good.

First run (28 October 2026): `npm run audit:composition`, results and the plan changes they
imply in [COMPOSITION_AUDIT.md](COMPOSITION_AUDIT.md). Measured so far: intervals, direction,
degree profile, phrase endings, syncopation, chord roots and motion, pitch-class circulation,
exact repeats, low-register spacing and mood cues. Not yet: counter line, n-gram surprise,
Longuet-Higgins & Lee syncopation, seam scores.

## 5. What changed from the first version of this document
- **Dropped:** a directional predominant→dominant→tonic role table as the default.
  The rock-harmony corpus shows symmetric, distance-weighted motion; directional
  grammars apply only to functional-style presets.
- **Dropped:** an explicit "reverse direction after a leap" bonus. Reversal is largely
  regression to the median; use range + proximity (plus the direction asymmetry).
- **Added:** cadence seventh in major, GTTM cadence stability, centricity recipe,
  pitch-class circulation, game-music repetition benchmark, seam scoring, mood cue
  units, satiation, Euclidean cells, partial-based roughness.
- **Corrected:** minor mode is not a reliable calm cue (Eerola: major slightly more
  peaceful; sleep trials favour minor; both are small-sample).

## 6. Not yet read
Lerdahl & Jackendoff ch. 5–12 (reductions, tension), Krumhansl chord/key chapters,
Caplin ch. 4+ (hybrids, compound themes), Huron 2016 ch. 8–14, Huron 2006 ITPRA and
harmony chapters, Tymoczko ch. 2–4 and 7, Toussaint ch. 17/18/33/37, Pearce model
chapters, Margulis ch. 2/3/6–8. Details in the notes' README.
