"""Render Hush's toolbar icons (amber crescent on an ink tile). Run: python3 scripts/make_icons.py"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
SS = 8  # supersampling factor for smooth edges


def render(size: int) -> Image.Image:
    s = size * SS
    # Ink tile, lighter at the top
    top, bottom = (38, 42, 54), (11, 12, 16)
    grad = Image.linear_gradient("L").resize((s, s))
    tile = Image.composite(Image.new("RGBA", (s, s), bottom + (255,)), Image.new("RGBA", (s, s), top + (255,)), grad)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.27), fill=255)

    # Crescent: a disc minus an offset disc (same geometry as the popup's SVG mark)
    u = s / 40
    moon = Image.new("L", (s, s), 0)
    ImageDraw.Draw(moon).ellipse(((19 - 10) * u, (20 - 10) * u, (19 + 10) * u, (20 + 10) * u), fill=255)
    cut = Image.new("L", (s, s), 0)
    ImageDraw.Draw(cut).ellipse(((24.5 - 9) * u, (15.5 - 9) * u, (24.5 + 9) * u, (15.5 + 9) * u), fill=255)
    moon = ImageChops.subtract(moon, cut)
    tile.paste(Image.new("RGBA", (s, s), (242, 196, 109, 255)), (0, 0), moon)

    tile.putalpha(mask)
    return tile.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        render(size).save(OUT / f"icon{size}.png")
        print(f"icons/icon{size}.png")
