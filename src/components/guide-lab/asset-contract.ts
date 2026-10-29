import type { Vec3 } from "@/domain/types";

export interface LabActorAsset {
  id: string;
  label: string;
  format: "VRM-1.0";
  status: "technical-sample" | "user-local" | "production-approved";
  url: string;
  height: number;
  palmOffset: Vec3;
  provenance: string;
}

export const sampleActor: LabActorAsset = {
  id: "pixiv-constraint-sample",
  label: "pixiv 官方棕发技术样本 · 非最终角色",
  format: "VRM-1.0",
  status: "technical-sample",
  url: "/characters/guide-lab/pixiv-sample.vrm",
  height: 1.7,
  palmOffset: [0.055, 0.085, 0],
  provenance: "© 2022 pixiv Inc. · VRM Public License 1.0 + 内嵌许可（允许再分发）",
};

export interface LabMetrics {
  fps: number; frameP95: number; calls: number; triangles: number; textures: number;
  loadMs: number; palmError: number; hand: Vec3; orb: Vec3; camera: Vec3;
  bodyYaw: number; headYaw: number; chestPitch: number; gazeError: number; blinkPeak: number;
}
