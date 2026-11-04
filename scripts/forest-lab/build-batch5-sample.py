"""Derive one editable creek/forest stand from the original, never save the source.
Blender 4.4.3 -b pine-forest-copy.blend --python this.py. Exact source placements.
No new scatter, tree LOD, or ground material is authored here.
"""
import bpy, bmesh, json, gzip, math, os
from pathlib import Path
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import numpy as np

assert Path(bpy.data.filepath).name == 'pine-forest-copy.blend'
root=Path.cwd();out=root/'artifacts-local/pine-batch5/blender';out.mkdir(parents=True,exist_ok=True)
web=root/'public/forest-origin-assets/batch5';web.mkdir(parents=True,exist_ok=True)
assets=Path(os.environ['LOCALAPPDATA'])/'UNIVERSE-OF-ME/asset-audit/candidate-assets'
for image in bpy.data.images:
    if image.filepath.startswith('//'): image.filepath=str(assets/image.filepath[2:])
source_scene=bpy.context.scene;original_material=bpy.data.materials['main_terrain'].copy()
# Relief is explicit geometry in both renderers; do not displace it twice.
for node in original_material.node_tree.nodes:
    if node.type=='OUTPUT_MATERIAL':
        for link in list(node.inputs['Displacement'].links):original_material.node_tree.links.remove(link)
source=bpy.data.objects['terrain_main'];deps=bpy.context.evaluated_depsgraph_get()
mesh=bpy.data.meshes.new_from_object(source.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
scene=bpy.data.scenes.new('Pine_Batch5_Creek_Stand');scene.world=source_scene.world.copy();bpy.context.window.scene=scene
terrain=bpy.data.objects.new('source_terrain_with_local_relief',mesh);scene.collection.objects.link(terrain)
core=(-40,40,-75,-15)
# Refine only the representative creek stand. Preserve macro terrain and seams.
bm=bmesh.new();bm.from_mesh(mesh)
edges=[e for e in bm.edges if all(core[0]<v.co.x<core[1] and core[2]<v.co.y<core[3] for v in e.verts)]
bmesh.ops.subdivide_edges(bm,edges=edges,cuts=2,use_grid_fill=True)
bm.to_mesh(mesh);bm.free();mesh.update()
maps=[]
for name,scale,amplitude in [('forest_leaves_04',150,.07),('forest_ground_04',22,.4),('rocky_trail',20,.5)]:
    image=bpy.data.images.load(str(assets/'textures'/f'{name}_disp.png'),check_existing=True)
    image.scale(1024,1024);values=np.empty(1024*1024*4,dtype=np.float32);image.pixels.foreach_get(values)
    maps.append((values.reshape(1024,1024,4)[:,:,0],scale,amplitude))
def sample(data,u,v):
    x=(u%1)*1024;y=(v%1)*1024;ix=int(x)%1024;iy=int(y)%1024;fx=x-int(x);fy=y-int(y)
    return float((data[iy,ix]*(1-fx)+data[iy,(ix+1)%1024]*fx)*(1-fy)+(data[(iy+1)%1024,ix]*(1-fx)+data[(iy+1)%1024,(ix+1)%1024]*fx)*fy)
path_attr=mesh.attributes['path'];river_attr=mesh.attributes['river'];displaced=0;maximum=0
for v in mesh.vertices:
    x,y=v.co.x,v.co.y
    fade=min((x-core[0])/2,(core[1]-x)/2,(y-core[2])/2,(core[3]-y)/2,1)
    if fade<=0:continue
    heights=[(sample(data,(x+102.94194)/202.94194*scale,(y+100)/200*scale)-.5)*amplitude for data,scale,amplitude in maps]
    p=path_attr.data[v.index].color[0];r=river_attr.data[v.index].color[0]
    delta=((heights[0]*(1-p)+heights[1]*p)*(1-r)+heights[2]*r)*fade
    v.co.z+=delta;maximum=max(maximum,abs(delta));displaced+=1
mesh.update()
for face in mesh.polygons:face.use_smooth=True
# Export relief only, preserving existing global terrain UV and layered shader.
export_material=bpy.data.materials.new('existing_layered_surface_runtime');export_material.diffuse_color=(.5,.5,.5,1)
mesh.materials.clear();mesh.materials.append(export_material)
bpy.ops.object.select_all(action='DESELECT');terrain.select_set(True);bpy.context.view_layer.objects.active=terrain
bpy.ops.export_scene.gltf(filepath=str(web/'sample-terrain.glb'),export_format='GLB',use_selection=True,export_apply=True)
mesh.materials[0]=original_material

# Import the already-approved runtime geometry losslessly decoded for Blender.
# The imported mesh library remains linked between original instance locations.
library={}
for name in ['pine_01','pine_02','pine_03','pine_04','pine_05','silver_fir_01','silver_fir_02','silver_fir_03','silver_fir_04','silver_fir_05','silver_fir_06','props']:
    before=set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(root/'artifacts-local/pine-batch5/blender-inputs'/f'{name}.glb'))
    imported=set(scene.objects)-before
    for obj in imported:obj.hide_render=True
    if name!='props':library[name]=[(o.data,o.matrix_world.copy()) for o in imported if o.type=='MESH']
    else:
        for obj in imported:
            if obj.name.startswith('source__'):
                parts=[(o.data,o.matrix_world.copy()) for o in imported if o.type=='MESH' and (o==obj or o in obj.children_recursive)]
                if parts:library[obj.name[8:]]=parts
    for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
def place(name,rows,label):
    parts=library.get(name)
    if not parts:return False
    transform=Matrix(rows if len(rows)==4 else rows+[[0,0,0,1]])
    for index,(data,local) in enumerate(parts):
        obj=bpy.data.objects.new(f'{label}_{name}_{index}',data);scene.collection.objects.link(obj);obj.matrix_world=transform@local
    return True
tree_rows=json.loads((root/'public/forest-origin-assets/source-tree-placements.json').read_text())
trees=[]
for index,item in enumerate(tree_rows):
    x,y=item['matrix'][0][3],item['matrix'][1][3]
    if -65<x<65 and -100<y<10:
        place(item['source'],item['matrix'],f'original_tree_{index}');trees.append(item)
prop_count=0;prop_types={}
for file in (root/'public/forest-origin-assets/runtime-tiles').glob('*.json.gz'):
    data=json.loads(gzip.decompress(file.read_bytes()))
    inventory=json.loads((root/'public/forest-origin-assets/render-inventory.json').read_text())
    for asset,rows in data['props']:
        name=inventory['sourceAssetNames'][asset];x,y=rows[0][3],rows[1][3]
        if not(core[0]<x<core[1] and core[2]<y<core[3]):continue
        # Preserve native non-moss understory/creek structure; moss is represented
        # by the original terrain in the DCC preview, not re-scattered.
        if name.startswith(('moss_patch','cover_','pine_cover')):continue
        if place(name,rows,f'original_prop_{prop_count}'):
            prop_count+=1;prop_types[name]=prop_types.get(name,0)+1
sun=bpy.data.lights.new('creek_morning_sun','SUN');sun.energy=2.1;sun.angle=math.radians(6)
light=bpy.data.objects.new('creek_morning_sun',sun);scene.collection.objects.link(light)
light.rotation_euler=Vector((30,12,-45)).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('Batch5_matching_camera',bpy.data.cameras.new('Batch5_camera'));scene.collection.objects.link(camera);scene.camera=camera
camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=24;camera.data.lens=24/(2*math.tan(math.radians(48.5)/2))
camera.location=(23.1554737091,-47.5597991943,.9223032594);direction=Vector((-.9821439487,.1396602648,.1260486988))
camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.use_simplify=True;scene.cycles.texture_limit_render='1024'
scene.render.resolution_x=960;scene.render.resolution_y=600;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.use_nodes=False
# Bake local contact/canopy ambient occlusion, with exact placed source geometry.
scene.world.color=(.1,.1,.1);scene.world.use_nodes=True
ao=bpy.data.images.new('Batch5_source_stand_contact_ao',width=2048,height=2048,alpha=False)
ao.colorspace_settings.name='Non-Color'
target=original_material.node_tree.nodes.new('ShaderNodeTexImage');target.image=ao;original_material.node_tree.nodes.active=target
bpy.ops.object.select_all(action='DESELECT');terrain.select_set(True);bpy.context.view_layer.objects.active=terrain
scene.render.bake.margin=8
bpy.ops.object.bake(type='AO')
ao.filepath_raw=str(out/'contact-ao.png');ao.file_format='PNG';ao.save()
original_material.node_tree.nodes.remove(target)
# Keep the relief collision heightfield consistent without modifying source data.
collision=json.loads((root/'public/forest-origin-assets/collision-layout.json').read_text())
tree=BVHTree.FromPolygons([v.co for v in mesh.vertices],[p.vertices[:] for p in mesh.polygons])
c=collision['collision']
for row in range(c['rows']):
    for col in range(c['columns']):
        x=c['origin'][0]+col*c['step'];y=c['origin'][1]+row*c['step']
        hit=tree.ray_cast(Vector((x,y,100)),Vector((0,0,-1)))
        if hit[0] is not None:c['heights'][row*c['columns']+col]=hit[0].z
(web/'collision-layout.json').write_text(json.dumps(collision,separators=(',',':')))
report={'source':str(assets/'polyhaven_pine_fir_forest.blend'),'coreBlenderXY':core,'trees':len(trees),'props':prop_count,'propTypes':prop_types,'terrainVertices':len(mesh.vertices),'terrainFaces':len(mesh.polygons),'displacedVertices':displaced,'maxDisplacement':maximum,'treePlacementChanged':False,'groundMaterialRebuilt':False,'camera':{'position':[camera.location.x,camera.location.z,-camera.location.y],'direction':[direction.x,direction.z,-direction.y],'fov':48.5},'limitations':['Blender uses existing near tree and mid prop LODs with their PBR conversion, not full Cycles source trees.','DCC preview omits tiny moss cards; browser retains existing source ground cover.','AO is static; no real-time sun shadow map.']}
(out/'sample.json').write_text(json.dumps(report,indent=2));(web/'sample.json').write_text(json.dumps(report,indent=2))
scene.render.filepath=str(out/'blender-near.png');bpy.ops.render.render(write_still=True)
# Save only this editable sample and its packed, bounded textures.
for other in list(bpy.data.scenes):
    if other!=scene:bpy.data.scenes.remove(other)
for obj in list(bpy.data.objects):
    if obj.name not in scene.objects:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
for image in bpy.data.images:
    if image.type=='IMAGE' and image.size[0]>2048:image.scale(2048,2048)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/'pine-batch5-creek-stand.blend'))
print('BATCH5_SAMPLE',json.dumps(report),flush=True)
