# EarnRoom self-hosted Wan 2.2 video worker

This is the GPU service EarnRoom talks to for marketing video. It is deliberately
a separate deployment: the EarnRoom web app runs on an edge runtime with no GPU,
no CUDA and no ffmpeg, so it can never run inference itself.

**This worker cannot run inside the Lovable build environment — that environment
has no GPU (`nvidia-smi` is not present). It must be deployed on a GPU host.**

## Model and licence

| | |
|---|---|
| Default model | `Wan-AI/Wan2.2-TI2V-5B-Diffusers` |
| Pinned revision | `b8fff7315c768468a5333511427288870b2e9635` |
| Alternative (higher quality) | `Wan-AI/Wan2.2-T2V-A14B-Diffusers` rev `5be7df9619b54f4e2667b2755bc6a756675b5cd7` |
| Licence | Apache License 2.0 |
| Verified on | 2026-09-06, read from the model repository metadata |
| Commercial use | Permitted, no revenue ceiling, no territory restriction |
| Output rights | No claim over generated footage |
| Attribution | Keep the licence/NOTICE in the image; no on-screen credit required |

Suitable for UK commercial marketing use. The worker refuses to start on any
model not listed in `config.py` — it never silently substitutes another model.

Dependencies are all permissive (Apache-2.0 / BSD / MIT / LGPL-linked ffmpeg via
system package). Use an ffmpeg build without `--enable-gpl-nonfree` codecs; the
Ubuntu package is fine.

## Infrastructure required

Default configuration — TI2V-5B, 720p, up to 10s:

| Item | Requirement |
|---|---|
| GPU | 24 GB VRAM (RTX 4090 / L4 24GB / A10G). 48 GB (A6000/A100) for the A14B model |
| CPU | 8 vCPU |
| RAM | 32 GB |
| Disk | 120 GB (≈60 GB weights + cache + outputs) |
| Runtime | CUDA 12.4, cuDNN, Python 3.11, torch 2.6, ffmpeg 6 |
| Generation time | ≈25–40 s of wall clock per second of 720p output on a 4090; a 8s clip ≈ 4–6 min, plus ~2 min first-run model load |
| GPU utilisation | ~95–100% for the whole generation; 1 job at a time |
| Compute cost | RTX 4090 on a GPU marketplace ≈ £0.30–£0.55/hour → **≈ £0.03–£0.06 per 8s clip**. An always-on A10G on a hyperscaler is ≈ £0.70/hour → ≈ £500/month. This is **not** £0 — only the video-service/API fee is £0. |

## Simplest practical deployment

1. Rent one GPU box with a public HTTPS endpoint (RunPod, Vast.ai, Lambda,
   Hetzner GEX, or your own machine behind Cloudflare Tunnel).
2. `docker build -t earnroom-wan .` and run it:

```bash
docker run -d --gpus all -p 8080:8080 \
  -e VIDEO_WORKER_TOKEN="$(openssl rand -hex 32)" \
  -v /data/models:/srv/models -v /data/brand:/srv/brand -v /data/output:/srv/output \
  earnroom-wan
```

3. Copy the approved EarnRoom artwork (`earnroom-lockup.png`,
   `earnroom-icon-transparent.png`) into `/data/brand`. Missing artwork fails the
   job loudly — it never produces an unbranded film.
4. Put it behind HTTPS (Caddy, Cloudflare Tunnel). Plain HTTP is not acceptable:
   the bearer token would travel in clear.
5. In EarnRoom, set the backend secrets `VIDEO_WORKER_URL` and
   `VIDEO_WORKER_TOKEN` (and optionally `VIDEO_INFRA_PENCE_PER_GPU_MINUTE`).
   These are server-side only — the token is never sent to the browser and the
   Founder Console shows only the connection state.

## API

All endpoints require `Authorization: Bearer <VIDEO_WORKER_TOKEN>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status, model, revision, licence, running/queued/capacity |
| POST | `/jobs` | submit a job (prompt, aspect, seconds, resolution, fps, seed, overlay, reuseJobId) |
| GET | `/jobs/{id}` | state, progress, failure reason, measured file, generation seconds |
| POST | `/jobs/{id}/cancel` | cancel queued or running work and release the GPU |
| GET | `/jobs/{id}/output` | the finished, branded MP4 |

## What the worker guarantees

- One job on the GPU at a time; the rest queue in order; day/queue limits enforced.
- Branding is composited with ffmpeg from the approved PNG artwork and the exact
  approved strings EarnRoom sends. The model is instructed never to draw a logo.
- Every finished file is measured with `ffprobe` (size, duration, dimensions,
  codec, frame rate, audio) before it is offered, and the branded file is
  measured again after compositing. A mismatch fails the job.
- `reuseJobId` re-brands an already generated core film for another platform, so
  a four-platform campaign that shares a frame shape costs one generation.
- No paid provider exists in this service at all.
