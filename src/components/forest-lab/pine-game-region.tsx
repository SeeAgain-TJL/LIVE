"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Group, InstancedMesh, Mesh, type Material, type BufferGeometry } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const inGameTreeRegion = (x:number, sourceY:number) => (x-4)**2+(sourceY+44)**2<33**2;

/** Fixed author-made foliage cards, instantiated at the 38 original transforms. */
export function PineGameRegion({onReady,onError}:{onReady:(ready:boolean)=>void;onError:(message:string)=>void}) {
  const {scene,gl}=useThree();
  useEffect(()=>{
    let disposed=false;
    const group=new Group(), geometries=new Set<BufferGeometry>(), materials=new Set<Material>();
    const release=()=>{
      scene.remove(group);
      group.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});
      geometries.forEach(g=>g.dispose());
      materials.forEach(m=>{
        for(const value of Object.values(m))if(value?.isTexture)value.dispose();
        m.dispose();
      });
    };
    new GLTFLoader().loadAsync('/forest-origin-assets/game-region/trees.glb').then(asset=>{
      asset.scene.updateMatrixWorld(true);
      const sets=new Map<string,Mesh[]>();
      asset.scene.traverse(o=>{
        if(!(o instanceof Mesh))return;
        geometries.add(o.geometry);
        (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));
        const key=o.geometry.uuid;
        const entries=sets.get(key)||[];entries.push(o);sets.set(key,entries);
      });
      if(disposed){release();return;}
      for(const entries of sets.values()){
        const instance=new InstancedMesh(entries[0].geometry,entries[0].material,entries.length);
        entries.forEach((o,i)=>instance.setMatrixAt(i,o.matrixWorld));
        instance.computeBoundingSphere();group.add(instance);
      }
      scene.add(group);gl.domElement.dataset.pineGameRegion='38';onReady(true);
    }).catch(error=>{if(!disposed)onError('树木代表区域加载失败：'+String(error));});
    return ()=>{disposed=true;release();onReady(false);delete gl.domElement.dataset.pineGameRegion;};
  },[scene,gl,onReady,onError]);
  return null;
}
