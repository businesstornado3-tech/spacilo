# EarnRoom Video Worker (Windows, macOS, Linux)

Lets a computer make EarnRoom marketing videos at no running cost. It reports
what the machine can do; EarnRoom decides whether to use it.

## Windows — the normal route

In the Founder Console: **Advanced administration → Set up where videos are
made → My computer → Set up my computer**. EarnRoom downloads the installer,
you open it, and the computer connects itself. There is no code to type and no
key to copy: the setup session travels in the installer's filename, and the
worker creates its own key on the machine.

The installer is built by `.github/workflows/windows-worker.yml` on a real
Windows runner and published as a release asset. Set
`EARNROOM_WORKER_INSTALLER_URL` to that asset's address to switch the button
on. Until that is set, the console says plainly that no installer exists — it
never offers a download that isn't real.

**It is not code-signed.** Windows will show an "unknown publisher" warning
until a code-signing certificate is bought and added to the workflow.

## macOS and Linux

Install Python 3.11+, then:

```bash
python earnroom_worker.py --pair ABCD2345 --site https://earnroom.co.uk
```

The setup code comes from the same console section.

## Files

- `earnroom_core.py` — pairing, hardware detection, reporting in (shared).
- `earnroom_app.py` — the Windows app window: Connecting / Connected / Offline
  / Needs setup / Error, stop button, hardware view, starts at logon.
- `earnroom_worker.py` — the command-line worker for macOS and Linux.
- `installer/earnroom-worker.iss` — the Inno Setup installer script.
- `build_windows.ps1` — local Windows build, same steps as the workflow.

## What it sends

A name, this machine's hardware facts, which video models are installed here,
a status and a queue length. Nothing else leaves the machine.
