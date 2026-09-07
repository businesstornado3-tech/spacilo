"""Shared core for the EarnRoom video worker.

Pairing, hardware detection and reporting in. Used by both the command-line
worker and the Windows app, so the two can never drift apart.

Only ever sends: a name, this machine's hardware facts, which video models are
installed here, a status and a queue length. It is never sent, and never asks
for, renter or host data.
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
from pathlib import Path
from urllib import request

HEARTBEAT_SECONDS = 30
DEFAULT_SITE = os.environ.get("EARNROOM_SITE", "https://earnroom.co.uk")
STATE_DIR = Path(os.environ.get("EARNROOM_WORKER_HOME", Path.home() / ".earnroom-worker"))
STATE_FILE = STATE_DIR / "worker.json"
SETUP_FILE = STATE_DIR / "setup.json"

# The installer is named after the setup session, so the app can pair itself.
SETUP_NAME = re.compile(r"EarnRoom-Video-Worker-Setup-([A-Z0-9]{6,16})\.exe$", re.IGNORECASE)


def pairing_code_from_filename(name: str) -> str | None:
    match = SETUP_NAME.search(name.strip())
    return match.group(1).upper() if match else None


# ----------------------------------------------------------------- state


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def write_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), "utf-8")
    try:  # Owner-only, so the key is not readable by other accounts.
        os.chmod(STATE_FILE, 0o600)
    except OSError:
        pass


def pending_setup_code() -> str | None:
    """The code the installer wrote for us, used once and then cleared."""
    code = read_json(SETUP_FILE).get("code")
    return str(code).upper() if code else None


def clear_setup_code() -> None:
    try:
        SETUP_FILE.unlink()
    except OSError:
        pass


# -------------------------------------------------------------- hardware


def nvidia_gpu() -> dict:
    binary = shutil.which("nvidia-smi")
    if not binary:
        return {}
    try:
        output = (
            subprocess.run(
                [binary, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=15,
                check=True,
            )
            .stdout.strip()
            .splitlines()
        )
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
    clear_setup_code()
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
