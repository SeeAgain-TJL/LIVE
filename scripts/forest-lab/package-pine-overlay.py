"""Package one new runtime directory; do not duplicate earlier releases."""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

batch, folder, name = sys.argv[1:]
base = Path("public/forest-origin-assets")
out = Path("artifacts-local") / batch / "handoff"
docs = Path("docs/reviews") / batch
out.mkdir(parents=True, exist_ok=True)
docs.mkdir(parents=True, exist_ok=True)
files = []
with zipfile.ZipFile(out / name, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=4) as archive:
    for item in sorted((base / folder).iterdir()):
        relative = item.relative_to(base).as_posix()
        data = item.read_bytes()
        files.append({"path": relative, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        archive.write(item, "runtime/" + relative)
assert files
with zipfile.ZipFile(out / name) as archive:
    for item in files:
        assert hashlib.sha256(archive.read("runtime/" + item["path"])).hexdigest() == item["sha256"]
(docs / "runtime-assets.json").write_text(json.dumps({
    "version": 1, "scope": "Runtime overlay; restore alongside earlier stage manifests",
    "files": files, "totalBytes": sum(item["bytes"] for item in files),
}, indent=2)+"\n", encoding="utf-8")
