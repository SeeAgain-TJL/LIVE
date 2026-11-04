"use client";
/* eslint-disable react-hooks/immutability -- Three objects are updated only by the render loop. */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, PerspectiveCamera, Quaternion, ShaderMaterial, TubeGeometry, Vector3 } from "three";
import type { PineMemoryAnchor } from "./pine-memory-anchors";

export type MemoryPhase = "exploring" | "focusing" | "reading" | "returning";
export type MemorySignal = { id: string; distance: number; available: boolean; bearing: number } | null;
export interface PineMemorySceneProps {
  selectedId: string | null; phase: MemoryPhase; reduced: boolean; enabled: boolean;
  onOpen(id: string): void; onSignal(signal: MemorySignal): void; onFocused(): void; onReturned(): void;
}

const vertex = `varying vec3 vN; varying vec3 vEye; varying vec3 vP;
void main(){vP=position;vN=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vEye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`;
const fragment = `uniform float time; uniform float attention; varying vec3 vN; varying vec3 vEye; varying vec3 vP;
void main(){
 float fres=pow(1.-abs(dot(normalize(vN),normalize(vEye))),2.3);
 float a=atan(vP.z,vP.x), y=vP.y;
 float strata=sin(a*3.+y*13.+sin(y*9.-time*.22)*1.3+time*.12);
 float grain=pow(.5+.5*sin(a*23.+y*42.+sin(a*4.+y*11.)),24.);
 float filament=pow(.5+.5*strata,18.);
 float inner=exp(-pow(y-.06,2.)*13.);
 vec3 c=mix(vec3(.028,.08,.068),vec3(.22,.27,.17),inner);
 c+=vec3(.53,.32,.10)*filament*(.22+inner*.3);
 c+=vec3(.75,.60,.28)*grain*.18;
 c=mix(c,vec3(.74,.82,.65),fres*.8);
 c+=vec3(.83,.55,.16)*inner*(.08+.12*attention);
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const glowVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const glowFragment = `varying vec2 vUv;uniform float strength;void main(){float r=length(vUv-.5)*2.;float a=exp(-r*r*7.)*smoothstep(1.,.35,r)*strength;gl_FragColor=vec4(.94,.75,.38,a);#include <colorspace_fragment>}`.replace(";#include", ";\n#include");

function petalGeometry() {
  const positions: number[] = [], indices: number[] = [];
  for(let i=0;i<=20;i++) for(let j=0;j<=6;j++) {
    const t=i/20, s=j/3-1, width=Math.sin(Math.PI*t)*.13;
    positions.push(s*width,-.41+t*.72, .14+Math.sin(t*Math.PI)*.28-t*.10 + s*s*.055);
  }
  for(let i=0;i<20;i++) for(let j=0;j<6;j++){const n=i*7+j;indices.push(n,n+1,n+7,n+1,n+8,n+7);}
  const g=new BufferGeometry();g.setAttribute("position",new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function MemorySeed({ anchor, reduced, selected, onOpen }: { anchor: PineMemoryAnchor; reduced: boolean; selected: boolean; onOpen(id:string):void }) {
  const group=useRef<Group>(null), seed=useRef<Group>(null), halo=useRef<Mesh>(null);
  const pointer=useRef<{x:number;y:number;time:number}|null>(null);
  const {camera}=useThree();
  const resources=useMemo(()=>{
    const material=new ShaderMaterial({uniforms:{time:{value:0},attention:{value:0}},vertexShader:vertex,fragmentShader:fragment});
    const glow=new ShaderMaterial({uniforms:{strength:{value:.18}},vertexShader:glowVertex,fragmentShader:glowFragment,transparent:true,depthWrite:false});
    const points=[];for(let i=0;i<=64;i++){const t=i/64*Math.PI*1.65;points.push(new Vector3(Math.sin(t)*(.3+.03*Math.cos(t*3)),Math.cos(t)*.43,Math.sin(t*.7)*.13));}
    const thread=new TubeGeometry(new CatmullRomCurve3(points),64,.004,4,false);
    return {material,glow,thread,petal:petalGeometry()};
  },[]);
  useEffect(()=>()=>{resources.material.dispose();resources.glow.dispose();resources.thread.dispose();resources.petal.dispose();},[resources]);
  useFrame((state,dt)=>{
    if(!group.current || !seed.current || !halo.current)return;
    const distance=camera.position.distanceTo(group.current.position);
    group.current.visible=distance<75;
    if(!group.current.visible)return;
    const t=reduced ? 0:state.clock.elapsedTime;
    const attention=selected ? 1:Math.max(0,1-distance/10);
    resources.material.uniforms.time.value=t;
    resources.material.uniforms.attention.value=attention;
    resources.glow.uniforms.strength.value=.10+attention*.10;
    seed.current.position.y=reduced ? 0:Math.sin(t*.72+anchor.position[0])*.045;
    seed.current.rotation.y+=reduced ? 0:Math.min(dt,.04)*.09;
    halo.current.quaternion.copy(camera.quaternion);
  });
  const open=(event:ThreeEvent<PointerEvent>)=>{
    const press=pointer.current;pointer.current=null;
    if(press && performance.now()-press.time<800 && Math.hypot(press.x-event.clientX,press.y-event.clientY)<6 && camera.position.distanceTo(new Vector3(...anchor.position))<=4.5) {event.stopPropagation();onOpen(anchor.memory.id);}
  };
  return <group ref={group} position={anchor.position}>
    <group ref={seed} onPointerDown={e=>{if(e.button===0)pointer.current={x:e.clientX,y:e.clientY,time:performance.now()};}} onPointerUp={open} onPointerCancel={()=>{pointer.current=null;}}>
      <mesh scale={[.29,.41,.29]}><sphereGeometry args={[1,32,24]}/><primitive object={resources.material} attach="material"/></mesh>
      <mesh scale={[.303,.423,.303]}><sphereGeometry args={[1,24,16]}/><meshPhysicalMaterial color="#bdcbb6" roughness={.15} metalness={.48} clearcoat={1} clearcoatRoughness={.16} transparent opacity={.16} depthWrite={false}/></mesh>
      {[0,2.09,4.18].map((angle,i)=><group key={angle} rotation={[.08,angle,.15]}><mesh geometry={resources.petal}><meshStandardMaterial color={i===1 ? "#82724e":"#9e915f"} metalness={.75} roughness={.34} side={DoubleSide}/></mesh><mesh geometry={resources.thread}><meshBasicMaterial color="#dac28a" transparent opacity={.4} /></mesh></group>)}
    </group>
    <mesh ref={halo} raycast={()=>null} position={[0,0,-.02]}><planeGeometry args={[1.8,1.8]}/><primitive object={resources.glow} attach="material"/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-1.01,0]} raycast={()=>null}><circleGeometry args={[.7,32]}/><shaderMaterial vertexShader={glowVertex} fragmentShader={glowFragment} uniforms={{strength:{value:.13}}} transparent depthWrite={false}/></mesh>
  </group>;
}

export function PineMemoryScene({ anchors, selectedId, phase, reduced, enabled, onOpen, onSignal, onFocused, onReturned }: PineMemorySceneProps & {anchors: PineMemoryAnchor[]}) {
  const {camera,gl,size}=useThree();
  const callbacks=useRef({onOpen,onSignal,onFocused,onReturned});
  useLayoutEffect(()=>{callbacks.current={onOpen,onSignal,onFocused,onReturned};},[onOpen,onSignal,onFocused,onReturned]);
  const selection=useRef<MemorySignal>(null), previous=useRef({id:"",distance:0,available:false,bearing:0}), last=useRef(0);
  const saved=useRef<{rotation:Quaternion;fov:number}|null>(null);
  const tween=useRef<{from:Quaternion;to:Quaternion;fromFov:number;toFov:number;t:number;duration:number;returning:boolean}|null>(null);
  const direction=useMemo(()=>new Vector3(),[]), point=useMemo(()=>new Vector3(),[]);
  useEffect(()=>{
    const c=gl.domElement;
    c.dataset.pineMemoryAnchors=JSON.stringify(anchors.map(a=>({id:a.memory.id,position:a.position})));
    c.dataset.memoryPhase=phase;
    const key=(e:KeyboardEvent)=>{if(enabled && phase==="exploring" && e.key.toLowerCase()==="e" && !e.repeat && selection.current?.available){e.preventDefault();callbacks.current.onOpen(selection.current.id);}};
    c.addEventListener("keydown",key);
    return()=>{c.removeEventListener("keydown",key);delete c.dataset.pineMemoryAnchors;};
  },[anchors,gl,phase,enabled]);
  useEffect(()=>{
    if(!(camera instanceof PerspectiveCamera))return;
    if(phase==="focusing") {
      const anchor=anchors.find(a=>a.memory.id===selectedId);if(!anchor)return;
      saved.current={rotation:camera.quaternion.clone(),fov:camera.fov};
      const fov=44;
      const rotation=new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(camera.position,new Vector3(...anchor.position),camera.up));
      if(size.width>760)rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.atan(.48*Math.tan(fov*Math.PI/360)*camera.aspect)));
      tween.current={from:camera.quaternion.clone(),to:rotation,fromFov:camera.fov,toFov:fov,t:0,duration:reduced ? .01:.85,returning:false};
    } else if(phase==="returning") {
      if(!saved.current){callbacks.current.onReturned();return;}
      tween.current={from:camera.quaternion.clone(),to:saved.current.rotation,fromFov:camera.fov,toFov:saved.current.fov,t:0,duration:reduced ? .01:.65,returning:true};
    }
  },[phase,selectedId,camera,anchors,reduced,size.width]);
  useFrame((_,dt)=>{
    if(!(camera instanceof PerspectiveCamera))return;
    const animation=tween.current;
    if(animation){
      animation.t=Math.min(1,animation.t+Math.min(dt,.05)/animation.duration);
      const t=animation.t*animation.t*(3-2*animation.t);
      camera.quaternion.slerpQuaternions(animation.from,animation.to,t);camera.rotation.reorder("YXZ");
      camera.fov=animation.fromFov+(animation.toFov-animation.fromFov)*t;camera.updateProjectionMatrix();
      if(animation.t===1){tween.current=null;if(animation.returning){saved.current=null;callbacks.current.onReturned();}else callbacks.current.onFocused();}
    }
    if(performance.now()-last.current<150)return;last.current=performance.now();
    gl.domElement.dataset.forestWalkerPosition=JSON.stringify({position:camera.position.toArray(),direction:camera.getWorldDirection(direction).toArray()});
    if(!enabled || phase!=="exploring"){selection.current=null;return;}
    camera.getWorldDirection(direction);
    let next:MemorySignal=null;
    for(const a of anchors){
      point.fromArray(a.position).sub(camera.position);const distance=point.length(),dot=point.clone().normalize().dot(direction);
      if(distance>20 || (next && distance>=next.distance))continue;
      const bearing=Math.atan2(-point.x,-point.z)-camera.rotation.y;
      next={id:a.memory.id,distance,available:distance<=4.5 && dot>.65,bearing:Math.atan2(Math.sin(bearing),Math.cos(bearing))};
    }
    selection.current=next;
    gl.domElement.dataset.memorySignal=JSON.stringify(next);
    if((next?.id??"")!==previous.current.id || Math.abs((next?.distance??0)-previous.current.distance)>.25 || (next?.available??false)!==previous.current.available || Math.abs((next?.bearing??0)-previous.current.bearing)>.08){
      previous.current={id:next?.id??"",distance:next?.distance??0,available:next?.available??false,bearing:next?.bearing??0};callbacks.current.onSignal(next);
    }
  });
  return <group>{anchors.map(a=><MemorySeed key={a.memory.id} anchor={a} reduced={reduced} selected={a.memory.id===selectedId} onOpen={id=>{if(enabled && phase==="exploring")onOpen(id);}}/>)}</group>;
}
