# Lerdahl & Jackendoff — A Generative Theory of Tonal Music

Source PDF: `docs/ref/A GENERATIVE THEORY OF TONAL MUSIC,LERDAHL ... .pdf` (the text
version; the earlier scanned PDF is unreadable). Read: rule statements for grouping
(ch. 3) and metre (ch. 4), with the explanatory text for GPR 2–5, MPR 3, 6, 7, 10.
Not yet read: reductions and the later chapters on time-span and prolongational
structure and tension. Those are analysis tools more than generation rules.

## Grouping rules (what makes a phrase boundary)
- **GWFR 1–5.** Groups are contiguous, nest hierarchically, and a group that contains
  part of another contains all of it; a group is split exhaustively into subgroups.
- **GPR 1.** Avoid single-note groups.
- **GPR 2 (Proximity).** A boundary is heard after n2 when, among four notes, the gap
  n2→n3 is bigger than n1→n2 and n3→n4. (a) slur/rest: the silence between the end
  of n2 and the start of n3 is the larger. (b) attack-point: the onset interval
  n2→n3 is the larger. It must be *distinctive on both sides*; a boundary between two
  equal-looking transitions is not assigned.
- **GPR 3 (Change).** A boundary is heard at a transition that differs from both its
  neighbours in register (bigger leap), dynamics, articulation or note length.
- **GPR 4 (Intensification).** Where GPR 2 or 3 effects are stronger, the boundary
  belongs to a larger-level group.
- **GPR 5 (Symmetry).** Prefer splitting groups into two parts of equal length.
- **GPR 6 (Parallelism).** Parallel (repeated) material forms parallel parts of groups.
- **GPR 7.** Prefer groupings giving stabler time-span and prolongational structure.

## Metrical rules
- **MWFR 1–4.** Every attack lies on a beat of the smallest level present; beats at
  a level are also beats at all smaller levels; strong beats are 2 or 3 beats apart;
  tactus and the next level up are equally spaced.
- **MPR 1** Parallelism: parallel passages get parallel metre.
- **MPR 2** Strong beat early in a group (weak).
- **MPR 3 (Event).** Prefer strong beats where notes begin.
- **MPR 4 (Stress).** Prefer strong beats where notes are stressed (louder, accented).
- **MPR 5 (Length).** Prefer strong beats at the start of longer notes, longer
  harmonies, longer pitch or dynamic patterns.
- **MPR 6 (Bass).** Prefer a metrically stable bass.
- **MPR 7 (Cadence).** *Strongly* prefer metrically stable cadences: syncopation and
  cross-accents are extremely rare within a cadence, though the approach to one can
  be metrically complex (e.g. a hemiola). Masculine (weak–strong) or feminine
  (strong–weak) endings are both fine as long as the cadence agrees with the global
  pattern.
- **MPR 8** A suspension sits on a stronger beat than its resolution.
- **MPR 10 (Binary regularity).** With no other evidence, prefer duple grouping at
  every level, including bars → 2 → 4 → 8 (hypermetre). Irregularity comes from irregular
  group lengths, or from grouping overlaps and elisions (e.g. Haydn Symphony 104: a
  phrase's last bar is also the next one's first, so a four-bar-level beat arrives only
  three bars after the previous one).

## What it means for us
1. **Cadence stability (MPR 7) is the missing rule for our drums/rhythm.** The last
   bar or two of a phrase should be rhythmically plain: no syncopation mutation, no
   ghost notes off the beat, no swing exaggeration, no random fill that moves the
   downbeat. Complexity belongs in the approach (bars 2–3), not in the cadence bar.
   This pairs with Temperley's syncopation–rubato trade-off, which already says
   rubato is acceptable if metre is clear.
2. **How to mark a phrase boundary so it is heard.** Lengthen the inter-onset gap
   (rest or long note) at the end relative to neighbours (GPR 2), and change register,
   dynamics, articulation or note length there (GPR 3). Our `phraseLength.js` and
   `rhythmGrammar.js` have gaps but do not enforce distinctiveness. Make a boundary
   rest longer than the surrounding gaps, not only "a rest".
3. **Avoid one-note groups (GPR 1).** A lone short note between two rests reads as
   an error; ensure fragments in `themeDevelopment.js` have at least two events.
4. **Symmetry and binary regularity (GPR 5, MPR 10).** Keep phrases and sections in
   2:2 or 4:4 splits by default. A 3- or 5-bar span is an intentional
   irregularity; use it as a rare surprise, and if one is used, make it an elision or
   overlap (which the theory describes as a metrical readjustment), not an unmarked
   odd group. This supports the existing 4/8-bar design and the guarded
   variable-harmonic-rhythm rule (transfer a bar, keep the cycle total).
5. **Parallelism (GPR 6, MPR 1).** Repetition is what makes boundaries. Keep a motif's
   rhythm parallel across a presentation pair, then break it in the continuation
   (consistent with Caplin).
6. **Bass stability (MPR 6).** Keep the bass on strong beats at harmony changes; use
   syncopated bass only inside a phrase.
