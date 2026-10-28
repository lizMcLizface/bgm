# Composition audit — first run

28 October 2026. Step zero of [MUSIC_THEORY_GROUNDING.md](MUSIC_THEORY_GROUNDING.md) §4: the generator's plan
measured against the norms in [theory-notes/](theory-notes/README.md). **Planning only: nothing here was
listened to**, so it shows where the output departs from published music, not whether the departure sounds
wrong. Several departures are deliberate (calm presets, synth leads).

## How to run it
`npm run audit:composition` (about 20 s). Options: `AUDIT_BARS=128`, `AUDIT_SEEDS=3`,
`AUDIT_ONLY=boss-fight-politely,rainy-cafe`. It writes `.tmp/composition-audit/report.json` (per preset and
seed) and `summary.md` (all tables). Code: `tools/compositionMetrics.js` (pure measurements, unit-tested in
`tools/compositionMetrics.test.js`, including Toussaint's two worked syncopation examples) and
`tools/compositionAudit.audit.js` (driver; runs under vitest with the audio layer stubbed, like
`src/app/generator.test.js`, and is excluded from `npm test`).

## Method and limits
- 118 music presets (the browsable library minus ambience-only) × 3 seeds × 128 bars, each planned through
  `Generator.planner()` with the preset's rulebook applied as the app does, timing humanisation and swing off
  so beats are the composed grid.
- Lead = the `lead` role only (the counter line is not in the melodic tables). Presets with few lead notes
  give noisy ratios; pooled values weight by note count.
- Norms come from folk and art-music corpora (mostly major-key, vocal-range melodies). Our leads are synth
  lines and many presets are deliberately sparse, so a gap is a prompt to look, not proof of a defect.
- "Phrase" ends assume the generator's own structure: a 2-bar call and response inside a 4-bar phrase, aligned
  to bar 0 (`bar % 4`); sections that start off-grid blur this. Keith syncopation is computed on a quarter-unit
  grid, for meters whose unit is the felt beat only (so not 6/8, 9/8, 12/8, 5/8, 7/8).
- Roughness uses the Sethares fit of the Plomp–Levelt curve with constants from memory, so only its ordering
  is used, not its magnitude.

## Findings (largest departures first)

### 1. Phrases end open: the answer is less settled than the call
Last lead note of each unit, major-key-like presets, pooled (120 runs; degrees 1 to 7):

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| end of the 2-bar call (bar 2 of 4) | .47 | .22 | .10 | .05 | .03 | .03 | .10 |
| end of the 4-bar response (bar 4 of 4) | .16 | .27 | .05 | .05 | .08 | .10 | .26 |
| Huron, notes before a rest (folk) | .33 | .14 | .21 | .05 | .21 | .04 | .03 |

Tonic-triad degrees (1, 3, 5): **call .60, response .29**; folk melodies end on them about .75 of the time.
The response ends on 2̂ or 7̂ more than half the time. 117 of the 120 runs use the "settled" ending setting:
"settled" means a root or third of whichever chord sounds, which is 2̂ or 7̂ over a ii or V chord. Caplin's
period requires the second phrase to end *stronger*; here it ends weaker. (Related: V→I arrivals preceded by
a seventh chord are .53 of 2,859 arrivals, against .76–.88 in classical final cadences.)

### 2. Key-level note choice: tonic-heavy, fifth-poor, leading-tone-heavy
Pooled proportion of lead notes by degree, against the Essen folk corpus (major / minor):

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ours, major-like | .309 | .159 | .156 | .073 | **.077** | .078 | **.132** |
| Essen major | .184 | .155 | .191 | .109 | **.214** | .078 | .055 |
| ours, minor-like | .234 | .188 | .202 (♭3) | .091 | **.080** | .010 | .132 (♭7) |
| Essen minor | .192 | .149 | .179 (♭3) | .144 | **.201** | .012 | .053 (♭7) |

Against the *sounding chord* the distribution looks normal (root .23, third .25, fifth .22, seventh .08,
outside the chord .20), and on strong beats lead notes are chord tones 100% of the time (p10 .955). So
the gap is which chord tones are chosen at the key level, not chord fit. The probe-tone stability profile
(Krumhansl) ranks the fifth second after the tonic; the generator does not use it.

### 3. Melodic contour: more repeats, fewer leaps, and zig-zag instead of step inertia
Lead, pooled (norm: Vos & Troost composers/folk; Huron 2006):

| measure | ours | norm |
| --- | --- | --- |
| unison | .23 | .12 / .18 |
| step (1–2 semitones) | .45 | .53 / .55 |
| leap ≥ 5 semitones | .08 | .19 / .10 |
| descend after a descending step | **.40** | ≈ .70 |
| ascend after an ascending step | .43 | ≈ .51 |
| direction reverses after a leap ≥ 5 | .79 | ≈ .5–.7 |
| ascending share of steps / of leaps ≥ 5 | .52 / .47 | ≈ .41–.45 / .55–.66 |

Lead pitch varies little inside a 4-bar window (variance 3.4 vs Temperley's 10.6 for a whole folk melody),
and the lead sits high (median MIDI 79 vs Essen 68). Lines turn around too often: descending steps continue
only 40% of the time (folk: 70%), and the few leaps nearly always reverse (the planner's recovery penalty).
Calm sparse leads lower all these numbers by construction.

### 4. Rhythm is almost entirely straight
Keith syncopation per bar of the merged lead/bass/percussion/counter onsets: **median 0.08**
(p10 0, p90 .31). Most presets score about 0; the most syncopated are Soft Landing (.87), Deep night (.60),
Plotting a Course (.51), Breathing room (.50). By bar of a 4-bar phrase the means are .06 / .06 / .13 / .03,
so the cadence bar is plainer, but only because everything is near zero. Witek's medium-syncopation sweet spot
applies to groove material; there is no target in the generator today. Lead notes per bar by phrase position
are flat (.97 / 1.03 / .89 / .97), with none of the continuation-phase acceleration of a sentence.

### 5. Repetition: far fewer exact bar repeats than game music
Bars that exactly repeat an earlier bar (all tracks): **median .055** (p10 0, p90 .51), against .628 for game
MIDI. By layer: percussion .92, bass .65, pad .42, counter .25, lead .18. A single varying layer defeats an
exact all-tracks match (bass walking, ornaments, a varying counter), so this does not mean pieces never
repeat; it says the *same bar* seldom recurs. Highest: Room Tone .88, Rain Under Speech .76, Open Mic Pad .73;
lowest: Slightly Slower Than Light, Boss Fight Politely, Demo: 7/8 electro (0).

### 6. Harmony roughly matches the rock corpus, with a minor-bank flavour
Chord-root shares pooled over all presets against de Clercq & Temperley (ours / corpus): I .31/.33, IV
**.15/.23**, V .14/.16, bVI **.10/.04**, VI .10/.07, bVII .10/.08, bIII .06/.03. Root motion by circle-of-fifths
distance (ours / corpus): 1 step .42/.49, 2 .23/.30, 4 **.16/.08**, 6 **.02/.002**. More major-third and tritone
motion than pop, consistent with the minor and "unresolved" progression banks. 45% of chords carry a seventh.

### 7. Macroharmony, spacing and mood
- Pitch-class circulation at 100 attacks: median 7.70 (p10–p90 6.9–8.4); diatonic music should plateau near 7.
  Highest: Altman 12 (deliberately atonal), Bittersweet Sunday 9.5, Wet Pavement Two-Step 8.9, Dorian walk 8.7.
- Bar-start sonorities with a close pair (≤ minor third) below C4: median .12, p90 .49; worst Mild Vacuum .86,
  Open Mic Pad .70, Soft Landing .62, Wet Pavement Two-Step .55, Pure Piano .54.
- Mood cues: notes per second median 1.36 (range .41–3.97) against Eerola's 1.2–6 scale; articulation .88
  (legato-leaning). Consistent with calm music; no preset sits at the energetic end.

## What this changes in the plan
Order by size of gap and cheapness:
1. **Closure rule for the end of a 4-bar response:** prefer 1̂/3̂/5̂ of the key (and a V→I cadence) where the
   chord allows; keep 2̂/7̂ for the call or for half-cadence phrases. Test: the response-end tonic-triad share.
2. **Key-level stability prior** (Krumhansl) in the beam search so the fifth and tonic triad are used in their
   natural proportions. Test: degree profile against Essen.
3. **Step inertia and fewer zig-zags** (Huron 2006; Schellenberg proximity): continue descending steps, allow
   some leaps with leap-lengthening. Test: descend-after-descend and ascend-after-ascend shares.
4. **Syncopation band for groove presets** and the sentence-style density curve in build/full sections.
5. **Seventh at major-key cadences**, and a spacing check for the presets listed above.
6. Leave repetition alone until it is heard: low exact repeats may be a feature of the varied layers.

Not measured yet: the counter line, intervals between lead and counter, an n-gram surprise profile, Longuet-Higgins
& Lee syncopation, sections as a variable (e.g. full vs breakdown), and the seam score at section changes.
