# Vos & Troost (1989) — Ascending and descending melodic intervals

Source PDF: `docs/ref/vos1989.pdf` (*Music Perception* 6(4): 383–396). Read in full.
Figs. 2 and 3 are bar charts; values below were read from the rendered pages and are
approximate (±2 percentage points).

## Method
Themes from 13 composers (469 themes, Bach to Stravinsky, plus Beatles) and eight
European folk repertoires (327 themes). Counted all 13 within-octave melodic
intervals, split by direction. Then 24 listeners discriminated computer-made
8-note tunes built with the real direction statistics from tunes with the
statistics reversed.

## Findings
1. **Small intervals dominate** (roughly exponential fall-off beyond 5–6 semitones),
   peaking at the major second. Same pattern across cultures. Rank correlation of
   composers vs folk interval frequencies r_s = .987.
2. **Direction asymmetry.** Small intervals (the four smallest in folk; thirds and
   below broadly) are mostly *descending*; large intervals mostly *ascending*. In
   the composer sample the fifth is a significant exception (mostly descending, z = −2.98);
   the major third is neutral; ascending fourths remain significant even after removing
   upbeat fourths.
3. **First interval of a tune is mostly ascending.** The only position-specific effect
   found in the first five intervals.
4. **Perceptual relevance:** listeners discriminated "classical" from "contra-classical"
   direction patterns convincingly. The regularity is audible.
5. Interpretation (Meyer): a large ascending leap is a "gap" that creates tension and
   surprise; the listener then expects it to be filled by small steps descending.
   Unisons serve rhythmic rather than melodic purpose.

## What it means for us
1. A plausible default direction bias in melody generation: after a leap up, fall by
   steps; prefer small steps down and larger intervals up. This is statistical, not strict.
2. Note the Temperley reading: much of the reversal after a leap is explained by
   range and proximity alone (regression to the mean). Implement proximity + range
   first; add direction bias only if the interval histogram still misses the
   ascending-large / descending-small shape.
3. Start phrases with an ascending interval more often than not (pickup upward).
4. The chart values below give starting weights. For a firmer basis, count our own
   generated intervals against the Essen collection (public) or use Temperley's fitted
   variances.

## Chart values (read from the page images, approximate)
**Fig. 2 — share of all melodic intervals by size (semitones), %:**
| size | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Composers | 12 | 21 | 32 | 11 | 7 | 9 | 1 | 3 | 2 | 2 | 1 | 0 | 1 |
| Folk (Ethno) | 18 | 17 | 38 | 13 | 7 | 4 | 0.5 | 2 | 1 | 1 | 0.5 | 0 | 1 |
(The major second is the mode in both; seconds plus unisons are about 65% of composer
intervals and about 73% of folk intervals; intervals above a fifth are under ~10% together.)

**Fig. 3 — share of non-unison intervals that ascend, %, by size:**
| size | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Composers | 46 | 43 | 49 | 45 | 62 | 48 | 41 | 49 | 54 | 50 | 67 |
| Folk (Ethno) | 40 | 42 | 47 | 45 | 68 | 57 | 66 | 64 | 69 | 56 | 73 |
Bars below 50% mean mostly descending. Composer fifths (7) ≈ 41% ascending (mostly
descending, p < .001); folk fifths ≈ 66% ascending.
