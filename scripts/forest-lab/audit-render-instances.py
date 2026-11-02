import bpy
from collections import Counter

changed = 0
for group in bpy.data.node_groups:
    if group.bl_idname != "GeometryNodeTree":
        continue
    for node in group.nodes:
        if node.bl_idname != "GeometryNodeIsViewport":
            continue
        for link in list(group.links):
            if link.from_node != node:
                continue
            socket = link.to_socket
            group.links.remove(link)
            if hasattr(socket, "default_value"):
                socket.default_value = False
                changed += 1
print("VIEWPORT_SWITCHES_OVERRIDDEN_IN_MEMORY", changed, flush=True)

counts = Counter()
samples = {}
depsgraph = bpy.context.evaluated_depsgraph_get()
depsgraph.update()
for instance in depsgraph.object_instances:
    if not instance.is_instance:
        continue
    name = instance.object.original.name
    counts[name] += 1
    if len(samples.get(name, [])) < 2:
        samples.setdefault(name, []).append(tuple(round(x, 3) for x in instance.matrix_world.translation))
print("RENDER_BRANCH_INSTANCES", sum(counts.values()), flush=True)
for name, count in counts.most_common():
    print("INSTANCE", name, count, samples[name], flush=True)
