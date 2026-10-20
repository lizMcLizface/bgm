# OB-Xa patch book → data

Measures the Oberheim OB-Xa/120 *Programmed Patches* book (a scanned PDF of panel drawings, two per page) into knob values and switch states. The book itself and everything extracted from it stay out of the repo: the output goes to the git-ignored `banks/oberheim-ob-xa/` and `patches/oberheim-ob-xa/`.

Needs Python with `numpy` and `pillow`. A throwaway virtual environment is enough. Run everything from a work directory:

```
python extract.py OB-Xa_patch_book.pdf pages     # LZW-compressed scans → pages/p01.png … p52.png
mkdir titles && python pipeline.py               # → panels.json (+ title crops in titles/)
python convert.py patch-book.json titles.txt     # → the JSON for banks/oberheim-ob-xa/
python overlay.py 5a 40b                         # optional: measured pointers drawn over a panel, to check
npx vite-node tools/exportPatchesYaml.mjs banks/oberheim-ob-xa/patch-book.json   # → YAML
```

## How it works
1. **Knobs:** found by a matched template (white centre, dark inner circle at r ≈ 10–14 px, white band, outer ring at r ≈ 24). Every patch page has exactly 48: 2 panels × 24.
2. **Registration:** each panel is aligned to the A1 panel (page 5, top) with an affine fit on its 24 knobs. The residual is under 3 px on all 96 panels.
3. **Knob values:** the angle of the darkest arc in the white band, where the drawn pointer wedge sits. The scale is 300° from 7 o'clock (0) to 5 o'clock (10). A knob drawn without a pointer (low contrast) is recorded as `null`.
4. **Switches:** the LED positions come from the reference panel, mapped through the fit and refined locally. "Lit" means the dot is filled. The readings fall into two clusters (below 0.3 and above 0.7), with nothing in between.
5. **Names and pitch notes:** read by eye from the title crops into `titles.txt` (no OCR available). Codes follow book order. The programmer LEDs on each drawing serve as a cross-check: two drawings show the wrong ones (D3 drawn as D4, ACD2 as BCD5), and these are kept as `drawing_note`.

## Known limits
- **Group C** (Trumpets … Pizzicato) is not in this scan, so the set has 96 of the 104 factory programs.
- **Accuracy:** the drawings are facsimiles. The book itself says fine tuning of frequencies, detune, modulation depth and envelopes matters, so treat the values as ±0.3 or so. Oscillator pitch comes from the printed notes, not from the frequency knob angles.
- **Not decoded:** the paragraph of playing tips under each drawing.
