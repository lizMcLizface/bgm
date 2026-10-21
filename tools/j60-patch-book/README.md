# Juno-60 patch book → Analog 106 sounds

Reads the panel drawings of a *Juno-60 patch book* (the 56 factory programs 11–78 and 43 owner's-manual examples drawn on the Juno-6 panel) into approximate panel settings, which `tools/buildJ60BookPresets.mjs` turns into Analog 106 sounds of our own: new names, the synth's own categories and level matching. The book and the measured JSON stay out of the repo (`banks/` is git-ignored); only `src/synths/juno/bookPresets.js` ships.

Needs Python with `numpy`, `scipy` and `pymupdf` (the pages are composited images and must be rendered).

```
python pipeline.py Juno-60-Patch-Book-01A.pdf ../../banks/juno-60/book-raw.json
npx vite-node tools/buildJ60BookPresets.mjs        # → src/synths/juno/bookPresets.js
```

## How it works
Every panel is drawn from the same template, four to a page, so positions are fixed relative to each panel's black header bar (found as a band of mostly-black rows).
1. **Sliders (17):** caps are double bars; the centre of the thick rows in each column, on the scale from the 10 tick (101 px below the header) to the 0 tick (198 px). Rounded to 0.05.
2. **LEDs:** pulse, saw and sub-oscillator buttons, chorus I and II (none lit = off): filled or hollow.
3. **Levers:** the dot's height. PWM: LFO / manual / envelope; VCF envelope: normal / inverted; VCA: envelope / gate.

## Mapping to the 106 (src/synths/juno/book.js)
Through the 106 patch decoder (`junoValues`). The 60's HPF slider becomes the nearest 106 position (flat, 2, 3); its envelope-driven PWM becomes a fixed width (the 106 has no such mode); range is 8'; the sub-oscillator level only counts when its button is lit. Drawings whose VCA is on ENV with an envelope that does nothing play in GATE mode.

## Known limits
Sliders ±0.05; a few drawings leave caps undrawn (read as neutral). The arpeggiator, LFO trigger mode and key transpose are not read.
