"use client";

import { useMemo } from "react";
import { AdditiveBlending, Color } from "three";

export function StarField({ low = false }: { low?: boolean }) {
  const { positions, colors } = useMemo(() => {
    const count = low ? 1000 : 3200;
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    let state = 48151;
    const random = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
    const color = new Color();
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2, z = random() * 2 - 1, r = 90 + random() * 100;
      positions.set([r * Math.sqrt(1 - z * z) * Math.cos(theta), r * z, r * Math.sqrt(1 - z * z) * Math.sin(theta)], i * 3);
      color.setHSL(0.54 + random() * 0.15, 0.08 + random() * 0.25, 0.3 + random() * 0.5);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    return { positions, colors };
  }, [low]);
  return <points frustumCulled={false} raycast={() => null}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /><bufferAttribute attach="attributes-color" args={[colors, 3]} /></bufferGeometry>
    <pointsMaterial vertexColors size={low ? 0.13 : 0.105} sizeAttenuation transparent opacity={0.85} depthWrite={false} blending={AdditiveBlending} />
  </points>;
}
