# Plomp & Levelt (1965) — Tonal consonance and critical bandwidth

Source PDF: `docs/ref/Plomp_Levelt_Tonal_1965.pdf` (*J. Acoust. Soc. Am.* 38: 548–560).
Read: abstract, introduction/historical review, and sections III–IV with their figures.
Curves (Figs. 8–12) were read from rendered page images; values below are read off the
graphs (±0.05 on the consonance scale). Sections on the experimental method and the
Bach/Dvořák chord statistics (Figs. 14–15) were not read in detail.

## Findings
- Consonance of two **pure** tones depends on the *frequency difference relative to
  the critical bandwidth* at that frequency, not on a simple frequency ratio.
- Pairs whose frequency difference **exceeds the critical bandwidth** are judged
  consonant; the **most dissonant** pairs are about **a quarter of a critical
  bandwidth** apart. The transition range moves with frequency, so the same
  semitone-based interval is rougher low than high.
- For **complex tones** (with harmonics, as in real instruments) consonance of simple
  ratios (octave, fifth, fourth, thirds) comes from fewer pairs of adjacent partials
  falling inside one critical band, i.e. less beating (Helmholtz's idea, refined).
- Analysis of Bach (organ trio sonata) and Dvořák (string quartet) chords: the density
  of simultaneous partials varies with frequency the way critical bandwidth does, so
  composers space chords wider in the bass. (Huron 2016 cites the same finding.)

## Figures read from the page images
- **Fig. 10, standard curve** (consonance of two pure tones vs frequency difference in
  units of critical bandwidth, CBW; consonance scale arbitrary, 1 = maximum): 0 CBW →
  1.0 (unison); falls steeply to ~0 at about 0.2–0.25 CBW (maximum dissonance); then rises
  smoothly: ≈ 0.35 at 0.4, ≈ 0.6 at 0.6, ≈ 0.85 at 0.8, ≈ 0.95–1.0 at 1.0 CBW and beyond.
- **Fig. 8/9:** frequency difference of maximum dissonance (0.25 CBW) and of the smallest
  consonant interval (1 CBW) both follow the CBW-vs-frequency curve: roughly constant
  (~100 cps CBW) below ≈ 500 cps and then growing roughly in proportion to frequency.
  The paper notes the bend at about 500 cps.
- **Complex tones:** total dissonance of an interval is *assumed to be the sum of the
  dissonances of each pair of adjacent partials*, using the Fig. 10 curve (they call it
  speculative but reasonable). With 6 harmonics, Fig. 11 (lower tone 250 cps, upper tone
  swept to 500) shows consonance peaks at the simple ratios 1:1, 5:6, 4:5, 3:4, 2:3,
  3:5 and 1:2. Fig. 12 shows consonance of a fixed ratio is nearly independent of
  frequency over a large range; below the ≈ 500 cps bend, intervals become more and more
  dissonant, which is why thirds are avoided low and octaves or wider are used.
- Text (p. 556): "Apart from the range below 100 cps, the dissonance is 0 for the octave
  (Fig. 12)", meaning that with up to 6 harmonics all adjacent partials are separated by
  more than a critical bandwidth. This does not hold for tones with higher partials, which
  explains why complex tones with strong upper harmonics sound sharper (also Helmholtz).
- **Figs. 14–15** (Bach trio sonata, Dvořák quartet chord statistics) were not viewed; only
  the abstract's conclusion is recorded: the density of simultaneous partials changes
  with frequency in the same way critical bandwidth does.

## What it means for us
1. This is the quantitative basis for the low-register spacing rule in the Huron note.
   A dissonance cost can be computed from *synthesised partials* of the actual voices
   (not only note names): sum roughness over adjacent partial pairs using the
   critical-band curve. That favours wide bottom intervals automatically, and works
   for non-12-tone sets and for the inharmonic bells in the library.
2. Practical formulation (recalled, not found in this paper): Sethares' fit of the
   Plomp–Levelt curve, `d(f1, f2, a1, a2) = a1·a2·(e^(−3.5·s·Δf) − e^(−5.75·s·Δf))`,
   `s = 0.24 / (0.0207·f_min + 18.96)`, is the standard way to turn the curve into
   code. Verify against the primary source before using constants.
3. Use it as an **audit metric** first (per bar: summed roughness of pad + bass
   partials), and as a cost in `voiceLead` second. It would flag muddy close
   voicings in the bass without a separate "low interval limit" table.
4. Note it measures sensory roughness only. A rough chord is not a wrong chord;
   clusters and seconds are deliberate colour in several presets.
