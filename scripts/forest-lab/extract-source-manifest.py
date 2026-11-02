"""Read the Pine Forest render graph without saving or modifying its .blend source.

Run with Blender --background source.blend --python this_file. Outputs stay in
LOCALAPPDATA/UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion.
"""

import bpy
import gzip
import hashlib
import json
import math
import os
from collections import Counter, defaultdict
from pathlib import Path


SOURCE = Path(bpy.data.filepath)
ROOT = Path(os.environ["LOCALAPPDATA"]) / "UNIVERSE-OF-ME" / "asset-audit" / "candidate-assets"
DESTINATION = ROOT / "pine-source-conversion"
DESTINATION.mkdir(parents=True, exist_ok=True)
TREE_NAMES = {f"pine_{number:02d}" for number in range(1, 6)} | {
    f"silver_fir_{number:02d}" for number in range(1, 7)
}
SENTINEL = 2147483647
TILE_SIZE = 32


def render_branch_in_memory():
    changed = 0
    for group in bpy.data.node_groups:
        if group.bl_idname != "GeometryNodeTree":
            continue
        for node in group.nodes:
            if node.bl_idname != "GeometryNodeIsViewport":
                continue
            for link in list(group.links):
                if link.from_node != node or not hasattr(link.to_socket, "default_value"):
                    continue
                socket = link.to_socket
                group.links.remove(link)
                socket.default_value = False
                changed += 1
    return changed


def source_hash():
    digest = hashlib.sha256()
    with SOURCE.open("rb") as file:
        for block in iter(lambda: file.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def matrix_rows(matrix):
    return [[round(float(value), 7) for value in row] for row in matrix]


changed = render_branch_in_memory()
depsgraph = bpy.context.evaluated_depsgraph_get()
depsgraph.update()
counts = Counter()
parents = defaultdict(Counter)
depths = defaultdict(Counter)
root_trees = defaultdict(dict)
asset_names = sorted(obj.name for obj in bpy.data.objects)
asset_ids = {name: index for index, name in enumerate(asset_names)}
tile_handles = {}
tile_counts = Counter()
source_mesh_counts = Counter()
tile_directory = DESTINATION / "source-layout-tiles"
tile_directory.mkdir(parents=True, exist_ok=True)
for instance in depsgraph.object_instances:
    if not instance.is_instance:
        continue
    obj = instance.object.original
    name = obj.name
    parent = instance.parent.original.name if instance.parent else None
    persistent_id = tuple(int(value) for value in instance.persistent_id)
    depth = next((index for index, value in enumerate(persistent_id) if value == SENTINEL), len(persistent_id))
    counts[name] += 1
    parents[name][parent or "<none>"] += 1
    depths[name][depth] += 1
    if obj.type == "MESH" and parent == "terrain_main" and depth == 1:
        # Keep the original render branch's unique mesh, matrix and spatial
        # location. Source-provided lod0/lod1 remain distinct named assets.
        x, y = instance.matrix_world.translation[:2]
        tile = (math.floor(x / TILE_SIZE), math.floor(y / TILE_SIZE))
        if tile not in tile_handles:
            tile_handles[tile] = gzip.open(tile_directory / f"{tile[0]}_{tile[1]}.jsonl.gz", "wt", encoding="utf-8", compresslevel=6)
        rows = matrix_rows(instance.matrix_world)
        packed = [rows[0], rows[1], rows[2]]
        tile_handles[tile].write(json.dumps([asset_ids[name], packed], separators=(",", ":")) + "\n")
        tile_counts[tile] += 1
        source_mesh_counts[name] += 1
    if name not in TREE_NAMES or parent != "terrain_main" or depth != 1:
        continue
    # Depsgraph also reports the tree's internal Geometry Nodes as deeper
    # instances. Only the first-level root positions represent whole trees.
    root_trees[name][persistent_id[0]] = {
        "source": name,
        "persistentId": persistent_id[0],
        "matrix": matrix_rows(instance.matrix_world),
    }

for file in tile_handles.values():
    file.close()

trees = [placement for name in sorted(root_trees) for placement in root_trees[name].values()]
trees.sort(key=lambda placement: (placement["source"], placement["persistentId"]))
manifest = {
    "source": str(SOURCE),
    "sourceSha256": source_hash(),
    "blenderVersion": bpy.app.version_string,
    "renderBranchViewportLinksOverriddenInMemory": changed,
    "treePlacementCount": len(trees),
    "treeSpeciesCounts": {name: len(values) for name, values in sorted(root_trees.items())},
    "tileSizeBlenderUnits": TILE_SIZE,
    "tileCounts": {f"{x}_{y}": count for (x, y), count in sorted(tile_counts.items())},
    "sourceMeshInstanceCount": sum(source_mesh_counts.values()),
    "sourceMeshInstanceCounts": dict(source_mesh_counts.most_common()),
    "sourceAssetNames": asset_names,
    "sourceMeshAssets": [
        {"name": name, "faces": len(bpy.data.objects[name].data.polygons),
         "materials": [material.name if material else None for material in bpy.data.objects[name].data.materials]}
        for name in sorted(source_mesh_counts)
    ],
    "camera": {
        "matrix": matrix_rows(bpy.context.scene.camera.matrix_world),
        "lensMm": bpy.context.scene.camera.data.lens,
    },
    "objectInventory": [
        {"name": name, "count": count, "parents": dict(parents[name]),
         "persistentDepths": dict(depths[name]), "type": bpy.data.objects[name].type}
        for name, count in counts.most_common()
    ],
    "notes": [
        "This is an inventory, not a complete browser scene.",
        "Nested Geometry Nodes instances must not be interpreted as separate whole trees.",
        "Tile rows are [sourceAssetNameIndex, 3x4 Blender world matrix] in Blender Z-up coordinates.",
        "The river and non-mesh Cycles effects require separate conversion; they are not in mesh tiles.",
        "The source .blend was opened and evaluated but never saved.",
    ],
}
(DESTINATION / "render-inventory.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
(DESTINATION / "source-tree-placements.json").write_text(json.dumps(trees, separators=(",", ":")), encoding="utf-8")
print("SOURCE_MANIFEST", DESTINATION, "trees", len(trees), "all_instances", sum(counts.values()),
      "mesh_instances", sum(source_mesh_counts.values()), "tiles", len(tile_counts),
      "render_links", changed, flush=True)
print("TREE_SPECIES", manifest["treeSpeciesCounts"], flush=True)
print("SOURCE_SHA256", manifest["sourceSha256"], flush=True)
