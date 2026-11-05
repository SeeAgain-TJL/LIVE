"""Pack only the authored tree library, audit and reproducible build scripts."""
import sys
import zipfile
from pathlib import Path

stage, authoring = sys.argv[1:]
if stage not in {"pine-tree-representative", "pine-tree-rebuild"}:
    raise ValueError(stage)
output = Path("artifacts-local") / stage / "handoff" / f"{stage}-authoring.zip"
output.parent.mkdir(parents=True, exist_ok=True)
sources = Path(authoring)
with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as archive:
    for name in ("pine-rebuilt-trees.blend", "production.json", "packed.json"):
        archive.write(sources / name, "authoring/" + name)
    for name in ("rebuild-pine-trees.py", "pack-pine-tree-rebuild.mjs"):
        archive.write(Path("scripts/forest-lab") / name, "scripts/" + name)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
print(output, output.stat().st_size)
