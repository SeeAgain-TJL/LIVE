"""Rebuild source twig instances as compact, fixed 3-D branch clusters.

Run in Blender 4.4 with the original Pine Forest open. The source is never
saved. -- pine_02 builds the representative tree; pass additional source names
only after inspecting the representative assets. Requires the original textures.
"""
import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser()
parser.add_argument("trees", nargs="+")
parser.add_argument("--out", default="artifacts-local/pine-tree-rebuild/authoring")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
source_scene = bpy.context.scene
textures = Path(bpy.data.filepath).parent / "textures"
twig_collections = ("pine_twigs", "fir_twigs_main", "fir_twigs_tip")
size, padding, columns = 192, 4, 6
directions = tuple(Vector(d).normalized() for d in ((.20, -.12, 1), (.87, .36, .64), (-.48, .83, .55)))
tiers = {"near": (), "mid": (0, 1), "far": (1,)}


def new_scene(name):
    scene = bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    return scene


def image(family, suffix):
    result = bpy.data.images.load(str(textures / f"{family}_{suffix}.png"), check_existing=True)
    if suffix != "diff":
        result.colorspace_settings.name = "Non-Color"
    return result


def bake_material(family):
    mat = bpy.data.materials.new(f"Geometric twig albedo and coverage: {family}")
    mat.use_nodes = True
    n, l = mat.node_tree.nodes, mat.node_tree.links
    n.clear()
    output, emission = n.new("ShaderNodeOutputMaterial"), n.new("ShaderNodeEmission")
    color = n.new("ShaderNodeVertexColor")
    color.layer_name = "TwigColor"
    l.new(color.outputs["Color"], emission.inputs["Color"])
    l.new(emission.outputs[0], output.inputs[0])
    return mat


def source_uv(mesh):
    attribute = mesh.attributes.get("UVMap")
    if attribute and attribute.data_type == "FLOAT_VECTOR" and attribute.domain == "CORNER":
        values = np.empty(len(attribute.data) * 3, dtype=np.float32)
        attribute.data.foreach_get("vector", values)
        return values.reshape(-1, 3)[:, :2].ravel()
    uv = mesh.uv_layers.active
    if not uv:
        raise RuntimeError(f"No source UV: {mesh.name}")
    values = np.empty(len(uv.data) * 2, dtype=np.float32)
    uv.data.foreach_get("uv", values)
    return values


def vertex_needle_material(family):
    mat = bpy.data.materials.new(f"{family}_geometric_needles")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    color = nodes.new("ShaderNodeVertexColor")
    color.layer_name = "TwigColor"
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .94
    mat.node_tree.links.new(color.outputs["Color"], shader.inputs["Base Color"])
    return mat


def geometric_twig(mesh, uv, scene, material, diffuse):
    """Reduce each selected source needle to a tapered, slightly bent shape.

    Source needle islands stay in their own local positions and orientations.
    Wood islands are reduced separately, so collapse cannot discard whole tips.
    """
    parent = list(range(len(mesh.vertices)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for edge in mesh.edges:
        a, b = edge.vertices
        parent[root(a)] = root(b)
    islands = {}
    for poly in mesh.polygons:
        islands.setdefault(root(poly.vertices[0]), []).append(poly)
    pos = np.asarray([v.co[:] for v in mesh.vertices], dtype=np.float32)
    width, height = diffuse.size
    texels = np.empty(width * height * 4, dtype=np.float32)
    diffuse.pixels.foreach_get(texels)
    texels = texels.reshape(height, width, 4)

    def linear_color(coords):
        u, v = np.median(np.reshape(coords, (-1, 2)), axis=0)
        c = texels[min(height - 1, int((v % 1) * height)), min(width - 1, int((u % 1) * width)), :3]
        return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)

    candidates, trunk = [], []
    for polys in islands.values():
        if len(polys) >= 20:
            trunk.extend(polys)
            continue
        ids = sorted({i for p in polys for i in p.vertices})
        pts = pos[ids]
        center = pts.mean(axis=0)
        _, _, axes = np.linalg.svd(pts - center, full_matrices=False)
        local = (pts - center) @ axes.T
        i, j = local[:, 0].argmin(), local[:, 0].argmax()
        if local[j, 0] - local[i, 0] < .012:
            continue
        # The source centerline may curve; use an actual vertex near its midpoint.
        m = np.abs(local[:, 0]).argmin()
        transverse = max(.00055, min(.002, np.ptp(local[:, 1]) * .60))
        c = linear_color(np.concatenate([uv[n*2:n*2+2] for p in polys for n in p.loop_indices]))
        candidates.append((center, (pts[i], pts[m] + axes[1] * transverse,
                                     pts[j], pts[m] - axes[1] * transverse), c))
    if not candidates or not trunk:
        raise RuntimeError("Source twig lost leaf or wood islands: " + mesh.name)
    # Spatially cover every part of the twig before increasing the density.
    centers = np.asarray([x[0] for x in candidates])
    extent = np.maximum(np.ptp(centers, axis=0), .06)
    normalized = (centers - centers.min(axis=0)) / extent
    nearest = np.full(len(candidates), np.inf)
    index = int(np.argmin(np.linalg.norm(normalized - .5, axis=1)))
    points, faces, colors = [], [], []
    for _ in range(min(len(candidates), 78)):
        _, quad, color = candidates[index]
        i = len(points)
        points.extend(quad)
        faces.extend(((i, i+1, i+3), (i+1, i+2, i+3)))
        colors.extend([(*color, 1)] * 4)
        nearest = np.minimum(nearest, np.sum((normalized - normalized[index]) ** 2, axis=1))
        index = int(nearest.argmax())

    used = {}
    stem_points, stem_faces = [], []
    for poly in trunk:
        face = []
        for index in poly.vertices:
            if index not in used:
                used[index] = len(stem_points)
                stem_points.append(pos[index])
            face.append(used[index])
        stem_faces.append(face)
    stem = bpy.data.meshes.new(mesh.name + " stem")
    stem.from_pydata(stem_points, [], stem_faces)
    obj = bpy.data.objects.new(stem.name, stem)
    scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("Small twig stems only", "DECIMATE")
    modifier.ratio = .085
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    start = len(points)
    points.extend(v.co[:] for v in obj.data.vertices)
    colors.extend([(.075, .047, .026, 1)] * len(obj.data.vertices))
    faces.extend(tuple(start + i for i in p.vertices) for p in obj.data.polygons)
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(stem)
    result = bpy.data.meshes.new(mesh.name + " geometric needles")
    result.from_pydata(points, [], faces)
    result.materials.append(material)
    result.uv_layers.new(name="UVMap")
    result.color_attributes.new(name="TwigColor", type="FLOAT_COLOR", domain="POINT").data.foreach_set(
        "color", np.asarray(colors, dtype=np.float32).ravel())
    marker = np.zeros(len(result.polygons), dtype=np.int32)
    marker[0] = 1
    result.attributes.new("TwigInstance", "INT", "FACE").data.foreach_set("value", marker)
    return result


def bake_twigs(family, collection_names):
    scene = new_scene(f"Twig bake {family}")
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = 24
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = size - 2 * padding
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.use_nodes = False
    camera = bpy.data.objects.new("Twig bake camera", bpy.data.cameras.new("Twig ortho"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.clip_start = .01
    camera.data.clip_end = 30
    texture_family = "pine_twig" if family == "pine" else "fir_twig"
    mat = bake_material(texture_family)
    near_material = vertex_needle_material(family)
    diffuse = image(texture_family, "diff")
    sources = [obj for name in collection_names for obj in bpy.data.collections[name].objects]
    height = math.ceil(len(sources) * len(directions) / columns) * size
    atlas = np.zeros((height, columns * size, 4), dtype=np.float32)
    cards, near_meshes = {}, {}
    bake_folder = out / "twig-bakes"
    bake_folder.mkdir(exist_ok=True)
    for index, source in enumerate(sources):
        # Curves as well as meshes can carry the source scan and UVs.
        clone = source.copy()
        scene.collection.objects.link(clone)
        clone.matrix_world = Matrix.Identity(4)
        clone.hide_render = False
        clone.hide_set(False)
        deps = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(clone.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
        bpy.data.objects.remove(clone, do_unlink=True)
        near_meshes[source.name] = geometric_twig(mesh, source_uv(mesh), scene, near_material, diffuse)
        bake_mesh = near_meshes[source.name].copy()
        bake_mesh.materials[0] = mat
        bake = bpy.data.objects.new(source.name + " bake", bake_mesh)
        scene.collection.objects.link(bake)
        points = [v.co.copy() for v in mesh.vertices]
        cards[source.name] = []
        for angle, forward in enumerate(directions):
            rot = (-forward).to_track_quat("-Z", "Y")
            right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
            bounds = [[min(p.dot(a) for p in points), max(p.dot(a) for p in points)] for a in (right, up, forward)]
            center = sum((axis * (lo + hi) * .5 for axis, (lo, hi) in zip((right, up, forward), bounds)), Vector((0, 0, 0)))
            width = max(b - a for a, b in bounds[:2]) * 1.04
            camera.location = center + forward * 5
            camera.rotation_euler = rot.to_euler()
            camera.data.ortho_scale = width
            filename = bake_folder / f"{source.name}-{angle}.png"
            if not filename.exists():
                scene.render.filepath = str(filename)
                bpy.ops.render.render(write_still=True)
            baked = bpy.data.images.load(str(filename), check_existing=False)
            dim = size - 2 * padding
            pixels = np.empty(dim * dim * 4, dtype=np.float32)
            baked.pixels.foreach_get(pixels)
            bpy.data.images.remove(baked)
            pixels = pixels.reshape(dim, dim, 4)
            if not (pixels[:, :, 3] > .25).any():
                raise RuntimeError(f"Empty source bake: {filename}")
            # Extend RGB into the transparent fringe without expanding coverage.
            covered = pixels[:, :, 3] > .06
            for _ in range(5):
                for axis, shift in ((0, 1), (0, -1), (1, 1), (1, -1)):
                    take = np.roll(covered, shift, axis) & ~covered
                    if axis == 0:
                        take[0 if shift > 0 else -1, :] = False
                    else:
                        take[:, 0 if shift > 0 else -1] = False
                    pixels[take, :3] = np.roll(pixels[:, :, :3], shift, axis)[take]
                    covered[take] = True
            tile = index * len(directions) + angle
            x, y = (tile % columns) * size + padding, (tile // columns) * size + padding
            atlas[y:y + dim, x:x + dim] = pixels
            coords = [(x / atlas.shape[1], y / height), ((x + dim) / atlas.shape[1], y / height),
                      ((x + dim) / atlas.shape[1], (y + dim) / height), (x / atlas.shape[1], (y + dim) / height)]
            verts = [center + (right * sx + up * sy) * (width / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            cards[source.name].append((verts, coords))
        bpy.data.objects.remove(bake, do_unlink=True)
        bpy.data.meshes.remove(bake_mesh)
        bpy.data.meshes.remove(mesh)
    output = bpy.data.images.new(f"{family} twig albedo", width=atlas.shape[1], height=height, alpha=True)
    output.pixels.foreach_set(atlas.ravel())
    output.filepath_raw = str(out / f"{family}-twigs.png")
    output.file_format = "PNG"
    output.save()
    output.pack()
    material = bpy.data.materials.new(f"{family}_branch_cluster")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .92
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = output
    mask = nodes.new("ShaderNodeMath")
    mask.operation = "GREATER_THAN"
    mask.inputs[1].default_value = .23
    links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    links.new(tex.outputs["Alpha"], mask.inputs[0])
    links.new(mask.outputs[0], shader.inputs["Alpha"])
    return cards, material, near_meshes, near_material


def make_collection(original, tier, cards, material, near_meshes):
    result = bpy.data.collections.new(f"{original.name}_{tier}_rebuild")
    for source in original.objects:
        if tier == "near":
            obj = bpy.data.objects.new(source.name + " " + tier, near_meshes[source.name])
            obj.matrix_world = source.matrix_world
            result.objects.link(obj)
            continue
        verts, faces, uvs = [], [], []
        for index in tiers[tier]:
            positions, coords = cards[source.name][index]
            start = len(verts)
            verts.extend(positions)
            faces.append(tuple(range(start, start + 4)))
            uvs.extend(coords)
        mesh = bpy.data.meshes.new(source.name + " " + tier)
        mesh.from_pydata(verts, [], faces)
        mesh.materials.append(material)
        uv = mesh.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv", np.array(uvs, dtype=np.float32).ravel())
        marker = np.zeros(len(faces), dtype=np.int32)
        marker[0] = 1
        mesh.attributes.new("TwigInstance", "INT", "FACE").data.foreach_set("value", marker)
        obj = bpy.data.objects.new(source.name + " " + tier, mesh)
        obj.matrix_world = source.matrix_world
        result.objects.link(obj)
    return result


def realize_modifier(tree):
    group = bpy.data.node_groups.new("Realize compact branch instances", "GeometryNodeTree")
    group.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    group.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    a, b, c = (group.nodes.new(kind) for kind in ("NodeGroupInput", "GeometryNodeRealizeInstances", "NodeGroupOutput"))
    group.links.new(a.outputs[0], b.inputs[0])
    group.links.new(b.outputs[0], c.inputs[0])
    tree.modifiers.new("Realize compact branch instances", "NODES").node_group = group


def split_mesh(mesh, name, filter_material, uv):
    materials = list(mesh.materials)
    selected = [p for p in mesh.polygons if filter_material(materials[p.material_index])]
    used = {}
    points, faces, values = [], [], []
    for polygon in selected:
        face = []
        for loop, index in zip(polygon.loop_indices, polygon.vertices):
            if index not in used:
                used[index] = len(points)
                points.append(mesh.vertices[index].co)
            face.append(used[index])
            values.extend(uv[loop * 2:loop * 2 + 2])
        faces.append(face)
    result = bpy.data.meshes.new(name)
    result.from_pydata(points, [], faces)
    result.uv_layers.new(name="UVMap").data.foreach_set("uv", np.asarray(values, dtype=np.float32))
    colors = mesh.color_attributes.get("TwigColor")
    if colors and any(filter_material(m) and m and m.name.endswith("_geometric_needles") for m in materials):
        raw = np.empty(len(mesh.vertices) * 4, dtype=np.float32)
        colors.data.foreach_get("color", raw)
        values = raw.reshape(-1, 4)[list(used)].ravel()
        result.color_attributes.new(name="TwigColor", type="FLOAT_COLOR", domain="POINT").data.foreach_set("color", values)
    for material in materials:
        result.materials.append(material)
    for original, target in zip(selected, result.polygons):
        target.material_index = original.material_index
        target.use_smooth = original.use_smooth
    return result


wood_materials = {}


def wood_material(original):
    if original.name in wood_materials:
        return wood_materials[original.name]
    mat = bpy.data.materials.new(original.name + "_tree_rebuild")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .92
    source_nodes = original.node_tree.nodes if original.use_nodes else ()
    for source in source_nodes:
        if source.type != "TEX_IMAGE" or not source.image or "_diff." not in source.image.name:
            continue
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = source.image.copy()
        tex.image.scale(512, 512)
        tex.image.pack()
        links.new(tex.outputs["Color"], shader.inputs["Base Color"])
        break
    wood_materials[original.name] = mat
    return mat


def build_tree(name, replacements, foliage, geometric_foliage):
    scene = new_scene(name + " runtime asset")
    source = bpy.data.objects[name]
    result = {}
    keep = []
    for tier in tiers:
        tree = source.copy()
        scene.collection.objects.link(tree)
        tree.matrix_world = Matrix.Identity(4)
        tree.hide_render = False
        tree.hide_set(False)
        replaced = 0
        for modifier in tree.modifiers:
            if modifier.type != "NODES":
                continue
            modifier.node_group = modifier.node_group.copy()
            for node in modifier.node_group.nodes:
                if node.type != "COLLECTION_INFO":
                    continue
                collection = node.inputs[0].default_value
                if collection and collection.name in replacements:
                    if not node.inputs["Reset Children"].default_value:
                        raise RuntimeError(f"Unexpected twig origin rule: {name} {node.name}")
                    node.inputs[0].default_value = replacements[collection.name][tier]
                    replaced += 1
        if not replaced:
            raise RuntimeError(f"No source twig inputs replaced: {name}")
        realize_modifier(tree)
        deps = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(tree.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
        bpy.data.objects.remove(tree, do_unlink=True)
        uv = source_uv(mesh)
        crown_material = geometric_foliage if tier == "near" else foliage
        crown = split_mesh(mesh, f"{name} {tier} branch clusters", lambda m: m == crown_material, uv)
        wood = split_mesh(mesh, f"{name} {tier} woody structure", lambda m: m != crown_material, uv)
        marker = np.empty(len(mesh.polygons), dtype=np.int32)
        mesh.attributes["TwigInstance"].data.foreach_get("value", marker)
        for i, mat in enumerate(list(wood.materials)):
            if mat and mat != crown_material:
                wood.materials[i] = wood_material(mat)
        bpy.data.meshes.remove(mesh)
        objs = []
        for data in (wood, crown):
            obj = bpy.data.objects.new(data.name, data)
            scene.collection.objects.link(obj)
            objs.append(obj)
            keep.append(obj)
        bpy.context.view_layer.objects.active = objs[0]
        reduction = objs[0].modifiers.new("Reduce wood only; leave branch coverage intact", "DECIMATE")
        reduction.ratio = {"near": .24, "mid": .07, "far": .018}[tier]
        bpy.ops.object.modifier_apply(modifier=reduction.name)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objs:
            obj.select_set(True)
        destination = out / f"{name}-{tier}.glb"
        bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", use_selection=True,
                                  use_active_scene=True, export_animations=False, export_yup=True)
        result[tier] = {obj.name: sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in objs}
        result[tier]["twigInstances"] = int(marker.sum())
        for obj in objs:
            obj.hide_set(tier != "near")
    if len({r["twigInstances"] for r in result.values()}) != 1:
        raise RuntimeError(f"Twig placement changed between LODs: {name}")
    print("TREE_REBUILT", name, result, flush=True)
    return result, scene, keep


report = {}
authoring_scenes = []
for family, collections in (("pine", twig_collections[:1]), ("silver_fir", twig_collections[1:])):
    names = [name for name in args.trees if name.startswith(family + "_")]
    if not names:
        continue
    cards, material, near_meshes, near_material = bake_twigs(family, collections)
    replacements = {
        name: {tier: make_collection(bpy.data.collections[name], tier, cards, material, near_meshes) for tier in tiers}
        for name in collections
    }
    for name in names:
        report[name], scene, keep = build_tree(name, replacements, material, near_material)
        authoring_scenes.append(scene)

# Export a small editable library containing only the rebuilt geometry and baked materials.
bpy.data.libraries.write(str(out / "pine-rebuilt-trees.blend"), set(authoring_scenes), compress=True)
(out / "production.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
