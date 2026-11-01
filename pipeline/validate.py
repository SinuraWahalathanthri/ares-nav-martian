"""Phase 1 validation and waypoint placement.

1. Sanity-checks every grid listed in site.json (size, value ranges).
2. Checks the habitat is on flat, hazard-free ground (suggests a better spot if not).
3. Picks SO-3 (fresh crater) and SO-4 (dune margin) from the detected features.
4. Runs a reference Dijkstra walk (4 m grid) from the habitat to every waypoint and
   reports reachability, distance and max slope.

Prints a report and writes .cache/validation.json. Exit code 1 on any failure.
"""

import json
import math
import sys

import numpy as np
from scipy import ndimage as ndi
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

from config import CACHE, M_PER_DEG, OUT, X_SCALE

# Provisional waypoints from app/src/lib/site.ts (SO-3/SO-4 are chosen here).
WAYPOINTS = {
    "HAB-1": (-4.799847, 137.383541),
    "SO-1": (-4.808008, 137.381004),
    "SO-2": (-4.806538, 137.379338),
    "SO-5": (-4.812015, 137.382037),
}
H_STEEP, H_IMPASSABLE, H_ROCKY, H_SAND, H_CRATER, H_RIM = 1, 2, 4, 8, 16, 32
COARSE = 2  # 2 m nav grid → 4 m routing grid

failures: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        failures.append(msg)


def load(site, name):
    g = site["nav_grid"]["layers"][name]
    a = np.fromfile(OUT / g["file"], dtype=np.dtype(g["dtype"]).newbyteorder("<"))
    check(a.size == g["width"] * g["height"], f"{name}: {g['width']}x{g['height']} {g['dtype']}")
    return a.reshape(g["height"], g["width"])


def main() -> None:
    site = json.loads((OUT / "site.json").read_text(encoding="utf-8"))
    left, bottom, right, top = site["bounds"]["projected"]
    res = site["nav_grid"]["resolution_m"]
    print("grids")
    slope = load(site, "slope").astype(np.float32) / 4
    rough = load(site, "roughness").astype(np.float32) / 100
    rock = load(site, "rock_density").astype(np.float32) / 255
    haz = load(site, "hazard")
    elev_raw = load(site, "elevation")
    lo, hi = site["elevation_range_m"]
    check(hi - lo < 1500 and -5000 < lo < -3000, f"elevation range {lo:.0f}..{hi:.0f} m")
    check(0 < np.mean(slope) < 30, f"mean slope {np.mean(slope):.1f}°")
    print("  stats", site["stats"])

    nh, nw = slope.shape

    def to_cell(lat, lon, f=1):
        col = (lon * M_PER_DEG - left) / (res * f)
        row = (top - lat * M_PER_DEG) / (res * f)
        return int(row), int(col)

    def to_latlon(row, col, f=1):
        return top / M_PER_DEG - (row + 0.5) * res * f / M_PER_DEG, left / M_PER_DEG + (col + 0.5) * res * f / M_PER_DEG

    def ground_dist(a, b):
        return math.hypot((a[1] - b[1]) * M_PER_DEG * X_SCALE, (a[0] - b[0]) * M_PER_DEG)

    # ------------------------------------------------------------ habitat
    print("habitat")
    hab = WAYPOINTS["HAB-1"]
    r, c = to_cell(*hab)
    rad = int(25 / res)
    yy, xx = np.ogrid[-rad : rad + 1, -rad : rad + 1]
    disk = (yy**2 + xx**2) <= rad**2

    def pad_score(r, c):
        s = slope[r - rad : r + rad + 1, c - rad : c + rad + 1][disk]
        hz = haz[r - rad : r + rad + 1, c - rad : c + rad + 1][disk]
        return float(s.mean()), float(s.max()), float((hz != 0).mean())

    mean_s, max_s, hz_frac = pad_score(r, c)
    print(f"  HAB-1 50 m pad: mean slope {mean_s:.1f}°, max {max_s:.1f}°, hazard cells {hz_frac * 100:.0f}%")
    hab_new = None
    if mean_s > 5 or hz_frac > 0.05:
        # Search within 400 m for the flattest hazard-free 50 m pad.
        cost = ndi.uniform_filter(slope, 2 * rad + 1) + 50 * ndi.uniform_filter((haz != 0).astype(np.float32), 2 * rad + 1)
        sr = int(400 / res)
        r0, r1, c0, c1 = max(rad, r - sr), min(nh - rad, r + sr), max(rad, c - sr), min(nw - rad, c + sr)
        sub = cost[r0:r1, c0:c1]
        br, bc = np.unravel_index(np.argmin(sub), sub.shape)
        hab_new = to_latlon(r0 + br, c0 + bc)
        ms, mx, hf = pad_score(r0 + br, c0 + bc)
        print(f"  → suggested HAB-1 {hab_new[0]:.6f}, {hab_new[1]:.6f}: mean slope {ms:.1f}°, max {mx:.1f}°, hazard {hf * 100:.0f}%, {ground_dist(hab, hab_new):.0f} m away")
        hab = hab_new
        WAYPOINTS["HAB-1"] = hab

    # ------------------------------------------------------------ routing graph (4 m)
    f = COARSE
    s4 = slope[: nh // f * f, : nw // f * f].reshape(nh // f, f, nw // f, f).max(axis=(1, 3))
    h4 = np.bitwise_or.reduce(np.bitwise_or.reduce(haz[: nh // f * f, : nw // f * f].reshape(nh // f, f, nw // f, f), axis=3), axis=1)
    k4 = rock[: nh // f * f, : nw // f * f].reshape(nh // f, f, nw // f, f).mean(axis=(1, 3))
    gh, gw = s4.shape
    blocked = (s4 > 25) | ((h4 & (H_IMPASSABLE | H_CRATER)) != 0)
    w = 1 + (s4 / 8) ** 2 + 2 * k4 + 3 * ((h4 & H_SAND) != 0) + 2 * ((h4 & H_RIM) != 0)
    w[blocked] = np.inf
    idx = np.arange(gh * gw).reshape(gh, gw)
    rows, cols, vals = [], [], []
    step = res * f
    for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):  # each undirected 8-neighbour edge once
        c0, c1 = max(0, -dc), gw - max(0, dc)
        a = idx[0 : gh - dr, c0:c1]
        b = idx[dr:gh, c0 + dc : c1 + dc]
        d = step * math.hypot(dr, dc * X_SCALE)
        wa, wb = w.ravel()[a.ravel()], w.ravel()[b.ravel()]
        cost = d * (wa + wb) / 2
        ok = np.isfinite(cost)
        rows += [a.ravel()[ok], b.ravel()[ok]]
        cols += [b.ravel()[ok], a.ravel()[ok]]
        vals += [cost[ok], cost[ok]]
    graph = coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(gh * gw, gh * gw)).tocsr()
    hr, hc = to_cell(*hab, f)
    dist, pred = dijkstra(graph, indices=int(idx[hr, hc]), return_predecessors=True)
    dist = dist.reshape(gh, gw)
    reach = np.isfinite(dist)
    print(f"routing grid {gw}x{gh} @ {step} m: {reach.mean() * 100:.0f}% of site reachable from HAB-1")

    def path_stats(lat, lon):
        r, c = to_cell(lat, lon, f)
        node = int(idx[r, c])
        if not np.isfinite(dist.ravel()[node]):
            return None
        length, mx = 0.0, 0.0
        prev = None
        while node >= 0:
            pr, pc = divmod(node, gw)
            mx = max(mx, float(s4[pr, pc]))
            if prev is not None:
                length += step * math.hypot(pr - prev[0], (pc - prev[1]) * X_SCALE)
            prev = (pr, pc)
            node = int(pred[node]) if pred[node] >= 0 else -1
        return {"walk_m": round(length), "cost": round(float(dist[r, c])), "max_slope_deg": round(mx, 1)}

    # ------------------------------------------------------------ SO-3 / SO-4
    cand = json.loads((CACHE / "candidates.json").read_text(encoding="utf-8"))
    print("science targets")

    def reachable_near(lat, lon, radius_m=60):
        """Closest reachable, non-hazard routing cell to a point (stand-off position)."""
        r, c = to_cell(lat, lon, f)
        rr = int(radius_m / step)
        best = None
        for dr in range(-rr, rr + 1):
            for dc in range(-rr, rr + 1):
                y, x = r + dr, c + dc
                if 0 <= y < gh and 0 <= x < gw and reach[y, x] and h4[y, x] & (H_SAND | H_CRATER | H_RIM | H_IMPASSABLE) == 0:
                    d = dr * dr + dc * dc
                    if best is None or d < best[0]:
                        best = (d, y, x)
        return to_latlon(best[1], best[2], f) if best else None

    picks = {}
    craters = sorted(
        (c for c in cand["craters"] if 15 <= c["diameter_m"] <= 120 and 600 <= ground_dist(hab, (c["lat"], c["lon"])) <= 1800),
        key=lambda c: -c["d_over_D"],
    )
    for c in craters:
        p = reachable_near(c["lat"], c["lon"], radius_m=c["diameter_m"] * 0.8 + 10)
        if p:
            picks["SO-3"] = {"lat": p[0], "lon": p[1], "target": c}
            break
    sands = sorted(
        (s for s in cand["sand"] if 500 <= ground_dist(hab, (s["lat"], s["lon"])) <= 1800),
        key=lambda s: -s["area_m2"],
    )
    for s in sands:
        p = reachable_near(s["lat"], s["lon"], radius_m=150)
        if p:
            picks["SO-4"] = {"lat": p[0], "lon": p[1], "target": s}
            break
    for k in ("SO-3", "SO-4"):
        check(k in picks, f"{k} candidate found" + (f": {picks[k]['lat']:.6f}, {picks[k]['lon']:.6f} ← {picks[k]['target']}" if k in picks else ""))
        if k in picks:
            WAYPOINTS[k] = (picks[k]["lat"], picks[k]["lon"])

    # ------------------------------------------------------------ reachability
    print("reference walk from HAB-1")
    routes = {}
    for k, (lat, lon) in WAYPOINTS.items():
        if k == "HAB-1":
            continue
        # Stand-off: the crew stops on safe ground next to a target, not on top of it.
        r, c = to_cell(lat, lon, f)
        if not reach[r, c] or h4[r, c] & (H_SAND | H_CRATER | H_RIM | H_IMPASSABLE):
            p = reachable_near(lat, lon, radius_m=40)
            if p:
                print(f"  {k} moved {ground_dist((lat, lon), p):.0f} m to safe stand-off ground")
                lat, lon = p
                WAYPOINTS[k] = p
        st = path_stats(lat, lon)
        routes[k] = st
        check(st is not None, f"{k}: " + (f"{st['walk_m']} m walk, max slope {st['max_slope_deg']}° (straight line {ground_dist(hab, (lat, lon)):.0f} m)" if st else "UNREACHABLE"))

    report = {"habitat": {"lat": hab[0], "lon": hab[1], "moved": hab_new is not None}, "picks": picks, "routes": routes, "waypoints": WAYPOINTS, "failures": failures}
    (CACHE / "validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("\nRESULT:", "PASS" if not failures else f"{len(failures)} failure(s)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
