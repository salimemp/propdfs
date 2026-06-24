"""Public asset routes.

Currently serves:
  * Blog cover images at `/assets/blog/{filename}.jpg` —
    generated on-the-fly from the post title via PIL, so we
    don't have to ship a 5-image CDN. Each post gets a stable
    gradient (hash of the slug → hue) and the title rendered
    over it.

Why generate on-the-fly: Railway's filesystem is ephemeral,
so we can't write the images to disk at startup and expect
them to survive a redeploy. On-the-fly generation is also
deterministic — same slug always returns the same image.
"""

import hashlib
import io
import re
import colorsys
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from PIL import Image, ImageDraw, ImageFont

from app.api.blog import BLOG_POSTS

router = APIRouter(prefix="/assets", tags=["assets"])


def _slug_to_hue(slug: str) -> float:
    """Stable hue in [0, 360) for a given slug. Hash → mod 360."""
    h = int(hashlib.md5(slug.encode("utf-8")).hexdigest(), 16)
    return (h % 360) / 360.0


def _hsl_to_rgb(h: float, s: float, lightness: float) -> tuple[int, int, int]:
    """Tiny HSL→RGB. h in [0,1], s and lightness in [0,1]."""
    r, g, b = colorsys.hls_to_rgb(h, lightness, s)
    return int(r * 255), int(g * 255), int(b * 255)


def _gradient(size: tuple[int, int], slug: str) -> Image.Image:
    """Diagonal gradient seeded from the slug. Two colours ~30°
    apart so the result has depth without being noisy."""
    w, h = size
    base_hue = _slug_to_hue(slug)
    c1 = _hsl_to_rgb(base_hue, 0.55, 0.30)  # dark
    c2 = _hsl_to_rgb((base_hue + 0.10) % 1.0, 0.65, 0.55)  # mid
    img = Image.new("RGB", size, c1)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        # Linear blend top-to-bottom, with a slight diagonal
        # offset so the gradient reads as "light coming from
        # the top-left" — works for both light and dark bg.
        t = y / h
        r = int(c1[0] * (1 - t) + c2[0] * t)
        g = int(c1[1] * (1 - t) + c2[1] * t)
        b = int(c1[2] * (1 - t) + c2[2] * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return img


def _find_font(size: int) -> ImageFont.ImageFont:
    """Locate a usable TrueType font. Falls back to the PIL
    default if none of the system fonts are present (slim
    Docker image might not have any)."""
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap_title(
    draw: ImageDraw.ImageDraw, title: str, font, max_width: int
) -> list[str]:
    """Greedy word-wrap. Returns a list of lines, each ≤ max_width px."""
    words = title.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = (current + " " + word).strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _slug_from_filename(filename: str) -> Optional[str]:
    """`pdf-tools-2025.jpg` → `pdf-tools-2025`. Returns None
    if the filename is empty or doesn't have a recognised
    image extension.

    The "blog/" prefix is part of the route (we're mounted at
    `/assets/blog/`), so the parameter here is just the bare
    filename.
    """
    # Strip query string if any (defensive — should never be
    # present since the API base URL is the origin).
    filename = filename.split("?", 1)[0]
    stem = re.sub(r"\.(jpg|jpeg|png|webp)$", "", filename, flags=re.IGNORECASE)
    if not stem:
        return None
    return stem


def _resolve_post(slug: str) -> Optional[dict]:
    """Look up a post by slug. Returns None if not found."""
    for p in BLOG_POSTS:
        if p.get("slug") == slug:
            return p
    return None


@router.get("/blog/{filename:path}")
def blog_cover(filename: str):
    """Generate a cover image for a blog asset path.

    The browser sees this as a normal image response. The
    frontend's `_resolveImageUrl` prepends the API base URL,
    so the request comes in as
    `https://<api>/assets/blog/<slug>.jpg` and lands here.

    If the filename's stem matches a real post slug, we use
    that post's title + category. Otherwise (older posts may
    have a different filename convention, or a future post
    hasn't been added to the catalog yet) we generate the
    cover from the filename stem directly — better than 404.
    """
    slug = _slug_from_filename(filename)
    if slug is None:
        raise HTTPException(status_code=400, detail="Invalid blog asset path")

    # Try to find the post by exact slug first. If that misses,
    # also try matching on a substring — covers the case where
    # the API stored an abbreviated slug in featured_image but
    # the full post slug is what shows up in BLOG_POSTS.
    post = _resolve_post(slug)
    if post is None:
        for p in BLOG_POSTS:
            if slug in (p.get("slug") or "") or (p.get("slug") or "") in slug:
                post = p
                break

    if post is not None:
        title = post.get("title", slug)
        category = post.get("category", "general")
    else:
        # Fall back to the filename as the title. Convert
        # kebab-case → "Title Case" for readability.
        title = slug.replace("-", " ").title()
        category = "blog"

    # 1600x900 ≈ 16:9, matches the <img>'s aspectRatio on the
    # blog list and detail pages. Big enough to look sharp on
    # retina, small enough to ship fast (~80-150 KB per image).
    size = (1600, 900)
    img = _gradient(size, slug)
    draw = ImageDraw.Draw(img)

    # Title block. Wrap the title to ~62% of the canvas width
    # and center it.
    title_font = _find_font(72)
    max_text_width = int(size[0] * 0.78)
    lines = _wrap_title(draw, title, title_font, max_text_width)
    line_height = 88
    total_height = line_height * len(lines)
    y = (size[1] - total_height) // 2

    # Soft shadow for legibility on either bright or dark
    # gradient halves. Draw the text 3 times: dark shadow,
    # light shadow, white fill.
    for dx, dy, color in [
        (4, 4, (0, 0, 0, 200)),
        (-2, -2, (0, 0, 0, 120)),
        (0, 0, (255, 255, 255, 255)),
    ]:
        cy = y
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=title_font)
            tw = bbox[2] - bbox[0]
            x = (size[0] - tw) // 2
            draw.text((x + dx, cy + dy), line, font=title_font, fill=color)
            cy += line_height

    # Category badge in the bottom-left corner. A subtle
    # pill that matches the gradient palette.
    cat_font = _find_font(32)
    cat_text = category.upper()
    cb = draw.textbbox((0, 0), cat_text, font=cat_font)
    cw = cb[2] - cb[0]
    ch = cb[3] - cb[1]
    pad_x, pad_y = 24, 14
    badge_w = cw + pad_x * 2
    badge_h = ch + pad_y * 2
    badge_x, badge_y = 64, size[1] - badge_h - 64
    draw.rounded_rectangle(
        [(badge_x, badge_y), (badge_x + badge_w, badge_y + badge_h)],
        radius=badge_h // 2,
        fill=(255, 255, 255, 230),
    )
    draw.text(
        (badge_x + pad_x, badge_y + pad_y - 6),
        cat_text,
        font=cat_font,
        fill=(15, 23, 42, 255),  # slate-900 to match the brand
    )

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88, optimize=True)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="image/jpeg",
        headers={
            # Long cache — the image is content-addressable via
            # the slug, and we never mutate it (a slug rename
            # means a new file). 30 days is the standard "this
            # won't change" interval.
            "Cache-Control": "public, max-age=2592000, immutable",
        },
    )
