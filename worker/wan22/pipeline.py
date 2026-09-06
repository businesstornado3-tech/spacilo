"""Real Wan 2.2 inference.

No stub, no placeholder clip. If the model or the GPU is not available the
worker reports that state; it never returns footage it did not generate.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass

from config import ModelRecord

_LOCK = threading.Lock()
_PIPE = None
_LOADED_FOR: str | None = None

# Frame geometry per aspect ratio, at the two supported tiers. Wan wants
# dimensions divisible by 16.
GEOMETRY: dict[tuple[str, str], tuple[int, int]] = {
    ("9:16", "360p"): (368, 640),
    ("9:16", "720p"): (720, 1280),
    ("16:9", "360p"): (640, 368),
    ("16:9", "720p"): (1280, 720),
    ("1:1", "360p"): (368, 368),
    ("1:1", "720p"): (720, 720),
}


class GenerationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Generated:
    path: str
    width: int
    height: int
    fps: int
    frames: int
    seconds: float


def geometry(aspect: str, resolution: str) -> tuple[int, int]:
    try:
        return GEOMETRY[(aspect, resolution)]
    except KeyError as error:  # pragma: no cover - guarded by the app layer
        raise GenerationError(f"Unsupported aspect/resolution: {aspect} {resolution}") from error


def load(model: ModelRecord, device: str):
    """Loads the pinned checkpoint once and keeps it resident."""
    global _PIPE, _LOADED_FOR
    with _LOCK:
        if _PIPE is not None and _LOADED_FOR == model.model_id:
            return _PIPE
        import torch  # imported lazily so the module can be inspected without CUDA
        from diffusers import AutoencoderKLWan, WanPipeline

        vae = AutoencoderKLWan.from_pretrained(
            model.repo, revision=model.revision, subfolder="vae", torch_dtype=torch.float32
        )
        pipe = WanPipeline.from_pretrained(
            model.repo, revision=model.revision, vae=vae, torch_dtype=torch.bfloat16
        )
        pipe.to(device)
        pipe.enable_attention_slicing()
        if hasattr(pipe, "enable_model_cpu_offload") and os.environ.get("VIDEO_WORKER_OFFLOAD") == "1":
            pipe.enable_model_cpu_offload()
        _PIPE = pipe
        _LOADED_FOR = model.model_id
        return pipe


def generate(
    *,
    model: ModelRecord,
    device: str,
    prompt: str,
    aspect: str,
    resolution: str,
    seconds: int,
    fps: int,
    seed: int,
    destination: str,
    negative_prompt: str = "",
    progress=None,
) -> Generated:
    import torch
    from diffusers.utils import export_to_video

    width, height = geometry(aspect, resolution)
    frames = max(17, int(seconds * fps) // 4 * 4 + 1)  # Wan wants 4n+1 frames
    pipe = load(model, device)
    generator = torch.Generator(device=device).manual_seed(seed)

    callback = None
    if progress is not None:
        total = int(os.environ.get("VIDEO_WORKER_STEPS", "40"))

        def callback(_pipe, step, _timestep, kwargs):  # noqa: ANN001
            progress(min(95, int((step + 1) / total * 95)))
            return kwargs

    output = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt or None,
        height=height,
        width=width,
        num_frames=frames,
        guidance_scale=float(os.environ.get("VIDEO_WORKER_GUIDANCE", "5.0")),
        num_inference_steps=int(os.environ.get("VIDEO_WORKER_STEPS", "40")),
        generator=generator,
        callback_on_step_end=callback,
    )
    export_to_video(output.frames[0], destination, fps=fps)
    if not os.path.isfile(destination) or os.path.getsize(destination) == 0:
        raise GenerationError("The model produced no output file.")
    return Generated(
        path=destination,
        width=width,
        height=height,
        fps=fps,
        frames=frames,
        seconds=round(frames / fps, 2),
    )
