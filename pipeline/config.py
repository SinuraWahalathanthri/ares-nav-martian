"""Shared settings for the Gale boxwork data pack. Keep in sync with app/src/lib/site.ts."""

import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache"
OUT = ROOT.parent / "app" / "public" / "data" / "gale"

MARS_RADIUS_M = 3_396_190
M_PER_DEG = 2 * math.pi * MARS_RADIUS_M / 360  # ≈ 59,274.7 m

SITE_ID = "gale-boxwork"
CENTER = (-4.806, 137.381)  # lat, lon (planetocentric, east-positive)
BBOX = dict(min_lat=-4.8313, max_lat=-4.7807, min_lon=137.3557, max_lon=137.4063)

# Ground metres per projected metre in x (the USGS rasters use an equirectangular
# projection with standard parallel 0, so x is stretched by 1/cos(lat) at the site).
X_SCALE = math.cos(math.radians(CENTER[0]))

USGS = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL"
DEM_URL = f"/vsicurl/{USGS}/MSL_Gale_DEM_Mosaic_1m_v3.tif"
ORTHO_URL = f"/vsicurl/{USGS}/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif"

GDAL_ENV = dict(
    GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    GDAL_HTTP_MULTIRANGE="YES",
    GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
    CPL_VSIL_CURL_CHUNK_SIZE=str(2 * 1024 * 1024),
    VSI_CACHE="TRUE",
    GDAL_HTTP_MAX_RETRY="5",
    GDAL_HTTP_RETRY_DELAY="2",
)


def bbox_projected():
    """Site bbox in the rasters' projected metres (left, bottom, right, top)."""
    return (
        BBOX["min_lon"] * M_PER_DEG,
        BBOX["min_lat"] * M_PER_DEG,
        BBOX["max_lon"] * M_PER_DEG,
        BBOX["max_lat"] * M_PER_DEG,
    )
