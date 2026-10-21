# FM7 suite: generated voices in the spirit of classic FM cartridges

The FM7 has no factory bank of its own. This builds one by generating voices from aggregate statistics of the classic ROM cartridges, which stay local (`banks/dx7/`, git-ignored).

```
npx vite-node tools/fm7-suite/buildModel.mjs   # → src/synths/dx7/suiteModel.json (statistics only)
npx vite-node tools/fm7-suite/suite.mjs        # → src/synths/dx7/suitePresets.js (128 voices)
```

1. **Model** (`model.mjs`): the 238 distinct cartridge voices are grouped into families by name (`families.mjs`) and reduced to counts per family and operator role (carrier, modulator, deeper modulator): algorithms, ratios, levels, detune, scaling, feedback, LFO; and envelope archetypes, each the average of at least three voices. No voice is stored.
2. **Generator** (`src/synths/dx7/generate.js`, ships): draws an algorithm, then each operator's ratio, level and envelope (an archetype with jitter) for its role, blending small families with the shared statistics. Seeded. The page's "New" button uses it at runtime.
3. **Suite** (`suite.mjs`): candidates are kept when they render cleanly, their brightness, attack and sustain fall within the range the family's cartridge voices span (basses judged at C2 over the whole held note, with their fundamental weight: at middle C a thin, buzzy bass passes), and their nearest cartridge voice is at least as far as two cartridge voices typically are from each other (in practice about five times that). Then named (`names.mjs`), styled and level-matched.
