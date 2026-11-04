"use client";
import { identitySeed, type RenderTier } from "@/domain/cosmic-visuals";
import { NebulaVolume } from "./nebula-volume";
import { DeepSpace } from "./deep-space";
import { galaxyIdentity } from "@/domain/galaxy-identity";

/** World-space stellar layers and bounded 3D gas; no intersecting translucent cloud planes. */
export function CosmicEnvironment({ tier, identity = "universe", reuseStaticVolume = false }: { tier: RenderTier; identity?: string; reuseStaticVolume?: boolean }) {
  const seed = identitySeed(identity);
  const palette = galaxyIdentity(identity);
  return <>
    <color attach="background" args={["#03060c"]} />
    <DeepSpace seed={seed} tier={tier} local={identity !== "universe"} />
    <NebulaVolume tier={tier} local={identity !== "universe"} seed={seed} cool={palette.cool} warm={palette.warm} reuseStatic={reuseStaticVolume} />
  </>;
}
