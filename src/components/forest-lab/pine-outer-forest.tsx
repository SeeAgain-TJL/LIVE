"use client";

import { useEffect } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { BufferGeometry, FileLoader, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial,
  Object3D, PlaneGeometry, SRGBColorSpace, TextureLoader } from "three";
import { pineRoot } from "./pine-stream";

export const pineVisualRoot = pineRoot + "visual-finish/";
type Rim = {positions:number[]; colors:number[]; indices:number[]};
type Stand = [x:number,y:number,z:number,scale:number,variant:number];
const variantHeight=[16,17,18.5,15.5];
const variantWidth=[7.6,8.8,7.3,6.8];

/** Static visual extension outside the walkable source plot. Keep a single
 * atlas and small bounds so most of the outer cards are culled at ground level. */
export function PineOuterForest() {
  const {scene}=useThree();
  const canvas=useThree(state=>state.gl.domElement);
  const [groundFile,standsFile]=useLoader(FileLoader,[pineVisualRoot+"edge-ground.json",pineVisualRoot+"edge-stands.json"]);
  const atlas=useLoader(TextureLoader,pineVisualRoot+"edge-crowns.webp");
  useEffect(()=>{
    const rim=JSON.parse(String(groundFile)) as Rim;
    const stands=JSON.parse(String(standsFile)) as Stand[];
    const group=new Group();
    group.name="Pine Forest scenic continuation";
    const ground=new BufferGeometry();
    ground.setAttribute("position",new Float32BufferAttribute(rim.positions,3));
    ground.setAttribute("color",new Float32BufferAttribute(rim.colors,3));
    ground.setIndex(rim.indices);
    const groundMaterial=new MeshBasicMaterial({vertexColors:true,toneMapped:false});
    // Carry the warm source forest floor through the first ring before the
    // distant understory color takes over. Blend in world space at the join.
    groundMaterial.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec2 pineRimXZ;")
        .replace("#include <begin_vertex>","#include <begin_vertex>\npineRimXZ=position.xz;");
      shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nvarying vec2 pineRimXZ;")
        .replace("#include <opaque_fragment>",`
          float pineRimEdge = max(abs(pineRimXZ.x + 1.35),abs(pineRimXZ.y))-100.0;
          float pineRimPattern = sin(dot(pineRimXZ,vec2(.61,.37))) * cos(dot(pineRimXZ,vec2(.31,-.53)));
          float pineRimNear = 1.0 - smoothstep(1.0,29.0,pineRimEdge + pineRimPattern * 4.0);
          outgoingLight = mix(outgoingLight,vec3(.155,.119,.066) * (.91 + .09 * pineRimPattern),pineRimNear);
          #include <opaque_fragment>`);
    };
    group.add(new Mesh(ground,groundMaterial));

    // Clone the texture metadata so the loader cache stays independent of this owner.
    const map=atlas.clone();map.colorSpace=SRGBColorSpace;map.needsUpdate=true;
    const material=new MeshBasicMaterial({map,color:"#929d83",alphaTest:.34,alphaToCoverage:true,toneMapped:false});
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader
        .replace("#include <common>","#include <common>\nattribute float pineStandView;")
        .replace("#include <uv_vertex>","#include <uv_vertex>\nvMapUv.x = (pineStandView + mix(.006,.994,uv.x)) * .25;")
        .replace("#include <project_vertex>",`
          vec3 center = instanceMatrix[3].xyz;
          vec3 toCamera = cameraPosition - center;
          vec3 toward = normalize(vec3(toCamera.x, .0001, toCamera.z + .0001));
          vec3 right = vec3(toward.z, 0.0, -toward.x);
          float pitch = smoothstep(26.0, 145.0, cameraPosition.y) * min(.84, atan(max(0.0,toCamera.y), length(toCamera.xz)));
          vec3 up = vec3(-toward.x*sin(pitch),cos(pitch),-toward.z*sin(pitch));
          vec4 mvPosition = viewMatrix * vec4(center + right*position.x*instanceMatrix[0].x + up*position.y*instanceMatrix[1].y, 1.0);
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
      const geometry=new PlaneGeometry(1,1);
      // The view is per instance, not per vertex. Each cell keeps its own static GPU buffer.
      const mesh=new InstancedMesh(geometry,material,cell.length);
      const choices=new Float32Array(cell.length);
      cell.forEach(([x,y,z,scale,variant],i)=>{
        const h=variantHeight[variant]*scale;
        matrix.position.set(x,y+h*.47,z);matrix.scale.set(variantWidth[variant]*scale,h,1);matrix.updateMatrix();
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
      map.dispose();material.dispose();groundMaterial.dispose();ground.dispose();
    };
  },[atlas,canvas,groundFile,scene,standsFile]);
  return null;
}
