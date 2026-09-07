"""EarnRoom desktop video worker.

Runs on the founder's own computer. It pairs once with a short setup code from
the Founder Console, stores its own access token locally, then reports in every
30 seconds with what the machine can actually do.

It only ever sends: a name, hardware facts read from this machine, which video
models are installed here, and a status. It is never sent, and never asks for,
renter or host data.

Usage:
    python earnroom_worker.py --pair ABCD2345 --site https://earnroom.co.uk
    python earnroom_worker.py --site https://earnroom.co.uk
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib import error, request

HEARTBEAT_SECONDS = 30
STATE_DIR = Path(os.environ.get("EARNROOM_WORKER_HOME", Path.home() / ".earnroom-worker"))
STATE_FILE = STATE_DIR / "worker.json"


# ----------------------------------------------------------------- state


def read_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text("utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def write_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), "utf-8")
    try:  # Owner-only, so the token is not readable by other accounts.
        os.chmod(STATE_FILE, 0o600)
    except OSError:
        pass


# -------------------------------------------------------------- hardware


def nvidia_gpu() -> dict:
    """Reads the dedicated graphics memory, and nothing it cannot verify."""
    binary = shutil.which("nvidia-smi")
    if not binary:
        return {}
    try:
        output = subprocess.run(
            [binary, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=15,
            check=True,
        ).stdout.strip().splitlines()
    except (subprocess.SubprocessError, OSError):
        return {}
    if not output:
        return {}
    name, _, memory = output[0].partition(",")
    try:
        vram_gb = round(int(memory.strip()) / 1024, 1)
    except ValueError:
        return {"gpuModel": name.strip()}
    return {"gpuModel": name.strip(), "dedicatedVramGb": vram_gb, "accelerator": "CUDA"}


def system_memory_gb() -> float | None:
    try:
        if hasattr(os, "sysconf") and "SC_PAGE_SIZE" in os.sysconf_names:
            return round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1024**3, 1)
    except (ValueError, OSError):
        pass
    if platform.system() == "Windows":
        try:
            import ctypes

            class Status(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            status = Status()
            status.dwLength = ctypes.sizeof(Status)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
            return round(status.ullTotalPhys / 1024**3, 1)
        except Exception:  # noqa: BLE001 - a missing figure is reported as unknown
            return None
    return None


def hardware_profile() -> dict:
    profile: dict = {
        "operatingSystem": f"{platform.system()} {platform.release()}",
        "cpuThreads": os.cpu_count(),
    }
    ram = system_memory_gb()
    if ram is not None:
        profile["ramGb"] = ram
    profile.update(nvidia_gpu())
    return profile


def installed_models() -> list[str]:
    """Only models actually present on this machine are reported."""
    root = Path(os.environ.get("EARNROOM_MODEL_DIR", STATE_DIR / "models"))
    if not root.is_dir():
        return []
    return sorted(entry.name for entry in root.iterdir() if entry.is_dir())[:50]


# ------------------------------------------------------------------ http


def post(url: str, body: dict, token: str | None = None) -> dict:
    payload = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = request.Request(url, data=payload, headers=headers, method="POST")
    with request.urlopen(req, timeout=60) as response:  # noqa: S310 - fixed EarnRoom host
        return json.loads(response.read().decode("utf-8") or "{}")


def pair(site: str, code: str, label: str) -> dict:
    result = post(
        f"{site.rstrip('/')}/api/public/video-worker/pair",
        {
            "code": code,
            "label": label,
            "hardware": hardware_profile(),
            "installedModels": installed_models(),
        },
    )
    state = {
        "site": site.rstrip("/"),
        "token": result["token"],
        "workerId": result["workerId"],
        "heartbeatUrl": result.get(
            "heartbeatUrl", f"{site.rstrip('/')}/api/public/video-worker/heartbeat"
        ),
        "label": label,
    }
    write_state(state)
    return state


def heartbeat(state: dict, status: str = "IDLE", detail: str = "Ready.") -> None:
    post(
        state["heartbeatUrl"],
        {
            "status": status,
            "detail": detail,
            "queued": 0,
            "hardware": hardware_profile(),
            "installedModels": installed_models(),
        },
        token=state["token"],
    )


# ------------------------------------------------------------------ main


def main() -> int:
    parser = argparse.ArgumentParser(description="EarnRoom desktop video worker")
    parser.add_argument("--site", default=os.environ.get("EARNROOM_SITE", "https://earnroom.co.uk"))
    parser.add_argument("--pair", dest="code", help="Setup code from the Founder Console")
    parser.add_argument("--name", default=platform.node() or "My computer")
    args = parser.parse_args()

    state = read_state()
    if args.code:
        try:
            state = pair(args.site, args.code, args.name)
        except error.HTTPError as failure:
            body = failure.read().decode("utf-8", "replace")
            print(f"Pairing failed ({failure.code}): {body}", file=sys.stderr)
            return 1
        print(f"Paired as {state['label']}. This computer now appears in the Founder Console.")

    if not state.get("token"):
        print("Not paired yet. Run again with --pair <setup code>.", file=sys.stderr)
        return 1

    print("Reporting in every 30 seconds. Leave this window open. Press Ctrl+C to stop.")
    while True:
        try:
            heartbeat(state)
        except (error.URLError, error.HTTPError, TimeoutError) as failure:
            print(f"Could not reach EarnRoom: {failure}", file=sys.stderr)
        time.sleep(HEARTBEAT_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
