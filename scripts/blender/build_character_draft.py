"""Editable procedural study from the current references, NOT final character art.

No sample VRM/basemesh is used. Face, hair locks, ears, garments and tail remain
separate editable meshes/curves. Manual sculpting, retopology and texture work
are explicitly still required. Run only in a new background Blender process.
"""
import bpy
import math
import sys
import json
import hashlib
from pathlib import Path
from mathutils import Vector

args = sys.argv[sys.argv.index('--')+1:]
out = Path(args[0]).resolve()
repo = Path(args[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
if (out/'silver-spirit-draft01.blend').exists() and '--overwrite-generated' not in args:
    raise RuntimeError('Existing project preserved. Use a new output directory, or explicitly pass --overwrite-generated for untouched generated files.')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
scene['stage']='G2.1 procedural base study 01 - NOT visually approved'
scene['reference_baseline']='G1-current-pair-v1: user beauty and turnaround only'
scene['limitations']='Face likeness, hand anatomy, hair silhouette and garment topology require manual art refinement. No final rig or animation.'

char = bpy.data.collections.new('G01_DRAFT_EDITABLE')
scene.collection.children.link(char)
refs = bpy.data.collections.new('REFERENCE_ONLY_NOT_RENDERED')
scene.collection.children.link(refs)
stage = bpy.data.collections.new('STUDIO_AND_CAMERAS')
scene.collection.children.link(stage)

def move(obj, collection=char):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    collection.objects.link(obj)
    return obj

def material(name, color, rough=.45, metal=0):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    return m

skin=material('Skin - pale warm, unpainted draft',(.79,.58,.52),.52)
white=material('Eye white - warm ivory',(.9,.88,.91),.25)
lash=material('Lashes and brow - desaturated indigo',(.05,.035,.085),.48)
iris=material('Iris blue-violet',(.22,.27,.59),.23)
iris_light=material('Iris lower lavender',(.4,.47,.76),.26)
pupil=material('Pupil deep indigo',(.015,.012,.042),.22)
lip=material('Lip muted rose',(.46,.16,.19),.46)
ear_inner=material('Ear inner pale mauve',(.54,.36,.48),.65)
gold=material('Muted gold - primary detail only',(.59,.43,.23),.28,.7)
navy=material('Gown deep midnight blue',(.023,.035,.10),.38,.1)
blue=material('Gown middle blue',(.08,.12,.28),.45)
gauze=material('Sleeve silver-blue - opaque draft fabric',(.46,.55,.73),.6)
hair=bpy.data.materials.new('Hair silver crown to cool lavender blue')
hair.use_nodes=True
nodes=hair.node_tree.nodes;links=hair.node_tree.links
bs=nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.38
# Explicit vertex colors retain the silver/blue gradient in GLB as well as Blender.
vertex_color=nodes.new('ShaderNodeVertexColor');vertex_color.layer_name='HairTint'
links.new(vertex_color.outputs['Color'],bs.inputs['Base Color'])

def mesh(name, vertices, faces, mat, subdiv=1):
    data=bpy.data.meshes.new(name)
    data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);char.objects.link(obj)
    obj.data.materials.append(mat)
    if mat == hair:
        colors=data.color_attributes.new(name='HairTint',type='FLOAT_COLOR',domain='CORNER')
        data.color_attributes.active_color=colors
        low=(.20,.29,.51);mid=(.46,.52,.70);high=(.77,.79,.89)
        for loop in data.loops:
            t=max(0,min(1,(data.vertices[loop.vertex_index].co.z-.88)/.77))
            a,b,f=(low,mid,t/.6) if t<.6 else (mid,high,(t-.6)/.4)
            colors.data[loop.index].color=tuple(a[k]*(1-f)+b[k]*f for k in range(3))+(1,)
    for p in data.polygons:p.use_smooth=True
    if subdiv:
        mod=obj.modifiers.new('Editable subdivision','SUBSURF');mod.levels=subdiv;mod.render_levels=subdiv
    return obj

def ellipsoid(name, loc, scale, mat, segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    obj=move(bpy.context.object);obj.name=name;obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def curve(name, points, radius, mat):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=18
    data.bevel_depth=radius;data.bevel_resolution=3
    spline=data.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for bp,p in zip(spline.bezier_points,points):
        bp.co=p;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,data);char.objects.link(obj);obj.data.materials.append(mat)
    return obj

def catmull(points, t):
    t=max(0,min(.999999,t))*(len(points)-1)
    i=int(t);u=t-i
    p0=Vector(points[max(0,i-1)]);p1=Vector(points[i]);p2=Vector(points[min(i+1,len(points)-1)]);p3=Vector(points[min(i+2,len(points)-1)])
    return .5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u*u*u)

def lock(name,points,width,depth,mat=hair,steps=28,sides=8):
    verts=[]
    for i in range(steps+1):
        t=i/steps;c=catmull(points,t)
        tangent=(catmull(points,min(.99999,t+.002))-catmull(points,max(0,t-.002))).normalized()
        across=Vector((1,0,0))-tangent*tangent.x
        if across.length<.01:across=Vector((0,1,0))-tangent*tangent.y
        across.normalize();normal=tangent.cross(across).normalized()
        taper=(.20+.80*math.sin(math.pi*min(.98,t*.8+.11)))*(max(.005,1-t)**.38)
        for j in range(sides):
            a=j*2*math.pi/sides
            verts.append(c+across*(width*taper*math.cos(a))+normal*(depth*taper*math.sin(a)))
    faces=[tuple(range(sides-1,-1,-1))]
    for i in range(steps):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.append(tuple(steps*sides+j for j in range(sides)))
    return mesh(name,verts,faces,mat,1)

def loft(name,rings,mat,sides=48):
    # z, x radius, y radius, y center
    verts=[(rx*math.sin(j*2*math.pi/sides),cy-ry*math.cos(j*2*math.pi/sides),z) for z,rx,ry,cy in rings for j in range(sides)]
    faces=[]
    for i in range(len(rings)-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces += [tuple(range(sides-1,-1,-1)),tuple((len(rings)-1)*sides+j for j in range(sides))]
    return mesh(name,verts,faces,mat,2)

# Custom head surface: tapered chin, fuller cheeks, forehead and shallow nose/lip relief.
head_rings=[(1.378,.008,.012,-.009),(1.39,.037,.036,-.002),(1.414,.064,.053,0),
 (1.444,.084,.063,.003),(1.477,.096,.069,.006),(1.51,.101,.073,.009),
 (1.545,.105,.079,.013),(1.58,.103,.081,.017),(1.615,.086,.070,.019),
 (1.642,.055,.047,.021),(1.654,.012,.012,.021)]
verts=[];N=64
for z,rx,ry,cy in head_rings:
    for j in range(N):
        a=j*2*math.pi/N;x=rx*math.sin(a);y=cy-ry*math.cos(a)
        front=max(0,math.cos(a))**12
        nose=.024*math.exp(-((z-1.475)/.019)**2)*math.exp(-(x/.017)**2)
        bridge=.008*math.exp(-((z-1.50)/.045)**2)*math.exp(-(x/.016)**2)
        muzzle=.004*math.exp(-((z-1.432)/.016)**2)*math.exp(-(x/.035)**2)
        y-=front*(nose+bridge+muzzle)
        verts.append((x,y,z))
faces=[]
for i in range(len(head_rings)-1):
    for j in range(N):faces.append((i*N+j,i*N+(j+1)%N,(i+1)*N+(j+1)%N,(i+1)*N+j))
faces.extend([tuple(range(N-1,-1,-1)),tuple((len(head_rings)-1)*N+j for j in range(N))])
mesh('FACE_custom_cheek_chin_nose_surface',verts,faces,skin,2)
loft('Neck',[(1.29,.042,.036,0),(1.34,.038,.034,0),(1.395,.034,.031,.004)],skin)

# Almond eye surfaces, bounded pupils and shaped lid rims (no giant protruding eyeballs).
for sign,side in [(-1,'R'),(1,'L')]:
    cx=sign*.044;cz=1.518
    def eye_point(u,v):
        x=cx+u*.030
        z=cz+v*.0125+sign*u*.003
        face_y=.009-.073*math.sqrt(max(.01,1-(x/.101)**2))
        y=face_y-.002-.003*(1-u*u)*(1-v*v)
        return (x,y,z)
    vs=[eye_point(0,0)];count=48
    for j in range(count):
        a=2*math.pi*j/count;u=math.cos(a);v=math.sin(a)*(.82+.18*abs(math.sin(a)))
        vs.append(eye_point(u,v))
    mesh('Eye_almonde_white_'+side,vs,[(0,j+1,(j+1)%count+1) for j in range(count)],white,0)
    # flattened spherical iris keeps actual depth in profile
    eye_y=.009-.073*math.sqrt(1-(cx/.101)**2)-.005
    ellipsoid('Iris_'+side,(cx,eye_y-.001,cz),(.012,.0018,.0115),iris)
    ellipsoid('Pupil_'+side,(cx,eye_y-.0027,cz+.001),(.0047,.0007,.008),pupil)
    curve('Iris_lower_light_'+side,[(cx-.006,eye_y-.0028,cz-.006),(cx,eye_y-.003,cz-.008),(cx+.006,eye_y-.0028,cz-.006)],.0012,iris_light)
    ellipsoid('Eye_glint_'+side,(cx-.003,eye_y-.0035,cz+.005),(.0018,.0007,.0018),white,16,10)
    upper=[];lower=[]
    for j in range(13):
        u=-1+2*j/12;v=math.sqrt(max(0,1-u*u))
        p=Vector(eye_point(u,v));p.y-=.002;upper.append(p)
        p=Vector(eye_point(u,-v));p.y-=.001;lower.append(p)
    curve('Upper_lid_'+side,upper,.0017,lash)
    curve('Lower_lid_'+side,lower,.00065,lip)
    outer=Vector(eye_point(sign,0))
    curve('Outer_lash_'+side,[outer,outer+Vector((sign*.006,-.002,.003)),outer+Vector((sign*.011,0,.007))],.0016,lash)
    curve('Brow_'+side,[(cx-.027,-.055,1.552),(cx,-.068,1.56),(cx+.027,-.054,1.553)],.0022,lash)
curve('Mouth_upper_lip',[(-.016,-.060,1.433),(-.007,-.065,1.434),(0,-.067,1.433),(.008,-.065,1.434),(.016,-.060,1.433)],.0008,lip)
curve('Mouth_lower_lip',[(-.014,-.062,1.432),(0,-.067,1.429),(.014,-.062,1.432)],.001,lip)

# Ears are independent curved shells with inner surfaces, not a flat triangle sprite.
for sign,side in [(-1,'R'),(1,'L')]:
    outer=[(sign*.043,.008,1.608),(sign*.072,-.009,1.653),(sign*.145,.020,1.775),
           (sign*.159,.045,1.675),(sign*.117,.060,1.615)]
    center=(sign*.101,.008,1.662)
    vs=[center]+outer+[(x,y+.028,z) for x,y,z in outer]
    fs=[(0,1+j,1+(j+1)%5) for j in range(5)]+[(1+j,6+j,6+(j+1)%5,1+(j+1)%5) for j in range(5)]+[tuple(range(10,5,-1))]
    mesh('Fox_ear_shell_'+side,vs,fs,hair,1)
    inn=[(sign*.067,-.006,1.637),(sign*.141,.013,1.75),(sign*.14,.018,1.652),(sign*.10,-.004,1.63)]
    mesh('Fox_ear_inner_'+side,inn,[(0,1,2,3)],ear_inner,2)
    # Fine ear fur is deferred rather than using disconnected geometric spikes.

# Scalp mesh follows upper head and opens around face; separate sculptable strands.
vs=[];rows=12;cols=64
for i in range(rows+1):
    t=i/rows
    for j in range(cols):
        a=j*2*math.pi/cols
        # front hem above brows; back extends to nape
        end=1.0 if math.cos(a)>.35 else 2.25
        phi=.03+t*end
        vs.append((.113*math.sin(phi)*math.sin(a),.023-.095*math.sin(phi)*math.cos(a),1.53+.137*math.cos(phi)))
fs=[]
for i in range(rows):
    for j in range(cols):fs.append((i*cols+j,i*cols+(j+1)%cols,(i+1)*cols+(j+1)%cols,(i+1)*cols+j))
mesh('Hair_scalp_cap',vs,fs,hair,2)
# Layered back clumps in a quiet, no-wind shape.
for j in range(19):
    a=math.pi*.42+j/(18)*math.pi*1.16
    x=.095*math.sin(a);y=.022-.080*math.cos(a)
    endz=.92+.12*(.5+.5*math.sin(j*2.1))
    lock(f'H04_back_lock_{j:02}',[(x*.55,y*.6,1.655),(x*.9,y+.035,1.58),(x*1.13,y+ .035,1.47),(x*1.65,y+.035,1.25),
         (x*2.15+.018*math.sin(j),y+.065,1.10),(x*2.2+.027*math.sin(j*1.3),y+.028,endz)],.024,.012)
for sign,side in [(-1,'R'),(1,'L')]:
    for j in range(4):
        lock(f'H02_side_{side}_{j}',[(sign*(.052+j*.013),-.022,1.64),
             (sign*(.095+j*.007),-.049,1.52),(sign*(.106+j*.015),-.053,1.40),
             (sign*(.098+j*.018),-.092,1.24),(sign*(.12+j*.016),-.07,1.12+j*.025)],.018,.009)
# Swept fringe leaves both eyes visible, divided into distinct curved locks.
for j in range(7):
    startx=-.045+j*.014
    endx=-.081+j*.022
    endz=1.548+(.014 if j in (0,6) else 0)+.01*math.sin(j*.85)
    lock(f'H01_fringe_{j}',[(startx,.003,1.658),(startx-.02,-.068,1.613),
          (endx-.007,-.082,1.578),(endx,-.075,endz)],.019,.006,steps=20)

# Adult body proportions as a provisional editable surface, not a finished anatomical sculpt.
loft('Body_torso_draft',[(.83,.085,.061,.014),(.90,.115,.069,.018),(1.0,.103,.065,.009),
 (1.109,.073,.048,0),(1.19,.088,.059,0),(1.27,.121,.065,0),(1.31,.133,.051,.008),(1.34,.072,.039,.007)],skin)
for sign,side in [(-1,'R'),(1,'L')]:
    # Arms and legs are custom swept surfaces, joints remain separately editable in this study.
    lock('Arm_'+side,[(sign*.12,0,1.30),(sign*.184,-.003,1.25),(sign*.237,-.018,1.13),
         (sign*.267,-.026,1.02),(sign*.292,-.04,.94)],.042,.034,skin,32,12)
    palm=ellipsoid('Hand_palm_draft_'+side,(sign*.303,-.04,.92),(.026,.016,.041),skin)
    for j in range(4):
        x=sign*(.286+j*.011)
        curve('Finger_draft_'+side+str(j),[(x,-.043,.91),(x+sign*.008,-.047,.875),(x+sign*.012,-.052,.85+abs(j-1.3)*.006)],.005,skin)
    curve('Thumb_draft_'+side,[(sign*.283,-.042,.936),(sign*.267,-.057,.917),(sign*.263,-.061,.899)],.006,skin)
    lock('Leg_'+side,[(sign*.077,.013,.91),(sign*.083,.013,.73),(sign*.082,-.014,.51),
          (sign*.08,.018,.32),(sign*.08,.01,.15)],.059,.05,skin,36,16)
    ellipsoid('Shoe_'+side,(sign*.08,-.04,.084),(.044,.103,.040),navy)
    curve('Shoe_heel_'+side,[(sign*.08,.028,.09),(sign*.08,.033,.025)],.017,navy)

# Minimal gown silhouette; fine ornaments and sheer cloth deliberately deferred.
loft('Gown_bodice',[(.88,.116,.074,.014),(.97,.105,.068,.005),(1.08,.078,.052,0),
 (1.17,.089,.063,-.006),(1.23,.111,.073,-.004),(1.265,.118,.064,.001)],navy)
loft('Gown_inner_short_skirt',[(.78,.126,.076,.014),(.84,.126,.077,.014),(.91,.119,.077,.014),(.95,.11,.071,.009)],blue)
loft('Gown_collar',[(1.325,.043,.037,.001),(1.35,.040,.035,.001),(1.365,.037,.033,.001)],navy)
for sign in (-1,1):
    curve('Neck_to_bodice_trim_'+str(sign),[(sign*.028,-.035,1.334),(sign*.061,-.051,1.29),(sign*.101,-.046,1.25)],.002,gold)
    curve('Bodice_trim_'+str(sign),[(sign*.099,-.050,1.25),(sign*.07,-.064,1.17),(sign*.015,-.058,1.08)],.002,gold)

def skirt_panel(name,a0,a1,mat,offset=0):
    levels=[(.985,.11),(.91,.132),(.73,.18),(.49,.235),(.26,.29),(.08,.34)]
    vs=[];nc=10
    for k,(z,r) in enumerate(levels):
        for j in range(nc+1):
            a=a0+(a1-a0)*j/nc
            ripple=.008*math.sin(a*17+k*.5)*(k/5)
            rr=r+offset+ripple
            vs.append((rr*math.sin(a),.02-rr*.67*math.cos(a),z+.025*math.sin(j*math.pi/nc)*(k/5)))
    fs=[(k*(nc+1)+j,k*(nc+1)+j+1,(k+1)*(nc+1)+j+1,(k+1)*(nc+1)+j) for k in range(len(levels)-1) for j in range(nc)]
    ob=mesh(name,vs,fs,mat,2)
    sol=ob.modifiers.new('Fabric thickness','SOLIDIFY');sol.thickness=.002
    return ob
# frontal opening shows legs; rear remains closed
skirt_panel('Skirt_deep_blue_L',.22,math.pi,navy)
skirt_panel('Skirt_deep_blue_R',math.pi,2*math.pi-.22,navy)
skirt_panel('Skirt_pale_layer_L',.70,1.23,gauze,.014)
skirt_panel('Skirt_pale_layer_R',2*math.pi-1.23,2*math.pi-.70,gauze,.014)
skirt_panel('Skirt_back_blue_layer',2.3,3.98,blue,.014)
for sign,side in [(-1,'R'),(1,'L')]:
    # flowing detached sleeve panel, simple opaque cloth in this draft
    pts=[(sign*.15,0,1.27),(sign*.22,-.007,1.11),(sign*.29,.015,.96),(sign*.34,.06,.76),(sign*.31,.08,.69)]
    lock('Sleeve_silver_panel_'+side,pts,.064,.008,gauze,32,8)
    lock('Sleeve_blue_ribbon_'+side,[(sign*.16,-.02,1.27),(sign*.24,-.025,1.1),(sign*.32,.015,.92),(sign*.36,.06,.72)],.024,.006,blue)
curve('Waist_gold_band',[(-.077,-.04,1.075),(-.045,-.057,1.055),(0,-.062,1.07),(.045,-.057,1.055),(.077,-.04,1.075)],.003,gold)
ellipsoid('Waist_central_blue_gem',(0,-.068,1.07),(.016,.008,.025),iris)

# Single large tail, attached behind pelvis. Surface is a volume study, not groomed fur.
lock('FOX_TAIL_single_volume_study',[(0,.07,.89),(-.15,.17,.77),(-.31,.19,.56),(-.40,.13,.46),(-.46,.07,.56),(-.40,.04,.71)],.12,.11,hair,48,16)
for j in range(8):
    lock(f'Tail_tip_clump_{j}',[(-.42+j*.008,.05+j*.007,.56),(-.43+j*.01,.03+j*.008,.65),(-.38+j*.006,.018+j*.007,.75+j*.006)],.021,.015,steps=20)
# Primary head ornament only. No intricate chains to distract from the face.
curve('Head_ornament_arc',[(-.077,-.047,1.617),(-.106,-.037,1.597),(-.117,-.029,1.567)],.0028,gold)
for j in range(3):
    ellipsoid('Head_gem_'+str(j),(-.104-j*.005,-.047,1.59-j*.021),(.005,.003,.009),iris_light,16,10)

# Pack the two actual baseline images as non-rendered reference empties in source project.
source_hashes={}
for i,file in enumerate(['approved-beauty.png','turnaround-v1.png']):
    source=repo/'docs/character/g1-5/source'/file
    source_hashes[file]=hashlib.sha256(source.read_bytes()).hexdigest()
    image=bpy.data.images.load(str(source),check_existing=True);image.pack()
    obj=bpy.data.objects.new('REFERENCE_'+file,None);refs.objects.link(obj)
    obj.empty_display_type='IMAGE';obj.data=image;obj.empty_display_size=1.8
    obj.location=(2.1+i*2.1,.4,1.0);obj.rotation_euler=(math.pi/2,0,0);obj.hide_render=True
    obj['role']='Only current visual baseline. Not part of model geometry.'
notes=bpy.data.texts.new('READ_ME_DRAFT_STATUS')
notes.write('G2.1 BASE STUDY 01 - NOT FINAL ART\nEditable procedural study. No sample character used.\nFace likeness, eyes, jaw, hair clump silhouette, ear roots, hands, topology and gown need manual editing.\nNo production rig, expressions, final UV textures or physics.\nTwo approved baseline images packed as reference empties only.\n')

# Save a static GLB from model objects only (no cameras, lights or reference planes).
bpy.ops.object.select_all(action='DESELECT')
for obj in char.objects:
    if obj.type in {'MESH','CURVE'}:obj.select_set(True)
glb_result=bpy.ops.export_scene.gltf(filepath=str(out/'silver-spirit-draft01.glb'),export_format='GLB',use_selection=True,export_apply=True)

# Neutral studio, CPU Cycles works independently of Intel GPU feature support.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=720;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.15,.22,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
scene.view_settings.view_transform='AgX'
floor=material('Studio floor',(.035,.045,.07),.8)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.008));ob=move(bpy.context.object,stage);ob.name='Studio_floor';ob.data.materials.append(floor)
for pos,energy,size in [((2,-3,3.5),260,3),((-2,-1,2.5),180,2.5),((0,2.5,3),330,2.5)]:
    bpy.ops.object.light_add(type='AREA',location=pos);ob=move(bpy.context.object,stage);ob.data.energy=energy;ob.data.shape='DISK';ob.data.size=size
    ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=move(bpy.context.object,stage);camera.name='Review_camera';scene.camera=camera
camera.data.type='ORTHO';camera.data.ortho_scale=2.05
# Render-visible label follows camera so every angle is explicitly a draft.
data=bpy.data.curves.new('Draft label','FONT');data.body='G2.1 / DRAFT 01 - NOT FINAL';data.size=.043
label=bpy.data.objects.new('RENDER_DRAFT_LABEL',data);stage.objects.link(label);label.parent=camera
label.location=(-.71,-.95,-1)
label_mat=bpy.data.materials.new('Draft label unlit');label_mat.use_nodes=True
label_nodes=label_mat.node_tree.nodes;label_nodes.clear()
emission=label_nodes.new('ShaderNodeEmission');emission.inputs[0].default_value=(1,.7,.2,1)
surface=label_nodes.new('ShaderNodeOutputMaterial');label_mat.node_tree.links.new(emission.outputs[0],surface.inputs['Surface'])
label.data.materials.append(label_mat)
def aim(pos,target,scale):
    camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
def render(name,pos,target=(0,0,.91),scale=2.05):
    aim(pos,target,scale)
    label.data.size=.043*scale/2.05;label.location=(-.345*scale,-.463*scale,-1)
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/(name+'.png'))
    bpy.ops.render.render(write_still=True)

aim((0,-4,1.0),(0,0,.91),2.05)
scene['glb_export_status']=str(glb_result)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active=bpy.data.objects['FACE_custom_cheek_chin_nose_surface']
bpy.context.view_layer.objects.active.select_set(True)
# Save before rendering so a render failure cannot lose the editable source.
bpy.ops.wm.save_as_mainfile(filepath=str(out/'silver-spirit-draft01.blend'))
for name,pos in [('front',(0,-4,1.0)),('side',(4,0,1.0)),('back',(0,4,1.0)),('three-quarter',(2.5,-4,1.2))]:render(name,pos)
render('head-front',(0,-3,1.55),(0,-.01,1.57),.55)
render('head-side',(3,0,1.55),(0,-.01,1.57),.55)
render('head-three-quarter',(1.3,-3,1.6),(0,-.01,1.57),.55)

# Actual camera orbit, 48 rendered frames, no character animation.
aim((0,-4,1.0),(0,0,.91),2.05)
label.data.size=.043;label.location=(-.71,-.95,-1)
orbit=bpy.data.objects.new('Turntable_camera_orbit',None);stage.objects.link(orbit)
camera.parent=orbit
orbit.rotation_euler.z=0;orbit.keyframe_insert(data_path='rotation_euler',frame=1)
orbit.rotation_euler.z=2*math.pi;orbit.keyframe_insert(data_path='rotation_euler',frame=49)
for fc in orbit.animation_data.action.fcurves:
    for key in fc.keyframe_points:key.interpolation='LINEAR'
scene.render.resolution_x=480;scene.render.resolution_y=640;scene.cycles.samples=12
scene.render.fps=12;scene.frame_start=1;scene.frame_end=48
scene.render.image_settings.file_format='FFMPEG'
scene.render.ffmpeg.format='MPEG4';scene.render.ffmpeg.codec='H264';scene.render.ffmpeg.constant_rate_factor='MEDIUM'
scene.render.filepath=str(out/'turntable-draft01.mp4')
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'silver-spirit-draft01.blend'))
bpy.ops.render.render(animation=True)
report={'status':'procedural base study; not final likeness; user visual review required',
        'blender':bpy.app.version_string,'source_sha256':source_hashes,
        'objects':len(char.objects),'mesh_objects':sum(o.type=='MESH' for o in char.objects),
        'glb_export':sorted(glb_result),'turntable_frames':48,'turntable_fps':12,
        'no_final_rig':True,'manual_work':['face likeness and eyelid anatomy','hair groom and fringe','ear root and fur','body/hand anatomy and retopology','garment seam construction','UV textures and material export fidelity']}
(out/'draft-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('UOM_DRAFT_RENDERED',json.dumps(report))
