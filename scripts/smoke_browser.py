import os, subprocess, sys, time, socket, tempfile
from pathlib import Path
import httpx
from playwright.sync_api import sync_playwright, expect


def port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def ready(url):
    for _ in range(120):
        try:
            if httpx.get(url, timeout=1).status_code == 200:
                return
        except httpx.TransportError:
            pass
        time.sleep(0.25)
    raise RuntimeError("Service startup timeout: " + url)


root = Path.cwd()
with tempfile.TemporaryDirectory() as tmp:
    a, w = port(), port()
    env = dict(
        os.environ,
        FS_DATABASE_URL="sqlite:///" + tmp + "/browser.db",
        FS_API_URL=f"http://127.0.0.1:{a}",
        FS_PROVIDER="demo",
        FS_WORKSPACE_TOKEN="browser-fixture",
        NEXT_TELEMETRY_DISABLED="1",
    )
    api = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "futurestack.api:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(a),
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    web = subprocess.Popen(
        [
            "node",
            "node_modules/next/dist/bin/next",
            "start",
            "-H",
            "127.0.0.1",
            "-p",
            str(w),
        ],
        cwd=root / "web",
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        ready(env["FS_API_URL"] + "/health")
        ready(f"http://127.0.0.1:{w}")
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=os.environ.get("FS_CHROME_PATH"), headless=True
            )
            page = browser.new_page(
                viewport={"width": 1440, "height": 1050}, device_scale_factor=1
            )
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"http://127.0.0.1:{w}/")
            expect(page.get_by_role("button", name="Month 24")).to_be_enabled()
            expect(page.locator(".react-flow__node-part")).to_have_count(4)
            expect(page.locator(".react-flow__node-spec")).to_have_count(3)
            expect(page.get_by_role("heading", name="Impact analysis")).to_be_visible()
            page.get_by_label("Simulation horizon", exact=True).select_option("3")
            expect(page.get_by_text("396 of 864 requests failed", exact=False)).to_be_visible()
            page.get_by_label("Simulation horizon", exact=True).select_option("2")
            if os.environ.get("FS_SCREENSHOT"):
                page.screenshot(path=os.environ["FS_SCREENSHOT"], full_page=False)
            page.get_by_role("button", name="Design from a brief").click()
            page.get_by_role("button", name="Generate and review").click()
            expect(page.get_by_text("Human approval required")).to_be_visible()
            expect(page.locator("tbody tr")).to_have_count(6)
            page.get_by_role("button", name="Approve design").click()
            expect(page.get_by_text("Saved · v1", exact=True)).to_be_visible()
            page.get_by_role("button", name="Edit graph").click()
            page.get_by_label("Component", exact=True).select_option("store")
            page.get_by_label("Replicas", exact=True).fill("3")
            page.get_by_role("button", name="Save new version").click()
            expect(page.get_by_text("Saved · v2", exact=True)).to_be_visible()
            page.get_by_role("button", name="Versions", exact=True).click()
            page.get_by_role("button", name="Compare versions").click()
            expect(page.get_by_text("Architecture changes", exact=True)).to_be_visible()
            page.get_by_role("button", name="Month 24").click()
            assert '"replicas"' in page.locator("pre").inner_text()
            page.get_by_role("button", name="Time machine", exact=True).click()
            page.get_by_label("Experiment", exact=True).select_option(
                "database-failure"
            )
            page.get_by_role("button", name="Run experiment").click()
            expect(page.locator(".path").first).to_be_visible()
            expect(page.locator(".part.affected").first).to_be_visible()
            with page.expect_download() as info:
                page.get_by_role("button", name="Download report").click()
            body = Path(info.value.path()).read_text()
            assert "revision 2" in body and "database-failure" in body
            page.reload()
            expect(page.get_by_text("Saved · v2", exact=True)).to_be_visible()
            page.set_viewport_size({"width": 390, "height": 844})
            assert page.evaluate(
                "document.documentElement.scrollWidth <= window.innerWidth"
            )
            assert not errors, errors
            browser.close()
            print(
                "Browser passed: graph, four horizons, six-stage review, approval, edit, version comparison, failure overlay, report download, reload and mobile width."
            )
    finally:
        web.terminate()
        api.terminate()
        web.wait(timeout=10)
        api.wait(timeout=10)
