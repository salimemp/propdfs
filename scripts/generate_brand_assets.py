#!/usr/bin/env python3
"""
Generate the rasterized brand assets for ProPDFs from the master
SVGs in frontend/assets/brand/.

Why a script (not just hand-rolled PNGs in git):
  - One source of truth. If we tweak the SVG, every PNG rerenders
    on the next CI run / local pre-deploy.
  - We can regenerate missing sizes (Chrome's PWA spec keeps
    growing) by editing the SIZES list, not by hand-exporting from
    a design tool.

Outputs (all under frontend/web/ unless --out is overridden):

  favicon-16.png          Legacy favicon (16x16)
  favicon-32.png          Modern favicon (32x32)
  favicon-48.png          Windows tile (48x48)
  apple-touch-icon.png    iOS home screen (180x180)
  icon-192.png            PWA / Android (192x192)
  icon-512.png            PWA splash (512x512)
  icon-maskable-192.png   Maskable PWA icon (192x192, safe area)
  icon-maskable-512.png   Maskable PWA icon (512x512, safe area)
  og-default.png          Social share image (1200x630)
  twitter-card.png        Twitter summary_large_image (1200x630)

We use cairosvg (which needs the system libcairo on macOS — see
README in this dir for Homebrew install). For CI we install
libcairo2 via apt.

Maskable icons have a 40% safe-area inset (per the W3C spec) so
the OS can crop the icon into any shape — circle, squircle, etc.
— without losing critical content. We render the mark at 60% of
the icon size, centered.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BRAND_DIR = Path("frontend/assets/brand")
WEB_DIR = Path("frontend/web")

# SIZES: list of (source_svg, output_png, width, height, optional_modifier)
# `optional_modifier` is a callable that takes the svg string and
# returns a new one (used for safe-area inset on maskable icons).
SIZES = [
    # source                  output                    size          modifier
    ("favicon.svg", "favicon-16.png", (16, 16), None),
    ("favicon.svg", "favicon-32.png", (32, 32), None),
    ("favicon.svg", "favicon-48.png", (48, 48), None),
    ("favicon.svg", "apple-touch-icon.png", (180, 180), None),
    ("favicon.svg", "icon-192.png", (192, 192), None),
    ("favicon.svg", "icon-512.png", (512, 512), None),
    # Maskable variants — same mark, but with a 40% safe-area inset
    # so the OS can crop to a circle/squircle without clipping the P.
    ("favicon.svg", "icon-maskable-192.png", (192, 192), "maskable"),
    ("favicon.svg", "icon-maskable-512.png", (512, 512), "maskable"),
]


def render_og_card(out: Path, size=(1200, 630)) -> None:
    """Generate the 1200x630 Open Graph share image.

    Different design from the icon: the brand mark on the left
    (large, in color), the wordmark and tagline on the right.
    We render this with cairosvg using a hand-built SVG — OG
    cards are unique enough that reusing the mark SVG is harder
    than just inlining the layout.
    """
    w, h = size
    bg_x = 80
    mark_size = 360
    mark_y = (h - mark_size) // 2
    word_x = bg_x + mark_size + 80
    word_baseline_top = h // 2 - 30
    word_baseline_bot = h // 2 + 50
    tagline_y = h // 2 + 110

    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
        '  <defs>\n'
        '    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">\n'
        '      <stop offset="0%" stop-color="#F8FAFC"/>\n'
        '      <stop offset="100%" stop-color="#E2E8F0"/>\n'
        '    </linearGradient>\n'
        '  </defs>\n'
        f'  <rect width="{w}" height="{h}" fill="url(#bg)"/>\n'
        f'  <g transform="translate({bg_x}, {mark_y})">\n'
        f'    <rect x="0" y="0" width="{mark_size}" height="{mark_size}" '
        f'rx="78" ry="78" fill="#0F172A"/>\n'
        f'    <path d="M {mark_size} 0 L {mark_size} {mark_size * 0.25:.0f} L {mark_size * 0.75:.0f} 0 Z" '
        f'fill="#DC2626"/>\n'
        f'    <g transform="scale({mark_size / 64:.4f})">\n'
        '      <path d="M 18 16 L 18 50 L 26 50 L 26 38 L 36 38 '
        'C 43 38 48 33 48 27 C 48 21 43 16 36 16 Z '
        'M 26 23 L 35 23 C 38 23 40 25 40 27 C 40 29 38 31 35 31 L 26 31 Z" '
        'fill="#FFFFFF"/>\n'
        '    </g>\n'
        '  </g>\n'
        '  <g fill="#0F172A">\n'
        f'    <text x="{word_x}" y="{word_baseline_top}" '
        'font-family="Inter, -apple-system, BlinkMacSystemFont, '
        "'Segoe UI', 'Helvetica Neue', Arial, sans-serif\" "
        f'font-size="148" font-weight="600" letter-spacing="-4.5">'
        'Pro<tspan font-weight="800">PDFs</tspan></text>\n'
        f'    <text x="{word_x}" y="{word_baseline_bot}" '
        'font-family="Inter, -apple-system, BlinkMacSystemFont, '
        "'Segoe UI', 'Helvetica Neue', Arial, sans-serif\" "
        f'font-size="44" font-weight="700" fill="#DC2626" letter-spacing="-0.5">'
        'Every PDF tool. Private. Free.</text>\n'
        f'    <text x="{word_x}" y="{tagline_y}" '
        'font-family="Inter, -apple-system, BlinkMacSystemFont, '
        "'Segoe UI', 'Helvetica Neue', Arial, sans-serif\" "
        f'font-size="26" font-weight="500" fill="#475569" letter-spacing="0.5">'
        '32 tools &#183; In-browser &#183; End-to-end encrypted '
        '&#183; GDPR-ready &#183; WCAG 2.1 AA</text>\n'
        '  </g>\n'
        '</svg>\n'
    )
    _cairo_render(svg.encode("utf-8"), w, h, out)


def maskable_svg(source_svg: str) -> bytes:
    """Wrap `source_svg` in a 40% safe-area inset for maskable PWA icons.

    The W3C maskable icon spec requires that the "important" content
    fit inside a centered circle covering 40% of the icon (the rest
    may be cropped by the OS into any shape). We achieve that by
    scaling the source SVG to 60% and centering it on a transparent
    background.
    """
    # Strip the leading XML declaration from the source — the
    # wrapper below provides its own. Without this, cairosvg sees
    # a document with two <?xml ?> prologues and rejects it.
    stripped = source_svg
    if stripped.lstrip().startswith("<?xml"):
        stripped = stripped[stripped.index("?>") + 2 :].lstrip()

    # Parse the source viewBox so we know the source's aspect ratio.
    # We assume square (64x64) for the favicon.svg.
    src_size = 64
    target = 512
    inner = int(target * 0.6)  # 307
    offset = (target - inner) // 2  # 102

    # Use plain string concat (not textwrap.dedent) — the inner
    # content has its own indentation and dedent was leaving the
    # wrapper with stray leading whitespace that the strict XML
    # parser rejects. Manual indentation below.
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {target} {target}" width="{target}" height="{target}">\n'
        f'  <g transform="translate({offset}, {offset}) '
        f'scale({inner / src_size:.4f})">\n'
        f"{stripped}\n"
        "  </g>\n"
        "</svg>\n"
    ).encode("utf-8")


def _cairo_render(svg_bytes: bytes, w: int, h: int, out: Path) -> None:
    """Render svg_bytes at (w, h) to out via cairosvg.

    macOS needs the system libcairo on the dylib search path. We
    look in the standard Homebrew location and add it if found.
    On Linux this is a no-op (libcairo is in /usr/lib).
    """
    env = os.environ.copy()
    cairo_dirs = [
        "/opt/homebrew/Cellar/cairo/1.18.4/lib",  # brew cairo 1.18.4
        "/opt/homebrew/lib",
        "/usr/lib",
        "/usr/local/lib",
    ]
    existing = env.get("DYLD_LIBRARY_PATH", "")
    for d in cairo_dirs:
        if Path(d, "libcairo.2.dylib").exists() and d not in existing:
            env["DYLD_LIBRARY_PATH"] = (
                f"{d}:{existing}" if existing else d
            )
            break

    try:
        import cairosvg  # type: ignore
    except OSError as e:
        print(f"  ✗ cairosvg import failed: {e}", file=sys.stderr)
        print(
            "  Hint: install libcairo (brew install cairo) "
            "or set DYLD_LIBRARY_PATH to the libcairo dir.",
            file=sys.stderr,
        )
        raise

    cairosvg.svg2png(
        bytestring=svg_bytes,
        output_width=w,
        output_height=h,
        write_to=str(out),
    )


def main() -> int:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else WEB_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    for source, dest_name, (w, h), modifier in SIZES:
        source_path = BRAND_DIR / source
        if not source_path.exists():
            print(f"  ✗ {source_path} missing — skipping", file=sys.stderr)
            continue

        source_svg = source_path.read_text(encoding="utf-8")
        if modifier == "maskable":
            payload = maskable_svg(source_svg)
        else:
            payload = source_svg.encode("utf-8")

        out = out_dir / dest_name
        _cairo_render(payload, w, h, out)
        print(f"  wrote {out}  ({w}x{h})")

    # OG card (separate generator — unique layout)
    render_og_card(out_dir / "og-default.png")
    print(f"  wrote {out_dir / 'og-default.png'}  (1200x630)")
    # Twitter card uses the same artwork
    render_og_card(out_dir / "twitter-card.png")
    print(f"  wrote {out_dir / 'twitter-card.png'}  (1200x630)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
