# Jupiter-8 patch sheets → Pluto 8 sounds

Measures the panel drawings of the *Jupiter-8 factory patch sheets* (a scanned PDF, one patch per page, 11–88) into approximate panel settings, which `tools/buildJp8SheetPresets.mjs` turns into Pluto 8 sounds of our own: new names, the synth's own categories and level matching. The sheets, the page images and the measured JSON stay out of the repo (`banks/` and `.tmp/` are git-ignored); only the generated `src/synths/jupiter/sheetPresets.js` ships.

Needs Python with `numpy`, `pillow` and `scipy` (a throwaway venv: `python -m venv .tmp/pyenv`).

```
python extract.py Roland-Jupiter-8-Factory-patch-sheets.pdf ../../.tmp/jp8/pages   # p01.png … p64.png
python pipeline.py ../../.tmp/jp8/pages ../../banks/jupiter-8/patch-sheets.json
npx vite-node tools/buildJp8SheetPresets.mjs                                       # → src/synths/jupiter/sheetPresets.js
```

## How it works
1. **Pages:** one image per page, CCITT G4 (wrapped in a one-strip TIFF for Pillow) or JPEG.
2. **Registration:** each page is shifted onto page 5 by cross-correlating column and row ink profiles of the panel (offsets up to ~30 px). The mean of all registered pages is the printed template: it stays sharp while the hand-drawn marks blur out.
3. **Sliders (21):** caps are the thick bars a 4 × 22 px opening leaves; each is read in its own column window (neighbouring caps at the same height merge into one stroke). The 0 and 10 rows come from the printed scale ticks per column. Values are rounded to 0.05.
4. **Knobs (7):** centres are fitted on the template; the pointer is the ray with the most ink not in the template. Switch knobs snap to their printed positions; VCO-2 RANGE maps through the dial's 16'/8'/4'/2' marks to the nearest semitone; FINE TUNE and SOURCE MIX turn 300°.
5. **Levers (10):** the filled dot's height (top / middle / bottom); meanings come from the printed labels (key follow: OFF up, ON down; polarity: down inverted; LOW FREQ down; and so on).
6. **Assign mode:** the lit LED among SOLO / UNISON / POLY 1 / POLY 2 (Unison wins when a sheet lights two).

## Checks
Against the decoded factory tape, used only as a check (nothing from it is written): VCO waves and ranges, sync, slope and polarity agree on 59–64 of 64 patches. Where they differ the sheet is used: some sheets draw decay at the top when sustain is at 10, and the tape decoder's key-follow and LFO-wave readings do not match the printed labels.

## Calibration
`npx vite-node tools/calibrateJp8Sheets.mjs` fits, per slider, a line from the drawn reading to the factory tape's value of the same program and writes its two coefficients to `calibration.json`, which the preset build applies (no tape value is copied). A slider is calibrated only when at least 30 programs agree with the fit, the slope is plausible and the error clearly drops. The drawings sit low on LFO rate, ENV-1 decay, ENV-2 attack and release (the strings attacked and stopped in 0.1 s); fine tune is drawn more scattered than the programs, which sit near centre. ENV-2 decay does not track the tape at all (likely the tape byte map, which was itself fitted against these sheets) and stays as drawn.

## Known limits
- **Accuracy:** the drawings are hand-marked facsimiles: about ±0.05 per slider, ±0.1 on a few knobs drawn as a bar through the knob (the longer side is taken).
- **Not read:** the arpeggiator, the bender and LFO-mod inset, and the playing notes under each drawing.
