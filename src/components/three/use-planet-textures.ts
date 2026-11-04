"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
import type { PlanetAppearance } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { texturesFromPixels } from "./planet-texture";
import { planetTextureKey, requestPlanetPixels, schedulePlanetUpload } from "./planet-texture-pipeline";
import { exteriorMapBytes } from "./exterior-lod";
import type { ExteriorLodSignal } from "./use-exterior-lod";

const states = new WeakMap<WebGLRenderer, Set<{ requested: string | null; rendered: string | null; tier: RenderTier | null }>>();
export function exteriorReadiness(gl: WebGLRenderer) {
  const entries = [...(states.get(gl) ?? [])];
  const resident = { low: 0, medium: 0, high: 0 };
  let mapBytes = 0;
  for (const { tier } of entries) if (tier) { resident[tier]++; mapBytes += exteriorMapBytes(tier); }
  const targets = entries.filter(e => e.requested !== null);
  return { total: entries.length, targets: targets.length, resident, mapBytes,
    pending: entries.filter(e => e.requested !== e.rendered).length };
}

export function usePlanetTextures(appearance: PlanetAppearance, requestedTier: RenderTier | null, lod?: ExteriorLodSignal) {
  const gl = useThree(state => state.gl);
  const { type, color, seed } = appearance;
  const key = requestedTier ? planetTextureKey({ type, color, seed }, requestedTier) : null;
  const status = useRef({ requested: null as string | null, rendered: null as string | null, tier: null as RenderTier | null });
  const owned = useMemo(() => new Set<ReturnType<typeof texturesFromPixels>>(), []);
  const [ready, setReady] = useState<{ key: string; tier: RenderTier; textures: ReturnType<typeof texturesFromPixels> } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useLayoutEffect(() => {
    const record = status.current;
    const entries = states.get(gl) ?? new Set(); states.set(gl, entries); entries.add(record);
    return () => { entries.delete(record); owned.forEach(textures => textures.dispose()); owned.clear(); };
  }, [gl, status, owned]);
  // Publish desired/committed keys in the same React commit as the meshes. A frame
  // between layout and passive effects must not report an empty queue as ready.
  useLayoutEffect(() => {
    status.current.requested = key;
    status.current.rendered = ready?.key ?? null;
    status.current.tier = ready?.tier ?? null;
  }, [key, ready, status]);
  useEffect(() => {
    const abort = new AbortController();
    if (!requestedTier || !key) {
      queueMicrotask(() => { if (!abort.signal.aborted) setReady(null); });
      return () => abort.abort();
    }
    const priority = () => lod?.priority ?? 0;
    requestPlanetPixels({ type, color, seed }, requestedTier, abort.signal, priority).then(maps => {
      schedulePlanetUpload(() => {
        const textures = texturesFromPixels(maps, requestedTier);
        // Upload before committing the new material. Keep the existing appearance until ready.
        try {
          gl.initTexture(textures.albedo); gl.initTexture(textures.surface);
          owned.add(textures);
          setReady({ key, tier: requestedTier, textures });
        } catch (e) { textures.dispose(); setError(e instanceof Error ? e : new Error(String(e))); }
      }, abort.signal, priority);
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e : new Error(String(e))); });
    return () => abort.abort();
  }, [type, color, seed, requestedTier, gl, key, owned, lod]);
  // Disposal follows the committed resource, not the request: the old material remains valid
  // while its replacement is baking. Rapid switches/unmount cancel stale queued work.
  useEffect(() => {
    return () => { if (ready) { ready.textures.dispose(); owned.delete(ready.textures); } };
  }, [ready, owned]);
  if (error) throw error;
  return { ready: requestedTier ? ready : null };
}
