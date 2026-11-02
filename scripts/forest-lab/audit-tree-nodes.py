import bpy

for name in ("NodeGroup.006", "NodeGroup.007"):
    group = bpy.data.node_groups[name]
    print("GROUP", name)
    for node in group.nodes:
        if node.type in {"FRAME", "REROUTE"}:
            continue
        inputs = []
        for socket in node.inputs:
            if socket.is_linked or not hasattr(socket, "default_value"):
                continue
            value = socket.default_value
            if hasattr(value, "name"):
                value = value.name
            elif hasattr(value, "__len__"):
                value = tuple(value)
            inputs.append((socket.name, value))
        print("NODE", node.name, node.bl_idname, "label", node.label, "inputs", inputs)
    for link in group.links:
        if link.from_node.type == "REROUTE" or link.to_node.type == "REROUTE":
            continue
        print("LINK", link.from_node.name, link.from_socket.name, "->", link.to_node.name, link.to_socket.name)

for name in ("pine_trees", "fir_trees_l"):
    collection = bpy.data.collections[name]
    print("COLLECTION", name, [(obj.name, obj.type) for obj in collection.objects])
