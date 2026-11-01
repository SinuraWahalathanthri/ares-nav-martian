# Data Sources — Phase 0 Verification

Checked on **2026-11-01** from a local machine with an `Origin: http://localhost:5173` header (to test browser CORS).
Status key: ✅ works from the browser · 🟡 works, but only through the offline pipeline (no CORS / large file) · ❌ unavailable.

## Live / tile services

| Layer (plan §3) | Endpoint | Status | Notes |
|---|---|---|---|
| L1 MOLA color hillshade | `trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m` | ✅ | WMTS, JPEG, CORS `*` |
| L1 Viking color mosaic | `.../Mars_Viking_MDIM21_ClrMosaic_global_232m` | ✅ | WMTS, JPEG |
| L1 CTX Gale mosaic | `.../Gale_CTX_BlockAdj_dd` | ✅ | PNG, 15 zoom levels, bbox 135.18–139.24°E, −6.57 to −2.81° |
| L1 CTX Curiosity site | `.../curiosity_ctx_mosaic` | ✅ | PNG, 13 levels |
| L2 HiRISE Curiosity site | `.../curiosity_hirise_mosaic` | ✅ | PNG; **z16 (~0.6 m/px) confirmed over the boxwork** (ridges clearly visible); z17/z18 return 404 at the site |
| L3 HiRISE Gale DEM 1 m | `.../Gale_DEM_SMG_1m` | ✅ | PNG tiles (visual); real elevations come from the USGS GeoTIFF below |
| L5 THEMIS day / night IR | `.../THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018`, `.../THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018` (the older `Mars_MO_THEMIS-IR-*` names return 404) | ✅ | Same `default028mm` grid as other layers, but the **maximum zoom is 9** (~81 m/px at the site); z10+ returns 404. Fetched into the data pack by `pipeline/fetch.py` |
| L6 TES albedo | `.../Mars_MGS_TES_Albedo_mosaic_global_7410m` | ✅ | Coarse (7.4 km) context only |
| Trek catalog search | `trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?key=…` | ✅ | Solr JSON; used to discover the layer IDs above |
| L10 MSL waypoints | `mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` | ✅ | 1,386 GeoJSON points, latest sol 5045; lat/lon/elevation/roll/pitch/yaw per stop |
| L10 MSL traverse | `.../MSL_traverse.json` | ✅ | 1.36 MB GeoJSON line |
| L11 Raw images (MSL) | `mars.nasa.gov/api/v1/raw_image_items/?condition_1=msl:mission&condition_2=<sol>:sol:gte&condition_3=<sol>:sol:lte` | ✅ | JSON, CORS `*`; includes camera pointing (`mast_az`, `mast_el`), LMST, rover site/drive. 288 images on sol 4722 |
| L11 Mars Rover Photos API | `api.nasa.gov/mars-photos/...` | ❌ | 404 — retired. Use raw_image_items above |
| L11 NASA Image & Video Library | `images-api.nasa.gov/search?q=boxwork` | ✅ | 9 hits incl. PIA26559 (first 360° boxwork view), PIA26558, PIA26680, PIA26306 (HiRISE boxwork) |
| L12 REMS weather | `mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` | ✅ | 4,745 sols; latest sol 4995 (2026-08-25): min/max air & ground temp, pressure, UV, sunrise/sunset. Wind and humidity mostly `--` |
| L15 DONKI space weather | `api.nasa.gov/DONKI/SEP`, `kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/...` | ❌ today | `api.nasa.gov` returned **503** and the CCMC host timed out on every try (key and no-key). Plan: bundle historical events (below) and retry live in Phase 5 |

## Offline pipeline sources

| Layer | Source | Status | Notes |
|---|---|---|---|
| L3 Gale merged DEM, 1 m | `asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif` (via planetarymaps.usgs.gov redirect) | 🟡 | 3.87 GB GeoTIFF, Float32, equirectangular, R = 3,396,190 m. **HTTP range requests work**, so Phase 1 reads only the site window |
| L2 Gale orthophoto, 25 cm | `.../MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif` | 🟡 | 24.4 GB GeoTIFF, range requests work. Gives zoom beyond Trek's z16 |
| L7 Crater catalog | USGS Astrogeology — Robbins 2012 crater database | 🟡 | Page reachable; catalog only goes down to ~1 km, so small site craters will be digitized from HiRISE |
| L8 CRISM | PDS Geosciences Node (`pds-geosciences.wustl.edu/missions/mro/crism.htm`) | 🟡 | Reachable, no CORS. Choose MTRDR products over the site in Phase 1 |
| L14 RAD | PDS PPI Node (`pds-ppi.igpp.ucla.edu`) | 🟡 | Reachable. Use published RAD baselines for the dose model |
| L16 Chemistry | PDS Analyst's Notebook (`an.rsl.wustl.edu/msl/`) | 🟡 | Reachable, no CORS |
| HiRISE DTM index | `uahirise.org/dtm/` | 🟡 | Reachable. Not needed for the primary site because the USGS 1 m merged DEM covers it |

## Space-weather fallback

Live DONKI is down, so the demo replays a historical event. Candidate: the **May 2024** solar storm, which reached Mars and was recorded by Curiosity's RAD and by MAVEN. Before Phase 5, confirm the exact dose numbers against NASA's JPL news release and the RAD PDS data, then store the event in the data pack as JSON.

## Tooling

- **Python 3.14** is installed. `rasterio 1.5.2` ships Windows wheels for cp314 with GDAL bundled, so **no system GDAL install is needed** for Phase 1.
- `numpy`, `pillow` and `tifffile` are already installed.
- Node 24 / npm 11 for the app.

## Rules

- Credit every layer to its mission and instrument in the app's DATA SOURCES screen.
- No NASA insignia or implied endorsement (Space Apps rules).
