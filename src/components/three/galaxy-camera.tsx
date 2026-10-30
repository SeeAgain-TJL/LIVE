"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import type { CameraBookmark, Galaxy, Vec3 } from "@/domain/types";
import { galaxyPosition } from "@/domain/galaxy";
import { galaxyOverview, galaxyStyle } from "@/domain/cosmic-visuals";
import { readCosmicCamera, saveCosmicCamera } from "@/data/cosmic-preferences";
import { comfortableProgress, stagedProgress, journeyPhase, TRAVEL_PROFILES, type TravelMode } from "@/domain/travel";

export interface GalaxyFlight { id: string; nonce: number }
interface Motion { start: Vector3; targetStart: Vector3; target: Vector3; to: Vector3; progress: number; rest: number; duration: number; hold: number; id: string | null }
export function GalaxyCamera({ galaxies, flight, onArrival, onRestored, reduced, travelMode }: { galaxies: Galaxy[]; flight: GalaxyFlight | null; onArrival: (id: string) => void; onRestored: () => void; reduced: boolean; travelMode: TravelMode }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const initialized = useRef(false), handled = useRef<number | null>(null);
  const origin = useRef<CameraBookmark | null>(null);
  const settled = useRef({ position: new Vector3(), target: new Vector3(), quiet: 0, saved: false });
  const animation = useRef<Motion | null>(null);
  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    const profile = TRAVEL_PROFILES[travelMode];
    if (!initialized.current) {
      initialized.current = true;
      const view = readCosmicCamera() ?? galaxyOverview(galaxies.length, size.width / size.height);
      camera.position.fromArray(view.position); control.target.fromArray(view.target); control.update();
    }
    if (!flight) {
      if (origin.current) {
        animation.current = { start: camera.position.clone(), targetStart: control.target.clone(), target: new Vector3(...origin.current.target), to: new Vector3(...origin.current.position), progress: 0, rest: 0, duration: profile.cancel, hold: 0, id: null };
        origin.current = null;
      } else if (!animation.current) onRestored();
      return;
    }
    const index = galaxies.findIndex(g => g.id === flight.id);
    if (index < 0 || handled.current === flight.nonce) return;
    handled.current = flight.nonce;
    origin.current = { position: camera.position.toArray() as Vec3, target: control.target.toArray() as Vec3 };
    saveCosmicCamera(origin.current);
    const target = new Vector3(...galaxyPosition(index));
    const direction = camera.position.clone().sub(target).normalize();
    const to = target.clone().addScaledVector(direction, galaxyStyle(flight.id).radius * 1.2 + 4);
    animation.current = { start: camera.position.clone(), targetStart: control.target.clone(), target, to, progress: 0, rest: 0, duration: profile.galaxy, hold: profile.hold, id: flight.id };
    const p = camera.position.clone(), t = control.target.clone();
    control.enabled = false; control.enableDamping = false; control.update(); camera.position.copy(p); control.target.copy(t); control.update();
  }, [camera, galaxies, flight, size.width, size.height, onRestored, travelMode]);
  useFrame(({ gl }, dt) => {
    const a = animation.current, control = controls.current;
    if (!control) return;
    gl.domElement.dataset.travelMode = travelMode;
    if (!a && control.enabled) {
      gl.domElement.dataset.travelPhase = "idle";
      const state = settled.current;
      if (state.position.distanceToSquared(camera.position) + state.target.distanceToSquared(control.target) > .000001) {
        state.position.copy(camera.position); state.target.copy(control.target); state.quiet = 0; state.saved = false;
      } else state.quiet += dt;
      if (!state.saved && state.quiet > .25) {
        saveCosmicCamera({ position: camera.position.toArray() as Vec3, target: control.target.toArray() as Vec3 }); state.saved = true;
      }
    }
    if (!a) return;
    const step = Math.min(dt, .05);
    if (a.progress < 1) a.progress = Math.min(1, a.progress + step / (reduced ? .12 : a.duration));
    else a.rest += step;
    const t = a.id ? comfortableProgress(a.progress, a.start.distanceTo(a.target), a.to.distanceTo(a.target)) : stagedProgress(a.progress);
    camera.position.lerpVectors(a.start, a.to, t); control.target.lerpVectors(a.targetStart, a.target, t); control.update();
    gl.domElement.dataset.travelPhase = a.id ? journeyPhase(a.progress, a.progress === 1) : "cancelling";
    if (a.progress === 1 && a.rest >= (reduced ? 0 : a.hold)) {
      animation.current = null;
      if (a.id) onArrival(a.id);
      else { control.enabled = true; control.enableDamping = !reduced; onRestored(); }
    }
  }, -.5);
  return <OrbitControls ref={controls} makeDefault enablePan panSpeed={.45} enableDamping={!reduced} dampingFactor={.06} minDistance={4} maxDistance={1200} rotateSpeed={.3} zoomSpeed={.5} onEnd={() => {
    if (controls.current?.enabled && !animation.current) saveCosmicCamera({ position: camera.position.toArray() as Vec3, target: controls.current.target.toArray() as Vec3 });
  }} />;
}
