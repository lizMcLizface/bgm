# Landscape for each musical preset

Each preset (scene) maps to a landscape kind, weather, hour and season in
[src/scenery/presetScenes.js](../src/scenery/presetScenes.js). Variants
("(previous piano)", "v1", "· Bossa", "(tonal)") share their base preset's
landscape; presets not listed fall back to their category.

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
- **Demo, Piano and Pads, Solo Grand, other abstract presets**: neutral lake.

## Missing landscapes, easiest to hardest to add

Each landscape is a build function in [biomes.js](../src/scenery/biomes.js) or
[landscapes.js](../src/scenery/landscapes.js) that stacks existing helpers (sky, mountains,
ground, meadow, trees, water, houses). Difficulty is how much new shape code each needs.

1. **Snowy tundra / winter forest** (easy): `woodland` or `hills` with `climate = 'snow'`
   forced, conifers and snowcaps. Seasons and snow palettes already exist.
2. **Alpine peaks** (easy): `lake` without the lake, with bigger `mountains` and snowcaps.
3. **Highway** (easy-medium): flat ground, a perspective road, poles and a few moving car lights
   (like the lights in `industrial`); the road is the only new shape.
4. **Swamp** (medium): reuse `water`, `reeds`, bare trees and fog; needs mangrove roots and
   mist banks tuned for it.
5. **Town / harbour** (medium): `house` and `village` exist, but street grids, lit windows at
   scale and a quay with boats need a layout pass. Seaside already has boats and a lighthouse.
6. **Jungle / rainforest** (medium): dense layered canopy, vines, a waterfall; needs a new tree
   type and its own wet-season palette.
7. **Volcanic / lava** (medium-hard): dark rock, a glowing lava flow and a plume. Embers now
   exist; the lava animation and sky tint are new.
8. **Ruins / castle** (hard): needs architectural shapes (arches, towers, broken walls) the
   shape library does not have.
9. **Cave / underground** (hard): the scene has a sky and horizon baked in; a cave needs a
   different layer stack, lighting model (no sun) and framing.
10. **Interiors (café, library, window view)** (hardest): new composition, props and lighting,
    probably a window frame over an existing landscape.
11. **Space / planet surface** (medium-hard): stars exist, but planets, rings and a ground
    plane under a lit sky need a sky mode with no atmosphere.

## Sky features

Done, in [effects.js](../src/scenery/effects.js):
- **Aurora**: green and violet curtains on clear nights over lake, hills, woodland,
  grassland and farmland; strongest in autumn and winter, swelling and fading over a few minutes.
- **Shooting stars**: a streak every so often on dark nights, everywhere except industrial.
- **Fireflies**: after dusk over grassland, farmland, woodland and river; gone in autumn and
  winter, and in rain.
- **Embers**: sparks rising from industrial flares.

Already there: falling leaves (woodland, lake banks, lone trees, strongest in autumn).

Still missing: falling petals in spring, underwater caustics, and embers need a campfire
object (Bonfire Rest, Campfire, Fireside folk have none yet).
