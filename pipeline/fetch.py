"""T1.1 — Read the EVA-site window from the USGS Gale DEM (1 m) and orthophoto (25 cm),
plus THEMIS day/night IR tiles from Mars Trek.

Only the site window is downloaded, via HTTP range requests. Results are cached as
GeoTIFFs in pipeline/.cache so later steps run offline.

    python fetch.py            # both rasters
    python fetch.py dem        # just the DEM
"""

import io
import sys
import time
import urllib.request

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import Affine
from rasterio.windows import from_bounds

from config import BBOX, CACHE, DEM_URL, GDAL_ENV, M_PER_DEG, ORTHO_URL, bbox_projected

TREK = "https://trek.nasa.gov/tiles/Mars/EQ"


def fetch(url: str, dest_name: str) -> None:
    dest = CACHE / dest_name
    if dest.exists():
        print(f"[skip] {dest.name} already cached")
        return
    t0 = time.time()
    with rasterio.Env(**GDAL_ENV), rasterio.open(url) as src:
        win = from_bounds(*bbox_projected(), transform=src.transform).round_offsets().round_lengths()
        print(f"[read] {dest_name}: {win.width}x{win.height} px at {src.res[0]} m from {url.rsplit('/', 1)[-1]}")
        data = src.read(1, window=win)
        profile = src.profile.copy()
        profile.update(
            driver="GTiff",
            width=win.width,
            height=win.height,
            transform=src.window_transform(win),
            compress="deflate",
            tiled=True,
            blockxsize=256,
            blockysize=256,
        )
    CACHE.mkdir(exist_ok=True)
    with rasterio.open(dest, "w", **profile) as dst:
        dst.write(data, 1)
    print(f"[done] {dest.name} in {time.time() - t0:.0f}s")


def fetch_trek_tiles(layer: str, z: int, dest_name: str) -> None:
    """Mosaic Mars Trek WMTS tiles covering the site and crop to the bbox (grayscale)."""
    dest = CACHE / dest_name
    if dest.exists():
        print(f"[skip] {dest.name} already cached")
        return
    deg = 360 / 2 ** (z + 1)  # tile size in degrees (default028mm: 2^(z+1) x 2^z tiles)
    c0, c1 = int((BBOX["min_lon"] + 180) // deg), int((BBOX["max_lon"] + 180) // deg)
    r0, r1 = int((90 - BBOX["max_lat"]) // deg), int((90 - BBOX["min_lat"]) // deg)
    mosaic = np.zeros(((r1 - r0 + 1) * 256, (c1 - c0 + 1) * 256), dtype=np.uint8)
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            url = f"{TREK}/{layer}/1.0.0/default/default028mm/{z}/{r}/{c}.png"
            with urllib.request.urlopen(url, timeout=60) as resp:
                tile = Image.open(io.BytesIO(resp.read())).convert("L")
            mosaic[(r - r0) * 256 : (r - r0 + 1) * 256, (c - c0) * 256 : (c - c0 + 1) * 256] = np.asarray(tile)
    px = deg / 256
    west, north = c0 * deg - 180, 90 - r0 * deg
    x0 = int((BBOX["min_lon"] - west) / px)
    x1 = int(np.ceil((BBOX["max_lon"] - west) / px))
    y0 = int((north - BBOX["max_lat"]) / px)
    y1 = int(np.ceil((north - BBOX["min_lat"]) / px))
    crop = mosaic[y0:y1, x0:x1]
    # Store in the same projected metres as the USGS rasters so all layers share one CRS.
    transform = Affine((px * M_PER_DEG), 0, (west + x0 * px) * M_PER_DEG, 0, -(px * M_PER_DEG), (north - y0 * px) * M_PER_DEG)
    with rasterio.open(CACHE / "dem_1m.tif") as ref:
        crs = ref.crs
    with rasterio.open(
        dest, "w", driver="GTiff", width=crop.shape[1], height=crop.shape[0], count=1,
        dtype="uint8", crs=crs, transform=transform,
    ) as dst:
        dst.write(crop, 1)
    print(f"[done] {dest.name}: {crop.shape[1]}x{crop.shape[0]} px at {px * M_PER_DEG:.0f} m")


if __name__ == "__main__":
    which = sys.argv[1:] or ["dem", "ortho", "themis"]
    if "dem" in which:
        fetch(DEM_URL, "dem_1m.tif")
    if "ortho" in which:
        fetch(ORTHO_URL, "ortho_25cm.tif")
    if "themis" in which:
        fetch_trek_tiles("THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018", 9, "themis_day_ir.tif")
        fetch_trek_tiles("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", 9, "themis_night_ir.tif")
