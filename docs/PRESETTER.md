# Presetter: listening to the presets and keeping what you change

A page for working through the preset library on the dev server: `/tools/presetter/` (source `src/presetter/`, entry `tools/presetter/index.html`). It is built only for local builds and left out of the public one (`vite.config.js`), and it is not linked from anywhere.

## The page
- **Left half:** the real app in a frame (timeline, instruments, control panel, everything), so a preset is judged and changed exactly where it will be used.
- **Right half:** a bar for the preset in the frame, filters, and a table of every preset.
  - Click a row, or use the up and down arrows (or j and k) when no field is focused, to open a preset. It is always taken at once and starts from the top, never carried over from the last one at a chord (the page's `cutToScene`).
  - Each row has a verdict (Not judged, Fine, Needs a tweak, Needs redoing), a note, a dot for "opened before", and, if you kept changes, what they touch and how long ago (highlighted for the last day).
  - A preset using an older voice of the Measured category shows `[to check instrument]` after its name (hover for which), since an Iowa or VSCO instrument may now do that part better; the checkbox of that name shows only those, and searching for an instrument's name finds them too (`toCheck.js`).
  - Filters: words (name, blurb, note), category, verdict, "has my changes", "changed in the last day". The table is also the tracker for what is done.
- **Keep my changes** compares the page in the frame with the preset as shipped and stores the difference for that preset. Nothing is kept if the page is as the preset has it. Settings, voices (a built-in sound by name, an edited one in full), the rulebook and the drum machine are kept. With the layers split the pad and rhythm voices are kept by name only; an edited sound there is reported as not kept.
- **Open with my changes** (on by default) opens a preset with the changes kept for it laid over it. **Reload original**, **Reload with mine** and **Drop mine** do what they say.
- Everything is stored in this browser's local storage (`bgm-presetter-v1`) as it is changed.

## Getting it into the library
1. **Dump to file** downloads `presetter-<date>.json`: only presets with a change, a verdict or a note. **Read a dump** merges one back in (a change made here after the file's wins).
2. `node tools/applyPresetChanges.mjs presetter-<date>.json` lays the changes over `src/library/scenes.json` (`--dry` to look first). A hidden "previous version" copy of a preset that was identical to it gets the same change, so the pair still match. It lists what could not be found or kept, and the presets still marked "Needs a tweak" or "Needs redoing" with their notes.
3. Run the tests and look at the diff before committing.

## How it works
The app's page sets `window.__bgm` on the dev server only (`GenerativeApp.jsx`): `applyScene`, `capture` (the page as a setup), `loadedName`. The diff (`diff.js`) is between that capture and the preset (`sceneSettings`, `sceneVoiceSpec`), minus the seed and generation; a test checks every shipped preset differs from itself by nothing. A change is a patch (`changes.js`): `applyChange` is used both to open a preset with its changes and to bake them in.
