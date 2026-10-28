# Toussaint (2013) — The Geometry of Musical Rhythm

Source PDF: `docs/ref/The Geometry of Musical Rhythm _ What Makes a __Good__ ... .pdf`
(CRC Press, 2nd printing). Read: ch. 13 (Keith's syncopation measure, book pp. 67–72)
and the Euclidean-rhythm list in ch. 19 (pp. 129–136, list of E(k,n) patterns). Only
the table of contents for ch. 17 (complexity), 18 (maximal evenness), 33 (similarity)
and 37 (what makes the clave son good: evenness, oddity, off-beatness, metrical
complexity, mirror symmetry, …). Those chapters would be the next read.

## Euclidean rhythms (ch. 19)
`E(k, n)`: k onsets spread as evenly as possible over n pulses (Bjorklund's /
Euclid's algorithm). Examples listed by Toussaint, with the worldwide use he cites:
| pattern | intervals between onsets (book's list) | note in the text |
| --- | --- | --- |
| E(3,8) | 3-3-2 | Cuban tresillo |
| E(5,8) | 2-1-2-1-2 | Cuban cinquillo |
| E(3,7) | 2-2-3 | |
| E(4,7) | 2-2-2-1 | |
| E(5,12) | 3-2-3-2-2 | metal-bell timeline (Venda) |
| E(7,12) | 2-1-2-2-1-2-2 | popular West African bell pattern |
| E(5,16) | 3-3-3-3-4 | used in modern electronic dance music |
| E(7,16) | 3-2-2-3-2-2-2 | |
| E(9,16) | 2-1-2-2-2-1-2-2-2 | (list prints 212221222) |
| E(3,4), E(5,6), E(7,8), E(11,12) | near-full cycles | |

Intervals count pulses from one onset to the next and sum to n. The book lists
necklaces, so any rotation is the same rhythm.

The list covers dozens of (k, n) pairs. Many correspond to named timelines in African,
Cuban, Balkan and other traditions. The algorithm gives maximum evenness; it does not target a syncopation level.

If both numbers in a (k, n) are halved or doubled the same pattern recurs at a
different subdivision; pick n to match the meter's unit grid (n = bar length in the
unit that holds the pattern).

## Keith's syncopation measure (ch. 13)
For notes with onsets and offsets on a power-of-two grid of n pulses: let D be the note
duration rounded down to a power of two. The onset is "off the beat" if start S is not
a multiple of D; the offset is off the beat if S + duration is not a multiple of D.
- Weights: hesitation (offset off the beat only) = 1; anticipation (onset off the beat
  only) = 2; true syncopation (both) = 3.
- Toussaint's simplification for percussion (attacks only): each onset off the beat
  scores 1, else 0, with "off the beat" defined by S not a multiple of the note's
  nominal duration D.
- Worked examples: a classical ostinato with onsets 0,4,8,10,12 in 16 pulses scores 0;
  clave son (3-3-4-2-4) scores 2.

## What it means for us
1. **Euclidean cells are a cheap, vetted source of syncopation levels** for the
   groove bank: pick k and n for the style and meter, and rotate. E(3,8) and E(5,8)
   for tresillo-based feels, E(5,12) and E(7,12) for 6/8 and 12/8, E(5,16) and E(7,16)
   for 16th-note electronic and breakbeat styles, E(4,7)/E(3,7) for 7/8, E(3,5) and E(2,5)
   for 5-beat meters. This answers the roadmap item "optional Euclidean timelines"
   with concrete patterns per meter.
2. **Two syncopation measures for the audit.** Longuet-Higgins & Lee (strength-weighted,
   tree-based; see the syncopation note) and Keith (onsets and offsets, grid-based) can
   both be computed from our events. Keith's is simpler to implement; use it for a
   quick per-bar score and LHL for the Witek-style target band.
3. **Use Euclidean patterns to *mutate*,** not only to generate: rotating a cell or
   moving one onset to the next-most-even position keeps the groove identity while
   changing the syncopation score by a small amount.
4. **Do not lean on the geometry alone.** The book argues these are properties of
   good timelines. It does not give a listening-test result for groove pleasure; the
   Witek study (medium syncopation) is the closer evidence.
5. Read chapters 17, 18, 33 and 37 before treating evenness or off-beatness as a
   quantitative target.
