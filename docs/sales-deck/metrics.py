"""
Text measurement, shared by the builder and the preview renderer.

The builder needs to know how tall a paragraph will be *before* it places the
next one, or blocks collide. python-pptx cannot tell it — PowerPoint does the
wrapping — so the same Segoe UI files PowerPoint will use are measured here
with Pillow, and every line height is written into the file as an exact point
value (`spcPts`) rather than as a percentage. Exact spacing is the whole trick:
a percentage is a multiple of the font's own line height, which differs per
face, so the builder could not predict it.
"""

from __future__ import annotations

from PIL import ImageFont

FACES = {
    "Segoe UI": "C:/Windows/Fonts/segoeui.ttf",
    "Segoe UI Semibold": "C:/Windows/Fonts/seguisb.ttf",
    "Segoe UI Light": "C:/Windows/Fonts/segoeuil.ttf",
    "Segoe UI Semilight": "C:/Windows/Fonts/segoeuisl.ttf",
}

# Measure at a multiple of the real size, so fractional point sizes such as
# 10.5 are not rounded to whole pixels before the division.
K = 8
_cache: dict = {}


def face(name: str, size_pt: float):
    key = (name, round(size_pt, 2))
    if key not in _cache:
        path = FACES.get(name, FACES["Segoe UI"])
        _cache[key] = ImageFont.truetype(path, max(1, int(round(size_pt * K))))
    return _cache[key]


def width_pt(body: str, name: str, size_pt: float, tracking_hundredths: float = 0) -> float:
    """Rendered width of one line, in points."""
    w = face(name, size_pt).getlength(body) / K
    if tracking_hundredths:
        w += len(body) * tracking_hundredths / 100
    return w


# PowerPoint measures with its own rounding, so a line that only just fits here
# can wrap there. Everything is laid out against a fractionally narrower column.
SAFETY = 0.985


def wrap(body: str, name: str, size_pt: float, width_pt_avail: float,
         tracking_hundredths: float = 0) -> list[str]:
    """
    Greedy wrap on spaces, honouring hard newlines.

    PowerPoint wraps greedily too, so a line that fits here fits there. The one
    place they diverge is a single word wider than the column, which PowerPoint
    will overhang rather than break — the layout avoids relying on that.
    """
    out: list[str] = []
    for hard in body.split("\n"):
        if not hard:
            out.append("")
            continue
        line = ""
        for word in hard.split(" "):
            trial = f"{line} {word}".strip()
            if not line or width_pt(trial, name, size_pt, tracking_hundredths) <= width_pt_avail:
                line = trial
            else:
                out.append(line)
                line = word
        out.append(line)
    return out


def lines(body: str, name: str, size_pt: float, width_in: float,
          tracking_hundredths: float = 0) -> int:
    return len(wrap(body, name, size_pt, width_in * 72, tracking_hundredths))


def height_in(body: str, name: str, size_pt: float, width_in: float, leading: float = 1.35,
              tracking_hundredths: float = 0) -> float:
    """Height of the wrapped block, in inches, at the exact leading used."""
    n = lines(body, name, size_pt, width_in, tracking_hundredths)
    return n * size_pt * leading / 72.0
