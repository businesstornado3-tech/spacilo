"""EarnRoom Video Worker — Windows desktop app.

A small always-running status window. It pairs itself using the setup session
the installer recorded, then reports in every 30 seconds. The founder never
types anything: install, and it connects.

States shown: Connecting, Connected, Offline, Needs setup, Error.
"""

from __future__ import annotations

import platform
import queue
import threading
import time
import tkinter as tk
from tkinter import ttk
from urllib import error

import earnroom_core as core

POLL_SECONDS = 1


class WorkerService(threading.Thread):
    """Pairs once if needed, then keeps reporting in. Reconnects by itself."""

    daemon = True

    def __init__(self, site: str, label: str, outbox: "queue.Queue[tuple[str, str]]") -> None:
        super().__init__()
        self.site = site
        self.label = label
        self.outbox = outbox
        self.stopped = threading.Event()

    def say(self, state: str, detail: str) -> None:
        self.outbox.put((state, detail))

    def run(self) -> None:
        state = core.read_json(core.STATE_FILE)
        while not self.stopped.is_set():
            if not state.get("token"):
                code = core.pending_setup_code()
                if not code:
                    self.say("NEEDS SETUP", "Start setup again from the EarnRoom Founder Console.")
                    self.stopped.wait(5)
                    continue
                self.say("CONNECTING", "Connecting this computer to EarnRoom…")
                try:
                    state = core.pair(self.site, code, self.label)
                except error.HTTPError as failure:
                    self.say("ERROR", f"Setup was refused ({failure.code}). Start setup again.")
                    core.clear_setup_code()
                    self.stopped.wait(10)
                    continue
                except (error.URLError, TimeoutError):
                    self.say("OFFLINE", "No connection to EarnRoom. Retrying…")
                    self.stopped.wait(10)
                    continue

            try:
                core.heartbeat(state)
                self.say("CONNECTED", f"Reporting in as {state.get('label', self.label)}.")
            except error.HTTPError as failure:
                if failure.code == 401:
                    self.say("NEEDS SETUP", "This computer is no longer paired.")
                    state = {}
                    continue
                self.say("ERROR", f"EarnRoom refused the last report ({failure.code}).")
            except (error.URLError, TimeoutError):
                self.say("OFFLINE", "No connection to EarnRoom. Retrying…")

            self.stopped.wait(core.HEARTBEAT_SECONDS)


def hardware_lines() -> str:
    profile = core.hardware_profile()
    parts = [str(profile.get("operatingSystem", "Unknown system"))]
    if profile.get("gpuModel"):
        vram = profile.get("dedicatedVramGb")
        parts.append(f"{profile['gpuModel']}" + (f" · {vram} GB graphics memory" if vram else ""))
    else:
        parts.append("No dedicated graphics card found")
    if profile.get("ramGb"):
        parts.append(f"{profile['ramGb']} GB memory")
    if profile.get("cpuThreads"):
        parts.append(f"{profile['cpuThreads']} processor threads")
    return "\n".join(parts)


def main() -> int:
    setup = core.read_json(core.SETUP_FILE)
    site = setup.get("site") or core.DEFAULT_SITE
    label = setup.get("label") or platform.node() or "My computer"

    root = tk.Tk()
    root.title("EarnRoom Video Worker")
    root.geometry("460x300")
    frame = ttk.Frame(root, padding=16)
    frame.pack(fill="both", expand=True)

    ttk.Label(frame, text="EarnRoom Video Worker", font=("Segoe UI", 13, "bold")).pack(anchor="w")
    status = ttk.Label(frame, text="Starting…", font=("Segoe UI", 11, "bold"))
    status.pack(anchor="w", pady=(10, 0))
    detail = ttk.Label(frame, text="", wraplength=420, foreground="#555")
    detail.pack(anchor="w", pady=(2, 0))

    ttk.Separator(frame).pack(fill="x", pady=12)
    ttk.Label(frame, text="This computer", font=("Segoe UI", 10, "bold")).pack(anchor="w")
    ttk.Label(frame, text=hardware_lines(), justify="left", foreground="#555").pack(anchor="w")

    outbox: "queue.Queue[tuple[str, str]]" = queue.Queue()
    service = WorkerService(site, label, outbox)

    buttons = ttk.Frame(frame)
    buttons.pack(anchor="w", pady=(14, 0))

    def stop() -> None:
        service.stopped.set()
        status.config(text="STOPPED")
        detail.config(text="Not making videos. Close and reopen to start again.")

    ttk.Button(buttons, text="Stop", command=stop).pack(side="left")
    ttk.Button(buttons, text="Hide", command=root.withdraw).pack(side="left", padx=6)

    def drain() -> None:
        while not outbox.empty():
            state, message = outbox.get()
            status.config(text=state)
            detail.config(text=message)
        root.after(POLL_SECONDS * 1000, drain)

    service.start()
    drain()
    root.protocol("WM_DELETE_WINDOW", root.withdraw)
    root.mainloop()
    service.stopped.set()
    time.sleep(0.1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
