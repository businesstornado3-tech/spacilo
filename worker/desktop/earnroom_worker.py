"""EarnRoom video worker — command line (macOS and Linux).

Windows uses the installer and the app window instead; see README.md.

Pairs once with a short setup code from the Founder Console, stores its own
access key locally, then reports in every 30 seconds with what the machine can
actually do.

Usage:
    python earnroom_worker.py --pair ABCD2345 --site https://earnroom.co.uk
    python earnroom_worker.py --site https://earnroom.co.uk
"""

from __future__ import annotations

import argparse
import platform
import sys
import time
from urllib import error

import earnroom_core as core


def main() -> int:
    parser = argparse.ArgumentParser(description="EarnRoom video worker")
    parser.add_argument("--site", default=core.DEFAULT_SITE)
    parser.add_argument("--pair", dest="code", help="Setup code from the Founder Console")
    parser.add_argument("--name", default=platform.node() or "My computer")
    args = parser.parse_args()

    state = core.read_json(core.STATE_FILE)
    code = args.code or core.pending_setup_code()
    if code:
        try:
            state = core.pair(args.site, code, args.name)
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
            core.heartbeat(state)
        except (error.URLError, error.HTTPError, TimeoutError) as failure:
            print(f"Could not reach EarnRoom: {failure}", file=sys.stderr)
        time.sleep(core.HEARTBEAT_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
