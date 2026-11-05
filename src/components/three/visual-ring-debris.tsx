"use client";

import { useLayoutEffect, useRef } from "react";
import { Object3D, type InstancedMesh } from "three";
import { ringRotation } from "./exterior-lighting";

const fragments = [
  [-.71, 2.20, .041], [-.59, 2.23, .035], [-.56, 2.29, .086], [-.52, 2.20, .051], [-.45, 2.32, .043],
  [-.37, 2.19, .034], [-.36, 2.25, .027], [-.30, 2.30, .028], [-.24, 2.15, .020],
  [2.16, 2.14, .026], [2.25, 2.17, .033], [2.32, 2.15, .022],
] as const;

/** A single local batch of fragments placed by hand; no collision or navigation. */
export function VisualRingDebris({ radius }: { radius: number }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const rock = new Object3D();
    fragments.forEach(([angle, distance, size], index) => {
      rock.position.set(Math.cos(angle) * distance * radius, Math.sin(angle) * distance * radius, radius * (index % 3 - 1) * .028);
      rock.rotation.set(index * .73, index * 1.15, index * .51);
      rock.scale.set(size * radius * 1.23, size * radius * .81, size * radius * .57);
      rock.updateMatrix();
      mesh.current?.setMatrixAt(index, rock.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [radius]);
  return <instancedMesh ref={mesh} rotation={ringRotation} args={[undefined, undefined, fragments.length]} raycast={() => null}>
    <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#7f93a9" roughness={.9} flatShading />
  </instancedMesh>;
}
