import type { GuideState } from "@/domain/guide-companion";

export interface CharacterAsset {
  status: "preview" | "original";
  alt: string;
  source: string | null;
  states: Partial<Record<GuideState, string>>;
}
/** Replace only with project-owned/licensed transparent assets; see public/characters/memory-guide/README.md. */
export const MEMORY_GUIDE_ASSET: CharacterAsset = {
  status: "preview",
  alt: "银蓝长发、深蓝星空服装的成年记忆引导者，开发立绘预览",
  source: null,
  states: {},
};
