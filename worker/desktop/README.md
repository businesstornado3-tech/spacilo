# EarnRoom desktop video worker

Lets a Windows, macOS or Linux computer make EarnRoom marketing videos at no
running cost. It reports what the machine can do; EarnRoom decides whether to
use it.

## There is no ready-made installer yet

A signed, double-click installer is **not available yet**. Setting this up
still needs a person to run a command on the machine. That limitation is stated
in the Founder Console too, so nobody expects a download that does not exist.

## Set it up

1. In the Founder Console, open **Advanced administration → Set up where videos
   are made → My computer** and create a setup code. The code lasts 30 minutes
   and can be used once.
2. On the computer that will make videos, install Python 3.11 or newer.
3. Run, replacing the code with yours:

   ```powershell
   python earnroom_worker.py --pair ABCD2345 --site https://earnroom.co.uk
   ```

4. Leave the window open. The computer appears in the console within a minute,
   with its real graphics memory, memory and installed models.

The access token is created on this machine during pairing and written to
`%USERPROFILE%\.earnroom-worker\worker.json` (owner-readable only). It is never
shown in the console and EarnRoom stores only a hash of it.

## Keep it running

- Windows: `build_windows.ps1` produces `dist\earnroom-worker.exe` with
  PyInstaller and registers a per-user scheduled task that starts it at logon.
- macOS/Linux: run it under `launchd`, `systemd --user`, or simply leave the
  terminal open.

## What it sends

A name, this machine's hardware facts, which video models are installed here,
a status and a queue length. Nothing else leaves the machine.
