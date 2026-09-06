"""EarnRoom self-hosted Wan 2.2 worker.

Endpoints (all bearer-authenticated, and exactly the contract EarnRoom's
`self-hosted.server.ts` client speaks):

    GET  /health                 worker, model and queue state
    POST /jobs                   submit a generation job
    GET  /jobs/{id}              job state and progress
    POST /jobs/{id}/cancel       cancel a queued or running job
    GET  /jobs/{id}/output       the finished, branded MP4

One GPU, one job at a time by default; everything else waits in an ordered
queue. Every finished file is measured with ffprobe before it is offered, and
branding is composited from approved artwork, never drawn by the model.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import threading
import uuid
from dataclasses import dataclass, field

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

import branding
import pipeline
from config import settings

SETTINGS = settings()
os.makedirs(SETTINGS.output_dir, exist_ok=True)

ACTIVE = {"QUEUED", "GENERATING", "RENDERING", "VALIDATING"}


@dataclass
class Job:
    id: str
    payload: dict
    state: str = "QUEUED"
    progress: int = 0
    reason: str | None = None
    created_at: float = field(default_factory=lambda: dt.datetime.now(dt.UTC).timestamp())
    started_at: float | None = None
    finished_at: float | None = None
    output: str | None = None
    probe: dict | None = None
    cancelled: bool = False
    core_of: str | None = None


JOBS: dict[str, Job] = {}
QUEUE: list[str] = []
LOCK = threading.Lock()
RUNNING = threading.Semaphore(SETTINGS.max_concurrent_jobs)


def authorise(request: Request) -> None:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer ") or header[7:].strip() != SETTINGS.token:
        raise HTTPException(status_code=401, detail="Authentication failed.")


def probe(path: str) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError("The finished file could not be read by ffprobe.")
    data = json.loads(result.stdout)
    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    audio = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    if video is None:
        raise RuntimeError("The finished file contains no video stream.")
    num, _, den = str(video.get("avg_frame_rate", "0/1")).partition("/")
    fps = round(float(num) / float(den or 1), 2) if float(den or 1) else 0.0
    return {
        "bytes": os.path.getsize(path),
        "durationSeconds": round(float(data.get("format", {}).get("duration", 0)), 2),
        "width": int(video.get("width", 0)),
        "height": int(video.get("height", 0)),
        "codec": video.get("codec_name"),
        "fps": fps,
        "hasAudio": audio is not None,
    }


def run_job(job_id: str) -> None:
    job = JOBS[job_id]
    with RUNNING:
        if job.cancelled:
            job.state, job.reason = "CANCELLED", "Cancelled before generation started."
            return
        job.state, job.started_at = "GENERATING", dt.datetime.now(dt.UTC).timestamp()
        raw = os.path.join(SETTINGS.output_dir, f"{job_id}-raw.mp4")
        final = os.path.join(SETTINGS.output_dir, f"{job_id}.mp4")
        payload = job.payload
        try:
            source = payload.get("reuseJobId")
            reused = JOBS.get(source) if source else None
            if reused is not None and reused.state == "READY" and reused.core_path:
                # Shared core film: only the branding differs between platforms.
                raw = reused.core_path
                job.core_of = source
                job.progress = 60
                width, height = pipeline.geometry(payload["aspect"], payload["resolution"])
            else:
                generated = pipeline.generate(
                    model=SETTINGS.model,
                    device=SETTINGS.device,
                    prompt=payload["prompt"],
                    aspect=payload["aspect"],
                    resolution=payload["resolution"],
                    seconds=int(payload["seconds"]),
                    fps=int(payload.get("fps") or SETTINGS.model.default_fps),
                    seed=int(payload.get("seed") or 0),
                    destination=raw,
                    progress=lambda pct: setattr(job, "progress", pct),
                )
                width, height = generated.width, generated.height
            if job.cancelled:
                job.state, job.reason = "CANCELLED", "Cancelled during generation."
                return

            job.state, job.progress = "RENDERING", 96
            source_probe = probe(raw)
            branding.composite(
                source=raw,
                destination=final,
                overlay=payload["overlay"],
                width=width,
                height=height,
                brand_asset_dir=SETTINGS.brand_asset_dir,
                has_audio=source_probe["hasAudio"],
            )

            job.state, job.progress = "VALIDATING", 98
            measured = probe(final)
            expected = int(payload["seconds"])
            if abs(measured["durationSeconds"] - expected) > 1.5:
                raise RuntimeError(
                    f"The branded file is {measured['durationSeconds']}s, not the requested {expected}s."
                )
            if measured["width"] != width or measured["height"] != height:
                raise RuntimeError("The branded file does not match the requested frame size.")
            job.probe = measured
            job.output = final
            job.core_path = raw
            job.state, job.progress = "READY", 100
        except Exception as error:  # noqa: BLE001 - every failure is reported, never hidden
            job.state = "FAILED"
            job.reason = str(error)
        finally:
            job.finished_at = dt.datetime.now(dt.UTC).timestamp()
            with LOCK:
                if job_id in QUEUE:
                    QUEUE.remove(job_id)


Job.core_path = None  # type: ignore[attr-defined]

app = FastAPI(title="EarnRoom Wan 2.2 worker")


class JobRequest(BaseModel):
    model: str | None = None
    modelVersion: str | None = None
    prompt: str = Field(min_length=8)
    aspect: str
    seconds: int
    resolution: str
    fps: int | None = None
    seed: int | None = None
    overlay: dict
    startingFrameUrl: str | None = None
    reuseJobId: str | None = None


def counts() -> tuple[int, int, int]:
    today = dt.datetime.now(dt.UTC).date()
    running = sum(1 for j in JOBS.values() if j.state in {"GENERATING", "RENDERING", "VALIDATING"})
    queued = sum(1 for j in JOBS.values() if j.state == "QUEUED")
    started_today = sum(
        1
        for j in JOBS.values()
        if dt.datetime.fromtimestamp(j.created_at, dt.UTC).date() == today
    )
    return running, queued, started_today


@app.get("/health", dependencies=[Depends(authorise)])
def health() -> dict:
    running, queued, _ = counts()
    model = SETTINGS.model
    loaded = pipeline._LOADED_FOR is not None  # noqa: SLF001
    return {
        "status": "BUSY" if running >= SETTINGS.max_concurrent_jobs else "AVAILABLE",
        "detail": "Worker online and ready." if loaded else "Worker online; model loads on first job.",
        "model": model.model_id,
        "modelVersion": model.revision,
        "modelRepo": model.repo,
        "licence": model.licence,
        "licenceUrl": model.licence_url,
        "licenceVerifiedOn": model.licence_verified_on,
        "running": running,
        "queued": queued,
        "capacity": SETTINGS.max_concurrent_jobs,
    }


@app.post("/jobs", dependencies=[Depends(authorise)])
def create(request: JobRequest) -> JSONResponse:
    if request.model and request.model != SETTINGS.model.model_id:
        raise HTTPException(400, f"This worker only runs {SETTINGS.model.model_id}.")
    if request.seconds > SETTINGS.max_seconds:
        raise HTTPException(400, f"Maximum clip length is {SETTINGS.max_seconds}s.")
    if (request.aspect, request.resolution) not in pipeline.GEOMETRY:
        raise HTTPException(400, f"Unsupported {request.aspect} at {request.resolution}.")
    running, queued, started_today = counts()
    if started_today >= SETTINGS.max_jobs_per_day:
        raise HTTPException(429, f"Daily limit of {SETTINGS.max_jobs_per_day} jobs reached.")
    if running >= SETTINGS.max_concurrent_jobs and queued >= SETTINGS.max_queue_length:
        raise HTTPException(429, "The generation queue is full.")

    job_id = f"wan-{uuid.uuid4().hex[:16]}"
    job = Job(id=job_id, payload=request.model_dump())
    with LOCK:
        JOBS[job_id] = job
        QUEUE.append(job_id)
    threading.Thread(target=run_job, args=(job_id,), daemon=True).start()
    return JSONResponse(
        {
            "jobId": job_id,
            "state": "QUEUED" if running >= SETTINGS.max_concurrent_jobs else "GENERATING",
            "model": SETTINGS.model.model_id,
            "modelVersion": SETTINGS.model.revision,
        }
    )


@app.get("/jobs/{job_id}", dependencies=[Depends(authorise)])
def status(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job.")
    return {
        "jobId": job.id,
        "state": job.state,
        "progress": job.progress,
        "reason": job.reason,
        "probe": job.probe,
        "generationSeconds": (
            round(job.finished_at - job.started_at, 1) if job.finished_at and job.started_at else None
        ),
        "sharedCoreOf": job.core_of,
    }


@app.post("/jobs/{job_id}/cancel", dependencies=[Depends(authorise)])
def cancel(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job.")
    if job.state not in ACTIVE:
        raise HTTPException(409, f"Job is already {job.state}.")
    job.cancelled = True
    if job.state == "QUEUED":
        job.state, job.reason = "CANCELLED", "Cancelled while queued."
    return {"jobId": job.id, "state": job.state}


@app.get("/jobs/{job_id}/output", dependencies=[Depends(authorise)])
def output(job_id: str) -> FileResponse:
    job = JOBS.get(job_id)
    if job is None or job.state != "READY" or not job.output:
        raise HTTPException(409, "No finished video for this job.")
    return FileResponse(job.output, media_type="video/mp4", filename=f"{job_id}.mp4")
