"use client";

import Image from "next/image";
import { useState } from "react";
import type { GuideState } from "@/domain/guide-companion";
import { MEMORY_GUIDE_ASSET, type CharacterAsset } from "./character-assets";
import { GuidePortrait } from "./guide-portrait";

export function GuideCharacter({ state, asset = MEMORY_GUIDE_ASSET }: { state: GuideState; asset?: CharacterAsset }) {
  const [failed, setFailed] = useState<string | null>(null);
  const source = asset.states[state] ?? asset.source;
  const preview = !source || failed === source;
  return <span className="guide-character-art" data-character-state={state} data-asset-status={preview ? "preview" : asset.status}>
    <span className="guide-character-visual">{preview ? <GuidePortrait /> : <Image src={source} width={512} height={1024} alt={asset.alt} draggable={false} unoptimized onError={() => setFailed(source)} />}</span>
  </span>;
}
