"""T1.2–T1.5 — Turn the cached rasters into the app's data pack (app/public/data/gale).

Inputs (from fetch.py): .cache/dem_1m.tif, .cache/ortho_25cm.tif, .cache/themis_{day,night}_ir.tif,
.cache/msl_waypoints.json, .cache/msl_traverse.json

Outputs:
  grids/*.bin        2 m navigation grids (raw little-endian, row-major, north-up) for routing & readouts
  overlays/*.png|jpg display images covering the site bbox
  tiles/{z}/{y}/{x}.jpg  orthophoto pyramid (0.5 m → 8 m)
  terrain/height.bin + texture.jpg  heightfield for the 3D view
  vectors/*.geojson  craters, sand patches, Curiosity traverse & stops
  site.json          manifest describing all of the above

Hazard detection is heuristic (documented per layer in site.json) — this is a planning aid, not
a certified hazard map.
"""

import json
import math
import shutil

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import from_bounds
from scipy import ndimage as ndi

from config import BBOX, CACHE, CENTER, M_PER_DEG, OUT, SITE_ID, X_SCALE

Image.MAX_IMAGE_PIXELS = None

# --- Walkability thresholds (suited crew, see TASK-PLAN §7.1) ------------------------------
SLOPE_HARD = 15.0  # degrees: hard going; pressurized-rover limit
SLOPE_MAX = 25.0  # degrees: impassable on foot
ROUGH_HAZARD_M = 0.35  # local relief RMS that marks blocky / rocky ground
CRATER_MIN_DEPTH_M = 1.0

# Hazard bitmask (grids/hazard.bin)
H_STEEP, H_IMPASSABLE, H_ROCKY, H_SAND, H_CRATER, H_RIM = 1, 2, 4, 8, 16, 32

NAV_RES = 2  # metres per navigation-grid cell


def block_mean(a: np.ndarray, f: int) -> np.ndarray:
    h, w = (a.shape[0] // f) * f, (a.shape[1] // f) * f
    out = np.empty((h // f, w // f), dtype=np.float32)
    step = 256  # rows of output per chunk keeps peak memory low for the 25 cm ortho
    for r in range(0, h // f, step):
        blk = a[r * f : min(h, (r + step) * f), :w].astype(np.float32)
        out[r : r + blk.shape[0] // f] = blk.reshape(blk.shape[0] // f, f, w // f, f).mean(axis=(1, 3))
    return out


def block_max(a: np.ndarray, f: int) -> np.ndarray:
    h, w = (a.shape[0] // f) * f, (a.shape[1] // f) * f
    return a[:h, :w].reshape(h // f, f, w // f, f).max(axis=(1, 3))


def local_std(a: np.ndarray, size: int) -> np.ndarray:
    m = ndi.uniform_filter(a, size)
    m2 = ndi.uniform_filter(a * a, size)
    return np.sqrt(np.maximum(m2 - m * m, 0))


def save_bin(name: str, arr: np.ndarray) -> dict:
    path = OUT / "grids" / f"{name}.bin"
    arr.astype(arr.dtype.newbyteorder("<")).tofile(path)
    return {"file": f"grids/{name}.bin", "dtype": str(arr.dtype), "width": arr.shape[1], "height": arr.shape[0]}


def colorize(v: np.ndarray, stops: list[tuple[float, tuple[int, int, int, int]]]) -> np.ndarray:
    """Piecewise-linear RGBA colour ramp."""
    xs = np.array([s[0] for s in stops], dtype=np.float32)
    rgba = np.zeros(v.shape + (4,), dtype=np.uint8)
    for ch in range(4):
        rgba[..., ch] = np.interp(v, xs, [s[1][ch] for s in stops]).astype(np.uint8)
    return rgba


def pix_to_lonlat(transform, row: float, col: float) -> tuple[float, float]:
    x, y = transform * (col + 0.5, row + 0.5)
    return x / M_PER_DEG, y / M_PER_DEG


def lonlat_to_pix(transform, lon: float, lat: float) -> tuple[int, int]:
    col, row = ~transform * (lon * M_PER_DEG, lat * M_PER_DEG)
    return int(row), int(col)


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    for d in ("grids", "overlays", "tiles", "terrain", "vectors"):
        (OUT / d).mkdir(parents=True)

    # ---------------------------------------------------------------- DEM (1 m)
    with rasterio.open(CACHE / "dem_1m.tif") as src:
        dem = src.read(1).astype(np.float32)
        tf = src.transform
        crs_wkt = src.crs.to_wkt()
        bounds = src.bounds
    h, w = dem.shape
    dx, dy = abs(tf.a) * X_SCALE, abs(tf.e)  # ground metres per pixel
    print(f"DEM {w}x{h}, elev {dem.min():.0f}..{dem.max():.0f} m")

    zs = ndi.gaussian_filter(dem, 1.0)
    # Walkability slope over a ~5 m baseline (σ = 2 m): suit-stride scale, and it suppresses
    # single-pixel DEM spikes. Checked against Curiosity's traverse (p95 ≈ 16°).
    gy, gx = np.gradient(ndi.gaussian_filter(dem, 2.0), dy, dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    rough = local_std(dem - ndi.gaussian_filter(dem, 3.0), 5).astype(np.float32)

    az, alt = math.radians(315), math.radians(35)
    aspect = np.arctan2(-gx, gy)
    sl = np.arctan(np.hypot(gx, gy))
    hill = np.clip(math.sin(alt) * np.cos(sl) + math.cos(alt) * np.sin(sl) * np.cos(az - aspect), 0, 1)

    # ---------------------------------------------------------------- craters
    # Closing fills depressions narrower than the structuring element; the fill depth marks
    # bowl-shaped lows. Keep compact, roughly circular ones to reject linear boxwork hollows.
    depth = np.zeros_like(zs)
    for size in (21, 61, 121):
        depth = np.maximum(depth, ndi.grey_closing(zs, size=(size, size)) - zs)
    lab, n = ndi.label(depth > CRATER_MIN_DEPTH_M)
    craters = []
    crater_mask = np.zeros_like(dem, dtype=bool)
    rim_mask = np.zeros_like(dem, dtype=bool)
    for i, sl_ in enumerate(ndi.find_objects(lab), start=1):
        reg = lab[sl_] == i
        area = reg.sum() * dx * dy
        bh, bw = (sl_[0].stop - sl_[0].start) * dy, (sl_[1].stop - sl_[1].start) * dx
        diam = math.sqrt(4 * area / math.pi)
        if not (8 <= diam <= 250):
            continue
        fill = area / (bh * bw)  # a disk fills ~0.785 of its bounding box
        elong = max(bh, bw) / max(min(bh, bw), 1)
        if fill < 0.55 or elong > 1.6:
            continue
        d = float(depth[sl_][reg].max())
        cy, cx = ndi.center_of_mass(reg)
        lon, lat = pix_to_lonlat(tf, sl_[0].start + cy, sl_[1].start + cx)
        craters.append(dict(lat=lat, lon=lon, diameter_m=round(diam, 1), depth_m=round(d, 2), d_over_D=round(d / diam, 3)))
        crater_mask[sl_] |= reg
    # Rim hazard: a ring 25 % of the radius outside each crater.
    if craters:
        dist_out = ndi.distance_transform_edt(~crater_mask, sampling=(dy, dx))
        rim_mask = (dist_out > 0) & (dist_out < 0.25 * np.median([c["diameter_m"] for c in craters]) / 2 + 2)
    print(f"craters: {len(craters)} kept of {n} depressions")

    # ---------------------------------------------------------------- orthophoto
    with rasterio.open(CACHE / "ortho_25cm.tif") as src:
        win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        ortho = src.read(1, window=win, boundless=True, fill_value=0)
    f = ortho.shape[0] // h  # 4 for 25 cm → 1 m
    ortho = ortho[: h * f, : w * f]
    ortho_1m = block_mean(ortho, f)
    # Texture: sub-metre brightness variance inside each 1 m cell (boulders, blocky outcrop).
    texture = np.sqrt(np.maximum(block_mean(ortho.astype(np.float32) ** 2, f) - ortho_1m**2, 0))
    print(f"ortho {ortho.shape[1]}x{ortho.shape[0]} → texture grid {texture.shape}")

    bright = ortho_1m - ndi.gaussian_filter(ortho_1m, 60)
    bright /= max(bright.std(), 1e-6)
    tex_s = ndi.uniform_filter(texture, 7)
    tex_n = tex_s / max(np.percentile(tex_s, 50), 1e-6)

    # Rocky: high sub-metre texture AND high DEM relief, smoothed into a density.
    rocky_px = (tex_n > 1.8) & (rough > ROUGH_HAZARD_M * 0.6)
    rock_density = ndi.uniform_filter(rocky_px.astype(np.float32), 11)
    rocky_mask = rock_density > 0.35

    # Sand: dark, smooth, gentle ground; cleaned and size-filtered.
    sand_px = (bright < -0.8) & (tex_n < 0.8) & (slope < 12)
    sand_px = ndi.binary_opening(sand_px, iterations=2)
    lab_s, ns = ndi.label(sand_px)
    sizes = ndi.sum(sand_px, lab_s, index=np.arange(1, ns + 1)) * dx * dy
    keep = np.zeros(ns + 1, dtype=bool)
    keep[1:] = sizes >= 300
    sand_mask = keep[lab_s]
    sand_patches = []
    for i in np.nonzero(keep)[0]:
        cy, cx = ndi.center_of_mass(lab_s == i)
        lon, lat = pix_to_lonlat(tf, cy, cx)
        sand_patches.append(dict(lat=lat, lon=lon, area_m2=round(float(sizes[i - 1]))))
    print(f"sand patches: {len(sand_patches)}; rocky cells: {rocky_mask.mean() * 100:.1f}%")

    # ---------------------------------------------------------------- THEMIS (81 m → 1 m)
    themis = {}
    for key in ("day", "night"):
        with rasterio.open(CACHE / f"themis_{key}_ir.tif") as src:
            a = src.read(1).astype(np.float32)
            t = src.transform
        # Bilinear sample at every DEM pixel centre.
        cols = (np.arange(w) + 0.5) * tf.a + tf.c
        rows = (np.arange(h) + 0.5) * tf.e + tf.f
        cc = (cols - t.c) / t.a - 0.5
        rr = (rows - t.f) / t.e - 0.5
        themis[key] = ndi.map_coordinates(a, np.meshgrid(rr, cc, indexing="ij"), order=1, mode="nearest").astype(np.float32)

    # ---------------------------------------------------------------- hazard bitmask (1 m)
    haz = np.zeros(dem.shape, dtype=np.uint8)
    haz |= np.where(slope > SLOPE_HARD, H_STEEP, 0).astype(np.uint8)
    haz |= np.where(slope > SLOPE_MAX, H_IMPASSABLE, 0).astype(np.uint8)
    haz |= np.where(rocky_mask, H_ROCKY, 0).astype(np.uint8)
    haz |= np.where(sand_mask, H_SAND, 0).astype(np.uint8)
    haz |= np.where(crater_mask, H_CRATER, 0).astype(np.uint8)
    haz |= np.where(rim_mask & ~crater_mask, H_RIM, 0).astype(np.uint8)

    # ---------------------------------------------------------------- 2 m navigation grids
    r = NAV_RES
    elev_nav = block_mean(dem, r)
    zmin, zmax = float(elev_nav.min()), float(elev_nav.max())
    zscale = (zmax - zmin) / 65535
    grids = {
        "elevation": save_bin("elevation", np.round((elev_nav - zmin) / zscale).astype(np.uint16))
        | {"decode": f"value * {zscale:.8f} + {zmin:.3f}", "units": "m (areoid)"},
        "slope": save_bin("slope", np.clip(np.round(block_max(slope, r) * 4), 0, 255).astype(np.uint8))
        | {"decode": "value / 4", "units": "degrees (max within cell)"},
        "roughness": save_bin("roughness", np.clip(np.round(block_mean(rough, r) * 100), 0, 255).astype(np.uint8))
        | {"decode": "value / 100", "units": "m RMS local relief"},
        "rock_density": save_bin("rock_density", np.clip(np.round(block_mean(rock_density, r) * 255), 0, 255).astype(np.uint8))
        | {"decode": "value / 255", "units": "fraction of rocky ground (heuristic)"},
        "thermal_night": save_bin("thermal_night", np.clip(np.round(block_mean(themis["night"], r)), 0, 255).astype(np.uint8))
        | {"decode": "value", "units": "THEMIS night IR brightness (thermal inertia proxy, 0–255)"},
        "hazard": save_bin("hazard", block_max(haz, r))  # OR within the cell
        | {
            "decode": "bitmask",
            "bits": {"steep": H_STEEP, "impassable": H_IMPASSABLE, "rocky": H_ROCKY, "sand": H_SAND, "crater": H_CRATER, "rim": H_RIM},
        },
    }
    nav_h, nav_w = elev_nav.shape

    # ---------------------------------------------------------------- overlays
    def save_png(name, rgba_or_l, quality=None):
        img = Image.fromarray(rgba_or_l)
        path = OUT / "overlays" / name
        if name.endswith(".jpg"):
            img.convert("L" if rgba_or_l.ndim == 2 else "RGB").save(path, quality=quality or 85, optimize=True)
        else:
            img.save(path, optimize=True)
        return f"overlays/{name}"

    overlays = {}
    overlays["hillshade"] = save_png("hillshade.jpg", (hill * 255).astype(np.uint8))
    slope_nav = block_max(slope, r)
    overlays["slope"] = save_png(
        "slope.png",
        colorize(slope_nav, [(0, (51, 255, 102, 0)), (5, (51, 255, 102, 70)), (10, (255, 210, 63, 150)), (15, (255, 176, 0, 190)), (25, (255, 59, 48, 220)), (40, (255, 59, 48, 255))]),
    )
    rough_nav = block_mean(rough, r)
    overlays["roughness"] = save_png("roughness.png", colorize(rough_nav, [(0, (255, 176, 0, 0)), (0.1, (255, 176, 0, 40)), (0.35, (255, 176, 0, 170)), (0.8, (255, 59, 48, 230))]))
    elev_n = (elev_nav - zmin) / (zmax - zmin)
    overlays["elevation"] = save_png("elevation.png", colorize(elev_n, [(0, (40, 12, 4, 255)), (0.35, (193, 68, 14, 255)), (0.7, (255, 176, 0, 255)), (1, (255, 240, 200, 255))]))
    # Contours: minor every 5 m, major every 25 m (1 m resolution, alpha mask).
    def contour(step):
        q = np.floor(zs / step)
        return (q != np.roll(q, 1, 0)) | (q != np.roll(q, 1, 1))
    cont = np.zeros(dem.shape + (4,), dtype=np.uint8)
    cont[contour(5)] = (255, 176, 0, 110)
    cont[contour(25)] = (255, 176, 0, 230)
    cont[0, :] = cont[:, 0] = 0
    overlays["contours"] = save_png("contours.png", cont)
    hz = block_max(haz, r)
    hz_rgba = np.zeros(hz.shape + (4,), dtype=np.uint8)
    hz_rgba[(hz & H_STEEP) > 0] = (255, 210, 63, 110)
    hz_rgba[(hz & H_ROCKY) > 0] = (255, 140, 0, 170)
    hz_rgba[(hz & H_SAND) > 0] = (120, 160, 255, 170)
    hz_rgba[(hz & H_RIM) > 0] = (255, 90, 60, 170)
    hz_rgba[(hz & (H_IMPASSABLE | H_CRATER)) > 0] = (255, 59, 48, 230)
    overlays["hazards"] = save_png("hazards.png", hz_rgba)
    for key in ("day", "night"):
        t = block_mean(themis[key], r)
        lo, hi = np.percentile(t, [1, 99])
        overlays[f"thermal_{key}"] = save_png(
            f"thermal_{key}.png",
            colorize(np.clip((t - lo) / max(hi - lo, 1), 0, 1), [(0, (20, 0, 60, 200)), (0.4, (160, 20, 90, 200)), (0.75, (255, 120, 0, 200)), (1, (255, 240, 120, 200))]),
        )
    overlays["ortho"] = save_png("ortho_1m.jpg", np.clip(ortho_1m, 0, 255).astype(np.uint8), quality=82)

    # ---------------------------------------------------------------- orthophoto tile pyramid
    # Tile grid in the rasters' projected metres, origin at the top-left of the DEM bounds.
    tile_px = 256
    base_res = 0.5
    ortho_05 = block_mean(ortho, 2) if f == 4 else ortho_1m
    levels = []  # resolution per z, coarsest first
    img = ortho_05
    res = base_res
    zlevels = []
    while True:
        zlevels.append((res, img))
        if max(img.shape) <= tile_px:
            break
        img = block_mean(img, 2)
        res *= 2
    zlevels.reverse()  # z0 = coarsest
    for z, (res, img) in enumerate(zlevels):
        th, tw = math.ceil(img.shape[0] / tile_px), math.ceil(img.shape[1] / tile_px)
        for ty in range(th):
            (OUT / "tiles" / str(z) / str(ty)).mkdir(parents=True, exist_ok=True)
            for tx in range(tw):
                tile = np.zeros((tile_px, tile_px), dtype=np.uint8)
                part = img[ty * tile_px : (ty + 1) * tile_px, tx * tile_px : (tx + 1) * tile_px]
                tile[: part.shape[0], : part.shape[1]] = np.clip(part, 0, 255).astype(np.uint8)
                Image.fromarray(tile).save(OUT / "tiles" / str(z) / str(ty) / f"{tx}.jpg", quality=80)
        levels.append(res)
    print(f"ortho tiles: {len(levels)} levels, {levels[0]}–{levels[-1]} m/px")

    # ---------------------------------------------------------------- terrain mesh
    mesh_n = 1024
    zoom = mesh_n / max(h, w)
    hm = ndi.zoom(dem, zoom, order=1)[:mesh_n, :mesh_n]
    hmin, hmax = float(hm.min()), float(hm.max())
    hscale = (hmax - hmin) / 65535
    np.round((hm - hmin) / hscale).astype("<u2").tofile(OUT / "terrain" / "height.bin")
    tex = Image.fromarray(np.clip(ndi.zoom(ortho_1m, 2048 / max(h, w), order=1), 0, 255).astype(np.uint8))
    tex.save(OUT / "terrain" / "texture.jpg", quality=85)

    # ---------------------------------------------------------------- vectors
    def fc(features):
        return {"type": "FeatureCollection", "features": features}

    def pt(lon, lat, props):
        return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]}, "properties": props}

    (OUT / "vectors" / "craters.geojson").write_text(json.dumps(fc([pt(c["lon"], c["lat"], c) for c in craters])), encoding="utf-8")
    (OUT / "vectors" / "sand.geojson").write_text(json.dumps(fc([pt(s["lon"], s["lat"], s) for s in sand_patches])), encoding="utf-8")

    inside = lambda lon, lat: BBOX["min_lon"] <= lon <= BBOX["max_lon"] and BBOX["min_lat"] <= lat <= BBOX["max_lat"]
    stops = []
    for feat in json.loads((CACHE / "msl_waypoints.json").read_text(encoding="utf-8"))["features"]:
        p = feat["properties"]
        if inside(p["lon"], p["lat"]):
            stops.append(pt(p["lon"], p["lat"], {k: p[k] for k in ("sol", "site", "drive", "elev_geoid", "dist_km")}))
    (OUT / "vectors" / "msl_stops.geojson").write_text(json.dumps(fc(stops)), encoding="utf-8")
    trav = json.loads((CACHE / "msl_traverse.json").read_text(encoding="utf-8"))
    clipped = []
    for feat in trav["features"]:
        geom = feat["geometry"]
        lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        for line in lines:
            seg = [[round(c[0], 7), round(c[1], 7)] for c in line if inside(c[0], c[1])]
            if len(seg) > 1:
                clipped.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": seg}, "properties": {k: v for k, v in feat["properties"].items() if isinstance(v, (int, float, str))}})
    (OUT / "vectors" / "msl_traverse.geojson").write_text(json.dumps(fc(clipped)), encoding="utf-8")

    # ---------------------------------------------------------------- manifest
    proj_bounds = [bounds.left, bounds.bottom, bounds.right, bounds.top]
    manifest = {
        "id": SITE_ID,
        "name": "Gale Crater · Mount Sharp Boxwork",
        "generated": __import__("datetime").date.today().isoformat(),
        "center": {"lat": CENTER[0], "lon": CENTER[1]},
        "bounds": {
            "lonlat": [b / M_PER_DEG for b in proj_bounds],
            "projected": proj_bounds,
            "crs": "Mars 2000 sphere, equirectangular, standard parallel 0 (IAU 49910 equivalent); metres = degrees × %.4f" % M_PER_DEG,
        },
        "ground_scale_x": X_SCALE,
        "elevation_range_m": [float(dem.min()), float(dem.max())],
        "nav_grid": {"resolution_m": NAV_RES, "width": nav_w, "height": nav_h, "origin": "top-left (north-west)", "layers": grids},
        "thresholds": {"slope_hard_deg": SLOPE_HARD, "slope_max_deg": SLOPE_MAX, "rough_hazard_m": ROUGH_HAZARD_M},
        "overlays": {k: {"file": v, "bounds_projected": proj_bounds} for k, v in overlays.items()},
        "ortho_tiles": {
            "url": "tiles/{z}/{y}/{x}.jpg",
            "tile_size": tile_px,
            "resolutions_m": levels,  # index = z
            "origin_projected": [bounds.left, bounds.top],
        },
        "terrain": {
            "height": "terrain/height.bin",
            "size": [hm.shape[1], hm.shape[0]],
            "dtype": "uint16",
            "decode": f"value * {hscale:.8f} + {hmin:.3f}",
            "texture": "terrain/texture.jpg",
            "extent_m": [w * dx, h * dy],
        },
        "vectors": {
            "craters": "vectors/craters.geojson",
            "sand": "vectors/sand.geojson",
            "msl_stops": "vectors/msl_stops.geojson",
            "msl_traverse": "vectors/msl_traverse.geojson",
        },
        "stats": {
            "craters": len(craters),
            "sand_patches": len(sand_patches),
            "rocky_pct": round(float(rocky_mask.mean() * 100), 2),
            "impassable_pct": round(float((slope > SLOPE_MAX).mean() * 100), 2),
            "steep_pct": round(float((slope > SLOPE_HARD).mean() * 100), 2),
        },
        "sources": [
            {"layer": "elevation, slope, roughness, contours, hillshade, craters", "data": "MSL Gale Merged DEM 1 m v3 (HRSC/CTX/HiRISE tied to MOLA)", "credit": "USGS Astrogeology / NASA / JPL-Caltech / University of Arizona", "url": "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m"},
            {"layer": "orthophoto, rock texture, sand", "data": "MSL Gale Merged Orthophoto Mosaic 25 cm v3 (MRO HiRISE)", "credit": "NASA / JPL-Caltech / University of Arizona / USGS", "url": "https://planetarymaps.usgs.gov/mosaic/Mars/MSL/"},
            {"layer": "thermal day/night", "data": "Mars Odyssey THEMIS IR controlled mosaics 100 m v2 (via Mars Trek)", "credit": "NASA / JPL-Caltech / Arizona State University", "url": "https://trek.nasa.gov/mars/"},
            {"layer": "Curiosity stops & traverse", "data": "MSL MMGIS waypoints and traverse", "credit": "NASA / JPL-Caltech", "url": "https://mars.nasa.gov/mmgis-maps/MSL/"},
        ],
        "method_notes": {
            "craters": "Depressions found by morphological closing (21/61/121 m) of the smoothed DEM; kept if ≥1 m deep, 8–250 m across and near-circular.",
            "rocky": "Sub-metre orthophoto brightness variance (>1.8× site median) coinciding with DEM relief; density over 11 m window >0.35.",
            "sand": "Dark (−0.8σ vs 60 m surroundings), smooth, <12° ground; patches ≥300 m².",
            "thermal": "THEMIS night IR brightness is a qualitative thermal-inertia proxy: bright at night = rock/bedrock, dark = loose fines.",
        },
    }
    (OUT / "site.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # Candidate science targets for the app's waypoint review (written to cache, not the app).
    (CACHE / "candidates.json").write_text(json.dumps({"craters": craters, "sand": sand_patches}, indent=1), encoding="utf-8")
    print("wrote", OUT / "site.json")


if __name__ == "__main__":
    main()
