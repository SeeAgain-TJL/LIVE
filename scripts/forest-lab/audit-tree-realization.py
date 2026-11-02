"""Check whether a source tree's nested GN instances survive mesh evaluation."""

import bpy
import sys
from collections import Counter

name = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "silver_fir_02"
source = bpy.data.objects[name]
original = bpy.context.evaluated_depsgraph_get()
original.update()
base = bpy.data.meshes.new_from_object(source.evaluated_get(original), preserve_all_data_layers=True, depsgraph=original)
print("BASE_EVALUATED", name, len(base.polygons), Counter(base.materials[poly.material_index].name for poly in base.polygons).most_common(), flush=True)
bpy.data.meshes.remove(base)

duplicate = source.copy()
duplicate.data = source.data.copy()
bpy.context.collection.objects.link(duplicate)
group = bpy.data.node_groups.new(name + "_realize_for_export", "GeometryNodeTree")
group.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
group.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
input_node = group.nodes.new("NodeGroupInput")
realize = group.nodes.new("GeometryNodeRealizeInstances")
output_node = group.nodes.new("NodeGroupOutput")
group.links.new(input_node.outputs["Geometry"], realize.inputs["Geometry"])
group.links.new(realize.outputs["Geometry"], output_node.inputs["Geometry"])
modifier = duplicate.modifiers.new("realize_source_instances", "NODES")
modifier.node_group = group
depsgraph = bpy.context.evaluated_depsgraph_get()
depsgraph.update()
mesh = bpy.data.meshes.new_from_object(duplicate.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
materials = Counter(mesh.materials[poly.material_index].name for poly in mesh.polygons)
print("REALIZED", name, len(mesh.vertices), len(mesh.polygons), materials.most_common(),
      "uv", [(item.name, len(item.data)) for item in mesh.uv_layers],
      "uv_attribute", [(item.name, item.domain, item.data_type) for item in mesh.attributes if "UV" in item.name], flush=True)
