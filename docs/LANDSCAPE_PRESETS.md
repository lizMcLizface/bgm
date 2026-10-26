# Landscape for each musical preset

Each preset (scene) maps to a landscape kind, weather, hour and season in
[src/scenery/presetScenes.js](../src/scenery/presetScenes.js). Variants
("(previous piano)", "v1", "· Bossa", "(tonal)") share their base preset's
landscape; presets not listed fall back to their category.

On a tall (portrait) window the scene is built at the window's shape with about the same
number of pixels: trees, peaks and towers keep their 16:9 size (`Scene.U`) and most of the
extra height goes to the land below the horizon (`Scene.horizonAt`).

Landscape menu options: **Preset picks the landscape**, **Time of day keeps
changing**, **Seasons keep changing**. With a "keeps changing" box off, the day
or the year stays at the preset's hour or season; with it on, it starts there
and moves on.

## Good matches
- Heroic Field Trip, Mushroom Kingdom Commute, Tall Grass Route, Soggy Home Planet, Thunderstorm, Wide Open Plains → grassland
- Slightly Lost Forest, Block Forest, Campfire, Fireside folk, Bonfire Rest, Ruins in the Drizzle → woodland
- Nervous Chicken Village, Turnip Town, Morning coffee, Rainy Day Chickens Inside, Sunday Reading → farmland
- Beach at night, Choir at sea, Island Shop Hours, Outrun Lullaby, Pastel Coastline, Tine and Tide → seaside
- Desert dusk, Pint-Sized Saloon, Dark Mirror Dimension → desert
- Cold Drifts, Ice Cave Echoes, Study session, Deep night, Falling Stars → mountain lake (snow, fog, night)
- Replicant Blues, Tears in Weather, Nightcall, Night drive, Robot Factory Rush, Clockwork → industrial
- Sunrise in seven → savanna; Windy hill, Long Way to Sunrise → hills
- Rainy café, Rain on the window, Rain Under Speech, Lamplight → river valley

## Weak matches (nearest fit used)
- **Starship set** (Slightly Slower Than Light, Mild Vacuum, Hull Breach Brunch, Mildly Alarmed, Plotting a Course): empty desert or lake at night, or industrial.
- **Caves** (Dig Straight Down, Quiet Blocky Cave, Bounty Hunter Basement, Ice Cave Echoes): surface hills, lake or industrial.
- **Racing** (Zero Fun Zone, Big Blue-ish): desert for open road.
- **Cafés, lounges, studios, saloon interiors** (Late-night brushes, Late Show Lounge, Whiteboard, Quiet Studio, Open Mic Pad, Room Tone): exteriors only.
- **Damp Crater, Boss Fight**: alien/arena places drawn as hills or desert with storm or dust.
- **Underwater**: seaside in fog.
- **Chapel organ, Haunted Staircase, Altman**: no building; hills or woodland in fog.
- **Piano and Pads, Solo Grand, other abstract presets**: neutral lake. The Demo scenes each
  have their own calm pick (lake, hills, grassland, savanna, seaside, farmland, river, woodland).

## Drafts in review

Built in [wilds.js](../src/scenery/wilds.js) and listed in the scenery tool
(`tools/scenery.html`, marked "new"; the Shape picker shows the phone build), but not yet in
the page's Look menu or the preset table above. Once a draft is approved, move its name from
`DRAFT_BIOME_NAMES` to `BIOME_NAMES` in [catalog.js](../src/scenery/catalog.js) and point the
presets below at it.

| Draft | What is in it | Presets it would take over |
|---|---|---|
| Alpine peaks | a tall snowy massif, a rockier range, an alpine meadow, a chalet, boulders, a green shoulder | Soft Landing, Five Notes Only, Rooms Above the Clouds, Windy hill |
| Tundra | a cold climate (snow from mid autumn to late spring), stunted spruces, a lake that freezes, aurora | Cold Drifts, Warm Socks; Quiet-room waltz; Falling Blocks Folk Dance; Altman |
| Swamp | channels between mossy hummocks, cypresses on arching roots, hanging moss, snags, lily pads, fireflies, fog | Ruins in the Drizzle, Haunted Staircase, Soggy Home Planet, Damp Crater |
| Volcano | a cone with a glowing crater, lava flows, an ash plume lit from below, embers, a cracked lava field, a red night sky | Boss Fight, Politely; Dark Mirror Dimension |
| Synthwave | a neon horizon at every hour: a huge striped sun with a halo (sunset, magenta or rose), glowing bands and stars, a city silhouette, wireframe pyramids or cloud banks, a scrolling grid floor with a centre line or a winding glowing road | Outrun Lullaby; Night drive; Getaway Driver, Off Duty; Nightcall, Voicemail; Real Hero Hours; Pocket Circuit; Lantern Circuit |
| Alien planet | a black sky by day, a ringed planet and a moon, craters, a domed outpost with a blinking mast | Slightly Slower Than Light, Mild Vacuum, Plotting a Course, Orbital Afterglow, Hull Breach Brunch |
| Campfire clearing | a fire with flames, embers and a pool of light, a stone ring, a log seat, a tent, forest around | Campfire, Fireside folk, Bonfire Rest |

## Still missing, easiest to hardest to add

Each landscape is a build function that stacks existing helpers (sky, mountains, ground,
meadow, trees, water, houses). Difficulty is how much new shape code each needs.

1. **Town / harbour** (medium): `house` and `village` exist, but street grids, lit windows at
   scale and a quay with boats need a layout pass. Seaside already has boats and a lighthouse.
2. **Jungle / rainforest** (medium): dense layered canopy, vines, a waterfall; needs a new tree
   type and its own wet-season palette.
3. **Ruins / castle** (hard): needs architectural shapes (arches, towers, broken walls) the
   shape library does not have.
4. **Cave / underground** (hard): the scene has a sky and horizon baked in; a cave needs a
   different layer stack, lighting model (no sun) and framing.
5. **Interiors (café, library, window view)** (hardest): new composition, props and lighting,
   probably a window frame over an existing landscape.

## Sky features

Done, in [effects.js](../src/scenery/effects.js):
- **Aurora**: one or two folded curtains on clear nights over lake, hills, woodland,
  grassland and farmland: a sharp bright lower edge that meanders and kinks, vertical rays
  drifting along it, green fading through teal into violet, stars and moon showing through;
  strongest in autumn and winter, swelling and fading over a few minutes.
- **Shooting stars**: a streak every so often on dark nights, everywhere except industrial.
- **Fireflies**: after dusk over grassland, farmland, woodland, river, swamp and the campfire clearing; gone in autumn and
  winter, and in rain.
- **Embers**: sparks rising from industrial flares.

Already there: falling leaves (woodland, lake banks, lone trees, strongest in autumn).

Still missing: falling petals in spring and underwater caustics.
