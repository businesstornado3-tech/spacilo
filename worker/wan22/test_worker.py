"""Worker checks that need no GPU.

Run on the worker host (or anywhere with ffmpeg):  python3 test_worker.py

These cover the parts that must be right before a GPU is ever rented:
the licence record, the geometry table, and — most importantly — that the
approved branding is genuinely burned into a real MP4.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

import branding
import pipeline
from config import MODELS


def check(condition: bool, label: str) -> None:
    print(("PASS  " if condition else "FAIL  ") + label)
    if not condition:
        sys.exit(1)


def test_licence_record() -> None:
    for record in MODELS.values():
        check(record.licence == "Apache License 2.0", f"{record.model_id} licence is Apache-2.0")
        check(len(record.revision) == 40, f"{record.model_id} revision is pinned")
        check(bool(record.licence_verified_on), f"{record.model_id} licence verification date recorded")


def test_geometry() -> None:
    check(pipeline.geometry("9:16", "720p") == (720, 1280), "9:16 720p geometry")
    check(pipeline.geometry("16:9", "360p") == (640, 368), "16:9 360p geometry")
    try:
        pipeline.geometry("4:3", "720p")
    except pipeline.GenerationError:
        check(True, "unsupported aspect refused")
    else:
        check(False, "unsupported aspect refused")


def test_missing_asset_fails_loudly() -> None:
    with tempfile.TemporaryDirectory() as empty:
        try:
            branding._asset_path("earnroom-lockup.png", empty)
        except branding.BrandingError:
            check(True, "missing approved artwork fails the job rather than shipping unbranded")
        else:
            check(False, "missing approved artwork fails the job rather than shipping unbranded")


def test_real_compositing() -> None:
    with tempfile.TemporaryDirectory() as work:
        brand = os.path.join(work, "brand")
        os.makedirs(brand)
        image = Image.new("RGBA", (600, 200), (15, 118, 110, 255))
        ImageDraw.Draw(image).text((40, 90), "EarnRoom", fill="white")
        image.save(os.path.join(brand, "earnroom-lockup.png"))

        core = os.path.join(work, "core.mp4")
        final = os.path.join(work, "final.mp4")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=gray:size=720x1280:rate=24:duration=8",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", core],
            capture_output=True,
            check=True,
        )
        overlay = {
            "aspect": "9:16",
            "seconds": 8,
            "safeArea": {"top": 0.08, "bottom": 0.2, "left": 0.06, "right": 0.12},
            "layers": [
                {"kind": "logo", "asset": "earnroom-lockup.png", "position": "centre",
                 "width": 0.46, "opacity": 1, "fromSeconds": 5, "toSeconds": None},
                {"kind": "text", "role": "tagline", "value": "Turn spare space into potential income",
                 "position": "centre", "fromSeconds": 5, "toSeconds": None},
                {"kind": "text", "role": "website", "value": "earnroom.co.uk",
                 "position": "centre", "fromSeconds": 5, "toSeconds": None},
            ],
        }
        result = branding.composite(core, final, overlay, 720, 1280, brand, False)
        check(result.layers_applied == 3, "all approved layers composited")
        check(os.path.getsize(final) > 10_000, "branded file has real bytes")

        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=width,height,codec_name",
             "-show_entries", "format=duration", "-of", "csv=p=0", final],
            capture_output=True, text=True, check=True,
        ).stdout
        check("720" in probe and "1280" in probe, "branded file keeps the requested frame size")
        check("h264" in probe, "branded file is h264")

        # The branded frames must actually differ from the unbranded ones.
        before = os.path.join(work, "before.png")
        after = os.path.join(work, "after.png")
        for source, target in ((core, before), (final, after)):
            subprocess.run(["ffmpeg", "-y", "-ss", "6", "-i", source, "-frames:v", "1", target],
                           capture_output=True, check=True)
        check(open(before, "rb").read() != open(after, "rb").read(),
              "the end-card frame genuinely changed — branding is burned in, not just described")


if __name__ == "__main__":
    test_licence_record()
    test_geometry()
    test_missing_asset_fails_loudly()
    test_real_compositing()
    print("\nAll worker checks passed.")
