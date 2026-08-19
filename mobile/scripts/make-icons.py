"""
Android launcher and splash assets, derived from the same brand master the
website and the deck use.

The mark is used, never the lockup: a launcher icon is 48dp on a phone, and a
wordmark scaled into that is an illegible smear. Adaptive icons also crop to a
circle on most launchers, so the foreground is padded to keep the mark inside
the safe zone rather than clipped at the corners.

    python mobile/scripts/make-icons.py
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "public" / "brand"
OUT = ROOT / "mobile" / "assets"

# The logo card's own navy. The icon sits on the brand ground rather than on
# white, so it reads at 48dp against any wallpaper.
NAVY = (10, 26, 63, 255)

# Android crops adaptive icons to a shape that can be a circle. Only the middle
# ~66% of the foreground is guaranteed visible, so the mark occupies 56% and
# keeps a margin even on the most aggressive mask.
SAFE_FRACTION = 0.56


def fit(mark: Image.Image, canvas: int, fraction: float, background=None) -> Image.Image:
    """Centres the mark on a square canvas, scaled to `fraction` of its width."""
    target = int(canvas * fraction)
    w, h = mark.size
    scale = min(target / w, target / h)
    resized = mark.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

    out = Image.new("RGBA", (canvas, canvas), background or (0, 0, 0, 0))
    out.paste(
        resized,
        ((canvas - resized.width) // 2, (canvas - resized.height) // 2),
        resized,
    )
    return out


def main() -> None:
    mark = Image.open(BRAND / "mycampusview-mark.png").convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)

    written = []

    # Legacy square icon: the mark on the brand navy, edge to edge.
    icon = fit(mark, 1024, 0.62, NAVY)
    icon.save(OUT / "icon.png")
    written.append("icon.png")

    # Adaptive icon: transparent foreground over a flat navy background layer.
    fit(mark, 1024, SAFE_FRACTION).save(OUT / "android-icon-foreground.png")
    Image.new("RGBA", (1024, 1024), NAVY).save(OUT / "android-icon-background.png")
    written.append("android-icon-foreground.png")
    written.append("android-icon-background.png")

    # Monochrome (themed icons, Android 13+): the silhouette only. Android
    # tints it, so colour here would be discarded — alpha is all that matters.
    mono = fit(mark, 1024, SAFE_FRACTION)
    alpha = mono.getchannel("A")
    silhouette = Image.new("RGBA", mono.size, (0, 0, 0, 0))
    silhouette.putalpha(alpha)
    silhouette.save(OUT / "android-icon-monochrome.png")
    written.append("android-icon-monochrome.png")

    # Splash: the mark alone on transparency. The navy comes from the splash
    # backgroundColor in app.json, so the two cannot drift apart.
    fit(mark, 512, 0.72).save(OUT / "splash-mark.png")
    written.append("splash-mark.png")

    # Favicon, for `expo start --web` during development.
    fit(mark, 96, 0.72, NAVY).save(OUT / "favicon.png")
    written.append("favicon.png")

    for name in written:
        size = (OUT / name).stat().st_size
        print(f"  {name:34} {size / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
