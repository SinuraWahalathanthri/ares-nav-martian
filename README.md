# ARES//NAV — Interplanetary Survival Guide: Martian Map

NASA Space Apps Challenge 2026. A retro-styled EVA planning and helmet-HUD web app for a crewed traverse of the boxwork region on Mount Sharp, Gale Crater, built from NASA mission data.

- Plan: [TASK-PLAN.md](TASK-PLAN.md)
- Data source verification: [docs/data-sources.md](docs/data-sources.md)
- Site and waypoints: [docs/site-selection.md](docs/site-selection.md)

## Run the app

```bash
cd app
npm install
npm run dev
```

Optional: copy `app/.env.example` to `app/.env.local` and add a free key from https://api.nasa.gov.

## Status
Phases 0–3 complete: data sources verified, site chosen, data pack built (`pipeline/`), retro design system (`#/design`), and the boot → mission select → planning console flow with a 16-layer map, terrain readout and data credits (`#/credits`). Next: Phase 4, the route navigator.

Data credits: NASA/JPL-Caltech, MSSS, University of Arizona (HiRISE), ASU (THEMIS), USGS Astrogeology, NASA Mars Trek. This project is not endorsed by NASA.
