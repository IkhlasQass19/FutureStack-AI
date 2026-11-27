"""Start the installed API and Next.js dev server together on loopback."""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from futurestack.config import Settings


def main():
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    if not (root / "web/node_modules/next").exists():
        raise SystemExit("Install the web dependencies first: npm --prefix web ci")
    cfg = Settings()
    api_port = os.getenv("FS_API_PORT", "8000")
    web_port = os.getenv("FS_WEB_PORT", "3000")
    env = dict(
        os.environ,
        FS_API_URL="http://127.0.0.1:" + api_port,
        NEXT_TELEMETRY_DISABLED="1",
    )
    if cfg.workspace_token:
        env["FS_WORKSPACE_TOKEN"] = cfg.workspace_token.get_secret_value()
    commands = [
        [
            sys.executable,
            "-m",
            "uvicorn",
            "futurestack.api:app",
            "--host",
            "127.0.0.1",
            "--port",
            api_port,
        ],
        [
            shutil.which("node") or "node",
            "web/node_modules/next/dist/bin/next",
            "dev",
            "web",
            "-H",
            "127.0.0.1",
            "-p",
            web_port,
        ],
    ]
    processes = []
    try:
        for cmd in commands:
            processes.append(subprocess.Popen(cmd, cwd=root, env=env))
        print("Architecture lab: http://127.0.0.1:" + web_port, flush=True)
        while all(p.poll() is None for p in processes):
            time.sleep(0.25)
        return next(p.returncode for p in processes if p.returncode is not None)
    except KeyboardInterrupt:
        return 0
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()
        for p in processes:
            p.wait()


if __name__ == "__main__":
    raise SystemExit(main())
