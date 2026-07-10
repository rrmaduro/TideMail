"""Generate packaging/tidemail.ico — the Layered Tide mark on a deep gradient tile.

Run once (or whenever the brand changes):  python scripts/make_icon.py
Requires Pillow (in requirements-dev.txt).
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 256
OUT = Path(__file__).resolve().parent.parent / "packaging" / "tidemail.ico"


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def build() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # Deep vertical gradient (ocean -> deep navy)
    grad = Image.new("RGB", (SIZE, SIZE))
    gd = ImageDraw.Draw(grad)
    top, bottom = (18, 59, 82), (8, 36, 58)
    for y in range(SIZE):
        gd.line([(0, y), (SIZE, y)], fill=_lerp(top, bottom, y / (SIZE - 1)))

    # Rounded-square mask
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([10, 10, SIZE - 10, SIZE - 10], radius=54, fill=255)
    img.paste(grad, (0, 0), mask)

    # Three stacked waves fading surface -> deep
    d = ImageDraw.Draw(img)

    def wave(cy: int, color, width: int):
        pts = [(x, cy + math.sin((x / SIZE) * math.pi * 4) * 11) for x in range(34, SIZE - 34)]
        d.line(pts, fill=color, width=width, joint="curve")

    wave(98, (38, 212, 226, 255), 13)
    wave(140, (111, 199, 214, 225), 13)
    wave(182, (191, 230, 238, 180), 13)
    return img


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img = build()
    img.save(OUT, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"[done] Wrote {OUT}")


if __name__ == "__main__":
    main()
