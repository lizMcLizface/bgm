# de Clercq & Temperley (2011) — A corpus analysis of rock harmony

Source PDF: `docs/ref/a-corpus-analysis-of-rock-harmony.pdf` (*Popular Music* 30/1, pp. 47–70).
Read in full for the results section (pp. 59–66); pp. 1–58 are method.

## What it is
100 songs (Rolling Stone's top 20 per decade, 1950s–90s), hand-analysed by both
authors in Roman numerals; agreement 92.4% on chromatic relative root, 97.3% on key.
Same-root repeats collapsed. Counts are chord *roots* (major/minor/7th merged).
Rock, soul and early pop; not ambient, game or lo-fi music.

## Key data

**Root distribution (Table 2, proportion of all chords):**
I .328 · IV .226 · V .163 · bVII .081 · VI .072 · bVI .040 · II .036 · bIII .026 ·
III .019 · bII .005 · VII .004 · #IV .003. Five roots (I, IV, V, bVII, VI) = 87%.

**Pre-tonic vs post-tonic (Table 4, share of non-tonic chords):**

| root | overall | before I | after I |
| --- | --- | --- | --- |
| IV | .336 | .396 | .356 |
| V | .241 | .269 | .240 |
| bVII | .119 | .132 | .159 |
| VI | .107 | .050 | .102 |
| bVI | .059 | .071 | .036 |
| II | .053 | .041 | .044 |
| bIII | .038 | .017 | .032 |

**Root motion (Tables 5–6):** ascending and descending motions are about equally
common (+P4 2,266 vs −P4 2,220; +M2 1,384 vs −M2 1,386). Frequency falls off
regularly with *circle-of-fifths distance*: P4/P5 ≈ 2,240; M2 ≈ 1,385; m3 ≈ 410–450;
M3 ≈ 326; m2 ≈ 113–162; tritone ≈ 20.

**Most common trigrams ending on I (Table 7):** IV–V–I 352 · V–IV–I 292 ·
bVII–IV–I 146 · VI–IV–I 126 · bVII–bVI–I 103 · bIII–bVI–I 66 · II–V–I 63 ·
bVI–bVII–I 60. V is mostly preceded by IV.

**Decades (Table 8):** the 1950s are 95%+ I/IV/V. From the 1960s on, bVII, VI, II
and bVI broaden the vocabulary (bVII ≈ 8–11% from the 60s).

## What it means for us
1. **Common-practice "predominant → dominant → tonic, never backwards" is *not* the
   rock norm.** The pre-tonic and post-tonic
   distributions are nearly the same, and root motion is directionally symmetric.
   A directional T→S→D→T grammar is wrong for pop/rock/game-flavoured presets. It
   only fits presets that claim common-practice or jazz style (see Rohrmeier,
   Steedman).
2. **Better model for loop presets: a symmetric, distance-weighted one.** Weight a
   candidate chord transition by circle-of-fifths distance of the roots
   (P4/P5 ≫ M2 > m3 > M3 > m2 ≫ tritone), plus a per-chord prior from Table 2.
3. **IV is the favourite neighbour of I** in both directions, and IV before V is
   the usual way V appears. Good default for interior destinations and
   cadence approach.
4. **bVII / bVI / bIII are idiomatic borrowed chords**, and they fall mostly next to
   I and each other (bVII–bVI–I, bVI–bVII–I, bIII–bVI–I). Borrowing "from the
   parallel minor" should prefer these, rather than uniform choice.
5. **Check against the bank in `progressions.js`**: `I V vi IV` (V→vi, vi→IV),
   `I vi IV V`, `vi IV I V` fit the model (P4/M2 motions). `ii iv iii ii`-style
   "unresolved" entries are deliberately outside it.

## Table 3 — chord transitions (counts)
Read from the rendered page image. Rows = antecedent chord, columns = consequent chord;
counts over the whole corpus, averaged over the two analysts; key changes are not counted.

| from \ to | I | bII | II | bIII | III | IV | #IV | V | bVI | VI | bVII | VII |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I | 0 | 25 | 132 | 94 | 44 | 1052 | 2 | 710 | 104 | 302 | 470 | 16 |
| bII | 31 | 0 | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| II | 120 | 1 | 0 | 2 | 20 | 58 | 0 | 97 | 0 | 24 | 10 | 0 |
| bIII | 50 | 6 | 6 | 0 | 0 | 64 | 2 | 2 | 67 | 0 | 41 | 0 |
| III | 16 | 0 | 39 | 0 | 0 | 46 | 0 | 6 | 0 | 60 | 3 | 4 |
| IV | 1162 | 14 | 30 | 98 | 45 | 0 | 4 | 514 | 57 | 72 | 90 | 4 |
| #IV | 7 | 0 | 0 | 6 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| V | 788 | 0 | 36 | 6 | 17 | 392 | 4 | 0 | 6 | 191 | 48 | 0 |
| bVI | 208 | 0 | 1 | 20 | 0 | 22 | 6 | 22 | 0 | 10 | 78 | 0 |
| VI | 144 | 0 | 87 | 0 | 32 | 260 | 0 | 124 | 21 | 0 | 3 | 0 |
| bVII | 386 | 0 | 0 | 11 | 2 | 188 | 2 | 26 | 114 | 6 | 0 | 0 |
| VII | 18 | 0 | 0 | 0 | 12 | 0 | 4 | 0 | 0 | 3 | 0 | 0 |

(Small cells could contain a misread digit. Row sums are within a few percent of the
chord counts in Table 2: I row 2,951 vs 3,058 instances, IV row 2,090 vs 2,104, because
sections ending a song or a key are not counted as transitions.)

Observations from the matrix: from I the top destinations are IV (1052), V (710),
bVII (470), VI (302); into I the top sources are IV (1162), V (788), bVII (386),
bVI (208), VI (144). IV→V (514) and V→IV (392) are both common, so the pair is
roughly symmetric; V→VI (191) is the third V exit (the deceptive-type move). The main
chromatic-side pairs are bVII→bVI (114), bVI→bVII (78) and bIII→bVI (67). VI→IV (260)
and VI→V (124) are VI's usual exits; II is entered most from I (132) and VI (87)
and exits mostly to I (120), V (97) and IV (58).
