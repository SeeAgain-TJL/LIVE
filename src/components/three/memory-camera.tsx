"use client";

import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import { memoryView } from "@/domain/memory";

export function MemoryCamera({ total, selectedIndex, reducedMotion }: { total: number; selectedIndex: number; reducedMotion: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const framing = useMemo(() => memoryView(total, selectedIndex, size.width / size.height), [total, selectedIndex, size.width, size.height]);
  const initialized = useRef(false);
  const animation = useRef<{ from: Vector3; to: Vector3; fromTarget: Vector3; toTarget: Vector3; progress: number } | null>(null);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const to = new Vector3(...framing.position);
    const toTarget = new Vector3(...framing.target);
    if (!initialized.current) {
      initialized.current = true;
      camera.position.copy(to); orbit.target.copy(toTarget); orbit.update();
      return;
    }
    // Both the flight and manual exploration share this control target. Release it after arrival.
    animation.current = { from: camera.position.clone(), to, fromTarget: orbit.target.clone(), toTarget, progress: 0 };
    orbit.enabled = false; orbit.enableDamping = false;
  }, [camera, framing]);
  useFrame((_, delta) => {
    const orbit = controls.current;
    const flight = animation.current;
    if (!orbit || !flight) return;
    flight.progress = reducedMotion ? 1 : Math.min(1, flight.progress + delta / 0.85);
    const t = flight.progress * flight.progress * (3 - 2 * flight.progress);
    camera.position.lerpVectors(flight.from, flight.to, t);
    orbit.target.lerpVectors(flight.fromTarget, flight.toTarget, t);
    orbit.update();
    if (flight.progress === 1) { animation.current = null; orbit.enabled = true; orbit.enableDamping = !reducedMotion; }
  });
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={!reducedMotion} dampingFactor={0.08}
    minDistance={6.5} maxDistance={Math.max(28, memoryView(total, -1, size.width / size.height).distance * 1.6)} rotateSpeed={0.45} zoomSpeed={0.65} />;
}
