import bpy
from collections import Counter

scene = bpy.context.scene
depsgraph = bpy.context.evaluated_depsgraph_get()
terrain = bpy.data.objects["terrain_main"]
camera = scene.camera

print("SOURCE", bpy.data.filepath)
print("CAMERA", camera.name, tuple(camera.location), tuple(camera.rotation_euler), camera.data.lens)
print("TERRAIN", tuple(terrain.dimensions), len(terrain.data.vertices), len(terrain.data.polygons))
print("MATERIALS")
for material in bpy.data.materials:
    if material.users:
        types = Counter(node.type for node in material.node_tree.nodes) if material.use_nodes else Counter()
        print(material.name, material.users, dict(types))

counts = Counter()
samples = {}
total = 0
for instance in depsgraph.object_instances:
    if not instance.is_instance:
        continue
    name = instance.object.original.name
    counts[name] += 1
    total += 1
    if len(samples.get(name, [])) < 3:
        samples.setdefault(name, []).append(tuple(instance.matrix_world.translation))

print("INSTANCE_TOTAL", total)
for name, count in counts.most_common():
    print("INSTANCE", name, count, samples[name])
