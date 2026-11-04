"use client";

import { useEffect } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { BufferGeometry, FileLoader, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial,
  Object3D, PlaneGeometry, SRGBColorSpace, TextureLoader, Vector2, type Material } from "three";
import { pineRoot } from "./pine-stream";

export const pineVisualRoot = pineRoot + "visual-finish/";
type Rim = {positions:number[]; uvs:number[]; indices:number[]};
type Stand = [x:number,y:number,z:number,scale:number,variant:number];
const variantHeight=[16,17,18.5,15.5];
const variantWidth=[7.6,8.8,7.3,6.8];

/** Static visual extension outside the walkable source plot. Keep a single
 * atlas and small bounds so most of the outer cards are culled at ground level. */
export function PineOuterForest({terrainMaterial}:{terrainMaterial:Material}) {
  const {scene}=useThree();
  const canvas=useThree(state=>state.gl.domElement);
  const [groundFile,standsFile]=useLoader(FileLoader,[pineRoot+"template-edge/edge-ground.json",pineRoot+"template-edge/edge-stands.json"]);
  const atlas=useLoader(TextureLoader,pineVisualRoot+"edge-crowns.webp");
  useEffect(()=>{
    const rim=JSON.parse(String(groundFile)) as Rim;
    const {stands,rootUv}=JSON.parse(String(standsFile)) as {stands:Stand[];rootUv:[number,number][]};
    const group=new Group();
    group.name="Pine Forest scenic continuation";
    const ground=new BufferGeometry();
    ground.setAttribute("position",new Float32BufferAttribute(rim.positions,3));
    ground.setAttribute("uv",new Float32BufferAttribute(rim.uvs,2));
    ground.setIndex(rim.indices);ground.computeVertexNormals();
    // The source and rim now use the same PBR maps, lighting and cover field.
    // Its owner is Terrain; this scenery never disposes the shared material.
    group.add(new Mesh(ground,terrainMaterial));

    // Clone the texture metadata so the loader cache stays independent of this owner.
    const map=atlas.clone();map.colorSpace=SRGBColorSpace;map.needsUpdate=true;
    const material=new MeshBasicMaterial({map,color:"#929d83",alphaTest:.34,alphaToCoverage:true,toneMapped:false});
    material.onBeforeCompile=shader=>{
      shader.uniforms.pineStandRoots={value:rootUv.map(uv=>new Vector2(...uv))};
      shader.vertexShader=shader.vertexShader
        .replace("#include <common>","#include <common>\nattribute float pineStandView;\nuniform vec2 pineStandRoots[4];")
        .replace("#include <uv_vertex>","#include <uv_vertex>\nvMapUv.x = (pineStandView + mix(.006,.994,uv.x)) * .25;")
        .replace("#include <project_vertex>",`
          vec3 center = instanceMatrix[3].xyz;
          vec3 toCamera = cameraPosition - center;
          vec3 toward = normalize(vec3(toCamera.x, .0001, toCamera.z + .0001));
          vec3 right = vec3(toward.z, 0.0, -toward.x);
          float pitch = smoothstep(26.0, 145.0, cameraPosition.y) * min(.84, atan(max(0.0,toCamera.y), length(toCamera.xz)));
          vec3 up = vec3(-toward.x*sin(pitch),cos(pitch),-toward.z*sin(pitch));
          vec2 root=pineStandRoots[int(pineStandView+.1)];
          vec4 mvPosition = viewMatrix * vec4(center + right*(position.x-root.x)*instanceMatrix[0].x + up*(position.y-root.y)*instanceMatrix[1].y, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        `);
    };
    const cells=new Map<string,Stand[]>();
    for(const stand of stands) {
      const key=`${Math.floor(stand[0]/52)}_${Math.floor(stand[2]/52)}`;
      const cell=cells.get(key);
      if(cell) cell.push(stand);else cells.set(key,[stand]);
    }
    const geometries:BufferGeometry[]=[];
    const matrix=new Object3D();
    for(const cell of cells.values()) {
      const geometry=new PlaneGeometry(1,1).translate(0,.5,0);
      // The view is per instance, not per vertex. Each cell keeps its own static GPU buffer.
      const mesh=new InstancedMesh(geometry,material,cell.length);
      const choices=new Float32Array(cell.length);
      cell.forEach(([x,y,z,scale,variant],i)=>{
        const h=variantHeight[variant]*scale;
        matrix.position.set(x,y-.015,z);matrix.scale.set(variantWidth[variant]*scale,h,1);matrix.updateMatrix();
        mesh.setMatrixAt(i,matrix.matrix);choices[i]=variant;
      });
      geometry.setAttribute("pineStandView",new InstancedBufferAttribute(choices,1));
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius+=8; // Rotated cards extend off the rest plane.
      geometries.push(geometry);group.add(mesh);
    }
    scene.add(group);
    canvas.setAttribute("data-pine-outer-forest","ready");
    return ()=>{
      scene.remove(group);canvas.removeAttribute("data-pine-outer-forest");
      for(const child of group.children) if(child instanceof InstancedMesh) child.dispose();
      for(const geometry of geometries) geometry.dispose();
      map.dispose();material.dispose();ground.dispose();
    };
  },[atlas,canvas,groundFile,scene,standsFile,terrainMaterial]);
  return null;
}
