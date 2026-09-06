"""Burn the approved EarnRoom branding into the generated MP4.

The overlay specification comes from EarnRoom (`buildBrandOverlay`). The worker
does not invent copy, does not draw a logo and does not re-word anything: it
composites the supplied artwork and the supplied approved strings with ffmpeg.

If an approved asset is missing, compositing fails loudly. A silently unbranded
film must never reach the founder console.
"""

from __future__ import annotations

import os
import shlex
import subprocess
from dataclasses import dataclass


class BrandingError(RuntimeError):
    pass


FONT_ENV = "VIDEO_WORKER_FONT"
DEFAULT_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

TEXT_SIZE = {"tagline": 0.055, "website": 0.038, "cta": 0.042, "caption": 0.034}


@dataclass(frozen=True)
class Composited:
    path: str
    layers_applied: int


def _asset_path(asset: str, brand_asset_dir: str) -> str:
    name = os.path.basename(asset)
    path = os.path.join(brand_asset_dir, name)
    if not os.path.isfile(path):
        raise BrandingError(
            f"Approved brand asset '{name}' is not present in {brand_asset_dir}. "
            "Copy the approved EarnRoom artwork onto the worker before generating."
        )
    return path


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'").replace(",", r"\,")


def _between(layer: dict) -> str:
    start = float(layer.get("fromSeconds") or 0)
    end = layer.get("toSeconds")
    return f"between(t,{start},{float(end)})" if end is not None else f"gte(t,{start})"


def build_filtergraph(overlay: dict, width: int, height: int, font: str) -> tuple[str, list[str]]:
    """Returns (filter_complex, ordered list of image inputs)."""
    safe = overlay.get("safeArea") or {}
    top = float(safe.get("top", 0.05))
    bottom = float(safe.get("bottom", 0.1))
    images: list[str] = []
    chain = "[0:v]null[v0]"
    step = 0
    text_slot = 0

    for layer in overlay.get("layers", []):
        if layer.get("kind") == "logo":
            idx = len(images) + 1
            images.append(layer["asset"])
            w = max(1, int(float(layer.get("width", 0.2)) * width))
            alpha = float(layer.get("opacity", 1))
            if layer.get("position") == "centre":
                x, y = "(W-w)/2", f"(H-h)/2-{int(height * 0.10)}"
            else:
                x = f"W-w-{int(width * 0.05)}"
                y = f"H-h-{int(height * (bottom + 0.02))}"
            chain += (
                f";[{idx}:v]scale={w}:-1,format=rgba,"
                f"colorchannelmixer=aa={alpha}[logo{step}]"
                f";[v{step}][logo{step}]overlay={x}:{y}:enable='{_between(layer)}'[v{step + 1}]"
            )
            step += 1
        elif layer.get("kind") == "text":
            role = layer.get("role", "caption")
            size = max(12, int(TEXT_SIZE.get(role, 0.035) * height))
            if layer.get("position") == "lower-third":
                y = f"H-{int(height * (bottom + 0.06))}"
            else:
                y = f"(H/2)+{int(height * 0.06) + text_slot * int(size * 1.5)}"
                text_slot += 1
            chain += (
                f";[v{step}]drawtext=fontfile={font}:text='{_escape(str(layer.get('value', '')))}'"
                f":fontcolor=white:fontsize={size}:x=(w-text_w)/2:y={y}"
                f":box=1:boxcolor=black@0.45:boxborderw={max(6, size // 4)}"
                f":enable='{_between(layer)}'[v{step + 1}]"
            )
            step += 1

    if step == 0:
        raise BrandingError("The overlay specification contained no branding layers.")
    chain += f";[v{step}]format=yuv420p[vout]"
    _ = top
    return chain, images


def composite(
    source: str,
    destination: str,
    overlay: dict,
    width: int,
    height: int,
    brand_asset_dir: str,
    has_audio: bool,
) -> Composited:
    font = os.environ.get(FONT_ENV, DEFAULT_FONT)
    if not os.path.isfile(font):
        raise BrandingError(f"Font {font} is missing on the worker; text cannot be rendered.")
    resolved = {
        **overlay,
        "layers": [
            {**layer, "asset": _asset_path(layer["asset"], brand_asset_dir)}
            if layer.get("kind") == "logo"
            else layer
            for layer in overlay.get("layers", [])
        ],
    }
    graph, images = build_filtergraph(resolved, width, height, font)
    command = ["ffmpeg", "-y", "-i", source]
    for image in images:
        command += ["-i", image]
    command += ["-filter_complex", graph, "-map", "[vout]"]
    if has_audio:
        command += ["-map", "0:a?", "-c:a", "aac"]
    command += ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-movflags", "+faststart", destination]

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0 or not os.path.isfile(destination):
        raise BrandingError(
            "Branding could not be composited: "
            + (result.stderr.strip().splitlines() or ["ffmpeg failed"])[-1]
            + f" (command: {shlex.join(command[:6])} …)"
        )
    return Composited(path=destination, layers_applied=len(resolved.get("layers", [])))
