"""
Derives the MyCampusView brand assets from the master artwork.

    python scripts/brand-assets.py

The master (`public/brand/mycampusview.svg`) is a 375x375 card: an opaque navy
field with the magnifier mark and the wordmark floating in a band across the
middle. Used as-is it paints a navy square onto every surface it touches, and
the lockup inside it is neither centred nor tight to the frame.

This script separates the artwork from its background so the brand can sit on
any ground:

    mycampusview-lockup.svg        mark + wordmark, transparent, cropped tight
    mycampusview-lockup-dark.svg   the same, for light grounds (see below)
    mycampusview-mark.svg          the magnifier alone, square, transparent
    mycampusview-*.png             raster twins, for OG images and slides
    icon-<n>.png                   PWA / favicon sizes, mark on the brand navy

How the background is removed: the mark is raster, so the navy behind it is
keyed out — a flood fill from the edges finds the true background, holes are
filled so the interior of the magnifier stays solid, and only the boundary
pixels keep a fractional alpha so the anti-aliasing survives. The wordmark is
vector in the master and is copied through untouched, so it stays crisp at any
size.

The one thing that does change: the master sets "MyCampus" in cream, which is
chosen to read on the navy card and measures 1.1:1 against white — invisible.
The light-ground variant therefore sets those same glyphs in the card's own
navy. No new colour is introduced, "View" keeps its orange, and the shapes are
untouched; if you would rather keep cream everywhere, delete WORDMARK_ON_LIGHT
below and use the dark-ground file on every surface.
"""

from __future__ import annotations

import base64
import io
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "public" / "brand"
MASTER = BRAND / "mycampusview.svg"

# The flat field the artwork is painted on, sampled from the master's corners.
BG = np.array([10, 26, 63])

# The wordmark as the master sets it, and what it becomes on a light ground.
WORDMARK = "#f8e8d5"
WORDMARK_ON_LIGHT = "#0a1a3f"   # the card's own navy, so no new colour appears

# Render the master this wide before keying. The mark inside it is a raster of
# about 210px, so this is a 4x supersample of it — enough to key cleanly and
# downsample back to something smooth.
RENDER = 3000

CHROME = next(
    (p for p in [
        Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
        Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
        Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
        Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe"),
    ] if p.exists()),
    None,
)


def render(svg_text: str, px: int) -> Image.Image:
    """Rasterise an SVG string on a transparent page."""
    if CHROME is None:
        raise SystemExit("no Chrome/Edge found to rasterise the SVG")
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        (d / "a.svg").write_text(svg_text, encoding="utf-8")
        (d / "a.html").write_text(
            "<!doctype html><meta charset='utf-8'>"
            "<style>html,body{margin:0;background:transparent}"
            f"img{{width:{px}px;height:{px}px;display:block}}</style>"
            "<img src='a.svg'>",
            encoding="utf-8",
        )
        subprocess.run(
            [str(CHROME), "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--default-background-color=00000000",
             f"--screenshot={d / 'a.png'}", f"--window-size={px},{px}",
             (d / "a.html").as_uri()],
            check=True, capture_output=True,
        )
        return Image.open(d / "a.png").convert("RGBA").copy()


def key_out_background(img: Image.Image) -> Image.Image:
    """
    Replace the flat navy field with transparency.

    Thresholding alone punches holes in the artwork wherever it happens to be
    navy-ish — the sky inside the magnifier, the shadow under the eaves. So the
    background is found by flooding in from the edges instead, holes in what
    remains are filled, and only the rim of the shape keeps a soft alpha.
    """
    a = np.array(img).astype(int)
    dist = np.sqrt(((a[..., :3] - BG) ** 2).sum(axis=2))

    near_bg = dist < 26
    # Everything reachable from the border without crossing the artwork.
    outside = np.zeros_like(near_bg)
    outside[0, :] = outside[-1, :] = outside[:, 0] = outside[:, -1] = True
    outside &= near_bg
    outside = ndimage.binary_propagation(outside, mask=near_bg)

    solid = ndimage.binary_fill_holes(~outside)
    core = ndimage.binary_erosion(solid, iterations=2)

    # Soft alpha at the boundary, hard inside, nothing outside.
    alpha = np.clip(dist / 70.0, 0, 1)
    alpha[core] = 1.0
    alpha[outside] = 0.0

    # Un-mix the navy the edge pixels were blended with, so nothing keeps a
    # dark fringe when the mark is placed on a light surface.
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = BG + (a[..., :3] - BG) / safe
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype("uint8")
    return Image.fromarray(out, "RGBA")


def trim(img: Image.Image, pad: int = 0) -> tuple[Image.Image, tuple[int, int, int, int]]:
    a = np.array(img)
    ys, xs = np.nonzero(a[..., 3] > 6)
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad),
           min(img.width, xs.max() + 1 + pad), min(img.height, ys.max() + 1 + pad))
    return img.crop(box), box


def data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def text_groups(master: str) -> str:
    """The two wordmark groups, verbatim — they are vector and stay vector."""
    out = []
    for anchor in ('<g transform="matrix(1, 0, 0, 1, 99, 167)">',
                   '<g transform="matrix(1, 0, 0, 1, 284, 168)">'):
        start = master.index(anchor)
        depth, i = 0, start
        while True:
            nxt_open = master.find("<g", i + 1)
            nxt_close = master.find("</g>", i + 1)
            if nxt_close == -1:
                raise SystemExit("unbalanced wordmark group")
            if nxt_open != -1 and nxt_open < nxt_close:
                depth += 1
                i = nxt_open
            else:
                if depth == 0:
                    out.append(master[start:nxt_close + 4])
                    break
                depth -= 1
                i = nxt_close
    return "\n  ".join(out)


def defs_block(master: str) -> str:
    """The clip paths the wordmark groups reference."""
    return master[master.index("<defs>"):master.index("</defs>") + 7]


def main() -> None:
    master = MASTER.read_text(encoding="utf-8")

    # 1. The mark: render the master with the wordmark suppressed, then key.
    marks_only = master
    for anchor in ('<g transform="matrix(1, 0, 0, 1, 99, 167)">',
                   '<g transform="matrix(1, 0, 0, 1, 284, 168)">'):
        marks_only = marks_only.replace(anchor, anchor[:-1] + ' display="none">')

    keyed = key_out_background(render(marks_only, RENDER))
    mark_img, (mx0, my0, mx1, my1) = trim(keyed)

    scale = 375.0 / RENDER
    ux0, uy0 = mx0 * scale, my0 * scale
    uw, uh = (mx1 - mx0) * scale, (my1 - my0) * scale
    print(f"mark  : {mark_img.width}x{mark_img.height}px "
          f"at ({ux0:.2f},{uy0:.2f}) size {uw:.2f}x{uh:.2f} user units")

    # Downsample the keyed mark. The master holds it at roughly 175px, so
    # anything much past that is empty resolution that only inflates the file.
    target = 320
    if mark_img.width > target:
        h = round(mark_img.height * target / mark_img.width)
        mark_img = mark_img.resize((target, h), Image.LANCZOS)

    # 2. Where the whole lockup sits, so the crop is tight and even.
    full = key_out_background(render(master, RENDER))
    _, (fx0, fy0, fx1, fy1) = trim(full)
    lx0, ly0 = fx0 * scale, fy0 * scale
    lw, lh = (fx1 - fx0) * scale, (fy1 - fy0) * scale
    print(f"lockup: ({lx0:.2f},{ly0:.2f}) size {lw:.2f}x{lh:.2f} user units")

    uri = data_uri(mark_img)
    defs = defs_block(master)
    words = text_groups(master)

    # 3. The lockup, cropped to its own bounds, on each ground. A hair of
    #    padding keeps the anti-aliased edge of the glyphs off the viewBox wall.
    pad = 0.6

    def lockup_svg(wordmark_fill: str) -> str:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"\n'
            f'     viewBox="{lx0 - pad:.3f} {ly0 - pad:.3f} {lw + pad * 2:.3f} {lh + pad * 2:.3f}"\n'
            f'     width="{lw + pad * 2:.3f}" height="{lh + pad * 2:.3f}"\n'
            f'     role="img" aria-label="MyCampusView">\n'
            f'  <title>MyCampusView</title>\n'
            f'  {defs}\n'
            f'  <image x="{ux0:.3f}" y="{uy0:.3f}" width="{uw:.3f}" height="{uh:.3f}"\n'
            f'         xlink:href="{uri}" preserveAspectRatio="xMidYMid meet"/>\n'
            f'  {words.replace(WORDMARK, wordmark_fill)}\n'
            f'</svg>\n'
        )

    lockup = lockup_svg(WORDMARK)
    lockup_dark = lockup_svg(WORDMARK_ON_LIGHT)
    (BRAND / "mycampusview-lockup.svg").write_text(lockup, encoding="utf-8")
    (BRAND / "mycampusview-lockup-dark.svg").write_text(lockup_dark, encoding="utf-8")

    # 4. The mark alone, square, centred in its own box.
    side = max(uw, uh)
    mark_svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"\n'
        f'     viewBox="0 0 {side:.3f} {side:.3f}" width="{side:.3f}" height="{side:.3f}"\n'
        f'     role="img" aria-label="MyCampusView">\n'
        f'  <title>MyCampusView</title>\n'
        f'  <image x="{(side - uw) / 2:.3f}" y="{(side - uh) / 2:.3f}"\n'
        f'         width="{uw:.3f}" height="{uh:.3f}" xlink:href="{uri}"/>\n'
        f'</svg>\n'
    )
    (BRAND / "mycampusview-mark.svg").write_text(mark_svg, encoding="utf-8")

    # 5. Raster fallbacks — anywhere an SVG cannot go (OG image, the deck).
    lock_png = render(lockup, 2400)
    lock_png, _ = trim(lock_png)
    lock_png.save(BRAND / "mycampusview-lockup.png", optimize=True)
    dark_png, _ = trim(render(lockup_dark, 2400))
    dark_png.save(BRAND / "mycampusview-lockup-dark.png", optimize=True)
    mark_png = render(mark_svg, 1024)
    mark_png, _ = trim(mark_png)
    mark_png.save(BRAND / "mycampusview-mark.png", optimize=True)

    # 6. App icons: the mark on the brand navy, so a home-screen tile is a
    #    filled square rather than a floating cut-out.
    navy = tuple(int(c) for c in BG)
    for n in (32, 180, 192, 512):
        tile = Image.new("RGBA", (n, n), navy + (255,))
        inner = round(n * 0.72)
        m = mark_png.copy()
        m.thumbnail((inner, inner), Image.LANCZOS)
        tile.alpha_composite(m, ((n - m.width) // 2, (n - m.height) // 2))
        tile.save(BRAND / f"icon-{n}.png", optimize=True)

    for f in sorted(BRAND.iterdir()):
        print(f"  {f.name:32} {f.stat().st_size / 1024:8.1f} KB")


if __name__ == "__main__":
    main()
