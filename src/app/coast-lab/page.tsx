import type { Metadata } from "next";
import { CoastLabScene } from "@/components/three/coast-lab-scene";

export const metadata: Metadata = { title: "海岸技术验证 · UNIVERSE OF ME" };

export default function CoastLabPage() {
  return <main className="coast-lab" style={{ position: "fixed", inset: 0, background: "#a1b4bd" }}>
    <CoastLabScene />
  </main>;
}
