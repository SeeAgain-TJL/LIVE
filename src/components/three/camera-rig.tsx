"use client";

import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PerspectiveCamera, Vector3, type Camera } from "three";
import type { CameraBookmark, Planet, Vec3 } from "@/domain/types";
import { safeCameraPosition, universeOverview } from "@/domain/exploration";
import { planetApproach } from "@/domain/planet-flight";
import { CAMERA_KEY } from "@/data/local-repository";
import { readVisit, saveVisit, validBookmark } from "@/data/exploration-session";
import { consumeGalaxyArrival } from "@/data/cosmic-preferences";

import { safeStellarCamera, type StellarSource } from "@/domain/spatial-scene";
import { safeEnvironmentCamera, vacancySlots } from "@/domain/system-environment";

import { comfortableProgress, stagedProgress, journeyPhase, TRAVEL_PROFILES, type TravelMode } from "@/domain/travel";

export interface FlightRequest { planetId: string | null; nonce: number; enter?: boolean }
interface Animation {
  from: Vector3; to: Vector3; fromTarget: Vector3; toTarget: Vector3;
  progress: number; duration: number; arrivalId: string | null; returning: boolean; approached: boolean;
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

export function CameraRig({ source, travelMode, planets, flight, onArrival, onApproach, onReturned, reducedMotion, bookmarkKey = CAMERA_KEY, galaxyId, returnPlanetId }: {
  source: StellarSource; travelMode: TravelMode; planets: Planet[]; flight: FlightRequest | null; onArrival: (id: string) => void; onApproach: (id: string) => void; onReturned: () => void;
  reducedMotion: boolean; bookmarkKey?: string; galaxyId: string; returnPlanetId?: string | null;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const handledRequest = useRef<number | null>(null);
  const initialized = useRef(false);
  const profile = TRAVEL_PROFILES[travelMode];
  const animation = useRef<Animation | null>(null);
  const departure = useRef<CameraBookmark | null>(null);
  const lastEntry = useRef(false);
  const vacancies = useMemo(() => vacancySlots(galaxyId, planets, source), [galaxyId, planets, source]);
  const context = useMemo(() => [{ position: source.position, size: source.radius }, ...vacancies.map(slot => ({ position: slot.position, size: slot.size * 1.8 }))], [source, vacancies]);
  const readCamera = (): CameraBookmark => ({ position: camera.position.toArray() as Vec3, target: controls.current!.target.toArray() as Vec3 });

  useEffect(() => {
    const control = controls.current;
    if (!control || initialized.current) return;
    initialized.current = true;
    const overview = universeOverview(planets, camera instanceof PerspectiveCamera ? camera.fov : 43, size.width / size.height, context);
    let bookmark: CameraBookmark = overview;
    try { const raw = localStorage.getItem(bookmarkKey); const stored: unknown = raw ? JSON.parse(raw) : null; if (validBookmark(stored)) bookmark = stored; } catch { /* Invalid optional bookmarks do not block records. */ }
    const visit = returnPlanetId ? readVisit(returnPlanetId, galaxyId) : null;
    const start = visit?.arrival ?? bookmark;
    camera.position.fromArray(safeCameraPosition(start.position, planets)); control.target.fromArray(start.target); control.update();
    if (visit) {
      animation.current = { from: camera.position.clone(), to: new Vector3(...visit.origin.position), fromTarget: control.target.clone(), toTarget: new Vector3(...visit.origin.target), progress: 0, duration: profile.returning, arrivalId: null, returning: true, approached: false };
      ownCamera(control, camera);
    } else if (returnPlanetId) onReturned();
    else if (consumeGalaxyArrival(galaxyId) && !reducedMotion) {
      const destination = camera.position.clone();
      camera.position.sub(control.target).multiplyScalar(profile.arrivalScale).add(control.target);
      animation.current = { from: camera.position.clone(), to: destination, fromTarget: control.target.clone(), toTarget: control.target.clone(), progress: 0, duration: profile.arrival, arrivalId: null, returning: false, approached: false };
      ownCamera(control, camera);
    }
  }, [camera, planets, size.width, size.height, bookmarkKey, galaxyId, returnPlanetId, onReturned, reducedMotion, context, profile]);

  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    if (!flight) {
      if (lastEntry.current && departure.current) {
        animation.current = { from: camera.position.clone(), to: new Vector3(...departure.current.position), fromTarget: control.target.clone(), toTarget: new Vector3(...departure.current.target), progress: 0, duration: profile.cancel, arrivalId: null, returning: true, approached: false };
        ownCamera(control, camera);
      }
      lastEntry.current = false;
      return;
    }
    if (handledRequest.current === flight.nonce) return;
    handledRequest.current = flight.nonce;
    const planet = planets.find(p => p.id === flight.planetId);
    const overview = universeOverview(planets, camera instanceof PerspectiveCamera ? camera.fov : 43, size.width / size.height, context);
    const origin: CameraBookmark = { position: camera.position.toArray() as Vec3, target: control.target.toArray() as Vec3 };
    const destination = planet ? planetApproach(planet, origin, planets, size.width / size.height) : overview;
    lastEntry.current = !!flight.enter;
    if (flight.enter && planet) {
      departure.current = origin;
      saveBookmark(bookmarkKey, origin);
      saveVisit({ planetId: planet.id, galaxyId, origin, arrival: destination });
    }
    const distance = camera.position.distanceTo(new Vector3(...destination.position));
    const duration = flight.enter ? profile.planet * Math.min(1, Math.max(.12, distance / Math.max(1, (planet?.appearance.size ?? 1) * 12))) : profile.arrival;
    animation.current = { from: camera.position.clone(), to: new Vector3(...destination.position), fromTarget: control.target.clone(), toTarget: new Vector3(...destination.target), progress: 0, duration, arrivalId: flight.enter && planet ? planet.id : null, returning: false, approached: false };
    // Flush OrbitControls damping before owning both camera and target.
    ownCamera(control, camera);
  }, [flight, planets, camera, size.width, size.height, bookmarkKey, galaxyId, context, profile]);

  useFrame(({ gl }, dt) => {
    const control = controls.current;
    if (!control) return;
    gl.domElement.dataset.travelMode = travelMode;
    const a = animation.current;
    if (!a && control.enabled) gl.domElement.dataset.travelPhase = "idle";
    if (a) {
      if (a.progress < 1) a.progress = Math.min(1, a.progress + Math.min(dt, .05) / (reducedMotion ? .12 : a.duration));
      const t = a.arrivalId ? comfortableProgress(a.progress, a.from.distanceTo(a.toTarget), a.to.distanceTo(a.toTarget)) : stagedProgress(a.progress);
      gl.domElement.dataset.travelPhase = a.returning ? "returning" : journeyPhase(a.progress);
      camera.position.lerpVectors(a.from, a.to, t);
      control.target.lerpVectors(a.fromTarget, a.toTarget, t);
      control.update();
      if (a.arrivalId && !a.approached && a.progress >= 0.65) { a.approached = true; if (!reducedMotion) onApproach(a.arrivalId); }
    }
    camera.position.fromArray(safeEnvironmentCamera(safeCameraPosition(safeStellarCamera(camera.position.toArray() as Vec3, source), planets), vacancies));
    camera.lookAt(control.target);
    if (a?.progress === 1) {
      animation.current = null;
      if (a.arrivalId) onArrival(a.arrivalId);
      else { control.enabled = true; control.enableDamping = !reducedMotion; saveBookmark(bookmarkKey, readCamera()); if (a.returning) onReturned(); }
    }
  }, -.5);

  const bounds = universeOverview(planets, camera instanceof PerspectiveCamera ? camera.fov : 43, size.width / size.height, context);
  return <OrbitControls ref={controls} makeDefault enableDamping={!reducedMotion} dampingFactor={0.07} minDistance={1} maxDistance={Math.max(100, bounds.farthestDistance * 1.5)} rotateSpeed={0.45} zoomSpeed={0.65} maxPolarAngle={Math.PI * 0.94} onEnd={() => { if (controls.current?.enabled && !animation.current) saveBookmark(bookmarkKey, readCamera()); }} />;
}
