"""
Derives the MyCampusView brand assets from the master artwork.

    python scripts/brand-assets.py

The master (`docs/brand/mycampusview-logo-master.jpg`) is the stacked logo on
a flat navy field: the gold magnifier-and-school mark above the wordmark,
"MyCampus" in white and "View" in orange.

This script lifts both parts off the navy so the brand can sit on any ground:

    mycampusview-mark.png          the magnifier alone, transparent
    mycampusview-lockup.png        mark + wordmark side by side, for dark grounds
    mycampusview-lockup-dark.png   the same with "MyCampus" in navy, for light grounds
    mycampusview-stacked.png       mark above wordmark (as drawn), for dark grounds
    mycampusview-stacked-dark.png  the same, for light grounds
    icon-<n>.png                   PWA / favicon sizes, mark on the brand navy

It also refreshes the copies other surfaces carry: the Next.js app icons, the
sales documents, the CCTV relay and Tally connector sources, and the Expo app.

How the background is removed: the mark is keyed with a flood fill from the
edges so the navy disc inside the magnifier stays part of the mark; the
wordmark is keyed by colour distance alone, so the counters of "a", "p" and
"e" open up instead of being filled.

On light grounds white glyphs disappear, so the light-ground cuts set the
white "MyCampus" in the master's own navy; "View" keeps its orange.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "public" / "brand"
MASTER = ROOT / "docs" / "brand" / "mycampusview-logo-master.jpg"

# The flat field the artwork is painted on, sampled from the master's corners.
BG = np.array([0, 32, 70])
NAVY = (0, 32, 70)

# Bands of the master, found by row profile. Anything below the wordmark is a
# clipped tagline and is left out.
MARK_ROWS = (120, 532)
WORD_ROWS = (532, 688)


def alpha_from_distance(a: np.ndarray) -> np.ndarray:
    dist = np.sqrt(((a[..., :3] - BG) ** 2).sum(axis=2))
    return dist, np.clip((dist - 18) / 70.0, 0, 1)


def unmix(a: np.ndarray, alpha: np.ndarray) -> Image.Image:
    """Remove the navy the edge pixels were blended with, so no dark fringe remains."""
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = BG + (a[..., :3] - BG) / safe
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype("uint8")
    return Image.fromarray(out, "RGBA")


def key_mark(img: Image.Image) -> Image.Image:
    a = np.array(img.convert("RGB")).astype(float)
    dist, alpha = alpha_from_distance(a)
    near_bg = dist < 30
    outside = np.zeros_like(near_bg)
    outside[0, :] = outside[-1, :] = outside[:, 0] = outside[:, -1] = True
    outside &= near_bg
    outside = ndimage.binary_propagation(outside, mask=near_bg)
    solid = ndimage.binary_fill_holes(~outside)
    core = ndimage.binary_erosion(solid, iterations=2)
    alpha[core] = 1.0
    alpha[outside & (dist < 30)] = 0.0
    return unmix(a, alpha)


def key_text(img: Image.Image) -> Image.Image:
    a = np.array(img.convert("RGB")).astype(float)
    _, alpha = alpha_from_distance(a)
    return unmix(a, alpha)


def trim(img: Image.Image, pad: int = 2) -> Image.Image:
    a = np.array(img)
    ys, xs = np.nonzero(a[..., 3] > 10)
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad),
           min(img.width, xs.max() + 1 + pad), min(img.height, ys.max() + 1 + pad))
    return img.crop(box)


def on_light(word: Image.Image) -> Image.Image:
    """White glyphs become navy; coloured ones (the orange "View") are untouched."""
    a = np.array(word).astype(int)
    rgb = a[..., :3]
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    white = chroma < 70
    a[white, 0], a[white, 1], a[white, 2] = NAVY
    return Image.fromarray(a.astype("uint8"), "RGBA")


def compose_lockup(mark: Image.Image, word: Image.Image, baseline: int) -> Image.Image:
    """Mark to the left, sized to the wordmark's cap height plus its descenders."""
    cap = baseline
    mh = round(word.height * 1.32)
    m = mark.resize((round(mark.width * mh / mark.height), mh), Image.LANCZOS)
    gap = round(word.height * 0.22)
    w = m.width + gap + word.width
    h = max(mh, word.height)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(m, (0, (h - mh) // 2))
    # Centre the caps (not the descenders) on the mark.
    wy = (h - cap) // 2
    wy = max(0, min(h - word.height, wy))
    out.alpha_composite(word, (m.width + gap, wy))
    return trim(out, 0)


def compose_stacked(mark: Image.Image, word: Image.Image) -> Image.Image:
    gap = round(word.height * 0.12)
    w = max(mark.width, word.width)
    out = Image.new("RGBA", (w, mark.height + gap + word.height), (0, 0, 0, 0))
    out.alpha_composite(mark, ((w - mark.width) // 2, 0))
    out.alpha_composite(word, ((w - word.width) // 2, mark.height + gap))
    return out


def tile(mark: Image.Image, n: int, fill: float = 0.74) -> Image.Image:
    t = Image.new("RGBA", (n, n), NAVY + (255,))
    m = mark.copy()
    m.thumbnail((round(n * fill), round(n * fill)), Image.LANCZOS)
    t.alpha_composite(m, ((n - m.width) // 2, (n - m.height) // 2))
    return t


def save_ico(img: Image.Image, path: Path, sizes=(16, 24, 32, 48, 64, 128, 256)) -> None:
    img.save(path, format="ICO", sizes=[(s, s) for s in sizes])


def main() -> None:
    master = Image.open(MASTER).convert("RGB")

    mark = trim(key_mark(master.crop((0, MARK_ROWS[0], master.width, MARK_ROWS[1]))))
    word = trim(key_text(master.crop((0, WORD_ROWS[0], master.width, WORD_ROWS[1]))))
    word_light = on_light(word)

    # Baseline: the bottom of the "M", which has no descender.
    wa = np.array(word)[..., 3]
    m_cols = wa[:, : round(word.width * 0.08)]
    baseline = int(np.nonzero(m_cols.max(axis=1) > 128)[0].max())

    lockup = compose_lockup(mark, word, baseline)
    lockup_light = compose_lockup(mark, word_light, baseline)
    stacked = compose_stacked(mark, word)
    stacked_light = compose_stacked(mark, word_light)

    for old in ("mycampusview.svg", "mycampusview-lockup.svg",
                "mycampusview-lockup-dark.svg", "mycampusview-mark.svg"):
        (BRAND / old).unlink(missing_ok=True)

    mark.save(BRAND / "mycampusview-mark.png", optimize=True)
    lockup.save(BRAND / "mycampusview-lockup.png", optimize=True)
    lockup_light.save(BRAND / "mycampusview-lockup-dark.png", optimize=True)
    stacked.save(BRAND / "mycampusview-stacked.png", optimize=True)
    stacked_light.save(BRAND / "mycampusview-stacked-dark.png", optimize=True)

    icons = {n: tile(mark, n) for n in (16, 24, 32, 48, 64, 128, 180, 192, 256, 512, 1024)}
    for n in (32, 180, 192, 512):
        icons[n].save(BRAND / f"icon-{n}.png", optimize=True)

    # Next.js file-convention icons.
    icons[512].save(ROOT / "src" / "app" / "icon.png", optimize=True)
    icons[180].save(ROOT / "src" / "app" / "apple-icon.png", optimize=True)

    # Sales documents (brochure, annex, proposals) sit the logo on black/navy bands.
    lockup.save(ROOT / "docs" / "sales" / "mycampusview-logo.png", optimize=True)
    proposals = ROOT / "docs" / "sales" / "proposals"
    if proposals.exists():
        lockup.save(proposals / "mycampusview-lockup.png", optimize=True)
        stacked.save(proposals / "mycampusview-stacked.png", optimize=True)

    # Tally connector: its own build derives sizes from these.
    tally = ROOT / "tools" / "tally-connector"
    if tally.exists():
        b = tally / "build"
        for n in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
            icons[n].save(b / f"icon-{n}.png", optimize=True)
        icons[1024].save(b / "icon.png", optimize=True)
        save_ico(icons[256], b / "icon.ico")
        # Its window is light, so it takes the navy-wordmark cut.
        for name in ("logo-wide.png", "logo-source.png", "brand-logo.png"):
            lockup_light.save(b / name, optimize=True)
        icons[256].save(tally / "gui" / "icon.png", optimize=True)
        lockup_light.save(tally / "gui" / "logo-wide.png", optimize=True)

    # Expo app. Adaptive foreground keeps the mark inside Android's 66% safe zone.
    mobile = ROOT / "mobile" / "assets"
    if mobile.exists():
        icons[1024].save(mobile / "icon.png", optimize=True)
        fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        m = mark.copy()
        m.thumbnail((600, 600), Image.LANCZOS)
        fg.alpha_composite(m, ((1024 - m.width) // 2, (1024 - m.height) // 2))
        fg.save(mobile / "android-icon-foreground.png", optimize=True)
        Image.new("RGBA", (1024, 1024), NAVY + (255,)).save(mobile / "android-icon-background.png", optimize=True)
        mono = np.array(fg)
        mono[..., :3] = 255
        Image.fromarray(mono, "RGBA").save(mobile / "android-icon-monochrome.png", optimize=True)
        icons[48].save(mobile / "favicon.png", optimize=True)
        s = mark.copy()
        s.thumbnail((512, 512), Image.LANCZOS)
        s.save(mobile / "splash-mark.png", optimize=True)
        s.save(mobile / "splash-icon.png", optimize=True)

    print(f"mark {mark.size}  word {word.size}  baseline {baseline}")
    print(f"lockup {lockup.size}  stacked {stacked.size}")
    for f in sorted(BRAND.iterdir()):
        print(f"  {f.name:32} {f.stat().st_size / 1024:8.1f} KB")


if __name__ == "__main__":
    main()
