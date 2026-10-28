"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PerspectiveCamera, Vector3 } from "three";
import type { CameraBookmark, Planet, Vec3 } from "@/domain/types";
import { safeCameraPosition, universeOverview } from "@/domain/exploration";
import { CAMERA_KEY } from "@/data/local-repository";

export interface FlightRequest { planetId: string | null; nonce: number; enter?: boolean }

function saveBookmark(position: Vector3, target: Vector3) {
  try { localStorage.setItem(CAMERA_KEY, JSON.stringify({ position: position.toArray(), target: target.toArray() })); } catch { /* Optional preference; archive save failures are reported separately. */ }
}

export function CameraRig({ planets, flight, onArrival, reducedMotion }: {
  planets: Planet[]; flight: FlightRequest | null; onArrival: (id: string) => void; reducedMotion: boolean;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const handledRequest = useRef<number | null>(null);
  const initialized = useRef(false);
  const animation = useRef<{ from: Vector3; to: Vector3; fromTarget: Vector3; toTarget: Vector3; progress: number; arrivalId: string | null } | null>(null);

  useEffect(() => {
    if (!controls.current || initialized.current) return;
    initialized.current = true;
    const overview = universeOverview(planets, camera instanceof PerspectiveCamera ? camera.fov : 43, size.width / size.height);
    camera.position.fromArray(overview.position);
    controls.current.target.fromArray(overview.target);
    try {
      const raw = localStorage.getItem(CAMERA_KEY);
      const bookmark = raw ? JSON.parse(raw) as CameraBookmark : null;
      const valid = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 10000);
      if (bookmark && valid(bookmark.position) && valid(bookmark.target) && new Vector3(...bookmark.position).distanceTo(new Vector3(...bookmark.target)) >= 2) {
        camera.position.fromArray(safeCameraPosition(bookmark.position, planets));
        controls.current.target.fromArray(bookmark.target);
      }
    } catch { /* Invalid bookmarks never prevent reading personal records. */ }
    controls.current.update();
  }, [camera, planets, size.width, size.height]);

  useEffect(() => {
    if (!flight || !controls.current || handledRequest.current === flight.nonce) return;
    handledRequest.current = flight.nonce;
    const planet = planets.find(p => p.id === flight.planetId);
    const overview = universeOverview(planets, camera instanceof PerspectiveCamera ? camera.fov : 43, size.width / size.height);
    const target = planet ? new Vector3(...planet.position) : new Vector3(...overview.target);
    const distance = planet ? planet.appearance.size * (planet.appearance.rings ? 6.3 : 4.2) : 0;
    const to = planet ? target.clone().add(new Vector3(0, distance * 0.24, distance)) : new Vector3(...overview.position);
    animation.current = { from: camera.position.clone(), to, fromTarget: controls.current.target.clone(), toTarget: target, progress: 0, arrivalId: flight.enter && planet ? planet.id : null };
    controls.current.enabled = false;
  }, [flight, planets, camera, size.width, size.height]);

  useFrame((_, dt) => {
    if (!controls.current) return;
    const a = animation.current;
    if (a) {
      a.progress = reducedMotion ? 1 : Math.min(1, a.progress + dt / 1.65);
      const t = a.progress * a.progress * (3 - 2 * a.progress);
      camera.position.lerpVectors(a.from, a.to, t);
      controls.current.target.lerpVectors(a.fromTarget, a.toTarget, t);
      controls.current.update();
    }
    camera.position.fromArray(safeCameraPosition(camera.position.toArray() as Vec3, planets));
    if (a?.progress === 1) {
      animation.current = null;
      controls.current.enabled = true;
      saveBookmark(camera.position, controls.current.target);
      if (a.arrivalId) onArrival(a.arrivalId);
    }
  });

  const bounds = universeOverview(planets, camera instanceof PerspectiveCamera ? camera.fov : 43, size.width / size.height);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.07} minDistance={1} maxDistance={Math.max(100, bounds.farthestDistance * 1.5)} rotateSpeed={0.45} zoomSpeed={0.65} maxPolarAngle={Math.PI * 0.94} onEnd={() => { if (controls.current && !animation.current) saveBookmark(camera.position, controls.current.target); }} />;
}
