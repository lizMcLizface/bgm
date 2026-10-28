# Theory notes

Condensed notes on the papers and books in `docs/ref/` (git-ignored PDFs), each
ending in "what it means for us". The overview and priorities are in
[../MUSIC_THEORY_GROUNDING.md](../MUSIC_THEORY_GROUNDING.md). Where a note
contradicts that document, the note wins: it was written from the source.

**Tables and charts.** `pdftotext` garbles tables and drops charts. Pages with key tables
were rendered to images (PyMuPDF) and read directly: de Clercq Table 3, Temperley Fig. 4.7,
Huron 2006 Table 9.2, Vos & Troost Figs. 2–3, Plomp & Levelt Figs. 8–12, Schellenberg Fig. 3,
Eerola Table 3, Krumhansl Table 2.1 (verified), Steedman rules 1–5 (verified). Chart values read off graphs are marked approximate in the notes.
Still only text-extracted: Huron 2006 Table 9.3, Temperley ch. 3 rhythm-model parameters,
Huron 2016 chapter tables, Pearce tables, Krumhansl tables beyond 2.1.

| # | source | status | note |
| --- | --- | --- | --- |
| 1 | de Clercq & Temperley 2011, rock harmony | done | [declercq-temperley-2011.md](declercq-temperley-2011.md) |
| 2 | Temperley 2007, *Music and Probability* | ch. 4, 5.2–5.3, 7.6, 10.1–10.3 done | [temperley-2007-music-and-probability.md](temperley-2007-music-and-probability.md) |
| 3 | Witek 2014; Longuet-Higgins & Lee 1984 | done | [syncopation-witek-and-longuet-higgins.md](syncopation-witek-and-longuet-higgins.md) |
| 4 | Vos & Troost 1989 | done | [vos-troost-1989-interval-direction.md](vos-troost-1989-interval-direction.md) |
| 5 | Schellenberg 1997 | done | [schellenberg-1997-two-factor-expectancy.md](schellenberg-1997-two-factor-expectancy.md) |
| 6 | Huron 2016, *Voice Leading* | ch. 5, 7 done | [huron-2016-voice-leading.md](huron-2016-voice-leading.md) |
| 7 | Krumhansl 1990 | probe-tone profiles done; chord/key chapters not read | [krumhansl-1990-probe-tone-profiles.md](krumhansl-1990-probe-tone-profiles.md) |
| 8 | Plomp & Levelt 1965 | sections III–IV and Figs. 8–12 read; method and Figs. 14–15 not | [plomp-levelt-1965-critical-bandwidth.md](plomp-levelt-1965-critical-bandwidth.md) |
| 9 | Pearce 2005 (thesis), Pearce & Wiggins 2006 | experiment 3 and thesis ch. 9 done | [pearce-expectation-and-composition.md](pearce-expectation-and-composition.md) |
| 10 | Huron 2006, *Sweet Anticipation* | ch. 5 melody, ch. 9 scale degrees done; ITPRA, harmony, rhythm not read | [huron-2006-sweet-anticipation-melody-statistics.md](huron-2006-sweet-anticipation-melody-statistics.md) |
| 11 | Margulis 2013, *On Repeat* | keyword-read (ch. 1, 5); other chapters not read | [margulis-2013-on-repeat.md](margulis-2013-on-repeat.md) |
| 12 | Rohrmeier 2011; Steedman 1984 | rule sets read (Steedman rules checked on the page images) | [rohrmeier-2011-and-steedman-1984-harmony-grammars.md](rohrmeier-2011-and-steedman-1984-harmony-grammars.md) |
| 13 | Tymoczko 2011, *A Geometry of Music* | ch. 1, 5.3, 5.7 read; voice-leading geometry and part II not read | [tymoczko-2011-geometry-of-music.md](tymoczko-2011-geometry-of-music.md) |
| 14 | Caplin 2013, *Analyzing Classical Form* | ch. 2, start of ch. 3 done; hybrids not read | [caplin-2013-sentence-and-period.md](caplin-2013-sentence-and-period.md) |
| 15 | Toussaint 2013, *Geometry of Musical Rhythm* | ch. 13, 19 read; ch. 17, 18, 33, 37 not read | [toussaint-2013-geometry-of-musical-rhythm.md](toussaint-2013-geometry-of-musical-rhythm.md) |
| 16 | Medina-Gray 2019; Hunt 2020 (game music) | done | [game-music-hunt-2020-and-medina-gray-2019.md](game-music-hunt-2020-and-medina-gray-2019.md) |
| 17 | Eerola 2013; Kilchenmann & Senn 2015; Pan & Wang 2025 | key sections read | [mood-cues-microtiming-and-sleep.md](mood-cues-microtiming-and-sleep.md) |
| 18 | Lerdahl & Jackendoff, *GTTM* | grouping and metre rules done (text version); reductions not read | [lerdahl-jackendoff-1983-gttm.md](lerdahl-jackendoff-1983-gttm.md) |

## Conventions
Each note has: source file and what was read and not read; the findings with numbers and
page references; then "What it means for us". Marks: *(recalled)* = background knowledge,
not found in the source; "approximate" = read off a chart; "my reading" / "suggestion" =
an inference of mine, not the source's claim.

## Where the notes disagree or qualify one another
- **Chord function.** Rohrmeier and Steedman give directional functional grammars; de
  Clercq & Temperley show pop/rock is symmetric and distance-weighted. Both are right for
  their repertoire; choose per preset family.
- **Leap reversal.** Narmour/Schellenberg model reversal as a principle; Temperley and
  Huron (2006) show most of it is regression to the median. Schellenberg's two-factor
  model still fits as well as richer ones.
- **Phrase-final degree.** Huron's prose lists 1̂, 5̂, 3̂; his Table 9.2 has 3̂ marginally
  above 5̂. The notes use "1̂ first, 3̂ ≈ 5̂".
- **Calm and mode.** Eerola: mode is weak for peaceful (and the paper's two tables
  disagree on its significance); sleep reviews favour minor. Use tempo, level, timbre and
  articulation for calm; do not force minor.
- **Calm and register.** Eerola predicted low, observed high.
- **Reading effort.** Several books were read by chapter or keyword only; their notes
  say which chapters, and "not read" lists are in each note's header.
