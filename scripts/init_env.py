"""Create local-only Compose secrets once, exclusively, with owner-only permissions."""

import os
from pathlib import Path
from secrets import token_urlsafe


def main():
    path = Path(__file__).resolve().parents[1] / ".env"
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        print("Existing .env preserved.")
        return
    with os.fdopen(fd, "w") as f:
        f.write(
            "FS_PROVIDER=demo\nPOSTGRES_PASSWORD="
            + token_urlsafe(28)
            + "\nFS_WORKSPACE_TOKEN="
            + token_urlsafe(32)
            + "\n"
        )
    print("Created .env for the local Compose workspace.")


if __name__ == "__main__":
    main()
