"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
import type { PlanetAppearance } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { texturesFromPixels } from "./planet-texture";
import { planetTextureKey, requestPlanetPixels, schedulePlanetUpload } from "./planet-texture-pipeline";

const states = new WeakMap<WebGLRenderer, Set<{ requested: string; rendered: string | null }>>();
export function exteriorReadiness(gl: WebGLRenderer) {
  const entries = [...(states.get(gl) ?? [])];
  return { total: entries.length, pending: entries.filter(e => e.requested !== e.rendered).length };
}

export function usePlanetTextures(appearance: PlanetAppearance, requestedTier: RenderTier) {
  const gl = useThree(state => state.gl);
  const { type, color, seed } = appearance;
  const status = useRef({ requested: "", rendered: null as string | null });
  const owned = useMemo(() => new Set<ReturnType<typeof texturesFromPixels>>(), []);
  const [ready, setReady] = useState<{ key: string; tier: RenderTier; textures: ReturnType<typeof texturesFromPixels> } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const record = status.current;
    const entries = states.get(gl) ?? new Set(); states.set(gl, entries); entries.add(record);
    return () => { entries.delete(record); owned.forEach(textures => textures.dispose()); owned.clear(); };
  }, [gl, status, owned]);
  useEffect(() => {
    status.current.requested = planetTextureKey({ type, color, seed }, requestedTier);
    const abort = new AbortController();
    requestPlanetPixels({ type, color, seed }, requestedTier, abort.signal).then(maps => {
      schedulePlanetUpload(() => {
        const textures = texturesFromPixels(maps, requestedTier);
        // Upload before committing the new material. Keep the existing appearance until ready.
        try {
          gl.initTexture(textures.albedo); gl.initTexture(textures.surface);
          owned.add(textures);
          setReady({ key: planetTextureKey({ type, color, seed }, requestedTier), tier: requestedTier, textures });
        } catch (e) { textures.dispose(); setError(e instanceof Error ? e : new Error(String(e))); }
      }, abort.signal);
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e : new Error(String(e))); });
    return () => abort.abort();
  }, [type, color, seed, requestedTier, gl, status, owned]);
  // Disposal follows the committed resource, not the request: the old material remains valid
  // while its replacement is baking. Rapid switches/unmount cancel stale queued work.
  useEffect(() => {
    status.current.rendered = ready?.key ?? null;
    return () => { if (ready) { ready.textures.dispose(); owned.delete(ready.textures); } };
  }, [ready, status, owned]);
  if (error) throw error;
  return { ready, pending: ready?.key !== planetTextureKey({ type, color, seed }, requestedTier) };
}
