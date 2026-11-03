import { Box3, DoubleSide, DynamicDrawUsage, Frustum, Group, InstancedBufferAttribute, InstancedMesh, Material, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Sphere, SRGBColorSpace, Texture, TextureLoader, Vector3, type WebGLRenderer } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export const pineRoot = "/forest-origin-assets/";
export type TileManifest = { names: string[]; propAssetCount: number; tiles: Record<string, { trees: number; props: number; bytes: number }> };
type Tier = "near" | "mid" | "far";
type Part = { geometry: Mesh["geometry"]; material: Material | Material[]; matrix: Matrix4 };
type Asset = { parts: Part[]; sphere: Sphere; billboard?: { center: Vector3 } };
type Resource = { assets: Map<string, Asset>; geometries: Set<Mesh["geometry"]>; materialKeys: Set<string>; lastUsed: number };
type Tile = { data: Float32Array; bounds: Float32Array; lod: Uint8Array; cells: { box: Box3; offsets: number[] }[]; lastUsed: number };
type Batch = { resource: string; parts: InstancedMesh[]; capacity: number; ownedGeometry: Mesh["geometry"][]; lastUsed: number };
type Selection = { resource: string; asset: Asset; chunks: { data: Float32Array; offsets: number[] }[]; count: number };
const tiers: Tier[] = ["near", "mid", "far"];
function matrixAt(data: Float32Array, offset: number, target: Matrix4) {
  // Exact A * source * inverse(A), A = rotationX(-PI/2). Avoid two
  // general 4x4 multiplies for every visible ground-cover instance.
  return target.set(data[offset+1],data[offset+3],-data[offset+2],data[offset+4],
    data[offset+9],data[offset+11],-data[offset+10],data[offset+12],
    -data[offset+5],-data[offset+7],data[offset+6],-data[offset+8],0,0,0,1);
}
function tileDistance(key: string, point: Vector3) {
  const [x,y] = key.split("_").map(Number);
  return Math.hypot(Math.max(x*32-point.x,0,point.x-(x+1)*32), Math.max(y*32+point.z,0,-point.z-(y+1)*32));
}

export async function loadPineImpostorAsset(name: string) {
  const response=await fetch(pineRoot+`batch2/impostors/${name}.json`);
  if(!response.ok) throw Error(`Impostor ${name} HTTP ${response.status}`);
  const metadata=await response.json() as {center:number[];width:number;height:number;bounds:{min:number[];max:number[]}};
  const texture=await new TextureLoader().loadAsync(pineRoot+`batch2/impostors/${name}.webp`);texture.colorSpace=SRGBColorSpace;
  const material=new MeshBasicMaterial({map:texture,transparent:true,alphaTest:0.015,depthWrite:false,side:DoubleSide,toneMapped:false});
  material.forceSinglePass=true;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nattribute float atlasAngle;");
    shader.vertexShader=shader.vertexShader.replace("#include <uv_vertex>","#include <uv_vertex>\nvMapUv = vec2((vMapUv.x + mod(atlasAngle, 4.0)) / 4.0, (vMapUv.y + 1.0 - floor(atlasAngle / 4.0)) / 2.0);");
  };
  material.customProgramCacheKey=()=>"pine-source-eight-view-v2";
  const geometry=new PlaneGeometry(metadata.width,metadata.height);
  const center=new Vector3().fromArray(metadata.center);
  const sphere=new Box3(new Vector3().fromArray(metadata.bounds.min),new Vector3().fromArray(metadata.bounds.max)).getBoundingSphere(new Sphere());
  const asset: Asset={parts:[{geometry,material,matrix:new Matrix4()}],sphere,billboard:{center}};
  return {asset,geometry,material,texture,metadata};
}

/** Imperative render-only owner. No archive data, React business state, or global
 * loader cache. Shared source geometry/materials are explicitly reference counted. */
export class PineStream {
  readonly group = new Group();
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private resources = new Map<string, Resource>();
  private pending = new Set<string>();
  private queue = new Map<string, number>();
  private materials = new Map<string, { material: Material; refs: number }>();
  private tiles = new Map<string, Tile>();
  private tileLoading = new Map<string, AbortController>();
  private batches = new Map<string, Batch>();
  private wantedTiles = new Set<string>();
  private disposed = false;
  private dirty = true;
  private lastTick = -Infinity;
  private position = new Vector3(Infinity,Infinity,Infinity);
  private direction = new Vector3();
  private lastEvict = 0;
  private lastReport = 0;
  private frustum = new Frustum();
  private projection = new Matrix4();
  private matrix = new Matrix4();
  private instance = new Matrix4();
  private billboardInverse = new Matrix4();
  private worldCenter = new Vector3();
  private worldScale = new Vector3();
  private localCamera = new Vector3();
  private sphere = new Sphere();
  private boundsBox = new Box3();
  private point = new Vector3();
  private currentDirection = new Vector3();
  private released = { tiles: 0, resources: 0, batches: 0, materials: 0 };
  private counters = { candidates: 0, frustumRejected: 0, pixelRejected: 0, trees: 0, props: 0, near: 0, mid: 0, far: 0 };
  private tickMs = 0;
  private failures = new Set<string>();

  constructor(private manifest: TileManifest, private gl: WebGLRenderer, private reportError: (message: string) => void,
    private options: { alpha: "single" | "mask"; frozenLod?: Tier } = { alpha: "single" }) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Meshoptimizer API, not a React hook.
    MeshoptDecoder.useWorkers(2);
    this.request("props/far", 0);
    // Coarse source trees are a small, bounded shared library. No full source
    // high-poly tree or 4K ground-cover package enters this runtime.
    for (const name of manifest.names.slice(manifest.propAssetCount)) this.request(`${name}/far`, 2);
  }
  private file(key: string) {
    const [name,tier] = key.split("/");
    return name === "props" ? `batch2/props-${tier}.gltf` : tier==="near" ? `batch2/trees/${name}-near.gltf` : `trees/${name}-lod03-meshopt-webp.glb`;
  }
  private request(key: string, priority: number) {
    const resource = this.resources.get(key);
    if (resource) { resource.lastUsed = performance.now(); return; }
    if (!this.pending.has(key) && !this.failures.has(key)) this.queue.set(key,Math.min(this.queue.get(key) ?? Infinity,priority));
  }
  private pump() {
    while (!this.disposed && this.pending.size < 2 && this.queue.size) {
      const [key] = [...this.queue].sort((a,b)=>a[1]-b[1])[0];
      this.queue.delete(key); this.pending.add(key);
      const load=key!=="props/far" && key.endsWith("/far") ? this.loadImpostor(key) : this.loader.loadAsync(pineRoot+this.file(key)).then(gltf=>this.prepare(gltf,key));
      load.then(resource => {
        if (this.disposed) this.releaseResource(resource);
        else { this.resources.set(key,resource); this.dirty = true; }
      }).catch(error => {
        if (!this.disposed) { this.failures.add(key); this.reportError(`森林资源加载失败 ${key}：${String(error)}`); }
      }).finally(()=>{this.pending.delete(key);this.pump();});
    }
  }
  private async loadImpostor(key: string): Promise<Resource> {
    const name=key.split("/")[0];
    const {asset,geometry,material}=await loadPineImpostorAsset(name);
    const materialKey=`impostor/${name}`;this.materials.set(materialKey,{material,refs:1});
    return {assets:new Map([[name,asset]]),geometries:new Set([geometry]),materialKeys:new Set([materialKey]),lastUsed:performance.now()};
  }
  private textures(material: Material) {
    return Object.values(material).filter((value): value is Texture => value instanceof Texture);
  }
  private prepare(gltf: GLTF, key: string): Resource {
    const resource: Resource = { assets:new Map(),geometries:new Set(),materialKeys:new Set(),lastUsed:performance.now() };
    gltf.scene.updateMatrixWorld(true);
    const [name,tier] = key.split("/");
    const seen = new Map<Material,Material>();
    gltf.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      resource.geometries.add(object.geometry);
      const convert = (material: Material) => {
        if (seen.has(material)) return seen.get(material)!;
        // Source atlases are identical across species within a tree LOD tier;
        // all three prop tiers use the exact same verified 1K image bytes.
        const poolKey = `${name === "props" ? "props" : tier}/${material.name}`;
        const pooled = this.materials.get(poolKey);
        let selected = material;
        if (pooled) {
          selected = pooled.material;
          for (const texture of this.textures(material)) texture.dispose();
          material.dispose();
        } else {
          if (material.transparent) {
            material.forceSinglePass = true;
            if (this.options.alpha === "mask") { material.transparent = false; material.alphaTest = 0.08; }
          }
          this.materials.set(poolKey,{material,refs:0});
        }
        if (!resource.materialKeys.has(poolKey)) { this.materials.get(poolKey)!.refs++; resource.materialKeys.add(poolKey); }
        seen.set(material,selected); return selected;
      };
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    });
    const collect = (parent: Object3D, assetName: string) => {
      const parts: Part[] = [];
      parent.traverse(object => { if (object instanceof Mesh) parts.push({geometry:object.geometry,material:object.material,matrix:object.matrixWorld.clone()}); });
      if (parts.length) resource.assets.set(assetName,{parts,sphere:new Box3().setFromObject(parent).getBoundingSphere(new Sphere())});
    };
    if (name === "props") {
      for (const assetName of this.manifest.names.slice(0,this.manifest.propAssetCount)) {
        const parent = gltf.scene.getObjectByName("source__"+assetName);
        if (!parent) throw Error("Missing source__"+assetName);
        collect(parent,assetName);
      }
      // Error-bounded simplification can flatten a tiny planar patch completely.
      // Use its nonempty SOURCE-native sibling LOD, retaining the same matrix;
      // never silently drop these instances or substitute a proxy shape.
      for(const assetName of this.manifest.names.slice(0,this.manifest.propAssetCount)) if(!resource.assets.has(assetName)) {
        const sibling=assetName.replace(/_lod([01])$/,(_,level)=>`_lod${1-Number(level)}`);
        const fallback=resource.assets.get(sibling);
        if(!fallback) throw Error("No source-native LOD fallback for "+assetName);
        resource.assets.set(assetName,fallback);
      }
    } else collect(gltf.scene,name);
    return resource;
  }
  private releaseResource(resource: Resource) {
    for (const geometry of resource.geometries) geometry.dispose();
    for (const key of resource.materialKeys) {
      const entry = this.materials.get(key)!;
      if (--entry.refs === 0) {
        for (const texture of this.textures(entry.material)) { texture.dispose(); (texture.source.data as { close?: () => void })?.close?.(); }
        entry.material.dispose();this.materials.delete(key);this.released.materials++;
      }
    }
    this.released.resources++;
  }
  private loadTiles(camera: Vector3, now: number) {
    const nearby = Object.keys(this.manifest.tiles).map(key=>({key,distance:tileDistance(key,camera)})).filter(t=>t.distance<80).sort((a,b)=>a.distance-b.distance);
    this.wantedTiles = new Set(nearby.map(t=>t.key));
    for (const [key,controller] of this.tileLoading) if (!this.wantedTiles.has(key)) controller.abort();
    for (const tile of nearby) if (this.tiles.has(tile.key)) this.tiles.get(tile.key)!.lastUsed=now;
    for (const {key} of nearby) {
      if (this.tileLoading.size >= 2) break;
      if (this.tiles.has(key) || this.tileLoading.has(key)) continue;
      const controller = new AbortController(); this.tileLoading.set(key,controller);
      fetch(pineRoot+`batch2/tiles/${key}.bin.gz`,{signal:controller.signal}).then(async response=>{
        if (!response.ok || !response.body) throw Error(`分区 ${key} HTTP ${response.status}`);
        const buffer=await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
        if (controller.signal.aborted || this.disposed) return;
        const data=new Float32Array(buffer);
        const count=data.length/13;
        const cells=new Map<string,{box:Box3;offsets:number[]}>();
        const bounds=new Float32Array(count*4);
        for(let offset=0;offset<data.length;offset+=13) {
          const name=this.manifest.names[data[offset]];
          const source=this.resources.get(data[offset]<this.manifest.propAssetCount ? "props/far" : `${name}/far`)!.assets.get(name);
          if(!source) throw Error(`Missing packed bounds ${key}: index ${data[offset]} ${name}`);
          matrixAt(data,offset,this.matrix);
          this.sphere.copy(source.sphere).applyMatrix4(this.matrix);
          // Add a small margin for simplification and quantization bounds.
          this.sphere.radius+=0.15;
          const index=offset/13;
          bounds[index*4]=this.sphere.center.x;bounds[index*4+1]=this.sphere.center.y;
          bounds[index*4+2]=this.sphere.center.z;bounds[index*4+3]=this.sphere.radius;
          const cellKey=`${Math.floor(data[offset+4]/4)}_${Math.floor(data[offset+8]/4)}_${this.sphere.radius>2 ? 'tall':'ground'}`;
          const cell=cells.get(cellKey) || {box:new Box3(),offsets:[]};
          cell.box.union(this.sphere.getBoundingBox(this.boundsBox));cell.offsets.push(offset);cells.set(cellKey,cell);
        }
        this.tiles.set(key,{data,bounds,lod:new Uint8Array(count).fill(2),cells:[...cells.values()],lastUsed:performance.now()});
        this.dirty=true;
      }).catch(error=>{if(!controller.signal.aborted && !this.disposed) this.reportError(String(error));}).finally(()=>this.tileLoading.delete(key));
    }
  }
  tick(camera: PerspectiveCamera, now: number) {
    if(this.disposed) return;
    this.pump();
    this.maintenance(now);
    const boundsReady = this.resources.has("props/far") && this.manifest.names.slice(this.manifest.propAssetCount).every(name=>this.resources.has(`${name}/far`));
    if (!boundsReady) return;
    camera.getWorldDirection(this.currentDirection);
    if(now-this.lastTick<90 || (!this.dirty && camera.position.distanceToSquared(this.position)<0.09 && this.direction.dot(this.currentDirection)>0.998)) return;
    const tickStart=performance.now();
    this.dirty=false;this.lastTick=now;this.position.copy(camera.position);this.direction.copy(this.currentDirection);
    this.loadTiles(camera.position,now);
    camera.updateMatrixWorld();
    this.projection.copy(camera.projectionMatrix);
    this.projection.elements[0]*=0.88;this.projection.elements[5]*=0.88;
    this.frustum.setFromProjectionMatrix(this.projection.multiply(camera.matrixWorldInverse));
    const projectionScale=this.gl.domElement.height/(2*Math.tan(camera.fov*Math.PI/360));
    const selection=new Map<string,Selection>();
    const counters={candidates:0,frustumRejected:0,pixelRejected:0,trees:0,props:0,near:0,mid:0,far:0};
    for(const tile of this.tiles.values()) {
      const chunks=new Map<string,{data:Float32Array;offsets:number[]}>();
      for(const cell of tile.cells) {
      if (!this.frustum.intersectsBox(cell.box)) { counters.frustumRejected+=cell.offsets.length; continue; }
      for(const offset of cell.offsets) {
        counters.candidates++;
        const i=offset/13;
        this.sphere.center.fromArray(tile.bounds,i*4);this.sphere.radius=tile.bounds[i*4+3];
        if(!this.frustum.intersectsSphere(this.sphere)) {counters.frustumRejected++;continue;}
        const tree=tile.data[offset]>=this.manifest.propAssetCount;
        const distance=Math.hypot(tile.data[offset+4]-camera.position.x,-tile.data[offset+8]-camera.position.z);
        const depth=Math.max(0.1,this.point.copy(this.sphere.center).sub(camera.position).dot(this.currentDirection));
        const pixels=2*this.sphere.radius*projectionScale/depth;
        if(distance>(tree ? 95:40) || pixels<(tree ? 2:1.5)) {counters.pixelRejected++;continue;}
        const previous=tile.lod[i];
        const hysteresis=previous===0 ? 1.12 : previous===2 ? 0.9 : 1;
        const tierIndex=tree ? (distance<18*hysteresis && pixels>700/hysteresis ? 0 : distance<45*hysteresis && pixels>260/hysteresis ? 1:2)
          : (distance<6*hysteresis && pixels>120/hysteresis ? 0 : distance<17*hysteresis && pixels>24/hysteresis ? 1:2);
        tile.lod[i]=tierIndex;
        const desired=this.options.frozenLod || tiers[tierIndex];
        const name=this.manifest.names[tile.data[offset]];
        const family=tree ? name:"props";
        const requestedTier=tree && desired==="mid" ? "far":desired;
        const resourceKey=`${family}/${requestedTier}`;
        this.request(resourceKey,distance);
        const available=tiers.slice(tiers.indexOf(requestedTier)).find(tier=>this.resources.has(`${family}/${tier}`)) || "far";
        const key=`${family}/${available}`;
        const resource=this.resources.get(key)!;resource.lastUsed=now;
        const asset=resource.assets.get(name)!;
        const batchKey=`${key}/${name}`;
        const batch=selection.get(batchKey) || {resource:key,asset,chunks:[],count:0};
        let chunk=chunks.get(batchKey);
        if(!chunk) {chunk={data:tile.data,offsets:[]};chunks.set(batchKey,chunk);batch.chunks.push(chunk);}
        chunk.offsets.push(offset);batch.count++;selection.set(batchKey,batch);
        if(tree) counters.trees++;else counters.props++;
        counters[tree && available==="far" ? tiers[tierIndex]:available]++;
      }
      }
    }
    for(const [key,batch] of this.batches) if(!selection.has(key)) for(const mesh of batch.parts) mesh.count=0;
    for(const [key,selected] of selection) {
      let batch=this.batches.get(key);
      if(!batch || batch.capacity<selected.count) {
        if(batch) this.removeBatch(key,batch);
        const capacity=2**Math.ceil(Math.log2(Math.max(1,selected.count)));
        const ownedGeometry: Mesh["geometry"][]=[];
        const parts=selected.asset.parts.map(part=>{
          const geometry=selected.asset.billboard ? part.geometry.clone():part.geometry;
          if(selected.asset.billboard) {geometry.setAttribute("atlasAngle",new InstancedBufferAttribute(new Float32Array(capacity),1));ownedGeometry.push(geometry);}
          const mesh=new InstancedMesh(geometry,part.material,capacity);
          mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;mesh.name=key;
          this.group.add(mesh);return mesh;
        });
        batch={resource:selected.resource,parts,capacity,ownedGeometry,lastUsed:now};this.batches.set(key,batch);
      }
      batch.lastUsed=now;
      for(let partIndex=0;partIndex<batch.parts.length;partIndex++) {
        const mesh=batch.parts[partIndex];
        const local=selected.asset.parts[partIndex].matrix;
        let index=0;
        for(const {data,offsets} of selected.chunks) {
          if(selected.asset.billboard) offsets.sort((a,b)=>((data[b+4]-camera.position.x)**2+(-data[b+8]-camera.position.z)**2)-((data[a+4]-camera.position.x)**2+(-data[a+8]-camera.position.z)**2));
          for(const offset of offsets) {
          matrixAt(data,offset,this.matrix);
          if(selected.asset.billboard) {
            const center=selected.asset.billboard.center;
            this.worldCenter.copy(center).applyMatrix4(this.matrix);
            this.worldScale.setFromMatrixScale(this.matrix);
            this.localCamera.copy(camera.position).applyMatrix4(this.billboardInverse.copy(this.matrix).invert()).sub(center);
            const angle=((Math.round(Math.atan2(this.localCamera.x,this.localCamera.z)/(Math.PI/4))%8)+8)%8;
            const attribute=mesh.geometry.getAttribute("atlasAngle") as InstancedBufferAttribute;attribute.setX(index,angle);
            const facing=Math.atan2(camera.position.x-this.worldCenter.x,camera.position.z-this.worldCenter.z);
            this.instance.makeRotationY(facing).scale(this.worldScale).setPosition(this.worldCenter);
          } else this.instance.multiplyMatrices(this.matrix,local);
          mesh.setMatrixAt(index,this.instance);
          index++;
          }
        }
        if(selected.asset.billboard) (mesh.geometry.getAttribute("atlasAngle") as InstancedBufferAttribute).needsUpdate=true;
        mesh.count=selected.count;mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,selected.count*16);mesh.instanceMatrix.needsUpdate=true;
      }
    }
    this.counters=counters;
    this.tickMs=performance.now()-tickStart;
    if(counters.trees>0 && counters.props>0) this.gl.domElement.dataset.forestGeometryReady="true";
  }
  private maintenance(now: number) {
    // Geometry and instance buffers release after grace periods; pooled atlases
    // remain only while at least one resident LOD resource references them.
    if(now-this.lastEvict>1000) {
      for(const [key,tile] of this.tiles) if(!this.wantedTiles.has(key) && now-tile.lastUsed>8000) {this.tiles.delete(key);this.released.tiles++;this.dirty=true;}
      for(const [key,batch] of this.batches) if(batch.parts.every(mesh=>mesh.count===0) && now-batch.lastUsed>8000) this.removeBatch(key,batch);
      const activeResources=new Set([...this.batches.values()].filter(batch=>batch.parts.some(mesh=>mesh.count>0)).map(batch=>batch.resource));
      for(const key of activeResources) {const resource=this.resources.get(key);if(resource) resource.lastUsed=now;}
      for(const [key,resource] of this.resources) if(!key.endsWith("/far") && now-resource.lastUsed>12000) {
        for(const [batchKey,batch] of this.batches) if(batch.resource===key) this.removeBatch(batchKey,batch);
        this.resources.delete(key);this.releaseResource(resource);
      }
      this.lastEvict=now;
    }
    if(now-this.lastReport>1000) {
      this.gl.domElement.dataset.forestStreaming=JSON.stringify({tiles:[...this.tiles.keys()],pendingTiles:[...this.tileLoading.keys()],resources:[...this.resources.keys()],pendingResources:[...this.pending],queued:this.queue.size,
        retainedBytes:[...this.tiles.values()].reduce((s,t)=>s+t.data.byteLength+t.bounds.byteLength+t.lod.byteLength,0),...this.counters,released:this.released,tickMs:this.tickMs,
        batches:this.batches.size,materials:this.materials.size,failures:[...this.failures]});
      this.lastReport=now;
    }
  }
  private removeBatch(key: string,batch: Batch) {
    for(const mesh of batch.parts) {this.group.remove(mesh);mesh.dispose();}
    for(const geometry of batch.ownedGeometry) geometry.dispose();
    this.batches.delete(key);this.released.batches++;
  }
  dispose() {
    this.disposed=true;
    for(const controller of this.tileLoading.values()) controller.abort();
    for(const [key,batch] of this.batches) this.removeBatch(key,batch);
    for(const resource of this.resources.values()) this.releaseResource(resource);
    this.resources.clear();this.tiles.clear();this.queue.clear();
  }
}
