"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PerspectiveCamera, Vector3, type Camera } from "three";
import type { CameraBookmark, Planet, Vec3 } from "@/domain/types";
import { safeCameraPosition, universeOverview } from "@/domain/exploration";
import { planetApproach } from "@/domain/planet-flight";
import { CAMERA_KEY } from "@/data/local-repository";
import { readVisit, saveVisit, validBookmark } from "@/data/exploration-session";
import { consumeGalaxyArrival } from "@/data/cosmic-preferences";

import { safeStellarCamera, travelArc, type StellarSource } from "@/domain/spatial-scene";

export interface FlightRequest { planetId: string | null; nonce: number; enter?: boolean }
interface Animation {
  from: Vector3; to: Vector3; fromTarget: Vector3; toTarget: Vector3;
  fromFov?: number; progress: number; duration: number; arrivalId: string | null; returning: boolean; approached: boolean;
}
function saveBookmark(key: string, bookmark: CameraBookmark) {
  try { localStorage.setItem(key, JSON.stringify(bookmark)); } catch { /* Optional camera preference, never archive data. */ }
}

function ownCamera(control: ComponentRef<typeof OrbitControls>, camera: Camera) {
  const position = camera.position.clone(), target = control.target.clone();
  control.enabled = false; control.enableDamping = false;
  // OrbitControls has private residual deltas. Drain them without rendering a jump.
  control.update(); camera.position.copy(position); control.target.copy(target); control.update();
}

export function CameraRig({ source, planets, flight, onArrival, onApproach, onReturned, reducedMotion, bookmarkKey = CAMERA_KEY, galaxyId, returnPlanetId }: {
  source: StellarSource; planets: Planet[]; flight: FlightRequest | null; onArrival: (id: string) => void; onApproach: (id: string) => void; onReturned: () => void;
  reducedMotion: boolean; bookmarkKey?: string; galaxyId: string; returnPlanetId?: string | null;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const handledRequest = useRef<number | null>(null);
  const initialized = useRef(false);
  const animation = useRef<Animation | null>(null);
  const departure = useRef<CameraBookmark | null>(null);
  const lastEntry = useRef(false);
  const readCamera = (): CameraBookmark => ({ position: camera.position.toArray() as Vec3, target: controls.current!.target.toArray() as Vec3 });

  useEffect(() => {
    const control = controls.current;
    if (!control || initialized.current) return;
    initialized.current = true;
    const overview = universeOverview(planets, camera instanceof PerspectiveCamera ? camera.fov : 43, size.width / size.height, [{ position: source.position, size: source.radius }]);
    let bookmark: CameraBookmark = overview;
    try { const raw = localStorage.getItem(bookmarkKey); const stored: unknown = raw ? JSON.parse(raw) : null; if (validBookmark(stored)) bookmark = stored; } catch { /* Invalid optional bookmarks do not block records. */ }
    const visit = returnPlanetId ? readVisit(returnPlanetId, galaxyId) : null;
    const start = visit?.arrival ?? bookmark;
    camera.position.fromArray(safeCameraPosition(start.position, planets)); control.target.fromArray(start.target); control.update();
    if (visit) {
      animation.current = { from: camera.position.clone(), to: new Vector3(...visit.origin.position), fromTarget: control.target.clone(), toTarget: new Vector3(...visit.origin.target), progress: 0, duration: 1.1, arrivalId: null, returning: true, approached: false };
      ownCamera(control, camera);
    } else if (returnPlanetId) onReturned();
    else if (consumeGalaxyArrival(galaxyId) && !reducedMotion) {
      const destination = camera.position.clone();
      camera.position.sub(control.target).multiplyScalar(1.7).add(control.target);
      animation.current = { from: camera.position.clone(), to: destination, fromTarget: control.target.clone(), toTarget: control.target.clone(), progress: 0, duration: 1.8, arrivalId: null, returning: false, approached: false };
      ownCamera(control, camera);
    }
  }, [camera, planets, size.width, size.height, bookmarkKey, galaxyId, returnPlanetId, onReturned, reducedMotion, source]);

  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    if (!flight) {
      if (lastEntry.current && departure.current) {
        animation.current = { from: camera.position.clone(), to: new Vector3(...departure.current.position), fromTarget: control.target.clone(), toTarget: new Vector3(...departure.current.target), progress: 0, duration: 0.6, arrivalId: null, returning: true, approached: false };
        ownCamera(control, camera);
      }
      lastEntry.current = false;
      return;
    }
    if (handledRequest.current === flight.nonce) return;
    handledRequest.current = flight.nonce;
    const planet = planets.find(p => p.id === flight.planetId);
    const overview = universeOverview(planets, camera instanceof PerspectiveCamera ? camera.fov : 43, size.width / size.height, [{ position: source.position, size: source.radius }]);
    const origin: CameraBookmark = { position: camera.position.toArray() as Vec3, target: control.target.toArray() as Vec3 };
    const destination = planet ? planetApproach(planet, origin, planets, size.width / size.height) : overview;
    lastEntry.current = !!flight.enter;
    if (flight.enter && planet) {
      departure.current = origin;
      saveBookmark(bookmarkKey, origin);
      saveVisit({ planetId: planet.id, galaxyId, origin, arrival: destination });
    }
    animation.current = { from: camera.position.clone(), to: new Vector3(...destination.position), fromTarget: control.target.clone(), toTarget: new Vector3(...destination.target), progress: 0, duration: flight.enter ? 2.2 : 1.3, arrivalId: flight.enter && planet ? planet.id : null, returning: false, approached: false };
    // Flush OrbitControls damping before owning both camera and target.
    ownCamera(control, camera);
  }, [flight, planets, camera, size.width, size.height, bookmarkKey, galaxyId, source]);

  useFrame((_, dt) => {
    const control = controls.current;
    if (!control) return;
    const a = animation.current;
    if (a) {
      a.progress = Math.min(1, a.progress + Math.min(dt, 0.05) / (reducedMotion ? 0.12 : a.duration));
      const t = a.progress * a.progress * (3 - 2 * a.progress);
      camera.position.lerpVectors(a.from, a.to, t);
      camera.position.setY(camera.position.y + (a.arrivalId ? travelArc(t, a.from.distanceTo(a.to), reducedMotion) * .35 : 0));
      control.target.lerpVectors(a.fromTarget, a.toTarget, t);
      if (camera instanceof PerspectiveCamera) {
        a.fromFov ??= camera.fov;
        const fov = a.fromFov + (43 - a.fromFov) * t - (a.arrivalId && !reducedMotion ? 1.2 * Math.sin(Math.PI * t) ** 2 : 0);
        camera.setFocalLength(.5 * camera.getFilmHeight() / Math.tan(fov * Math.PI / 360));
      }
      control.update();
      if (a.arrivalId && !a.approached && a.progress >= 0.65) { a.approached = true; if (!reducedMotion) onApproach(a.arrivalId); }
    }
    camera.position.fromArray(safeCameraPosition(safeStellarCamera(camera.position.toArray() as Vec3, source), planets));
    camera.lookAt(control.target);
    if (a?.progress === 1) {
      animation.current = null;
      if (a.arrivalId) onArrival(a.arrivalId);
      else { control.enabled = true; control.enableDamping = !reducedMotion; saveBookmark(bookmarkKey, readCamera()); if (a.returning) onReturned(); }
    }
  });

  const bounds = universeOverview(planets, camera instanceof PerspectiveCamera ? camera.fov : 43, size.width / size.height, [{ position: source.position, size: source.radius }]);
  return <OrbitControls ref={controls} makeDefault enableDamping={!reducedMotion} dampingFactor={0.07} minDistance={1} maxDistance={Math.max(100, bounds.farthestDistance * 1.5)} rotateSpeed={0.45} zoomSpeed={0.65} maxPolarAngle={Math.PI * 0.94} onEnd={() => { if (controls.current?.enabled && !animation.current) saveBookmark(bookmarkKey, readCamera()); }} />;
}
