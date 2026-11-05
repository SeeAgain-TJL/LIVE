"""Read original meshes/material links; never save the source blend."""
import bpy, json
from pathlib import Path
out=Path('artifacts-local/pine-scene-repair');out.mkdir(parents=True,exist_ok=True)
report={}
for name in ['montaigle_ruins_01','montaigle_ruins_02','montaigle_ruins_03','river_water','pine_02','pine_04','silver_fir_04']:
 o=bpy.data.objects[name]
 if o.type!='MESH':
  report[name]={'type':o.type};continue
 report[name]={'vertices':len(o.data.vertices),'faces':len(o.data.polygons),'uv':[{ 'name':u.name,'active_render':u.active_render,'range':[[min(v.uv[k] for v in u.data),max(v.uv[k] for v in u.data)] for k in range(2)]} for u in o.data.uv_layers], 'modifiers':[{'name':m.name,'type':m.type} for m in o.modifiers], 'materials':[]}
 for m in o.data.materials:
  if m and m.use_nodes:
   report[name]['materials'].append({'name':m.name,'nodes':[{'name':n.name,'type':n.type,'image':getattr(getattr(n,'image',None),'filepath',None),'uv_map':getattr(n,'uv_map',None)} for n in m.node_tree.nodes], 'links':[[l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name] for l in m.node_tree.links]})
report['twigMaterials']=[{'name':m.name,'nodes':[{'name':n.name,'type':n.type,'image':getattr(getattr(n,'image',None),'filepath',None)} for n in m.node_tree.nodes],'links':[[l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name] for l in m.node_tree.links]} for m in bpy.data.materials if 'twig' in m.name and m.use_nodes]
report['geometryReferences']={g.name:[n.inputs['Object'].default_value.name for n in g.nodes if n.type=='OBJECT_INFO' and n.inputs.get('Object') and n.inputs['Object'].default_value] for g in bpy.data.node_groups if g.bl_idname=='GeometryNodeTree'}
report['mapping']={m.name:[{'type':n.type,'attribute':getattr(n,'attribute_name',None),'inputs':{i.name:list(i.default_value) if hasattr(i.default_value,'__len__') and not isinstance(i.default_value,str) else i.default_value for i in n.inputs if hasattr(i,'default_value') and n.type in ['MAPPING','MIX_SHADER']}} for n in m.node_tree.nodes if n.type in ['MAPPING','ATTRIBUTE','MIX_SHADER']] for m in bpy.data.materials if 'twig' in m.name and m.use_nodes}
(out/'source-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('SOURCE_AUDIT_SAVED',flush=True)
