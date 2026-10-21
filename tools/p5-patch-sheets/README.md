# Prophet-5 patch sheets → Oracle 5 sounds

Measures the panel drawings of the original *Prophet-5 patch sheets* (a scanned PDF, one program per page, 1-1 … 5-6) into approximate panel settings, which `tools/buildP5SheetPresets.mjs` turns into Oracle 5 sounds of our own: new names, the synth's own categories and level matching. The scans and the measured JSON stay out of the repo (`banks/` and `.tmp/` are git-ignored); only `src/synths/prophet/sheetPresets.js` ships.

Needs Python with `numpy`, `pillow` and `scipy`.

```
python ../jp8-patch-sheets/extract.py Original-Prophet-5-Patch-Sheets-1.1.pdf ../../.tmp/p5/pages   # p01 … p38 (JPEG pages)
python pipeline.py ../../.tmp/p5/pages ../../banks/prophet-5/sheets-raw.json                      # knob angles, buttons
python convert.py ../../banks/prophet-5/sheets-raw.json ../../banks/prophet-5/patch-sheets.json    # panel values
npx vite-node tools/buildP5SheetPresets.mjs                                                         # → src/synths/prophet/sheetPresets.js
```

## How it works
1. **Ink:** the scans differ in density, so the threshold starts halfway between ink and paper and rises until the panel's knob discs show.
2. **Knob discs:** a disc-shaped opening leaves the filled knobs (and filled buttons, told apart by shape).
3. **Registration:** the panels are drawn at 0.7–1.1× and placed differently per page. Every pair of discs is tried as each of 63 pairs of anchor knobs; the similarity transform landing most knobs on discs is refined by closest points (all 38 pages: 26 of 26 knobs, ≤ 3 px).
4. **Knobs:** the darkest ray just outside the disc. The printed 0–10 scale turns 300° from 7 to 5 o'clock; readings round to 0.05.
5. **Buttons:** filled or hollow at their registered positions.
6. **Oscillator pitch:** from the printed notes under each drawing ("up 2 octaves" = 8'), read by eye into `convert.py`; LF mode keeps the knob as the rate.

## Checks
Against the original programs in Sequential's free factory file (bank F5), used only as a check: the knobs land within 0.02–0.05 on average (glide 0.14), the buttons agree on 795 of 798, and the printed pitches on 70 of 76 (the rest are in bank 5, where the sheets and the file differ; the sheets are used).

## Calibration
`npx vite-node tools/calibrateP5Sheets.mjs` fits per-knob lines against bank F5 (coefficients only, in `calibration.json`); the two pulse widths and cutoff get small corrections, every other knob already reads within about 0.05. Glide is a performance knob on the original, not part of a program: the drawings show wherever it sat (0.6 on a dozen sheets whose programs have none), so it is kept only on the sounds about gliding.

## Known limits
- 5-7 and 5-8 are not in the scan.
- The playing notes under each drawing (wheel amounts, suggested edits) are not decoded.
