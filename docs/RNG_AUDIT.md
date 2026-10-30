# RNG audit (2026-10-30)

`npm run audit:rng` (tools/rngAudit.audit.js, planning only, report in `.tmp/rng-audit/report.md`) tests the seed derivations and the music they make. It was run with 12 seeds x 96 bars over the 133 browsable presets.

## Seed derivations

Every `seeded(<formula>)` shape in src/ was driven over 64 random and 64 small seeds x 256 bars; the first draw (what `pick` and `chance` read) was tested for uniformity, correlation between neighbouring bars and seeds, and collisions.

- The mixing shapes (`seed ^ imul(bar+1, K)`, the LCG mix, the golden-ratio add) pass everywhere. That is most of composition/.
- The linear shapes pass for random 32-bit seeds (what a typed phrase or four words give) but fail for small seeds: `seed*31 + bar` (Generator.js:1303, borrowed chords), `seed*37 + 11 + bar` (:1312) and `seed*53 + bar` (:1408, key-lift pivot) are skewed and collide, since seed s at bar b+31 is the same stream as seed s+1 at bar b. In practice only seeds that differ by a few and are read 31-53 bars apart share decisions.
  **Not changed:** switching them to a hashed pair would change the music of every existing seed and shared link. Worth doing only with a version switch.
- sequencer.js:174 and :222 (`seed*131 + bar*...`) pass in the same test; the new walk and stack choices use a hashed pair.

## The music

- Sequencer arpeggio first step: 3244 up, 3156 down over 200 seeds x 32 bars. Stack first tone: 2157 / 2200 / 2043 (lowest / inner / highest). The stack had a bias before this audit (two of its three orders started at the bottom, 68% of bars); fixed.
- Melodic direction of the lead: mean share of rising intervals 0.509 over 133 presets (range 0.478 to 0.583), so no systemic lean. `hull-breach-brunch` (0.583, harmonic minor) is the one outlier; a raised leading tone resolving up is the likely reason, not the RNG.

## Found along the way

The expression pass (composition/noteExpression.js `expressNotes`) rebuilt every note's expression and dropped what a source had set on purpose, so the sequencer's held chords never got their slow attack and vibrato. It now keeps `attackScale` and the vibrato fields (test in noteExpression.test.js).
