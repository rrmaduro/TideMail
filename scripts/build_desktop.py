"""Build tidemail into a single desktop executable.

Steps:
  1. Ensure the Angular frontend is built (frontend/dist/browser).
  2. Ensure PyInstaller is installed.
  3. Run PyInstaller against packaging/tidemail.spec.

Usage (from the repo root, with your venv active):
    python scripts/build_desktop.py

Output: dist/tidemail(.exe)
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
FRONTEND_DIST = FRONTEND / "dist" / "browser"
SPEC = ROOT / "packaging" / "tidemail.spec"


def run(cmd: list[str], cwd: Path) -> None:
    print(f"\n$ {' '.join(cmd)}  (in {cwd})")
    subprocess.run(cmd, cwd=str(cwd), check=True)


def ensure_frontend() -> None:
    if (FRONTEND_DIST / "index.html").exists():
        print("[ok] Frontend already built.")
        return
    npm = shutil.which("npm")
    if not npm:
        sys.exit("npm not found. Install Node.js 20+ and re-run, or build the frontend manually.")
    if not (FRONTEND / "node_modules").exists():
        run([npm, "install"], FRONTEND)
    run([npm, "run", "build"], FRONTEND)
    if not (FRONTEND_DIST / "index.html").exists():
        sys.exit("Frontend build did not produce dist/browser/index.html.")


def ensure_pyinstaller() -> None:
    try:
        import PyInstaller  # noqa: F401

        print("[ok] PyInstaller present.")
    except ImportError:
        print("Installing PyInstaller...")
        run([sys.executable, "-m", "pip", "install", "pyinstaller"], ROOT)


def main() -> None:
    print("Building tidemail desktop app...")
    ensure_frontend()
    ensure_pyinstaller()
    run([sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", str(SPEC)], ROOT)
    out = ROOT / "dist" / ("tidemail.exe" if sys.platform == "win32" else "tidemail")
    print(f"\n[done] Executable: {out}")
    print("Double-click it (or run it) to launch tidemail - it opens your browser automatically.")


if __name__ == "__main__":
    main()
