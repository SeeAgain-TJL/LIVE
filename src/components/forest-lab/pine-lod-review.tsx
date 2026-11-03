"use client";
/* eslint-disable react-hooks/immutability -- Three.js camera/material diagnostics. */
import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { ACESFilmicToneMapping, Box3, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, OrthographicCamera, Vector3 } from "three";
import { useGLTF } from "@react-three/drei";
import { ForestSurface, RenderFailure, RenderHealth } from "./forest-origin-lab";
import { loadPineImpostorAsset, pineRoot } from "./pine-stream";
type Props = { species: string; level: string; view: string; bake: boolean; angle: number };
function AtlasModel({species,level,view}: Props) {
  const {scene,camera,gl,size}=useThree();
  const ready=useRef(false);
  useEffect(()=>{
    let disposed=false;
    let release:()=>void=()=>{};
    loadPineImpostorAsset(species).then(({asset,geometry,material,texture,metadata})=>{
      const center=asset.billboard!.center;
      geometry.setAttribute("atlasAngle",new InstancedBufferAttribute(new Float32Array([1]),1));
      const mesh=new InstancedMesh(geometry,material,1);
      mesh.setMatrixAt(0,new Matrix4().makeRotationY(Math.PI/4).setPosition(center));scene.add(mesh);
      const distance=view==="near" ? 27:view==="mid" ? 52:90;
      camera.position.set(center.x+distance*0.7,center.y+distance*0.08,center.z+distance*0.7);camera.lookAt(center);
      gl.domElement.dataset.pineReview=JSON.stringify({...metadata,species,level,view,representation:"source 8-view impostor",viewport:[size.width,size.height]});
      ready.current=true;
      release=()=>{ready.current=false;scene.remove(mesh);mesh.dispose();geometry.dispose();material.dispose();texture.dispose();};
      if(disposed) release();
    }).catch(error=>console.error(error));
    return ()=>{disposed=true;release();};
  },[species,level,view,scene,camera,gl,size]);
  useFrame(()=>{if(ready.current){gl.domElement.dataset.pineReviewReady="true";gl.domElement.dataset.pineReviewDraw=JSON.stringify(gl.info.render);}});
  return null;
}
function Model({species,level,view,bake,angle}: Props) {
  const file=level==="source" || level==="near" ? `batch2/trees/${species}-${level}.gltf` : `trees/${species}-${level==="mid" ? "lod03":"lod003"}-meshopt-webp.glb`;
  const gltf=useGLTF(pineRoot+file);
  const {camera,gl,size}=useThree();
  useLayoutEffect(()=>{
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object=>{if(object instanceof Mesh) for(const material of Array.isArray(object.material) ? object.material:[object.material]) if(material.transparent) material.forceSinglePass=true;});
    const box=new Box3().setFromObject(gltf.scene);
    const center=box.getCenter(new Vector3());const extent=box.getSize(new Vector3());
    const width=Math.max(extent.x,extent.z,extent.y/2)*1.08;
    const height=width*2;
    if(bake && camera instanceof OrthographicCamera) {
      camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.near=0.1;camera.far=300;
      camera.position.set(center.x+Math.sin(angle*Math.PI/4)*100,center.y,center.z+Math.cos(angle*Math.PI/4)*100);
      camera.lookAt(center);camera.updateProjectionMatrix();
    } else {
      const distance=view==="near" ? 27:view==="mid" ? 52:90;
      camera.position.set(center.x+distance*0.7,center.y+distance*0.08,center.z+distance*0.7);camera.lookAt(center);
    }
    gl.domElement.dataset.pineReview=JSON.stringify({species,level,view,angle,width,height,center:center.toArray(),bounds:{min:box.min.toArray(),max:box.max.toArray()},viewport:[size.width,size.height]});
    delete gl.domElement.dataset.pineReviewReady;
    const rotate=(event:Event)=>{
      if(!bake) return;
      const index=(event as CustomEvent<number>).detail;
      camera.position.set(center.x+Math.sin(index*Math.PI/4)*100,center.y,center.z+Math.cos(index*Math.PI/4)*100);camera.lookAt(center);
      const metadata=JSON.parse(gl.domElement.dataset.pineReview!);metadata.angle=index;gl.domElement.dataset.pineReview=JSON.stringify(metadata);
      delete gl.domElement.dataset.pineReviewReady;
    };
    window.addEventListener("pine-review-angle",rotate);
    return ()=>window.removeEventListener("pine-review-angle",rotate);
  },[gltf,camera,gl,species,level,view,bake,angle,size]);
  useFrame(()=>{gl.domElement.dataset.pineReviewReady="true";gl.domElement.dataset.pineReviewDraw=JSON.stringify(gl.info.render);});
  return <primitive object={gltf.scene} />;
}
export function PineLodReview(props: Props) {
  const {species,level,view,bake}=props;
  return <main style={{position:"fixed",inset:0,background:bake ? "transparent":"#8a9d9d"}}>
    <ForestSurface><Canvas orthographic={bake} dpr={1} camera={{position:[18,9,18],fov:35.6,near:0.1,far:300}}
      fallback={<RenderFailure message="无法创建 WebGL 资产对照场景。" />}
      gl={{alpha:true,preserveDrawingBuffer:bake,antialias:true,toneMapping:ACESFilmicToneMapping}}>
      <RenderHealth />
      {!bake && <color attach="background" args={["#8a9d9d"]} />}
      <ambientLight intensity={0.65} /><directionalLight position={[-30,45,12]} intensity={2.1} />
      <Suspense fallback={null}><Environment files={pineRoot+"sky.hdr"} environmentIntensity={0.75} />
        {level==="mid" || level==="far" ? <AtlasModel {...props} />:<Model {...props} />}
      </Suspense>
    </Canvas></ForestSurface>
    {!bake && <div style={{position:"absolute",left:16,top:16,padding:12,background:"#172421",color:"white"}}>
      <p>{species} · {level} · {view} · 同源资产视觉对照</p>
      {["source","near","mid","far"].map(tier=><a key={tier} style={{marginRight:18}} href={`?species=${species}&level=${tier}&view=${view}`}>{tier}</a>)}
      {["near","mid","far"].map(distance=><a key={distance} style={{marginRight:18}} href={`?species=${species}&level=${level}&view=${distance}`}>{distance} view</a>)}
    </div>}
  </main>;
}
