#!/usr/bin/env python3
"""Generate the Log Colorizer extension icons.

Uses only the Python standard library (no Pillow). The icon shows short
colored "log lines" on a dark terminal-like background.
"""
import os
import struct
import zlib

SIZES = [16, 32, 48, 128]
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

BACKGROUND = (0x1E, 0x1E, 0x1E, 0xFF)
# One color per "log line": green, yellow, red, blue (like INFO/WARN/ERROR/DEBUG)
LINES = [
    ((0x23, 0xD1, 0x8B, 0xFF), 0.80),
    ((0xF5, 0xF5, 0x43, 0xFF), 0.55),
    ((0xF1, 0x4C, 0x4C, 0xFF), 0.70),
    ((0x3B, 0x8E, 0xEA, 0xFF), 0.45),
]


def build_pixels(size):
    pixels = [[BACKGROUND] * size for _ in range(size)]
    margin = max(1, size // 8)
    corner = max(1, size // 6)

    # Rounded corners: make pixels outside the rounded rect transparent.
    for y in range(size):
        for x in range(size):
            dx = max(corner - x, x - (size - 1 - corner), 0)
            dy = max(corner - y, y - (size - 1 - corner), 0)
            if dx * dx + dy * dy > corner * corner:
                pixels[y][x] = (0, 0, 0, 0)

    # Colored log lines.
    n = len(LINES)
    usable = size - 2 * margin
    line_height = max(1, usable // (2 * n - 1))
    for i, (color, width_ratio) in enumerate(LINES):
        y0 = margin + i * 2 * line_height
        x1 = margin + max(1, int((size - 2 * margin) * width_ratio))
        for y in range(y0, min(y0 + line_height, size - margin)):
            for x in range(margin, min(x1, size - margin)):
                pixels[y][x] = color
    return pixels


def write_png(path, pixels):
    size = len(pixels)
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("4B", *px) for px in row) for row in pixels
    )

    def chunk(tag, data):
        payload = tag + data
        return (
            struct.pack(">I", len(data))
            + payload
            + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f"icon-{size}.png")
        write_png(path, build_pixels(size))
        print(f"wrote {os.path.relpath(path)}")


if __name__ == "__main__":
    main()
