# ARES//NAV — Interplanetary Survival Guide: Martian Map
### NASA Space Apps Challenge 2026 · Project Task Plan (planning only — not yet implemented)

> *"The first humans on Mars will want the best map possible."*
> ARES//NAV is a retro-futurist, web-based survival and navigation system for a Mars surface crew. It layers data from multiple NASA missions over a hyper-local EVA site, plans a safe walking/rover route around craters, rocks and steep terrain, reports current conditions (weather, dust, radiation), and projects everything into a **fighter-jet-style helmet HUD** that uses the webcam as the astronaut's eyes.

---

## 0. Table of Contents
1. Mission Concept & Challenge Mapping
2. Target Site & Science Objectives
3. NASA Data Sources (layers)
4. Product Modules
5. Retro Design System
6. HUD / "VR Visor" Mode
7. Route Navigator (pathfinding & EVA safety model)
8. Technical Architecture
9. Data Pipeline
10. Repository Structure
11. Task Breakdown by Phase (with acceptance criteria)
12. Priorities: MVP / Should / Stretch
13. Risks & Mitigations
14. Demo Script & Submission Deliverables
15. Open Questions

---

## 1. Mission Concept & Challenge Mapping

| Challenge objective | How ARES//NAV covers it |
|---|---|
| Map/tool an astronaut could use during a surface mission | Three form factors in one app: **Habitat Console** (desktop planning), **Field Tablet** (responsive/touch), **Helmet HUD** (webcam visor mode) |
| Data from multiple NASA science missions | MRO (HiRISE, CTX, CRISM), Mars Global Surveyor (MOLA, TES), Mars Odyssey (THEMIS), MSL Curiosity (REMS, RAD, Mastcam/Navcam, ChemCam/APXS), MAVEN (space weather), DONKI (heliophysics) |
| ≥3 data types layered | Optical, topographic, thermal, spectral/mineralogical, atmospheric, radiation, chemical — **7 types** |
| Astronaut safety first | Hazard layers (slope, rocks, craters, soft sand), radiation dose budget, dust/weather alerts, consumables-limited "walk-back" boundary, abort routing |
| Spacesuit mobility | Route cost model accounts for suit mass, max walkable slope, metabolic rate, carried payload, suit consumables |
| Route map avoiding obstacles | A* / Dijkstra pathfinding over a hazard-weighted cost grid derived from DTMs + rock/crater catalogs |
| POV imagery so the crew knows what to expect | Rover ground-level images (Navcam/Mastcam/MAHLI) pinned to their capture coordinates; "Waypoint Preview" panel & HUD picture-in-picture |
| Rovers / pairs of astronauts | Mission profiles: *Solo walk*, *Buddy pair (2 suits)*, *Pressurized rover + walk*; each changes cost model & range rings |
| HUD on suit visor (consideration) | Full fighter-jet HUD with stereo "VR headset" rendering and webcam pass-through |

---

## 2. Target Site & Science Objectives

**Primary site: Gale Crater — Mount Sharp (Aeolis Mons), boxwork region**
- Directly matches the challenge's example (Curiosity studied boxwork formations here in 2025).
- Richest multi-mission data stack on Mars: HiRISE DTMs, CTX mosaics, CRISM, THEMIS, **plus ground truth** from Curiosity (RAD radiation on the surface, REMS weather, chemistry, thousands of POV images, the actual traverse path).

**Hypothetical mission: "ARES-1 EVA 07 — Boxwork Ridge Traverse"**
- Landing/habitat site: a flat, low-rock area near Curiosity's traverse on the lower slopes of Mount Sharp (exact coordinates chosen in Phase 0 from the HiRISE DTM footprint).
- EVA radius: ~2–5 km walk-back limited (hyper-local — the gap the challenge identifies vs. Mars Trek's global view).

**Science objectives (each becomes a waypoint with a task card):**
1. **SO-1 Boxwork ridges** — sample ridge vs. hollow chemistry to test groundwater-mineralization hypotheses.
2. **SO-2 Sulfate-bearing unit contact** — image & sample the clay→sulfate transition (habitability shift as Mars dried).
3. **SO-3 Fresh impact crater ejecta** — look at excavated subsurface material, measure rock-size distribution.
4. **SO-4 Active dune margin** — wind/sediment monitoring (also a soft-sand **hazard** to route around).
5. **SO-5 Radiation shelter survey** — evaluate overhangs/ridges as natural partial shielding during SEP events.

**Secondary site (stretch): Jezero Crater** — Perseverance data; proves the tool is a *system* that can generate maps for other locations.

---

## 3. NASA Data Sources (layers)

> Every endpoint below must be re-verified in **Phase 0** (some NASA APIs have been retired/moved). Each layer has a **bundled offline fallback** so the demo never depends on live network.

| # | Layer | Data type | Mission / Source | Access | Use in app |
|---|---|---|---|---|---|
| L1 | Global/basemap mosaic | Optical | MRO **CTX** global mosaic, Viking MDIM | NASA **Mars Trek** WMTS tile service (trek.nasa.gov) | 2D basemap |
| L2 | High-res site imagery | Optical | MRO **HiRISE** (~25–50 cm/px) | uahirise.org / PDS Imaging Node; Mars Trek | Zoomed EVA map, 3D terrain texture |
| L3 | Elevation | Topographic | MGS **MOLA** (global), **HiRISE DTM** (~1 m), CTX DTM | PDS / USGS Astrogeology / Mars Trek | Contours, hillshade, slope, 3D mesh, route cost |
| L4 | Slope & roughness | Topographic (derived) | from L3 | Computed in pipeline | Primary walkability hazard |
| L5 | Thermal inertia / day-night IR | Thermal | Mars Odyssey **THEMIS** | Mars Trek / ASU THEMIS / PDS | Distinguish bedrock vs. loose sand (sinking/slip hazard), surface temperature |
| L6 | Rock abundance | Thermal-derived / optical | THEMIS/TES rock abundance; HiRISE rock counts | PDS / published USGS datasets | Obstacle density layer |
| L7 | Craters | Geomorphic catalog | Robbins & Hynek crater database (USGS-hosted, built on THEMIS/MOLA) + manual small-crater digitizing from HiRISE | USGS Astrogeology | Crater obstacles, rim hazards, science targets |
| L8 | Mineralogy | Spectral | MRO **CRISM** (MTRDR browse products), OMEGA-derived maps optional | PDS Geosciences Node | Clay/sulfate units → science waypoints |
| L9 | Geologic units | Geologic | USGS-NASA Planetary Geologic Mapping Program (Gale/Mount Sharp maps) | USGS Astrogeology | Unit polygons, context |
| L10 | Rover traverse & stops | Ground truth | **MSL Curiosity** traverse & waypoints | NASA/JPL **MMGIS** GeoJSON, PDS Analyst's Notebook | "Proven path" overlay, known-safe terrain |
| L11 | Surface POV imagery | Optical (ground) | MSL Navcam / Mastcam / MAHLI | mars.nasa.gov raw image API, NASA Image & Video Library API (images-api.nasa.gov), PDS | Waypoint previews, HUD picture-in-picture |
| L12 | Surface weather | Atmospheric | MSL **REMS** (temp, pressure, UV, wind, humidity) | mars.nasa.gov REMS feed / PDS Atmospheres Node | Conditions panel, EVA go/no-go |
| L13 | Dust / opacity | Atmospheric | MRO **MARCI** weekly weather reports, MCS, Mastcam tau | MSSS reports / PDS | Dust storm alerts, solar power & visibility |
| L14 | Surface radiation | Radiation | MSL **RAD** dose rates | PDS PPI Node + published RAD baselines | Dose-rate model, crew dose budget |
| L15 | Space weather events | Radiation / heliophysics | **DONKI** (CMEs, SEPs, flares incl. Mars-directed), MAVEN SEP | api.nasa.gov DONKI API | Live/replayed SEP alerts → "seek shelter" routing |
| L16 | Chemistry | Chemical | MSL ChemCam / APXS / CheMin results | PDS Geosciences Node | Point markers with composition at known targets |
| L17 | Sun / time | Ephemeris | Mars24 algorithm (NASA GISS) | Implemented locally (pure math) | Local Mean Solar Time, sunrise/sunset, sun azimuth/elevation, shadows |

**Attribution rule:** credit every layer to its mission/instrument in an in-app "DATA SOURCES" screen and the README. **Do not use the NASA insignia ("meatball"/"worm") or imply NASA endorsement** — Space Apps rules.

---

## 4. Product Modules

| ID | Module | Description |
|---|---|---|
| M0 | **Boot Sequence** | Retro terminal boot: system checks, data-link status ("DSN LINK · 12m 41s ONE-WAY LIGHT TIME"), loading layers, crew login (callsign only, no auth) |
| M1 | **Mission Select** | Choose site (Gale; Jezero stretch), mission profile (solo / buddy pair / rover-assisted), sol & local time |
| M2 | **Habitat Planning Console** | Main layered 2D map. Layer stack panel with opacity sliders, legend, readouts of lat/lon/elevation/slope/thermal inertia under cursor |
| M3 | **3D Terrain View** | HiRISE DTM mesh draped with orthoimage; route as glowing line; hazard extrusion; fly-through of the planned walk |
| M4 | **Route Navigator** | Pick habitat + waypoints → compute safe route; shows distance, elevation profile, max slope, ETA, O₂/power use, radiation dose, walk-back boundary; alternative routes (safest / fastest / most science) |
| M5 | **Site Dossier / Waypoint Cards** | Per-waypoint: science objective, instruments to carry, expected terrain, POV rover images, chemistry, hazards, estimated time on task |
| M6 | **Conditions Board** | Weather (REMS), dust opacity, UV, temperature curve, sun elevation, radiation dose rate, DONKI space-weather feed; computes **EVA GO / CAUTION / NO-GO** |
| M7 | **Helmet HUD (Visor Mode)** | Fighter-jet HUD over webcam; stereo VR-headset rendering; see Section 6 |
| M8 | **Field Tablet Mode** | Touch-first, high-contrast, glove-friendly (big targets) responsive layout of M4/M5/M6 |
| M9 | **EVA Log / Science Notebook** | Timestamped notes, waypoint check-offs, sample bag IDs, photos from webcam "suit camera"; export as JSON/PDF |
| M10 | **Alerts & Abort System** | Global alert bus: SEP event, dust storm, consumables low, off-route, slope exceed → audio klaxon + HUD master caution + auto "return to hab / nearest shelter" route |
| M11 | **Data Sources & Credits** | Full layer provenance, resolutions, dates, links |

---

## 5. Retro Design System

**Direction:** *1970s–80s mission-control CRT meets Cold-War fighter avionics.* Viking-era NASA documentation + vector-display HUDs + phosphor terminals. Everything feels like it runs on a ruggedized CRT inside a habitat.

- **Palette (CSS tokens):**
  - `--phosphor-amber` #FFB000 (primary text/lines)
  - `--phosphor-green` #33FF66 (HUD symbology, "safe")
  - `--mars-rust` #C1440E (map accents, terrain)
  - `--caution` #FFD23F · `--warning` #FF3B30 (master caution)
  - `--crt-black` #0A0806 · `--panel` #15110D · `--grid` rgba(255,176,0,0.12)
- **Type:** VT323 / Share Tech Mono for terminal text, a stencil-like display face (e.g. "Orbitron" or "Major Mono Display") for headers — all from Google Fonts.
- **Effects:** scanlines, subtle CRT curvature & bloom (CSS + optional WebGL post-process), phosphor persistence on moving lines, flicker on boot, noise grain; toggle "**REDUCED FX**" for accessibility/performance and `prefers-reduced-motion`.
- **UI furniture:** bezel frames with screw heads, rivets, hazard stripes, toggle switches & rotary-knob controls for layer opacity, segmented 7-seg readouts, dot-matrix status strips, teletype-style log.
- **Map styling:** map tiles rendered through a duotone/phosphor shader option ("CRT MAP MODE") vs. true-color mode for science.
- **Sound (optional, muted by default):** relay clicks, teletype, beeps, master-caution tone (Web Audio, generated — no copyrighted samples).
- **Accessibility:** contrast-checked amber/green on black; never encode hazard by colour alone (patterns + labels); keyboard navigable.

Deliverable: a `/design` style guide page showing every component.

---

## 6. HUD / "VR Visor" Mode (M7)

**Goal:** make a laptop/phone feel like a real helmet visor / fighter HUD, using the **webcam as the astronaut's eyes**, while no headset is available.

### 6.1 Rendering layers (bottom → top)
1. **Camera feed** — `getUserMedia` (rear camera on phones via `facingMode: "environment"`). Fallback when no camera/permission: a Mars panorama (Curiosity Mastcam 360) or the 3D terrain view from M3 as a "synthetic vision" feed.
2. **Mars grade shader (toggle)** — WebGL fragment shader: rust tint, haze by dust opacity (from L13), low-contrast sky — turns your room into "Mars".
3. **Synthetic vision overlay** — wireframe terrain horizon, route ribbon, waypoint diamonds projected into view using current heading/pitch.
4. **HUD symbology (canvas/SVG, phosphor green):**
   - Heading tape (top) with waypoint bearing caret
   - Pitch ladder + horizon line (from device orientation)
   - "Velocity vector" → **walk vector** marker
   - Waypoint box: name, range, ETA, bearing
   - Left tape: walking speed · Right tape: elevation / slope ahead
   - Bottom: suit vitals — O₂ %, CO₂ ppm, suit pressure, battery, heart rate (simulated), **radiation dose rate & cumulative dose**
   - Mini-map (rotating, north-up toggle), buddy-astronaut marker
   - Master CAUTION / WARNING annunciators; abort cue arrow back to hab
   - Mission clock: MET, LMST (Mars local time), sol, comm delay
5. **Helmet frame** — visor bezel, fog/condensation edges, slight vignette, scratches; optional breathing audio.

### 6.2 "VR headset" stereo mode
- Side-by-side stereo render (two viewports) with **barrel distortion + chromatic aberration** shader, lens vignette — works in a Google Cardboard-style phone holder.
- Small horizontal disparity on HUD symbology so it appears to float at a fixed depth.
- **Progressive enhancement:** if `navigator.xr` supports `immersive-ar`/`immersive-vr`, offer "ENTER XR" (real headset later, e.g. Quest browser) — same scene graph.

### 6.3 Inputs / motion
- **Phone:** `DeviceOrientationEvent` for heading/pitch/roll (with iOS permission request); Geolocation not used (we're "on Mars") — position is simulated along the route.
- **Desktop:** mouse-look + WASD to "walk" the route; or **AUTO-WALK** replays the planned EVA at real or accelerated time.
- **Voice (stretch):** Web Speech API — "next waypoint", "status", "mark sample".
- **Hand gestures (stretch):** MediaPipe Hands on the same webcam feed for pinch-to-select.

### 6.4 Privacy & permissions
- Camera stream stays on-device; nothing uploaded. Clear permission prompt screen explaining why. "Suit camera" snapshots only saved locally to the EVA log.

---

## 7. Route Navigator (pathfinding & EVA safety model)

### 7.1 Cost grid (per cell, ~1–5 m resolution from HiRISE DTM)
```
cost = base_distance
     × f_slope(slope°)            // 0–8° easy, 8–15° hard, 15–20° rover-no, >25° impassable for suited crew
     × f_rough(roughness)          // DTM local relief
     × f_rock(rock_abundance)      // rock density / boulders
     × f_soil(thermal_inertia)     // low TI → loose sand → slip/sink risk
     × f_crater(dist_to_rim)       // rim edges & steep walls masked
     × f_rad(exposure)             // optional: prefer routes near shelter during elevated SEP risk
+ penalty(elevation_gain)          // metabolic cost uphill
```
- **Hard masks:** slope > profile limit, crater interiors with steep walls, mapped dunes, cliff edges.
- **Algorithm:** A* (8-connected, octile heuristic) in a **Web Worker**; Theta*/path smoothing for natural lines; multi-objective variants (safest / fastest / max-science).
- **Mission profiles:** *Solo* (strict walk-back), *Buddy pair* (rescue-capable, shared kit), *Rover-assisted* (pressurized rover slope ≤ ~15°, longer range, walk segments at waypoints).

### 7.2 EVA budget model
- Suit + life support + payload mass (Mars g = 3.71 m/s²) → walking metabolic rate (Apollo/analog-derived parametric model, documented assumptions).
- O₂ / CO₂ scrubber / battery consumption vs. time & effort → **walk-back boundary**: the area from which the crew can always return to the hab with reserve (rendered as a shaded "safe return" polygon on the map).
- Radiation: baseline surface dose rate from RAD (~0.2–0.3 mGy/day order of magnitude; exact values from PDS), multiplied during SEP events → cumulative EVA dose vs. limit.
- Sun/thermal: Mars24 sun elevation → lighting, shadows, temperature window; EVA must end before sunset + margin.
- Outputs: distance, time, max slope, total ascent/descent, consumables at each waypoint, dose, GO/NO-GO per leg; **elevation profile chart** with hazard bands.

### 7.3 Dynamic re-routing
- Alert bus can trigger re-plan: SEP event → route to nearest shelter (ridge overhang / rover / hab); consumables low → direct return; user marks a new obstacle → cell masked & route recomputed.

---

## 8. Technical Architecture

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Fast, simple static deploy |
| UI | **React** (or Svelte — decide in Phase 0) | Component-heavy panels |
| 2D map | **OpenLayers** with custom Mars projection (IAU Mars 2000, equirectangular) consuming Mars Trek WMTS | Strong WMTS/projection support for non-Earth bodies |
| 3D terrain | **Three.js** (custom DTM heightfield mesh) — evaluate CesiumJS Mars ellipsoid as alternative | Full control over shaders, shared with HUD |
| HUD | Canvas 2D / SVG for symbology + Three.js/WebGL for camera post-processing & stereo distortion | Crisp vector lines + shader effects |
| Pathfinding | TypeScript A* in **Web Worker** over Float32/Uint8 grids | Non-blocking UI |
| Charts | Lightweight (uPlot or hand-rolled SVG) in retro style | Elevation profile, weather curves |
| State | Zustand (or Svelte stores) + an event bus for alerts | Simple, global alerts |
| Offline | **PWA** (service worker caches tiles & data packs) | On Mars there's no internet — the "data pack" concept is part of the story |
| Hosting | Static (GitHub Pages / Netlify / Vercel) — HTTPS required for webcam | Free & simple |
| Live APIs | Small optional serverless proxy for API keys (api.nasa.gov DEMO_KEY rate limits) & CORS | Keep keys out of client |

**Comms-delay realism:** live NASA feeds are labeled "EARTH UPLINK — DELAYED 12m 41s" with a computed one-way light time; the app works fully from the local data pack.

---

## 9. Data Pipeline (offline preprocessing, Python)

Located in `/pipeline`, run once to build the site **data pack**.

1. **Fetch** — scripts to download HiRISE DTM + orthoimage for the chosen Gale footprint, CTX tile extents, THEMIS TI, CRISM browse, crater catalog subset, MSL traverse GeoJSON, sample POV images + metadata, RAD/REMS summaries.
2. **Reproject & clip** — GDAL/rasterio to a common local grid (equirectangular, site-centred).
3. **Derive** — slope, aspect, roughness, hillshade, contours; rock/sand classification; crater rim buffers; hazard masks.
4. **Cost grid** — combine into per-profile cost rasters; export as compact binary (`.bin` Float32/Uint8 + JSON header) or 16-bit PNG.
5. **Tiles** — generate XYZ tiles for local high-res layers (gdal2tiles) for zoom levels beyond Mars Trek's.
6. **Terrain mesh** — downsampled heightfield (e.g. 512² / 1024²) + texture for Three.js.
7. **Manifest** — `site.json` listing layers, bounds, resolution, sources, dates, licenses.
8. **Validation** — sanity checks (no NaN holes, elevation ranges, CRS consistent) + a notebook preview.

Tools: Python 3.11, GDAL, rasterio, numpy, geopandas, Pillow. Document every source URL in the manifest.

---

## 10. Repository Structure (proposed)

```
martian-map/
├─ TASK-PLAN.md
├─ README.md
├─ app/                     # Vite + TS web app
│  ├─ public/
│  │  ├─ data/gale/         # generated data pack (tiles, grids, mesh, images, site.json)
│  │  └─ fonts/ sounds/
│  └─ src/
│     ├─ boot/              # M0 boot sequence
│     ├─ mission/           # M1 mission select, profiles
│     ├─ map/               # M2 OpenLayers map, layers, projection
│     ├─ terrain3d/         # M3 Three.js terrain
│     ├─ route/             # M4 pathfinding worker, cost model, EVA budget
│     ├─ dossier/           # M5 waypoint cards, POV gallery
│     ├─ conditions/        # M6 weather, radiation, DONKI, Mars24
│     ├─ hud/               # M7 camera, shaders, symbology, stereo, XR
│     ├─ tablet/            # M8 responsive layouts
│     ├─ log/               # M9 EVA log
│     ├─ alerts/            # M10 alert bus & abort routing
│     ├─ credits/           # M11 data sources
│     ├─ design/            # retro design system components + style guide
│     └─ lib/               # api clients, mars-time, geo math, units
├─ pipeline/                # Python preprocessing (Section 9)
└─ docs/                    # architecture notes, data provenance, demo script, screenshots
```

---

## 11. Task Breakdown by Phase

### Phase 0 — Research & Setup ✅ (2026-11-01; DONKI live feed down, POV images listed but not downloaded)
- [x] T0.1 Verify every data endpoint in Section 3 (availability, CORS, licensing, rate limits); record findings in `docs/data-sources.md`.
- [x] T0.2 Choose exact Gale EVA footprint where a **HiRISE DTM** exists and overlaps Curiosity's boxwork area; fix habitat coordinates and 5 science waypoints.
- [x] T0.3 Decide React vs Svelte; scaffold Vite + TS, lint/format, folder structure, git init.
- [x] T0.4 Get api.nasa.gov key (DONKI etc.); set up `.env` + optional proxy.
- [x] T0.5 Collect POV images (Navcam/Mastcam) near each waypoint with coordinates & credits.
- **Done when:** data-source doc complete, site & waypoints fixed, empty app runs locally.

### Phase 1 — Data Pipeline & Data Pack ✅ (2026-11-01; cost model lives in the app (Phase 4), the pack ships its inputs; CRISM/geologic units deferred to "Should")
- [x] T1.1 Fetch scripts (Section 9.1).
- [x] T1.2 Reproject/clip; derive slope/roughness/hillshade/contours.
- [x] T1.3 Hazard masks: craters (catalog + HiRISE digitized), rocks, soft sand (TI/dunes).
- [x] T1.4 Per-profile cost grids; export binary + manifest.
- [x] T1.5 Local XYZ tiles and Three.js heightfield.
- **Done when:** `app/public/data/gale/site.json` loads with ≥7 layers and passes validation.

### Phase 2 — Retro Design System ✅ (2026-11-01; design bench at `#/design`; tabs became MFD bezel keys)
- [x] T2.1 Tokens (colors, type, spacing), CRT effects (scanlines/bloom/flicker) + reduced-FX toggle.
- [x] T2.2 Components: bezel panel, knob/slider, toggle switch, 7-seg readout, teletype log, annunciator light, tabbed CRT screen, modal.
- [x] T2.3 `/design` style guide page.
- **Done when:** all components visible on style-guide page, contrast checked, keyboard accessible.

### Phase 3 — Boot, Mission Select & Planning Console (M0, M1, M2, M11)
- [ ] T3.1 Boot sequence animation with data-link checks.
- [ ] T3.2 Mission select (site, profile, sol/time).
- [ ] T3.3 OpenLayers Mars projection; Mars Trek basemap; local high-res tiles.
- [ ] T3.4 Layer stack panel (toggle, opacity, legend, provenance tooltip) for L1–L10, L16.
- [ ] T3.5 Cursor readout (lat/lon, elevation, slope, TI, unit); scale bar; graticule.
- [ ] T3.6 Data Sources & Credits screen.
- **Done when:** user can explore Gale site with ≥3 layer types blended and read values under cursor.

### Phase 4 — Route Navigator (M4)
- [ ] T4.1 A* Web Worker over cost grid; path smoothing.
- [ ] T4.2 Waypoint editing (click to add/drag/reorder), habitat marker.
- [ ] T4.3 Mission profile cost variants; safest/fastest/max-science alternatives.
- [ ] T4.4 EVA budget model (consumables, metabolic, dose, sun) + walk-back boundary polygon.
- [ ] T4.5 Route summary + elevation/hazard profile chart.
- [ ] T4.6 Unit tests for cost functions, A*, Mars24 time, EVA budget.
- **Done when:** route from hab through 5 waypoints avoids all hard-masked hazards, stays inside walk-back boundary, recomputes < 1 s.

### Phase 5 — Conditions & Alerts (M6, M10)
- [ ] T5.1 Mars24 time library (LMST, sol, sun position).
- [ ] T5.2 REMS weather + dust opacity panel (live with cached fallback).
- [ ] T5.3 RAD baseline dose model + DONKI SEP/CME feed (live + "replay historic event" mode, e.g. a known Mars-impacting SEP).
- [ ] T5.4 GO / CAUTION / NO-GO logic with explained reasons.
- [ ] T5.5 Alert bus, master caution audio/visual, auto abort/shelter re-route.
- **Done when:** replaying an SEP event triggers alert → shelter route within the UI and the HUD.

### Phase 6 — 3D Terrain & Site Dossier (M3, M5)
- [ ] T6.1 Three.js DTM mesh + orthoimage drape; route ribbon; waypoint pylons.
- [ ] T6.2 Fly-through camera along route.
- [ ] T6.3 Waypoint cards: objective, instruments, hazards, chemistry, POV image gallery with captions & credits.
- **Done when:** clicking a waypoint shows card + its rover POV images; 3D fly-through plays.

### Phase 7 — Helmet HUD / VR Visor (M7)
- [ ] T7.1 Camera pipeline (permissions UX, front/back camera, fallback feeds).
- [ ] T7.2 WebGL post-processing: Mars grade, dust haze, vignette, visor fog.
- [ ] T7.3 HUD symbology: heading tape, pitch ladder, walk vector, waypoint box, tapes, vitals, dose, mini-map, annunciators, clocks.
- [ ] T7.4 Orientation input (DeviceOrientation + iOS permission) and desktop mouse-look/WASD; AUTO-WALK replay along route.
- [ ] T7.5 Project route & waypoints into view (bearing/range from simulated position).
- [ ] T7.6 Stereo split-screen + barrel distortion + chromatic aberration (Cardboard mode).
- [ ] T7.7 Helmet frame art (original, SVG) + optional ambient audio.
- [ ] T7.8 WebXR "ENTER XR" progressive enhancement (stretch).
- **Done when:** on a phone in landscape, stereo HUD over rear camera tracks head turns and points to the next waypoint at ≥ 30 fps.

### Phase 8 — Field Tablet, EVA Log, PWA (M8, M9)
- [ ] T8.1 Touch/glove-friendly responsive layouts.
- [ ] T8.2 EVA log with suit-camera snapshots, sample IDs, export JSON/PDF.
- [ ] T8.3 Service worker + offline data pack caching; "DATA PACK SYNCED" indicator.
- **Done when:** app works in airplane mode after first load.

### Phase 9 — Polish, Testing & Submission
- [ ] T9.1 Performance pass (tile caching, worker offload, FX quality levels).
- [ ] T9.2 Cross-device test: Chrome/Edge/Firefox/Safari desktop; Android Chrome; iOS Safari (camera + orientation).
- [ ] T9.3 Accessibility pass (contrast, keyboard, reduced motion, captions on audio alerts).
- [ ] T9.4 README, data provenance, architecture diagram, screenshots.
- [ ] T9.5 Demo video (≤ 30 s project summary + full walkthrough) and Space Apps submission page content.
- [ ] T9.6 Deploy to HTTPS static host.

---

## 12. Priorities

**MVP (must exist for the demo)**
- Gale site data pack with ≥ 3 data types (optical HiRISE/CTX, topographic DTM/slope, thermal THEMIS) + crater/rock hazards
- Retro planning console with layer stack & readouts
- A* route navigator with walk-back boundary & elevation profile
- Conditions board with radiation + weather (cached data OK)
- Webcam HUD with core symbology (heading, waypoint, vitals, dose, caution) and stereo VR mode

**Should**
- CRISM mineralogy + geologic units + MSL traverse + chemistry markers
- POV image waypoint cards
- DONKI SEP replay → abort/shelter re-route
- 3D terrain fly-through
- PWA offline mode, field tablet layout

**Stretch**
- Jezero second site (proves "map generator" system)
- WebXR headset mode, voice commands, MediaPipe hand gestures
- Two-astronaut buddy tracking & shared route
- Pressurized-rover leg simulation

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| NASA API retired / CORS blocked / rate-limited | Bundled data pack; optional proxy; "cached at <date>" labels |
| HiRISE DTM files are large (hundreds of MB) | Clip & downsample in pipeline; ship only site footprint |
| Mars projection complexity in web map libs | OpenLayers custom projection; fall back to simple local planar grid for the EVA site (few km — negligible distortion) |
| Webcam unavailable / denied / non-HTTPS | Synthetic vision & panorama fallback; HTTPS deploy |
| iOS orientation permission & camera quirks | Explicit "ENABLE SENSORS" button; test early (Phase 7 start) |
| HUD performance on phones | Quality presets; render symbology at reduced rate; disable bloom |
| Scientific validity of EVA cost/metabolic model | Document assumptions & sources; present as planning estimate; show uncertainty |
| Retro FX hurting readability | Reduced-FX toggle, contrast checks, true-color science mode |
| Branding/licensing | No NASA logos; credit all data; original art & sounds only |

---

## 14. Demo Script & Submission Deliverables

**Demo flow (~3 min):**
1. Boot sequence → mission select "ARES-1 · EVA 07 · Buddy pair · Sol 14, 09:30 LMST".
2. Planning console: stack HiRISE + slope + THEMIS + craters + CRISM; show readouts.
3. Plan route through 5 boxwork/sulfate waypoints; show safest vs fastest; walk-back boundary; elevation profile.
4. Open waypoint card: Curiosity's real POV image of the boxwork + chemistry.
5. Conditions: GO. Then replay a historical SEP event → MASTER CAUTION → automatic shelter route.
6. Put phone in a Cardboard holder → stereo HUD over webcam, Mars-graded; turn head to find waypoint caret; AUTO-WALK shows range counting down.

**Deliverables:** deployed URL, GitHub repo, README with data credits, 30-second summary video, demo video, screenshots, Space Apps project description.

---

## 15. Open Questions (to confirm before implementation)
1. **Site:** Gale Crater / Mount Sharp boxwork (recommended) — or do you prefer Jezero Crater?
2. **Framework:** React (bigger ecosystem) or Svelte (lighter, faster to write)? Default: React + TypeScript.
3. **Team size & deadline:** how many people and how many hours are available? This decides how far past MVP we go.
4. **Target demo device:** laptop webcam only, or also a phone in a Cardboard-style viewer?
5. **Retro flavour:** amber CRT mission-control, green-phosphor fighter HUD, or both (amber console + green HUD — current plan)?
6. **Python pipeline:** OK to require Python/GDAL locally to build the data pack, or should all preprocessing ship as pre-built files in the repo?
