import { Box3, DoubleSide, DynamicDrawUsage, Frustum, Group, InstancedBufferAttribute, InstancedMesh, Material, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Sphere, SRGBColorSpace, Texture, TextureLoader, Vector3, type WebGLRenderer } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { applyPineCanopyField } from "./pine-environment";

export const pineRoot = "/forest-origin-assets/";
export type TileManifest = { names: string[]; propAssetCount: number; tiles: Record<string, { trees: number; props: number; bytes: number }> };
export type SourceTree = { source: string; matrix: number[][] };
type Tier = "near" | "mid" | "far";
type Quality = "low" | "mid" | "high";
type Part = { geometry: Mesh["geometry"]; material: Material | Material[]; matrix: Matrix4 };
type Asset = { parts: Part[]; sphere: Sphere; billboard?: { center: Vector3; views: number } };
type Resource = { assets: Map<string, Asset>; geometries: Set<Mesh["geometry"]>; materialKeys: Set<string>; lastUsed: number };
type Tile = { data: Float32Array; bounds: Float32Array; lod: Uint8Array; cells: { box: Box3; offsets: number[] }[]; lastUsed: number };
type Slot = { data: Float32Array; offset: number; seen: number };
type Batch = { resource: string; parts: InstancedMesh[]; capacity: number; ownedGeometry: Mesh["geometry"][]; lastUsed: number;
  entries: Slot[]; slots: Map<Float32Array, Map<number, Slot>> };
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

export async function loadPineImpostorAsset(name: string, detail=false, smooth=false, sourceMaterial=false) {
  const interpolate=(smooth || sourceMaterial) && name==="pine_04";
  const folder=sourceMaterial && name==="pine_04" ? "batch3b/impostors" : (detail || interpolate) && name==="pine_04" ? "batch3/impostors":"batch2/impostors";
  const response=await fetch(pineRoot+`${folder}/${name}.json`);
  if(!response.ok) throw Error(`Impostor ${name} HTTP ${response.status}`);
  const metadata=await response.json() as {center:number[];width:number;height:number;views?:number;bounds:{min:number[];max:number[]}};
  const views=metadata.views || 8,rows=views/4;
  const texture=await new TextureLoader().loadAsync(pineRoot+`${folder}/${name}.webp`);texture.colorSpace=SRGBColorSpace;
  const material=new MeshBasicMaterial({map:texture,transparent:true,alphaTest:0.015,depthWrite:false,side:DoubleSide,toneMapped:false});
  material.forceSinglePass=true;
  if(interpolate) {material.transparent=false;material.alphaTest=0.03;material.alphaToCoverage=true;material.depthWrite=true;texture.anisotropy=4;}
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nattribute float atlasAngle;");
    shader.vertexShader=shader.vertexShader.replace("#include <uv_vertex>",`#include <uv_vertex>\nvMapUv = vec2((vMapUv.x + mod(atlasAngle, 4.0)) / 4.0, (vMapUv.y + ${rows-1}.0 - floor(atlasAngle / 4.0)) / ${rows}.0);`);
    if(interpolate) {
      const declarations="varying vec2 pineNextUv; varying float pineViewBlend;";
      shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>\n${declarations}`);
      shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>\n${declarations}`);
      // Adjacent source views share their exact source center and bounds.
      // Interpolate premultiplied samples so transparent atlas RGB cannot halo.
      shader.vertexShader=shader.vertexShader.replace("#include <uv_vertex>",`#include <uv_vertex>
        float pineFirst = floor(atlasAngle);
        float pineNext = mod(pineFirst + 1.0, ${views}.0);
        pineViewBlend = fract(atlasAngle);
        pineNextUv = vec2((uv.x + mod(pineNext, 4.0))/4.0, (uv.y + ${rows-1}.0 - floor(pineNext/4.0))/${rows}.0);`);
      // Replace only the atlas address line installed above.
      shader.vertexShader=shader.vertexShader.replace("mod(atlasAngle, 4.0)","mod(pineFirst, 4.0)").replace("floor(atlasAngle / 4.0)","floor(pineFirst / 4.0)");
      shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`
        vec4 pineA = texture2D(map, vMapUv);
        vec4 pineB = texture2D(map, pineNextUv);
        float pineAlpha = mix(pineA.a,pineB.a,pineViewBlend);
        vec3 pineColor = mix(pineA.rgb*pineA.a,pineB.rgb*pineB.a,pineViewBlend)/max(pineAlpha,0.00001);
        diffuseColor *= vec4(pineColor,pineAlpha);`);
    }
  };
  material.customProgramCacheKey=()=>`pine-source-view-atlas-${views}-${interpolate}`;
  const geometry=new PlaneGeometry(metadata.width,metadata.height);
  const center=new Vector3().fromArray(metadata.center);
  const sphere=new Box3(new Vector3().fromArray(metadata.bounds.min),new Vector3().fromArray(metadata.bounds.max)).getBoundingSphere(new Sphere());
  const asset: Asset={parts:[{geometry,material,matrix:new Matrix4()}],sphere,billboard:{center,views}};
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
  private billboardTilt = new Matrix4();
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
  private work: Generator<void> | null = null;
  private maxSliceMs = 0;
  private audit = { updates: 0, matrices: 0, maxError: 0 };
  private generation = 0;
  private timings = { selectMs: 0, matrixMs: 0, tileBuildMs: 0, prepareMs: 0, matrixWrites: 0, uploadBytes: 0 };
  private failures = new Set<string>();
  private overview: Tile | null = null;
  private overviewKeys: string[] = [];
  private understory: Set<number>;
  private microCover: Set<number>;

  constructor(private manifest: TileManifest, private gl: WebGLRenderer, private reportError: (message: string) => void,
    private options: { alpha: "single" | "mask" | "coverage"; frozenLod?: Tier; quality?: Quality; audit?: boolean; smoothImpostor?: boolean; sourceImpostor?: boolean; sourceTrees?: SourceTree[]; sample?: boolean; field?: Texture } = { alpha: "single" }) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Meshoptimizer API, not a React hook.
    MeshoptDecoder.useWorkers(2);
    this.understory=new Set(this.manifest.names.flatMap((name,i)=>/^(fern|(?:fir|pine)_sapling)/.test(name) ? [i]:[]));
    this.microCover=new Set(this.manifest.names.flatMap((name,i)=>/^(cover_|pine_cover|moss_patch|grass_medium)/.test(name) ? [i]:[]));
    this.request("props/far", 0);
    // Coarse source trees are a small, bounded shared library. No full source
    // high-poly tree or 4K ground-cover package enters this runtime.
    for (const name of manifest.names.slice(manifest.propAssetCount)) this.request(`${name}/far`, 2);
  }
  private file(key: string) {
    const [name,tier] = key.split("/");
    if (name === "props") return `batch2/props-${tier}.gltf`;
    if (tier === "near") return this.options.field && this.options.quality!=="high" ? `optimized/${name}.glb` : `batch2/trees/${name}-near.gltf`;
    // Batch4: pine_04's mid tier is real reduced geometry (not the far billboard),
    // so trees crossing from near to mid keep actual branch silhouettes instead of
    // popping straight to a flat atlas card. Other species still use the billboard
    // for both mid and far until the same reduction is produced for them.
    if (tier === "mid" && name === "pine_04") return "batch4/trees/pine_04-mid.gltf";
    return `trees/${name}-lod03-meshopt-webp.glb`;
  }
  private request(key: string, priority: number) {
    const resource = this.resources.get(key);
    if (resource) { resource.lastUsed = performance.now(); return; }
    if (!this.pending.has(key) && !this.failures.has(key)) this.queue.set(key,Math.min(this.queue.get(key) ?? Infinity,priority));
  }
  private pump() {
    while (!this.disposed && this.pending.size < (this.options.field ? 4:2) && this.queue.size) {
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
    const {asset,geometry,material}=await loadPineImpostorAsset(name,this.options.quality==="high",this.options.smoothImpostor,this.options.sourceImpostor);
    if(this.options.field) {
      material.color.set("#a9afa0");
      applyPineCanopyField(material,this.options.field,true);
    }
    const materialKey=`impostor/${name}`;this.materials.set(materialKey,{material,refs:1});
    return {assets:new Map([[name,asset]]),geometries:new Set([geometry]),materialKeys:new Set([materialKey]),lastUsed:performance.now()};
  }
  private textures(material: Material) {
    return Object.values(material).filter((value): value is Texture => value instanceof Texture);
  }
  private prepare(gltf: GLTF, key: string): Resource {
    const started=performance.now();
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
        const coverage=this.options.alpha === "coverage" && name==="pine_02" && material.name.includes("twig");
        const poolKey = `${name === "props" ? "props" : tier}/${material.name}${coverage ? "/coverage":""}`;
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
            if (coverage) {
              material.transparent=false;material.alphaTest=0.03;material.alphaToCoverage=true;material.depthWrite=true;
            }
          }
          if (this.options.field) applyPineCanopyField(material,this.options.field);
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
    this.timings.prepareMs=Math.max(this.timings.prepareMs,performance.now()-started);
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
    const range=this.options.field ? this.options.quality==="high" ? 80:64 : 80;
    const nearby = Object.keys(this.manifest.tiles).map(key=>({key,distance:tileDistance(key,camera)})).filter(t=>t.distance<range).sort((a,b)=>a.distance-b.distance);
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
        let sliceStart=performance.now();
        for(let offset=0;offset<data.length;offset+=13) {
          // Decode is already asynchronous; bound the remaining spatial-index
          // construction so an arriving dense partition cannot monopolize a frame.
          if(offset%(13*1024)===0 && offset>0) {
            this.timings.tileBuildMs=Math.max(this.timings.tileBuildMs,performance.now()-sliceStart);
            await new Promise<void>(resolve=>setTimeout(resolve,0));
            if(controller.signal.aborted || this.disposed) return;
            sliceStart=performance.now();
          }
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
        this.timings.tileBuildMs=Math.max(this.timings.tileBuildMs,performance.now()-sliceStart);
        this.tiles.set(key,{data,bounds,lod:new Uint8Array(count).fill(2),cells:[...cells.values()],lastUsed:performance.now()});
        this.dirty=true;
      }).catch(error=>{if(!controller.signal.aborted && !this.disposed) this.reportError(String(error));}).finally(()=>this.tileLoading.delete(key));
    }
  }
  private prepareTreeOverview() {
    if(this.overview || !this.options.sourceTrees) return;
    // The already-loaded original collision/tree list is only 585 records. It
    // supplies the SAME trees while dense ground-cover partitions decode. Once
    // a source partition is resident its overview records are skipped, avoiding
    // duplicates or any alternate forest layout.
    const trees=this.options.sourceTrees;
    const data=new Float32Array(trees.length*13),bounds=new Float32Array(trees.length*4);
    const cells=new Map<string,{box:Box3;offsets:number[]}>();
    for(let i=0;i<trees.length;i++) {
      const {source,matrix}=trees[i],offset=i*13;
      data[offset]=this.manifest.names.indexOf(source);
      if(data[offset]<this.manifest.propAssetCount) throw Error("Unknown original overview tree "+source);
      for(let row=0;row<3;row++)for(let column=0;column<4;column++)data[offset+1+row*4+column]=matrix[row][column];
      matrixAt(data,offset,this.matrix);
      const asset=this.resources.get(`${source}/far`)!.assets.get(source)!;
      this.sphere.copy(asset.sphere).applyMatrix4(this.matrix);this.sphere.radius+=0.15;
      bounds.set([...this.sphere.center.toArray(),this.sphere.radius],i*4);
      const key=`${Math.floor(data[offset+4]/32)}_${Math.floor(data[offset+8]/32)}`;
      this.overviewKeys.push(key);
      const cell=cells.get(key) || {box:new Box3(),offsets:[]};
      cell.box.union(this.sphere.getBoundingBox(this.boundsBox));cell.offsets.push(offset);cells.set(key,cell);
    }
    this.overview={data,bounds,cells:[...cells.values()],lod:new Uint8Array(trees.length).fill(2),lastUsed:0};
  }
  tick(camera: PerspectiveCamera, now: number) {
    if(this.disposed) return;
    this.preload();
    if(this.work) {this.advance();return;}
    this.maintenance(now);
    const boundsReady = this.resources.has("props/far") && this.manifest.names.slice(this.manifest.propAssetCount).every(name=>this.resources.has(`${name}/far`));
    if (!boundsReady) return;
    this.prepareTreeOverview();
    camera.getWorldDirection(this.currentDirection);
    if(now-this.lastTick<90 || (!this.dirty && camera.position.distanceToSquared(this.position)<0.09 && this.direction.dot(this.currentDirection)>0.998)) return;
    // A coherent camera snapshot lets selection span frames without mixing
    // frusta/LOD distances. The previous complete visible set remains resident.
    this.work=this.update(camera.clone(),now);
    this.advance();
  }
  preload() {
    this.pump();
  }
  private advance() {
    const start=performance.now();
    do {
      if(this.work!.next().done) {this.work=null;break;}
    } while(performance.now()-start<4);
    this.maxSliceMs=Math.max(this.maxSliceMs,performance.now()-start);
  }
  private *update(camera: PerspectiveCamera, now: number): Generator<void> {
    const tickStart=performance.now();
    this.dirty=false;this.lastTick=now;this.position.copy(camera.position);this.direction.copy(this.currentDirection);
    this.loadTiles(camera.position,now);
    camera.updateMatrixWorld();
    this.projection.copy(camera.projectionMatrix);
    this.projection.elements[0]*=0.88;this.projection.elements[5]*=0.88;
    this.frustum.setFromProjectionMatrix(this.projection.multiply(camera.matrixWorldInverse));
    const projectionScale=this.gl.domElement.height/(2*Math.tan(camera.fov*Math.PI/360));
    const selection=new Map<string,Selection>();
    // Resolve each asset/tier only once per tick. In the dense route this used
    // to perform request(), now(), string allocation and tier lookup per prop.
    const resolved=new Map<number,{key:string;resource:Resource;asset:Asset;batchKey:string;available:Tier}>();
    const generation=++this.generation;
    const verifyMatrices=this.options.audit;
    let selectActiveMs=0,activeStart=performance.now();
    const high=this.options.quality==="high";
    const middle=this.options.quality==="mid";
    const tuned=!!this.options.field;
    const counters={candidates:0,frustumRejected:0,pixelRejected:0,trees:0,props:0,near:0,mid:0,far:0};
    const residentKeys=new Set(this.tiles.keys());
    for(const tile of [...this.tiles.values(),...(this.overview ? [this.overview]:[])]) {
      const chunks=new Map<string,{data:Float32Array;offsets:number[]}>();
      for(const cell of tile.cells) {
      selectActiveMs+=performance.now()-activeStart;
      yield;
      activeStart=performance.now();
      if (!this.frustum.intersectsBox(cell.box)) { counters.frustumRejected+=cell.offsets.length; continue; }
      for(let cellIndex=0;cellIndex<cell.offsets.length;cellIndex++) {
        if(cellIndex && cellIndex%256===0) {
          selectActiveMs+=performance.now()-activeStart;yield;activeStart=performance.now();
        }
        const offset=cell.offsets[cellIndex];
        if(tile===this.overview && residentKeys.has(this.overviewKeys[offset/13])) continue;
        counters.candidates++;
        const i=offset/13;
        const tree=tile.data[offset]>=this.manifest.propAssetCount;
        const dx=tile.data[offset+4]-camera.position.x,dz=-tile.data[offset+8]-camera.position.z;
        const distanceSquared=dx*dx+dz*dz;
        const inSample=tile.data[offset+4]>-40 && tile.data[offset+4]<40 && tile.data[offset+8]>-75 && tile.data[offset+8]<-15;
        const micro=this.microCover.has(tile.data[offset]);
        const propRange=tuned && micro && !high ? middle ? 31:24
          : (tuned || (this.options.sample && inSample)) && this.understory.has(tile.data[offset]) ? 55:40;
        const treeRange=tuned ? camera.position.y>55 ? 295:200 : 95;
        if(distanceSquared>(tree ? treeRange*treeRange:propRange*propRange)) {counters.pixelRejected++;continue;}
        this.sphere.center.fromArray(tile.bounds,i*4);this.sphere.radius=tile.bounds[i*4+3];
        if(!this.frustum.intersectsSphere(this.sphere)) {counters.frustumRejected++;continue;}
        const depth=Math.max(0.1,this.point.copy(this.sphere.center).sub(camera.position).dot(this.currentDirection));
        const pixels=2*this.sphere.radius*projectionScale/depth;
        if(pixels<(tree ? 2:tuned && !high ? micro ? middle ? 3.2:4.5 : 2:1.5)) {counters.pixelRejected++;continue;}
        const previous=tile.lod[i];
        const hysteresis=previous===0 ? 1.12 : previous===2 ? 0.9 : 1;
        // Use the actual camera-to-tree base distance for near geometry. A
        // raised overview must not select detailed trees directly below it.
        const dy=tuned ? tile.data[offset+12]-camera.position.y:0;
        const trueDistanceSquared=distanceSquared+dy*dy;
        const nearRange=tuned ? high ? 22:middle ? 17:11 : high ? 26:middle ? 22:18;
        const tierIndex=tree ? (trueDistanceSquared<(nearRange*hysteresis)**2 && pixels>(high?450:middle?580:700)/hysteresis ? 0 : trueDistanceSquared<(45*hysteresis)**2 && pixels>260/hysteresis ? 1:2)
          : (trueDistanceSquared<((high?9:middle?8:6)*hysteresis)**2 && pixels>120/hysteresis ? 0 : trueDistanceSquared<((high?22:middle?19:14)*hysteresis)**2 && pixels>24/hysteresis ? 1:2);
        tile.lod[i]=tierIndex;
        const desired=this.options.frozenLod || tiers[tierIndex];
        // Trees previously had no real "mid" asset, so every tree mid-tier
        // request was rewritten to "far" (the billboard). Batch4 gives pine_04
        // a real reduced-geometry mid file; let that one species actually
        // request "mid". Every other species keeps the old far-billboard
        // rewrite until they get the same treatment. Measured on the low tier the real
        // mid costs ~30% FPS (45->31 at 18m), so it is only requested at quality=high.
        const requestedTier=tree && desired==="mid" && !(high && this.manifest.names[tile.data[offset]]==="pine_04") ? "far":desired;
        const lookup=tile.data[offset]*3+tiers.indexOf(requestedTier);
        let resolvedAsset=resolved.get(lookup);
        if(!resolvedAsset) {
          const name=this.manifest.names[tile.data[offset]];
          const family=tree ? name:"props";
          this.request(`${family}/${requestedTier}`,distanceSquared);
          const available=tiers.slice(tiers.indexOf(requestedTier)).find(tier=>this.resources.has(`${family}/${tier}`)) || "far";
          const key=`${family}/${available}`;
          const resource=this.resources.get(key)!;resource.lastUsed=now;
          resolvedAsset={key,resource,asset:resource.assets.get(name)!,batchKey:`${key}/${name}`,available};
          resolved.set(lookup,resolvedAsset);
        }
        const {key,asset,available}=resolvedAsset;
        // Original tree parts can now be culled separately per small stand.
        // Broad species-wide bounds previously submitted whole crowns offscreen.
        const batchKey=resolvedAsset.batchKey+(!asset.billboard && tree ? `/${Math.floor(tile.data[offset+4]/8)}_${Math.floor(tile.data[offset+8]/8)}`:"");
        const batch=selection.get(batchKey) || {resource:key,asset,chunks:[],count:0};
        let chunk=chunks.get(batchKey);
        if(!chunk) {chunk={data:tile.data,offsets:[]};chunks.set(batchKey,chunk);batch.chunks.push(chunk);}
        chunk.offsets.push(offset);batch.count++;selection.set(batchKey,batch);
        if(tree) counters.trees++;else counters.props++;
        counters[tree && available==="far" ? tiers[tierIndex]:available]++;
      }
      }
    }
    const selectedAt=performance.now();
    this.timings.selectMs=selectActiveMs+selectedAt-activeStart;
    this.timings.matrixWrites=0;this.timings.uploadBytes=0;
    this.timings.matrixMs=0;
    const counts = new Map<InstancedMesh,number>();
    for(const [key,batch] of this.batches) if(!selection.has(key)) {
      for(const mesh of batch.parts) counts.set(mesh,0);
      batch.entries=[];batch.slots.clear();
    }
    for(const [key,selected] of selection) {
      yield;
      let batch=this.batches.get(key);
      if(!batch || batch.capacity<selected.count) {
        if(batch) this.removeBatch(key,batch);
        const capacity=2**Math.ceil(Math.log2(Math.max(8,selected.count*1.25)));
        const ownedGeometry: Mesh["geometry"][]=[];
        const parts=selected.asset.parts.map(part=>{
          const geometry=selected.asset.billboard ? part.geometry.clone():part.geometry;
          if(selected.asset.billboard) {geometry.setAttribute("atlasAngle",new InstancedBufferAttribute(new Float32Array(capacity),1));ownedGeometry.push(geometry);}
          const mesh=new InstancedMesh(geometry,part.material,capacity);
          // Parts are populated across frames. Never submit identity matrices
          // from a newly allocated but not yet populated batch.
          mesh.count=0;
          mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=!selected.asset.billboard;mesh.name=key;
          this.group.add(mesh);return mesh;
        });
        batch={resource:selected.resource,parts,capacity,ownedGeometry,lastUsed:now,entries:[],slots:new Map()};this.batches.set(key,batch);
      }
      batch.lastUsed=now;
      // Fixed slots preserve matrices for static source instances. Only additions
      // and swap-removals write buffers; camera-facing impostors still update.
      const additions:Slot[]=[];
      let changedScanned=0;
      for(const {data,offsets} of selected.chunks) {
        let slots=batch.slots.get(data);
        if(!slots) {slots=new Map();batch.slots.set(data,slots);}
        for(const offset of offsets) {
          if(changedScanned && changedScanned%1024===0) yield;
          changedScanned++;
          const entry=slots.get(offset);
          if(entry) entry.seen=generation;
          else additions.push({data,offset,seen:generation});
        }
      }
      const changed=new Set<number>();
      for(let i=batch.entries.length-1;i>=0;i--) {
        if(i && i%1024===0) yield;
        if(batch.entries[i].seen===generation) continue;
        const removed=batch.entries[i];batch.slots.get(removed.data)!.delete(removed.offset);
        const last=batch.entries.pop()!;
        if(i<batch.entries.length) {batch.entries[i]=last;changed.add(i);}
      }
      for(const entry of additions) {changed.add(batch.entries.length);batch.entries.push(entry);batch.slots.get(entry.data)!.set(entry.offset,entry);}
      for(const [data,slots] of batch.slots) if(!slots.size) batch.slots.delete(data);
      if(verifyMatrices && (batch.entries.length!==selected.count || [...batch.slots.values()].reduce((sum,slots)=>sum+slots.size,0)!==selected.count)) throw Error("Pine instance membership mismatch: "+key);
      for(let partIndex=0;partIndex<batch.parts.length;partIndex++) {
        yield;
        let partStart=performance.now();
        const mesh=batch.parts[partIndex];
        const local=selected.asset.parts[partIndex].matrix;
        // Transparent tree planes keep the original per-tile back-to-front order.
        const entries=selected.asset.billboard ? selected.chunks.flatMap(({data,offsets})=>offsets.sort((a,b)=>
          ((data[b+4]-camera.position.x)**2+(-data[b+8]-camera.position.z)**2)-((data[a+4]-camera.position.x)**2+(-data[a+8]-camera.position.z)**2)).map(offset=>({data,offset}))) : batch.entries;
        let first=Infinity,last=-1;
        for(let index=0;index<entries.length;index++) {
          if(index && index%1024===0) {
            this.timings.matrixMs+=performance.now()-partStart;yield;partStart=performance.now();
          }
          if(!selected.asset.billboard && !changed.has(index)) continue;
          const {data,offset}=entries[index];
          matrixAt(data,offset,this.matrix);
          if(selected.asset.billboard) {
            const center=selected.asset.billboard.center;
            this.worldCenter.copy(center).applyMatrix4(this.matrix);
            this.worldScale.setFromMatrixScale(this.matrix);
            this.localCamera.copy(camera.position).applyMatrix4(this.billboardInverse.copy(this.matrix).invert()).sub(center);
            const views=selected.asset.billboard.views;
            const viewAngle=Math.atan2(this.localCamera.x,this.localCamera.z)/(2*Math.PI/views);
            const angle=((((this.options.smoothImpostor || this.options.sourceImpostor) && key.includes("pine_04/") ? viewAngle:Math.round(viewAngle))%views)+views)%views;
            const attribute=mesh.geometry.getAttribute("atlasAngle") as InstancedBufferAttribute;attribute.setX(index,angle);
            const facing=Math.atan2(camera.position.x-this.worldCenter.x,camera.position.z-this.worldCenter.z);
            this.instance.makeRotationY(facing);
            if(tuned && camera.position.y>34) {
              const above=Math.min(1,(camera.position.y-34)/55);
              const elevation=Math.atan2(camera.position.y-this.worldCenter.y,
                Math.hypot(camera.position.x-this.worldCenter.x,camera.position.z-this.worldCenter.z));
              this.instance.multiply(this.billboardTilt.makeRotationX(-Math.min(.95,elevation)*above));
            }
            this.instance.scale(this.worldScale).setPosition(this.worldCenter);
          } else this.instance.multiplyMatrices(this.matrix,local);
          mesh.setMatrixAt(index,this.instance);
          first=Math.min(first,index);last=index;this.timings.matrixWrites++;
        }
        if(selected.asset.billboard) (mesh.geometry.getAttribute("atlasAngle") as InstancedBufferAttribute).needsUpdate=true;
        // Publish membership together after every incoming LOD is populated.
        // Clearing the old LOD before yielding through the new one caused
        // several frames with holes as vegetation changed representation.
        counts.set(mesh,selected.count);
        if(last>=first) {
          mesh.instanceMatrix.clearUpdateRanges();
          if(selected.asset.billboard) {
            mesh.instanceMatrix.addUpdateRange(first*16,(last-first+1)*16);this.timings.uploadBytes+=(last-first+1)*64;
          } else {
            // Merge small gaps, avoiding both full-buffer uploads and thousands
            // of tiny bufferSubData calls for scattered swap removals.
            const indices=[...changed].filter(i=>i<selected.count).sort((a,b)=>a-b);
            for(let i=0;i<indices.length;) {
              const start=indices[i];let end=start;
              while(++i<indices.length && indices[i]-end<=16) end=indices[i];
              mesh.instanceMatrix.addUpdateRange(start*16,(end-start+1)*16);this.timings.uploadBytes+=(end-start+1)*64;
            }
          }
          mesh.instanceMatrix.needsUpdate=true;
        }
        this.timings.matrixMs+=performance.now()-partStart;
        if(verifyMatrices && !selected.asset.billboard) {
          // Deterministic spread through old/new/swapped slots, outside timed
          // acceptance. Compare against original source matrices, including UV
          // part transforms; count/capacity changes are checked above.
          for(let i=0;i<batch.entries.length;i+=Math.max(1,Math.floor(batch.entries.length/32))) {
            const entry=batch.entries[i];matrixAt(entry.data,entry.offset,this.matrix);
            this.instance.multiplyMatrices(this.matrix,local);
            const actual=mesh.instanceMatrix.array;
            for(let j=0;j<16;j++) {
              const error=Math.abs(actual[i*16+j]-this.instance.elements[j]);this.audit.maxError=Math.max(this.audit.maxError,error);
              if(error>0.00005) throw Error("Pine incremental matrix mismatch: "+key);
            }
            this.audit.matrices++;
          }
        }
      }
    }
    for(const [mesh,count] of counts) {
      mesh.count=count;
      if(mesh.frustumCulled && count) mesh.computeBoundingSphere();
    }
    this.counters=counters;
    this.audit.updates++;
    this.tickMs=performance.now()-tickStart;
    // tickMs includes yields; selectMs/matrixMs report active CPU time.
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
      const geometry:Record<string,{instances:number;triangles:number}>={};
      for(const [key,batch] of this.batches) {
        const triangles=batch.parts.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count || mesh.geometry.getAttribute("position").count)/3*mesh.count,0);
        if(triangles) geometry[key]={instances:batch.parts[0].count,triangles};
      }
      this.gl.domElement.dataset.forestStreaming=JSON.stringify({tiles:[...this.tiles.keys()],pendingTiles:[...this.tileLoading.keys()],resources:[...this.resources.keys()],pendingResources:[...this.pending],queued:this.queue.size,
        retainedBytes:[...this.tiles.values()].reduce((s,t)=>s+t.data.byteLength+t.bounds.byteLength+t.lod.byteLength,0),...this.counters,released:this.released,tickMs:this.tickMs,
        batches:this.batches.size,materials:this.materials.size,overviewTrees:this.overview?.lod.length || 0,timings:this.timings,maxSliceMs:this.maxSliceMs,geometry,audit:this.options.audit ? this.audit:undefined,failures:[...this.failures]});
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
    this.work=null;
    this.overview=null;this.overviewKeys=[];
    for(const controller of this.tileLoading.values()) controller.abort();
    for(const [key,batch] of this.batches) this.removeBatch(key,batch);
    for(const resource of this.resources.values()) this.releaseResource(resource);
    this.resources.clear();this.tiles.clear();this.queue.clear();
  }
}
