import os
import shutil
import tomllib
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

project_root = Path(SPECPATH).parent

ffmpeg_directory = Path(os.environ.get("FFMPEG_DIR", ""))
if not ffmpeg_directory.is_dir():
    ffmpeg = shutil.which("ffmpeg")
    ffmpeg_directory = Path(ffmpeg).parent if ffmpeg else Path()

binaries = []
for executable in ("ffmpeg", "ffprobe"):
    path = ffmpeg_directory / executable
    if not path.is_file():
        raise SystemExit(f"Missing {executable}. Set FFMPEG_DIR to a directory containing both binaries.")
    binaries.append((str(path), "bin"))

native_bridge = Path(os.environ.get("NATIVE_BRIDGE_PATH", ""))
if not native_bridge.is_file():
    raise SystemExit("Missing native audio bridge. Run swift build before packaging.")
binaries.append((str(native_bridge), "bin"))

datas = [
    (str(project_root / "studio" / "static"), "studio/static"),
    *collect_data_files("mlx"),
    *collect_data_files("mlx_whisper"),
    *copy_metadata("mlx-whisper"),
]
hidden_imports = [
    *collect_submodules("uvicorn"),
    *collect_submodules("mlx"),
    *collect_submodules(
        "mlx_whisper",
        filter=lambda name: name
        not in {"mlx_whisper.timing", "mlx_whisper.torch_whisper"},
    ),
    "studio.engine",

]

analysis = Analysis(
    [str(project_root / "studio" / "service.py")],
    pathex=[str(project_root)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden_imports,
    runtime_hooks=[str(project_root / "packaging" / "pyi_rth_mlx_whisper.py")],
    excludes=[
        "tkinter",
        "webview",
        "torch",
        "torchgen",
        "numba",
        "llvmlite",
        "scipy",
        "mlx_whisper.timing",
        "mlx_whisper.torch_whisper",
    ],
    noarchive=False,
)
pyz = PYZ(analysis.pure)
executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="Whisper Studio Service",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    argv_emulation=False,
    target_arch=os.environ.get("MACOS_ARCH") or None,
    codesign_identity=os.environ.get("CODESIGN_IDENTITY") or None,
    entitlements_file=os.environ.get("ENTITLEMENTS_FILE") or None,
)
collection = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="Whisper Studio Service",
)
