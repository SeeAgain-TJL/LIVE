"use client";

import { useMemo } from "react";
import { BackSide, Color } from "three";
import { COSMIC_BUDGETS, seededRandom, type RenderTier } from "@/domain/cosmic-visuals";
import { CosmicPoints, type PointCloud } from "./cosmic-points";
import { SPATIAL_LANDMARKS } from "@/domain/spatial-scene";

const vertex = `varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `varying vec3 direction;uniform float seed;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7))+seed)*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){vec3 p=normalize(direction);float band=exp(-pow((p.y+p.x*.3)*3.5,2.));float cloud=noise(p*9.)*.65+noise(p*21.)*.25+noise(p*48.)*.1;
vec3 color=vec3(.0015,.003,.008)+vec3(.008,.013,.025)*band*cloud; color+=vec3(.009,.006,.009)*pow(cloud,3.);
gl_FragColor=vec4(color,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Five-layer space: distant field, clustered midground and sparse foreground volumes. */
export function DeepSpace({ seed, tier, local = false }: { seed: number; tier: RenderTier; local?: boolean }) {
  const uniforms = useMemo(() => ({ seed: { value: seed % 1000 } }), [seed]);
  const layers = useMemo(() => {
    const random = seededRandom(seed), budget = COSMIC_BUDGETS[tier].stars, color = new Color();
    const counts = [Math.floor(budget * .68), Math.floor(budget * .27), Math.floor(budget * .05)];
    return counts.map((count, layer): PointCloud => {
      const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), sizes = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        let x: number, y: number, z: number;
        if (layer === 0) {
          const angle = random() * Math.PI * 2, r = 850 + random() * 650;
          const band = random() < .67;
          const latitude = band ? (random() + random() - 1) * .24 : random() * 2 - 1;
          x = Math.cos(angle) * Math.sqrt(1 - latitude ** 2) * r; z = Math.sin(angle) * Math.sqrt(1 - latitude ** 2) * r; y = latitude * r - x * .25;
        } else if (layer === 1) {
          // Loose stellar associations rather than a uniform shell.
          const cluster = i % 7, angle = cluster * 2.399963;
          const r = 210 + cluster * 45;
          x = Math.cos(angle) * r + (random() + random() - 1) * 115;
          z = Math.sin(angle) * r - 180 + (random() + random() - 1) * 100;
          y = Math.sin(cluster * 1.8) * 75 + (random() + random() - 1) * 50;
        } else {
          x = (random() < .5 ? -1 : 1) * (18 + random() * 62);
          y = (random() - .5) * 65; z = -28 + random() * (local ? 75 : 100);
        }
        positions.set([x, y, z], i * 3);
        color.setHSL(random() < .22 ? .1 : .59, .12 + random() * .24, layer === 0 ? .3 + random() * .3 : .45 + random() * .4);
        colors.set([color.r, color.g, color.b], i * 3);
        sizes[i] = layer === 0 ? .55 + Math.pow(random(), 8) * 5.5 : layer === 1 ? .13 + Math.pow(random(), 6) * .75 : .025 + Math.pow(random(), 5) * .13;
      }
      // Stable visible landmarks used by diagnostics to measure actual perspective.
      if (layer === 2) positions.set(SPATIAL_LANDMARKS[0], 0);
      if (layer === 0) positions.set(SPATIAL_LANDMARKS[1], 0);
      return { positions, colors, sizes };
    });
  }, [seed, tier, local]);
  return <group>
    <mesh raycast={() => null} renderOrder={-100}><sphereGeometry args={[2300, 32, 20]} /><shaderMaterial side={BackSide} depthWrite={false} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} /></mesh>
    <CosmicPoints cloud={layers[0]} opacity={.83} minimumSize={1} />
    <CosmicPoints cloud={layers[1]} opacity={.9} minimumSize={1} />
    <CosmicPoints cloud={layers[2]} opacity={.57} nearFade={5} minimumSize={.7} />
  </group>;
}
