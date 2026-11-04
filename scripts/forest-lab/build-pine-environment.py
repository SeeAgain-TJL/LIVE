"""Blender 4.4.3 -b ORIGINAL.blend --python-exit-code 1 --python build-pine-environment.py.

Derive relief, a navigation grid, and a static canopy lighting field without
saving the source or re-exporting the vegetation, water, or ruin meshes.
"""
import bpy
import json
import os
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root = Path.cwd()
runtime = root / 'public/forest-origin-assets'
out = runtime / 'environment'
out.mkdir(exist_ok=True)
scene = bpy.context.scene
deps = bpy.context.evaluated_depsgraph_get()
source = scene.objects['terrain_main']
mesh = bpy.data.meshes.new_from_object(source.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
terrain = bpy.data.objects.new('Pine source terrain with relief', mesh)
scene.collection.objects.link(terrain)
terrain.matrix_world = source.matrix_world.copy()
textures = Path(bpy.data.filepath).parent / 'textures'
positions = np.empty(len(mesh.vertices)*3, dtype=np.float32)
mesh.vertices.foreach_get('co', positions)
positions = positions.reshape(-1, 3)
x, y = positions[:, 0], positions[:, 1]

def displacement(name, repeat, amplitude):
    image = bpy.data.images.load(str(textures / f'{name}_disp.png'), check_existing=False)
    image.colorspace_settings.name = 'Non-Color'
    image.scale(1024, 1024)
    values = np.empty(1024*1024*4, dtype=np.float32)
    image.pixels.foreach_get(values)
    data = values.reshape(1024, 1024, 4)[:, :, 0]
    u = ((x+102.94194)/202.94194*repeat % 1)*1024
    v = ((y+100)/200*repeat % 1)*1024
    ix, iy = u.astype(int), v.astype(int)
    fx, fy = u-ix, v-iy
    result = ((data[iy, ix]*(1-fx)+data[iy, (ix+1)%1024]*fx)*(1-fy)
              +(data[(iy+1)%1024, ix]*(1-fx)+data[(iy+1)%1024, (ix+1)%1024]*fx)*fy)
    bpy.data.images.remove(image)
    return (result-.5)*amplitude

def weight(name):
    values = np.empty(len(mesh.vertices)*4, dtype=np.float32)
    mesh.attributes[name].data.foreach_get('color', values)
    return values[::4]

leaves = displacement('forest_leaves_04', 150, .07)
trail = displacement('forest_ground_04', 22, .4)
gravel = displacement('rocky_trail', 20, .5)
p, r = weight('path'), weight('river')
delta = (leaves*(1-p)+trail*p)*(1-r)+gravel*r
positions[:, 2] += delta
mesh.vertices.foreach_set('co', positions.ravel())
for face in mesh.polygons:
    face.use_smooth = True
mesh.update()

world = terrain.matrix_world
ground = BVHTree.FromPolygons([world@v.co for v in mesh.vertices], [p.vertices[:] for p in mesh.polygons])
ruins = []
for obj in scene.objects:
    if not obj.name.startswith('montaigle_ruins_') or obj.hide_render:
        continue
    verts = [obj.matrix_world@v.co for v in obj.data.vertices]
    ruins.append((min(v.x for v in verts),max(v.x for v in verts),
                  min(v.y for v in verts),max(v.y for v in verts),
                  BVHTree.FromPolygons(verts, [p.vertices[:] for p in obj.data.polygons])))

def down(tree, a, b):
    hit, *_ = tree.ray_cast(Vector((a,b,64)), Vector((0,0,-1)))
    return hit.z if hit is not None else None

# Every walkable sample is projected onto the same displaced mesh as the browser.
# Conservatively reserve occupied ruin footprints, including roof overhangs.
origin = [-103, -100]
step = .5
cols, rows = 407, 401
heights, blocked = [], []
for j in range(rows):
    b = origin[1]+j*step
    for i in range(cols):
        a = origin[0]+i*step
        h = down(ground,a,b)
        heights.append(None if h is None else round(h,3))
        solid = False
        if h is not None:
            for lo,hi,bot,top,bvh in ruins:
                if lo<=a<=hi and bot<=b<=top:
                    z = down(bvh,a,b)
                    if z is not None and z>h+.38:
                        solid = True
                        break
        blocked.append(int(solid))
collision = dict(origin=origin, step=step, columns=cols, rows=rows, heights=heights, blocked=blocked)
(out/'navigation.json').write_text(json.dumps(collision,separators=(',',':')),encoding='utf-8')

# One field shared by terrain, foliage, ruins and water. RG stores terrain
# elevation; B stores soft direct light transmittance from source canopy bounds.
# Ground sampled at texel centers; sunlight projects along the original sun.
size = 768
lo = np.array([-104,-101])
span = np.array([206,202])
axis_x, axis_y = [lo[k]+(np.arange(size)+.5)*span[k]/size for k in range(2)]
height = np.empty((size,size), dtype=np.float32)
for j,b in enumerate(axis_y):
    for i,a in enumerate(axis_x):
        h = down(ground,float(a),float(b))
        height[j,i] = h if h is not None else -20
trees = json.loads((runtime/'source-tree-placements.json').read_text())
sun = scene.objects['sun_main'].matrix_world.to_quaternion() @ Vector((0,0,1))
shade = np.ones_like(height)
sx, sy = sun.x/sun.z, sun.y/sun.z
library = {item['source']:json.loads((runtime/'batch2/impostors'/f"{item['source']}.json").read_text()) for item in trees}
for item in trees:
    matrix = np.array(item['matrix'])
    a,b,h = matrix[:3,3]
    meta = library[item['source']]
    scale = np.linalg.norm(matrix[:3,:3],axis=0)
    width = meta['width']*max(scale[:2])
    crown = meta['height']*scale[2]
    if width < .1 or crown < .1:
        continue
    # Crown volume is represented by tapered layers; their soft shadows are
    # anchored to each original tree and conform to the sampled terrain.
    for f,w,opacity in ((.44,.46,.16),(.62,.49,.31),(.81,.32,.24),(.95,.15,.09)):
        z = h+f*crown
        radius = max(width*w,.2)
        # Bound the patch by the highest/lowest relevant ground elevations.
        endx = [a-sx*(z-q) for q in (-12,25)]
        endy = [b-sy*(z-q) for q in (-12,25)]
        ix0,ix1 = np.searchsorted(axis_x,[min(endx)-radius,max(endx)+radius])
        iy0,iy1 = np.searchsorted(axis_y,[min(endy)-radius,max(endy)+radius])
        hs = height[iy0:iy1,ix0:ix1]
        dx = axis_x[None,ix0:ix1]+sx*(z-hs)-a
        dy = axis_y[iy0:iy1,None]+sy*(z-hs)-b
        falloff = np.maximum(0,1-(dx*dx+dy*dy)/(radius*radius))
        shade[iy0:iy1,ix0:ix1] *= 1-opacity*falloff*(z>hs)
pixels = np.empty((size,size,4), dtype=np.float32)
encoded = np.round(np.clip((height+20)/64,0,1)*65535).astype(np.uint16)
pixels[:,:,0] = (encoded//256)/255
pixels[:,:,1] = (encoded%256)/255
pixels[:,:,2] = .19+.81*shade
pixels[:,:,3] = 1
image = bpy.data.images.new('Pine terrain height and canopy light',size,size,alpha=False,is_data=True)
image.colorspace_settings.name = 'Non-Color'
image.pixels.foreach_set(pixels.ravel())
image.filepath_raw=str(out/'height-light.png')
image.file_format='PNG'
image.save()

material = bpy.data.materials.new('Existing layered terrain PBR')
mesh.materials.clear()
mesh.materials.append(material)
bpy.ops.object.select_all(action='DESELECT')
terrain.select_set(True)
bpy.context.view_layer.objects.active = terrain
bpy.ops.export_scene.gltf(filepath=str(out/'terrain.glb'),export_format='GLB',use_selection=True,
                          export_apply=True,export_yup=True,export_attributes=False)
report=dict(source=Path(bpy.data.filepath).name, terrainVertices=len(mesh.vertices),
            terrainFaces=len(mesh.polygons), reliefPeakMeters=float(np.abs(delta).max()),
            treesUsedForField=len(trees), ruinColliders=len(ruins),
            walkableSamples=sum(v is not None for v in heights), blockedSamples=sum(blocked),
            fieldResolution=size, originalSun=list(sun))
(out/'production.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('PINE_ENVIRONMENT',json.dumps(report),flush=True)
