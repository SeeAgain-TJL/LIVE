import bpy

names = {"rock_moss_set_01", "rock_moss_set_02", "fern_02", "grass_medium_01",
         "moss_01", "dry_branches_medium_01", "pine_cover", "fir_sapling_branches",
         "pine_bark", "pine_twig", "tree_roots_01", "tree_roots_02", "tree_trunk", "dead_tree",
         "fir_dead_branches", "pine_dead_branches", "pine_trunk_04", "fir_trunk_02", "fir_trunk_03"}
for name in sorted(names):
    material = bpy.data.materials.get(name)
    if material is None:
        print("MATERIAL_MISSING", name)
        continue
    images = []
    for node in material.node_tree.nodes if material.use_nodes else []:
        if node.type == "TEX_IMAGE" and node.image:
            images.append((node.name, node.image.name, bpy.path.abspath(node.image.filepath)))
    print("MATERIAL_SOURCE", name, images)
    for node in material.node_tree.nodes if material.use_nodes else []:
        if node.type == "BSDF_PRINCIPLED":
            alpha = node.inputs.get("Alpha")
            print("MATERIAL_ALPHA", name, alpha.default_value if alpha else None,
                  [(link.from_node.name, link.from_socket.name) for link in alpha.links] if alpha else [])

for name in ("rock_moss_set_01_a_lod1", "fern_01_a_lod1", "moss_patch_01_lod1", "pine_cover_01", "fir_sapling_medium_a"):
    obj = bpy.data.objects.get(name)
    if obj and obj.type == "MESH":
        print("MESH_UV", name, [(uv.name, len(uv.data)) for uv in obj.data.uv_layers])
