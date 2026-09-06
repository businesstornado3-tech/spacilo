# EarnRoom self-hosted Wan 2.2 video worker.
# Base image carries CUDA 12.4 + cuDNN, matching the pinned torch 2.6 build.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/srv/models

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.11 python3-pip ffmpeg fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY *.py ./
# Approved EarnRoom artwork is mounted, never baked in.
VOLUME ["/srv/models", "/srv/brand", "/srv/output"]

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
