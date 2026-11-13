#!/usr/bin/env python3
"""Generate the PWA icon set without third-party dependencies.

The icons are committed, so this script only needs to run when the artwork or
the size list changes.  Everything is drawn at 4x and box-filtered down, which
is enough anti-aliasing for a 72 px icon.

    python3 scripts/generate-icons.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

SIZES = (72, 96, 128, 144, 152, 192, 384, 512)
OUT_DIR = Path(__file__).resolve().parent.parent / "static" / "icons"

BACKGROUND = (0x12, 0x15, 0x1B)
GLASS = (0xE8, 0xE8, 0xE8)
PIN = (0xFF, 0x44, 0x44)
SUPERSAMPLE = 4


def _blend(dst, src, coverage):
    if coverage <= 0:
        return dst
    if coverage >= 1:
        return src
    return tuple(
        int(round(dst[i] + (src[i] - dst[i]) * coverage)) for i in range(3)
    )


def _disc_cov(px, py, cx, cy, radius, samples):
    """Coverage of a filled disc at one pixel, sampled on a grid."""
    hits = 0
    step = 1.0 / samples
    for sy in range(samples):
        for sx in range(samples):
            x = px + (sx + 0.5) * step
            y = py + (sy + 0.5) * step
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius:
                hits += 1
    return hits / (samples * samples)


def _ring_cov(px, py, cx, cy, outer, inner, samples):
    return max(
        0.0,
        _disc_cov(px, py, cx, cy, outer, samples)
        - _disc_cov(px, py, cx, cy, inner, samples),
    )


def _segment_cov(px, py, x1, y1, x2, y2, half_width, samples):
    """Coverage of a thick round-capped segment at one pixel."""
    hits = 0
    step = 1.0 / samples
    dx, dy = x2 - x1, y2 - y1
    length_sq = dx * dx + dy * dy
    for sy in range(samples):
        for sx in range(samples):
            x = px + (sx + 0.5) * step
            y = py + (sy + 0.5) * step
            if length_sq == 0:
                t = 0.0
            else:
                t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / length_sq))
            closest_x = x1 + t * dx
            closest_y = y1 + t * dy
            if (x - closest_x) ** 2 + (y - closest_y) ** 2 <= half_width**2:
                hits += 1
    return hits / (samples * samples)


def _rounded_square_cov(px, py, size, radius, samples):
    step = 1.0 / samples
    hits = 0
    for sy in range(samples):
        for sx in range(samples):
            x = px + (sx + 0.5) * step
            y = py + (sy + 0.5) * step
            # distance to the rounded rectangle boundary
            qx = abs(x - size / 2) - (size / 2 - radius)
            qy = abs(y - size / 2) - (size / 2 - radius)
            outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
            if outside <= radius - min(max(qx, qy), 0.0):
                hits += 1
    return hits / (samples * samples)


def _pixel(x, y, size):
    """Colour of one output pixel with alpha, drawn at supersampled detail."""
    cov_bg = _rounded_square_cov(x, y, size, size * 0.18, SUPERSAMPLE)
    colour = _blend((0, 0, 0), BACKGROUND, cov_bg)

    cx = cy = size / 2
    lens_r = size * 0.26
    stroke = size * 0.075

    cov_glass = _ring_cov(x, y, cx, cy - size * 0.05, lens_r + stroke / 2, lens_r - stroke / 2, SUPERSAMPLE)
    colour = _blend(colour, GLASS, cov_glass)

    # handle from the lower right of the lens, 45 degrees
    angle = math.radians(45)
    start_x = cx + math.cos(angle) * lens_r
    start_y = (cy - size * 0.05) + math.sin(angle) * lens_r
    end_x = cx + math.cos(angle) * (lens_r + size * 0.17)
    end_y = (cy - size * 0.05) + math.sin(angle) * (lens_r + size * 0.17)
    cov_handle = _segment_cov(x, y, start_x, start_y, end_x, end_y, stroke / 2, SUPERSAMPLE)
    colour = _blend(colour, GLASS, cov_handle)

    # the pin inside the lens
    cov_pin = _disc_cov(x, y, cx, cy - size * 0.05, size * 0.065, SUPERSAMPLE)
    colour = _blend(colour, PIN, cov_pin)

    return colour + (int(round(cov_bg * 255)),)


def _png(size: int) -> bytes:
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter type: none
        for x in range(size):
            rows.extend(_pixel(x + 0.5, y + 0.5, size))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        target = OUT_DIR / f"icon-{size}x{size}.png"
        target.write_bytes(_png(size))
        print(f"wrote {target.relative_to(OUT_DIR.parent.parent)} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
