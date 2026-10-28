# Game music: Hunt (repetition) and Medina-Gray (seams)

Source PDFs: `docs/ref/CSMC__MuMe_2020_paper_10.pdf` (S. J. Hunt, "An analysis of
repetition in video game music", CSMC/MuMe 2020) and
`docs/ref/mto.19.25.3.medina.gray.pdf` (E. Medina-Gray, "Analyzing modular smoothness
in video game music", *Music Theory Online* 25(3), 2019). Hunt read in full (6 pages).
Medina-Gray read for the five-aspect method (¶ 15–31); the case studies (Wind Waker,
Portal 2) skimmed only.

## Hunt: how repetitive is game music?
- 21,391 MIDI pieces from 11 console platforms (VGMusic database), 4/4 only, cut at
  bar lines (min. clip = 1 bar), onsets/lengths quantised to 1/32. A bar is "a repeat"
  if another bar has *identical* notes, onsets and lengths.
- **Mean repetition = 62.79%** (SD across platforms 3.49): on average about 63% of the
  bars in a game piece exactly repeat an earlier bar. Almost no change from 8-bit to
  CD-era hardware, so repetition looks like an aesthetic norm, not a storage artefact
  (Collins 2007 reaches the same view).
- Song length and track count grew with hardware; repetition did not.
- Limits: exact repeats only (variations count as new), identical doubled tracks add
  repetition, MIDI cannot represent timbre. Not split by game genre.

## Medina-Gray: scoring a seam between two modules
A seam is *sequential* (one module follows another) or *simultaneous* (layered).
Smoothness (parts fit) vs disjunction (parts separate), judged over five aspects:
| aspect | sequential seam, smoothest case | disjunct case |
| --- | --- | --- |
| **Meter** | the first onsets of the new module continue the prevailing pulse streams | no pulse stream continues (her example: 140 → 119 BPM, no shared pulse); partial agreement (grouping *or* displacement dissonance, after Krebs) is mild |
| **Timbre** | same instruments and techniques before and after, nothing new introduced | entirely different instrumentation; partial overlap is mild |
| **Pitch** | every pitch class in the **first second after** the seam occurs in the **macroharmony of the 5 seconds before** (Tymoczko's term); ≥ half = mild; < half = mild disjunction; none = very disjunct | |
| **Volume** | consistent level in the seconds around the seam | a significant change, fade to silence and back |
| **Abruptness** | gradual: fades, natural decays, long sustain for a "smooth hand-off" | hard cut |
Simultaneous layers: smooth when they support one meter, share instruments, have
matching volumes and compatible pitch content; a quick crossfade (one rises as the
other falls) counts as disagreement.
- Seams are analysed probabilistically over all possible pairs when a system can join
  modules in many ways. Disjunction is sometimes wanted (combat, cutscenes).

## What it means for us
1. **A benchmark for the offline audit.** Compute the share of bars that exactly
   repeat an earlier bar (all tracks combined, same quantisation). Game music sits
   near 63% (± 3.5 across platforms). Our generator should be in the same region for
   game-flavoured presets and can be higher for ambient or lower for jazz-like ones,
   but a value far below ~50% would mean the pieces are less repetitive than real game
   music, and far above ~75% loop-like (this band is my own rough rule of thumb, not
   from the paper). Use the number, don't chase it.
2. **A seam score for section transitions.** Our sections (intro, build, full, breakdown)
   change texture on bar boundaries. Score each transition on the five aspects with
   cheap proxies: pulse continuity (same tempo and meter, or deliberate relation),
   instrument overlap (set overlap of voices), pitch-class overlap of the macroharmony
   in the last ~5 s vs the first ~1 s, loudness change in dB, and decay overlap
   (ring-out vs hard cut). Prefer smooth transitions by default; allow disjunct ones
   only for "breakdown" or "drop" gestures.
3. **Pitch-class overlap rule is concrete:** at a transition, ≥ 50% of the pitch
   classes in the first second should already appear in the preceding ~5 seconds. This
   is easy to check for key lifts and borrowed chords; it argues for pivot notes in
   `commonToneBridge.js`.
4. **The loop point is a seam too.** When a piece wraps (the same cycle restarts),
   run the same five checks between the last and first bars of the cycle. A cycle
   that ends on a bar of silence or a cymbal crash and restarts on full volume is
   the "audible loop" problem game writers describe.
5. **Don't generalise genre.** Hunt's data is MIDI of console games, 4/4 only and
   mostly foreground-melody music; the app is also calm and ambient.
