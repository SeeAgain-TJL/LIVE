"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import type { CameraBookmark, Galaxy, Vec3 } from "@/domain/types";
import { galaxyPosition } from "@/domain/galaxy";
import { galaxyOverview, galaxyStyle } from "@/domain/cosmic-visuals";
import { readCosmicCamera, saveCosmicCamera } from "@/data/cosmic-preferences";

export interface GalaxyFlight { id: string; nonce: number }
export function GalaxyCamera({ galaxies, flight, onArrival, reduced }: { galaxies: Galaxy[]; flight: GalaxyFlight | null; onArrival: (id: string) => void; reduced: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const initialized = useRef(false), handled = useRef<number | null>(null);
  const origin = useRef<CameraBookmark | null>(null);
  const settled = useRef({ position: new Vector3(), target: new Vector3(), quiet: 0, saved: false });
  const animation = useRef<{ start: Vector3; targetStart: Vector3; target: Vector3; to: Vector3; progress: number; id: string | null } | null>(null);
  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    if (!initialized.current) {
      initialized.current = true;
      const view = readCosmicCamera() ?? galaxyOverview(galaxies.length, size.width / size.height);
      camera.position.fromArray(view.position); control.target.fromArray(view.target); control.update();
    }
    if (!flight) {
      if (origin.current) {
        animation.current = { start: camera.position.clone(), targetStart: control.target.clone(), target: new Vector3(...origin.current.target), to: new Vector3(...origin.current.position), progress: 0, id: null };
        origin.current = null;
      }
      return;
    }
    const index = galaxies.findIndex(g => g.id === flight.id);
    if (index < 0 || handled.current === flight.nonce) return;
    handled.current = flight.nonce;
    origin.current = { position: camera.position.toArray() as Vec3, target: control.target.toArray() as Vec3 };
    saveCosmicCamera(origin.current);
    const target = new Vector3(...galaxyPosition(index));
    const direction = camera.position.clone().sub(target).normalize();
    // Approach the near side of the disk without crossing the nucleus.
    const to = target.clone().addScaledVector(direction, galaxyStyle(flight.id).radius * 0.95 + 3);
    animation.current = { start: camera.position.clone(), targetStart: control.target.clone(), target, to, progress: 0, id: flight.id };
    const p = camera.position.clone(), t = control.target.clone();
    control.enabled = false; control.enableDamping = false; control.update(); camera.position.copy(p); control.target.copy(t); control.update();
  }, [camera, galaxies, flight, size.width, size.height]);
  useFrame((_, dt) => {
    const a = animation.current, control = controls.current;
    if (!control) return;
    // OrbitControls emits end before its damping finishes. Save the settled view,
    // otherwise reload/return restores the pre-damping position.
    if (!a && control.enabled) {
      const state = settled.current;
      if (state.position.distanceToSquared(camera.position) + state.target.distanceToSquared(control.target) > 0.000001) {
        state.position.copy(camera.position); state.target.copy(control.target); state.quiet = 0; state.saved = false;
      } else state.quiet += dt;
      if (!state.saved && state.quiet > 0.25) {
        saveCosmicCamera({ position: camera.position.toArray() as Vec3, target: control.target.toArray() as Vec3 }); state.saved = true;
      }
    }
    if (!a) return;
    a.progress = Math.min(1, a.progress + Math.min(dt, 0.05) / (reduced ? 0.12 : a.id ? 2.8 : 0.65));
    const t = a.progress ** 3 * (a.progress * (a.progress * 6 - 15) + 10);
    camera.position.lerpVectors(a.start, a.to, t); control.target.lerpVectors(a.targetStart, a.target, t); control.update();
    if (a.progress === 1) {
      animation.current = null;
      if (a.id) onArrival(a.id);
      else { control.enabled = true; control.enableDamping = !reduced; }
    }
  });
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={!reduced} dampingFactor={0.06} minDistance={4} maxDistance={1200} rotateSpeed={0.35} zoomSpeed={0.6} onEnd={() => {
    if (controls.current?.enabled && !animation.current) saveCosmicCamera({ position: camera.position.toArray() as Vec3, target: controls.current.target.toArray() as Vec3 });
  }} />;
}
