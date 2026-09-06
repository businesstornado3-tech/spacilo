"""Worker configuration and the pinned model record.

Nothing here guesses. The checkpoint, its revision and its licence were read
from the model repository on the date recorded below, and the worker refuses to
start on a model that is not in this table.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ModelRecord:
    model_id: str
    repo: str
    revision: str
    licence: str
    licence_url: str
    licence_verified_on: str
    min_vram_gb: int
    max_seconds: int
    default_fps: int


# Verified against the Hugging Face model API on 2026-09-06. Both checkpoints
# are Apache-2.0: commercial use permitted, no revenue ceiling, no territory
# carve-out, no claim over generated output.
MODELS: dict[str, ModelRecord] = {
    "wan2.2-ti2v-5b": ModelRecord(
        model_id="wan2.2-ti2v-5b",
        repo="Wan-AI/Wan2.2-TI2V-5B-Diffusers",
        revision="b8fff7315c768468a5333511427288870b2e9635",
        licence="Apache License 2.0",
        licence_url="https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers",
        licence_verified_on="2026-09-06",
        min_vram_gb=24,
        max_seconds=10,
        default_fps=24,
    ),
    "wan2.2-t2v-a14b": ModelRecord(
        model_id="wan2.2-t2v-a14b",
        repo="Wan-AI/Wan2.2-T2V-A14B-Diffusers",
        revision="5be7df9619b54f4e2667b2755bc6a756675b5cd7",
        licence="Apache License 2.0",
        licence_url="https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B-Diffusers",
        licence_verified_on="2026-09-06",
        min_vram_gb=48,
        max_seconds=10,
        default_fps=24,
    ),
}


@dataclass(frozen=True)
class WorkerSettings:
    token: str
    model: ModelRecord
    max_concurrent_jobs: int
    max_queue_length: int
    max_jobs_per_day: int
    max_seconds: int
    brand_asset_dir: str
    output_dir: str
    device: str


def settings() -> WorkerSettings:
    token = os.environ.get("VIDEO_WORKER_TOKEN", "").strip()
    if not token:
        raise RuntimeError("VIDEO_WORKER_TOKEN must be set; the worker refuses to run unauthenticated.")
    model_id = os.environ.get("VIDEO_WORKER_MODEL", "wan2.2-ti2v-5b")
    if model_id not in MODELS:
        raise RuntimeError(
            f"Unknown model '{model_id}'. The worker never substitutes a different model. "
            f"Known: {', '.join(sorted(MODELS))}"
        )
    return WorkerSettings(
        token=token,
        model=MODELS[model_id],
        max_concurrent_jobs=int(os.environ.get("VIDEO_WORKER_MAX_CONCURRENT_JOBS", "1")),
        max_queue_length=int(os.environ.get("VIDEO_WORKER_MAX_QUEUE_LENGTH", "8")),
        max_jobs_per_day=int(os.environ.get("VIDEO_WORKER_MAX_JOBS_PER_DAY", "6")),
        max_seconds=int(os.environ.get("VIDEO_WORKER_MAX_VIDEO_SECONDS", "10")),
        brand_asset_dir=os.environ.get("VIDEO_WORKER_BRAND_ASSET_DIR", "/srv/brand"),
        output_dir=os.environ.get("VIDEO_WORKER_OUTPUT_DIR", "/srv/output"),
        device=os.environ.get("VIDEO_WORKER_DEVICE", "cuda"),
    )
